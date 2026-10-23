/* =============================================================================
   ICC CRM · Red de oficinas (delegaciones y distribuidores)
   Rutas: #/oficinas (panel de la red) y #/oficinas/ID (ficha de una oficina).
   Todas las cifras salen de los datos reales de las personas de cada oficina.
   ============================================================================= */
window.icc = window.icc || {};

window.icc.oficinas = (function () {
  var U = window.icc.util;
  var C = window.ICC_CONST;
  var API = window.icc.api;

  // Las 50 provincias y las 2 ciudades autónomas, por orden alfabético.
  var PROVINCIAS = [
    "A Coruña", "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz", "Barcelona", "Bizkaia",
    "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ceuta", "Ciudad Real", "Córdoba", "Cuenca", "Gipuzkoa",
    "Girona", "Granada", "Guadalajara", "Huelva", "Huesca", "Illes Balears", "Jaén", "La Rioja", "Las Palmas", "León",
    "Lleida", "Lugo", "Madrid", "Málaga", "Melilla", "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra",
    "Salamanca", "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid",
    "Zamora", "Zaragoza",
  ];
  var PALETA = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#FB923C", "#4ADE80", "#E879F9", "#2DD4BF", "#F87171", "#93C5FD"];
  var COLOR_ROL = { comercial: "#22D3EE", jefe_de_equipo: "#A78BFA", backoffice: "#FBBF24", coordinador: "#60A5FA", gerente: "#FB923C", admin: "#34D399", super_admin: "#F472B6" };

  function main() { return document.getElementById("icc-main"); }
  function esc(v) { return U.escapeHtml(v == null ? "" : String(v)); }
  function colorOficina(id) { return PALETA[Number(id) % PALETA.length]; }
  function nombrePersona(p) { return ((p.nombre || "") + " " + (p.apellidos || "")).trim(); }
  function num(n) { return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 }); }
  function kw(n) { return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 1 }); }
  function plural(n, s, p) { return n === 1 ? s : p; }
  function nombreMes() {
    var t = new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function avatar(p, t) {
    return '<span class="icc-of-ava" style="--c:' + (COLOR_ROL[p.rol] || "#94A3B8") + '">' + U.avatar(p, t || 36) + "</span>";
  }

  function errorMigracion(err) {
    return (
      '<header class="icc-ag-hero icc-of-hero"><div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">🏢 Red de oficinas</span>' +
      "<h1>Falta un paso para activar las oficinas</h1>" +
      '<p class="icc-ag-hero-res">' + esc(err.message || "") + "</p></div></header>" +
      '<div class="icc-aviso">Importa <code>sql/migracion_oficinas.sql</code> (o la base de datos completa) en phpMyAdmin y recarga esta página.</div>'
    );
  }

  // ======================================================== PANEL DE LA RED
  async function view() {
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var st = {
      q: params.get("q") || "",
      provincia: params.get("provincia") || "",
      vista: params.get("vista") === "tabla" ? "tabla" : "tarjetas",
      orden: params.get("orden") || "ok_mes",
      dir: params.get("dir") === "asc" ? "asc" : "desc",
      inactivas: params.get("inactivas") === "1",
    };
    main().innerHTML = '<div class="icc-loading">Cargando la red de oficinas…</div>';
    var datos;
    try {
      datos = await API.get("api/oficinas.php");
    } catch (err) {
      main().innerHTML = err.status === 409 || /migracion_oficinas/.test(err.message || "") ? errorMigracion(err)
        : '<p class="icc-empty">' + esc(err.message || "No se pudo cargar la red") + "</p>";
      return;
    }
    if (datos.puede_gestionar) pintarRed(datos, st);
    else pintarMiRed(datos);
  }

  // ===================================== VISTA DE MIEMBRO (no dirección)
  // Privacidad entre distribuidores: la API solo envía sus oficinas y
  // agregados anónimos del resto de la red (número por provincia y totales).
  function pintarMiRed(datos) {
    var red = datos.red || { oficinas_activas: 0, provincias: {}, n_provincias: 0, contratos_mes: 0, ok_mes: 0, kw: 0 };
    var mias = datos.oficinas || [];
    var N = red.oficinas_activas;
    var provs = Object.keys(red.provincias || {}).sort(function (a, b) { return red.provincias[b] - red.provincias[a] || a.localeCompare(b, "es"); });
    var maxP = provs.reduce(function (m, p) { return Math.max(m, red.provincias[p]); }, 1);
    var misProv = {};
    mias.forEach(function (o) { if (o.provincia) misProv[o.provincia] = true; });
    var kpi = function (valor, label, color, icono) {
      return '<div class="icc-stat-card icc-ag-kpi" style="--stat-color:' + color + '"><span class="icc-ag-kpi-ico">' + icono + '</span><span class="icc-stat-value">' + valor +
        '</span><span class="icc-stat-label">' + label + "</span></div>";
    };
    var miOficina = function (o) {
      var m = o.metricas;
      return '<a class="icc-of-card icc-of-mia" href="#/oficinas/' + o.id + '" style="--c:' + colorOficina(o.id) + '">' +
        '<header><span class="icc-of-card-ico" aria-hidden="true">🏢</span><div><strong>' + esc(o.nombre) + "</strong><small>" +
        esc([o.ciudad, o.provincia].filter(Boolean).join(" · ") || "Sin ubicación") + "</small></div>" +
        '<span class="icc-of-tag is-resp">Tu oficina</span></header>' +
        (o.posicion
          ? '<p class="icc-of-posicion"><b>nº ' + num(o.posicion) + "</b> de " + num(N) + " oficinas en " + esc(nombreMes().toLowerCase()) + "</p>"
          : '<p class="icc-of-posicion icc-muted">' + (o.activa ? "Aún sin posición este mes" : "Oficina inactiva") + "</p>") +
        '<div class="icc-of-stats">' +
        "<div><b>" + num(m.personas) + "</b><span>" + plural(m.personas, "persona", "personas") + "</span></div>" +
        '<div><b class="' + (m.ok_mes ? "ok" : "") + '">' + num(m.ok_mes) + "</b><span>OK este mes</span></div>" +
        "<div><b>" + num(m.contratos_mes) + "</b><span>altas este mes</span></div>" +
        "<div><b>" + kw(m.kw) + "</b><span>kW en cartera</span></div>" +
        "<div><b>" + num(m.citas_mes) + "</b><span>citas este mes</span></div>" +
        "<div><b>" + (m.conversion == null ? "—" : m.conversion + "%") + "</b><span>conversión</span></div>" +
        "</div><footer>Abrir mi oficina →</footer></a>";
    };
    main().innerHTML =
      '<header class="icc-ag-hero icc-of-hero"><div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">🏢 Red de oficinas</span>' +
      "<h1>Formas parte de una red de " + num(N) + " " + plural(N, "oficina", "oficinas") +
      (red.n_provincias ? " en " + num(red.n_provincias) + " " + plural(red.n_provincias, "provincia", "provincias") : "") + "</h1>" +
      '<p class="icc-ag-hero-res">Entre todas suman <b class="ok">' + num(red.ok_mes) + "</b> contratos OK y <b>" + num(red.contratos_mes) + "</b> altas en " +
      esc(nombreMes().toLowerCase()) + " · <b>" + kw(red.kw) + "</b> kW en cartera</p></div></header>" +
      '<div class="icc-ag-kpis">' +
      kpi(num(N), "Oficinas activas en la red", "#22D3EE", "🏢") +
      kpi(num(red.n_provincias), "Provincias con presencia", "#A78BFA", "🗺️") +
      kpi(num(red.contratos_mes), "Altas de la red este mes", "#60A5FA", "📝") +
      kpi(num(red.ok_mes), "Contratos OK de la red este mes", "#34D399", "🏆") +
      kpi(kw(red.kw), "kW en cartera de la red", "#FBBF24", "⚡") +
      "</div>" +
      (mias.length
        ? '<section class="icc-of-mias"><h2>' + (mias.length === 1 ? "Tu oficina" : "Tus oficinas") + '</h2><div class="icc-of-grid">' + mias.map(miOficina).join("") + "</div></section>"
        : '<section class="icc-card icc-of-vacio"><span class="icc-of-vacio-ico" aria-hidden="true">🏢</span><h2>Aún no estás en ninguna oficina</h2>' +
          "<p>Cuando dirección te asigne a una oficina verás aquí su ficha, su equipo y su posición en la red.</p></section>") +
      '<section class="icc-card icc-of-mapa"><h2>🗺️ La red por provincia</h2>' +
      (provs.length
        ? '<p class="icc-muted">Número de oficinas activas en cada provincia.</p><ul class="icc-of-burbujas">' + provs.map(function (p) {
            var n = red.provincias[p];
            var t = Math.round(44 + (n / maxP) * 52);
            return '<li class="' + (misProv[p] ? "is-mia" : "") + '"><span class="icc-of-burbuja" style="--t:' + t + 'px">' + num(n) + "</span><small>" + esc(p) + "</small></li>";
          }).join("") + "</ul>"
        : '<p class="icc-empty">La red todavía no tiene oficinas con provincia.</p>') +
      "</section>";
  }

  function hrefRed(st, cambios) {
    var x = Object.assign({}, st, cambios || {});
    var p = new URLSearchParams();
    if (x.q) p.set("q", x.q);
    if (x.provincia) p.set("provincia", x.provincia);
    if (x.vista === "tabla") p.set("vista", "tabla");
    if (x.orden && x.orden !== "ok_mes") p.set("orden", x.orden);
    if (x.dir === "asc") p.set("dir", "asc");
    if (x.inactivas) p.set("inactivas", "1");
    return "#/oficinas" + (p.toString() ? "?" + p.toString() : "");
  }

  function valorOrden(o, campo) {
    if (campo === "nombre" || campo === "provincia") return String(o[campo] || "").toLowerCase();
    var v = o.metricas[campo];
    return v == null ? -1 : Number(v);
  }

  function pintarRed(datos, st) {
    var todas = datos.oficinas || [];
    var gestiona = !!datos.puede_gestionar;
    var activas = todas.filter(function (o) { return o.activa; });
    var suma = function (lista, k) { return lista.reduce(function (s, o) { return s + Number(o.metricas[k] || 0); }, 0); };
    var provinciasActivas = {};
    activas.forEach(function (o) { if (o.provincia) provinciasActivas[o.provincia] = (provinciasActivas[o.provincia] || 0) + 1; });
    var nProv = Object.keys(provinciasActivas).length;

    var lista = todas.filter(function (o) {
      if (!st.inactivas && !o.activa) return false;
      if (st.provincia && o.provincia !== st.provincia) return false;
      return true;
    });
    lista.sort(function (a, b) {
      var va = valorOrden(a, st.orden), vb = valorOrden(b, st.orden);
      var r = va < vb ? -1 : va > vb ? 1 : 0;
      if (r === 0) r = String(a.nombre).localeCompare(String(b.nombre), "es");
      return st.dir === "asc" ? r : -r;
    });

    // Ranking del mes: OK, luego contratos dados de alta, luego kW.
    var ranking = activas.slice().filter(function (o) { return o.metricas.ok_mes || o.metricas.contratos_mes; })
      .sort(function (a, b) {
        return (b.metricas.ok_mes - a.metricas.ok_mes) || (b.metricas.contratos_mes - a.metricas.contratos_mes) || (b.metricas.kw - a.metricas.kw);
      }).slice(0, 5);

    var kpi = function (valor, label, color, icono, destino) {
      var inner = '<span class="icc-ag-kpi-ico">' + icono + '</span><span class="icc-stat-value">' + valor + '</span><span class="icc-stat-label">' + label + "</span>";
      return '<button type="button" class="icc-stat-card icc-ag-kpi icc-kpi-boton" style="--stat-color:' + color + '" data-ir="' + esc(destino) + '">' + inner + "</button>";
    };

    var tarjeta = function (o) {
      var m = o.metricas;
      var c = colorOficina(o.id);
      return (
        '<a class="icc-of-card' + (o.activa ? "" : " is-inactiva") + '" href="#/oficinas/' + o.id + '" style="--c:' + c + '" data-buscar="' +
        esc([o.nombre, o.ciudad, o.provincia, o.responsable_nombre, o.responsable_apellidos].join(" ").toLowerCase()) + '">' +
        '<header><span class="icc-of-card-ico" aria-hidden="true">🏢</span><div><strong>' + esc(o.nombre) + "</strong>" +
        "<small>" + esc([o.ciudad, o.provincia].filter(Boolean).join(" · ") || "Sin ubicación") + "</small></div>" +
        (o.activa ? "" : '<span class="icc-of-tag is-off">Inactiva</span>') + "</header>" +
        '<div class="icc-of-resp">' + (o.responsable_id
          ? avatar({ nombre: o.responsable_nombre, apellidos: o.responsable_apellidos, rol: o.responsable_rol, avatar_ruta: o.responsable_avatar }, 26) +
            "<span>" + esc(nombrePersona({ nombre: o.responsable_nombre, apellidos: o.responsable_apellidos })) + "</span><em>Responsable</em>"
          : '<span class="icc-muted">Sin responsable</span>') + "</div>" +
        '<div class="icc-of-stats">' +
        "<div><b>" + num(m.personas) + "</b><span>" + plural(m.personas, "persona", "personas") + "</span></div>" +
        '<div><b class="' + (m.ok_mes ? "ok" : "") + '">' + num(m.ok_mes) + "</b><span>OK este mes</span></div>" +
        "<div><b>" + num(m.contratos_mes) + "</b><span>altas este mes</span></div>" +
        "<div><b>" + kw(m.kw) + "</b><span>kW en cartera</span></div>" +
        "<div><b>" + num(m.citas_mes) + "</b><span>citas este mes</span></div>" +
        "<div><b>" + (m.conversion == null ? "—" : m.conversion + "%") + "</b><span>conversión</span></div>" +
        "</div><footer>Abrir oficina →</footer></a>"
      );
    };

    var cabecera = function (campo, label, num) {
      var activo = st.orden === campo;
      var dir = activo && st.dir === "desc" ? "asc" : "desc";
      return '<th scope="col"' + (num ? ' class="num"' : "") + (activo ? ' aria-sort="' + (st.dir === "asc" ? "ascending" : "descending") + '"' : "") + '><a href="' +
        hrefRed(st, { orden: campo, dir: dir }) + '">' + label + (activo ? (st.dir === "asc" ? " ▲" : " ▼") : "") + "</a></th>";
    };
    var tabla =
      '<div class="icc-card icc-table-wrap icc-of-tabla"><table class="icc-table"><thead><tr>' +
      cabecera("nombre", "Oficina") + cabecera("provincia", "Provincia") + cabecera("personas", "Personas", 1) + cabecera("clientes", "Clientes", 1) +
      cabecera("contratos_mes", "Altas mes", 1) + cabecera("ok_mes", "OK mes", 1) + cabecera("kw", "kW", 1) + cabecera("citas_mes", "Citas mes", 1) +
      cabecera("conversion", "Conversión", 1) + "</tr></thead><tbody>" +
      lista.map(function (o) {
        var m = o.metricas;
        return '<tr data-buscar="' + esc([o.nombre, o.ciudad, o.provincia].join(" ").toLowerCase()) + '" class="' + (o.activa ? "" : "is-inactiva") + '">' +
          '<td><a href="#/oficinas/' + o.id + '"><span class="icc-of-punto" style="--c:' + colorOficina(o.id) + '"></span>' + esc(o.nombre) + "</a>" + (o.activa ? "" : ' <span class="icc-of-tag is-off">Inactiva</span>') + "</td>" +
          "<td>" + esc(o.provincia || "—") + "</td>" +
          '<td class="num">' + num(m.personas) + '</td><td class="num">' + num(m.clientes) + '</td><td class="num">' + num(m.contratos_mes) +
          '</td><td class="num"><b class="' + (m.ok_mes ? "ok" : "") + '">' + num(m.ok_mes) + '</b></td><td class="num">' + kw(m.kw) + '</td><td class="num">' + num(m.citas_mes) +
          '</td><td class="num">' + (m.conversion == null ? "—" : m.conversion + "%") + "</td></tr>";
      }).join("") +
      "</tbody></table></div>";

    var medallas = ["🥇", "🥈", "🥉", "4º", "5º"];
    var maxRank = ranking.length ? Math.max(1, ranking[0].metricas.ok_mes || ranking[0].metricas.contratos_mes) : 1;

    main().innerHTML =
      '<header class="icc-ag-hero icc-of-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">🏢 Red de oficinas</span>' +
      "<h1>" + num(activas.length) + " " + plural(activas.length, "oficina activa", "oficinas activas") + (nProv ? " en " + nProv + " " + plural(nProv, "provincia", "provincias") : "") + "</h1>" +
      '<p class="icc-ag-hero-res"><b>' + num(suma(activas, "personas")) + "</b> " + plural(suma(activas, "personas"), "persona", "personas") +
      ' · <b class="ok">' + num(suma(activas, "ok_mes")) + "</b> contratos OK en " + esc(nombreMes().toLowerCase()) +
      " · <b>" + kw(suma(activas, "kw")) + "</b> kW en cartera</p></div>" +
      '<div class="icc-ag-hero-acc">' + (gestiona
        ? '<button type="button" class="icc-btn icc-btn-ghost icc-of-btn-importar" id="of-importar">⬆ Importar CSV</button>' +
          '<button type="button" class="icc-btn icc-btn-primary icc-ag-btn-nueva" id="of-nueva">+ Nueva oficina</button>'
        : "") + "</div></header>" +

      (gestiona && datos.personas_sin_oficina
        ? '<div class="icc-aviso icc-of-aviso">👥 <b>' + num(datos.personas_sin_oficina) + "</b> " + plural(datos.personas_sin_oficina, "persona del equipo no tiene", "personas del equipo no tienen") +
          " oficina asignada. Asígnalas desde la ficha de cada oficina.</div>"
        : "") +

      (!todas.length
        ? '<section class="icc-card icc-of-vacio"><span class="icc-of-vacio-ico" aria-hidden="true">🏢</span><h2>Da de alta tu primera oficina</h2>' +
          "<p>Cada oficina o distribuidor tiene su ficha, su responsable y su equipo, y el CRM calcula sus cifras con los datos reales de sus personas.</p>" +
          (gestiona
            ? '<div class="icc-of-vacio-acc"><button type="button" class="icc-btn icc-btn-primary" id="of-nueva-vacio">+ Nueva oficina</button>' +
              '<button type="button" class="icc-btn icc-btn-ghost" id="of-importar-vacio">⬆ Importar desde CSV / Excel</button></div>' +
              '<p class="icc-muted">¿Tienes ya la red en una hoja de cálculo? Impórtala de golpe.</p>'
            : '<p class="icc-muted">Las oficinas las da de alta dirección.</p>') +
          "</section>"
        : '<div class="icc-ag-kpis">' +
          kpi(num(activas.length), "Oficinas activas", "#22D3EE", "🏢", "#of-listado") +
          kpi(num(nProv), plural(nProv, "Provincia con presencia", "Provincias con presencia"), "#A78BFA", "🗺️", "#of-provincias") +
          kpi(num(suma(activas, "personas")), "Personas en la red", "#FBBF24", "👥", "#of-listado") +
          kpi(num(suma(activas, "contratos_mes")), "Contratos dados de alta este mes", "#60A5FA", "📝", "#of-ranking") +
          kpi(num(suma(activas, "ok_mes")), "Contratos OK este mes", "#34D399", "🏆", "#of-ranking") +
          "</div>" +

          '<div class="icc-of-grid2">' +
          '<section class="icc-card icc-of-ranking" id="of-ranking"><h2>🏆 Ranking de ' + esc(nombreMes().toLowerCase()) + "</h2>" +
          (ranking.length
            ? '<ol class="icc-of-podio">' + ranking.map(function (o, i) {
                var m = o.metricas;
                var v = m.ok_mes || m.contratos_mes;
                return '<li style="--c:' + colorOficina(o.id) + ";--w:" + Math.max(8, Math.round((v / maxRank) * 100)) + '%"><a href="#/oficinas/' + o.id + '">' +
                  '<span class="icc-of-medalla">' + medallas[i] + "</span><span class=\"icc-of-podio-txt\"><strong>" + esc(o.nombre) + "</strong><small>" + esc(o.provincia || "") + "</small>" +
                  '<span class="icc-of-barra"><i></i></span></span><b>' + num(m.ok_mes) + "<small> OK · " + num(m.contratos_mes) + " altas</small></b></a></li>";
              }).join("") + "</ol>"
            : '<p class="icc-empty">El ranking aparece en cuanto las oficinas den de alta contratos este mes.</p>') +
          "</section>" +
          '<section class="icc-card icc-of-prov" id="of-provincias"><h2>🗺️ Presencia por provincia</h2>' +
          (nProv
            ? '<div class="icc-of-chips">' + Object.keys(provinciasActivas).sort(function (a, b) { return a.localeCompare(b, "es"); }).map(function (p) {
                return '<a class="icc-of-chip' + (st.provincia === p ? " is-activo" : "") + '" href="' + hrefRed(st, { provincia: st.provincia === p ? "" : p }) + '">' + esc(p) + " <b>" + provinciasActivas[p] + "</b></a>";
              }).join("") + "</div>"
            : '<p class="icc-empty">Indica la provincia de cada oficina para verla aquí.</p>') +
          "</section></div>" +

          '<section class="icc-card icc-ag-barra icc-of-barra">' +
          '<input class="icc-input" id="of-buscar" type="search" placeholder="🔎 Buscar oficina, ciudad, provincia o responsable" value="' + esc(st.q) + '" aria-label="Buscar oficina">' +
          '<select class="icc-select" id="of-provincia" aria-label="Provincia"><option value="">Todas las provincias</option>' +
          PROVINCIAS.map(function (p) { return '<option' + (st.provincia === p ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select>" +
          '<label class="icc-check icc-of-check"><input type="checkbox" id="of-inactivas"' + (st.inactivas ? " checked" : "") + "> Ver inactivas</label>" +
          '<div class="icc-tabs icc-of-vistas"><a class="icc-tab' + (st.vista === "tarjetas" ? " is-active" : "") + '" href="' + hrefRed(st, { vista: "tarjetas" }) + '">▦ Tarjetas</a>' +
          '<a class="icc-tab' + (st.vista === "tabla" ? " is-active" : "") + '" href="' + hrefRed(st, { vista: "tabla" }) + '">☰ Comparativa</a></div>' +
          "</section>" +

          '<section id="of-listado">' +
          (lista.length
            ? st.vista === "tabla" ? tabla : '<div class="icc-of-grid">' + lista.map(tarjeta).join("") + "</div>"
            : '<p class="icc-empty">Ninguna oficina coincide con el filtro.</p>') +
          '<p class="icc-empty icc-of-sin" hidden>Ninguna oficina coincide con la búsqueda.</p>' +
          "</section>");

    var buscar = document.getElementById("of-buscar");
    if (buscar) {
      var filtrar = function () {
        var t = buscar.value.trim().toLowerCase();
        var n = 0;
        main().querySelectorAll("#of-listado [data-buscar]").forEach(function (el) {
          var ok = !t || el.getAttribute("data-buscar").indexOf(t) !== -1;
          el.hidden = !ok;
          if (ok) n++;
        });
        var hay = main().querySelectorAll("#of-listado [data-buscar]").length;
        main().querySelector(".icc-of-sin").hidden = !(hay && !n);
      };
      buscar.addEventListener("input", filtrar);
      if (st.q) filtrar();
      document.getElementById("of-provincia").addEventListener("change", function (e) { location.hash = hrefRed(st, { provincia: e.target.value, q: buscar.value.trim() }); });
      document.getElementById("of-inactivas").addEventListener("change", function (e) { location.hash = hrefRed(st, { inactivas: e.target.checked, q: buscar.value.trim() }); });
    }
    ["of-nueva", "of-nueva-vacio"].forEach(function (idBtn) {
      var b = document.getElementById(idBtn);
      if (b) b.addEventListener("click", function () { modalOficina(null); });
    });
    ["of-importar", "of-importar-vacio"].forEach(function (idBtn) {
      var b = document.getElementById(idBtn);
      if (b) b.addEventListener("click", modalImportar);
    });
  }

  // ====================================================== FICHA DE OFICINA
  async function viewDetalle(id) {
    main().innerHTML = '<div class="icc-loading">Cargando oficina…</div>';
    var d;
    try {
      d = await API.get("api/oficinas.php?id=" + encodeURIComponent(id));
    } catch (err) {
      main().innerHTML = /migracion_oficinas/.test(err.message || "") ? errorMigracion(err) : '<p class="icc-empty">' + esc(err.message || "No se pudo cargar la oficina") + '</p><p><a class="icc-btn icc-btn-ghost" href="#/oficinas">← Oficinas</a></p>';
      return;
    }
    var o = d.oficina;
    var m = o.metricas;
    var gestiona = !!d.puede_gestionar;
    var c = colorOficina(o.id);
    var miembros = d.miembros || [];
    var activosM = miembros.filter(function (p) { return !Number(p.bloqueado); });

    var kpi = function (valor, label, color, icono) {
      return '<button type="button" class="icc-stat-card icc-ag-kpi icc-kpi-boton" style="--stat-color:' + color + '" data-ir="#of-equipo"><span class="icc-ag-kpi-ico">' + icono +
        '</span><span class="icc-stat-value">' + valor + '</span><span class="icc-stat-label">' + label + "</span></button>";
    };

    var persona = function (p) {
      var dato = function (v, label, href) {
        if (v == null) return "";
        return href ? '<a href="' + href + '"><b>' + num(v) + "</b><span>" + label + "</span></a>" : "<div><b>" + num(v) + "</b><span>" + label + "</span></div>";
      };
      var esCom = p.rol === "comercial" || p.rol === "jefe_de_equipo";
      return (
        '<article class="icc-of-persona' + (Number(p.bloqueado) ? " is-bloqueada" : "") + '" style="--c:' + (COLOR_ROL[p.rol] || "#94A3B8") + '" data-buscar="' + esc((nombrePersona(p) + " " + (p.email || "")).toLowerCase()) + '">' +
        "<header>" + avatar(p, 42) + "<div><strong>" + esc(nombrePersona(p)) + "</strong>" +
        '<span class="icc-of-rol">' + esc(C.ROLES[p.rol] || p.rol) + "</span>" +
        (String(p.id) === String(o.responsable_id) ? '<span class="icc-of-tag is-resp">Responsable</span>' : "") +
        (Number(p.bloqueado) ? '<span class="icc-of-tag is-off">Bloqueada</span>' : "") + "</div></header>" +
        (p.email ? '<p class="icc-of-mail">✉️ <a href="mailto:' + esc(p.email) + '">' + esc(p.email) + "</a></p>" : "") +
        (p.visible && esCom
          ? '<div class="icc-of-pstats">' +
            dato(p.clientes, "clientes", "#/pipeline?comercial_id=" + p.id) +
            dato(p.contratos_mes, "altas mes", "#/contratos?comercial_id=" + p.id) +
            dato(p.ok_mes, "OK mes", "#/contratos?comercial_id=" + p.id + "&estado=ok") +
            dato(p.citas_mes, "citas mes", "#/agenda?comercial_id=" + p.id) +
            "</div>"
          : "") +
        (gestiona ? '<button type="button" class="icc-of-quitar" data-quitar-id="' + p.id + '" title="Quitar de la oficina" aria-label="Quitar a ' + esc(nombrePersona(p)) + ' de la oficina">Quitar</button>' : "") +
        "</article>"
      );
    };

    main().innerHTML =
      '<header class="icc-ag-hero icc-of-hero icc-of-hero-ficha" style="--c:' + c + '">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">🏢 Oficina' + (o.provincia ? " · " + esc(o.provincia) : "") + "</span>" +
      "<h1>" + esc(o.nombre) + (o.activa ? "" : ' <span class="icc-of-tag is-off">Inactiva</span>') + "</h1>" +
      '<p class="icc-ag-hero-res">' + esc([o.direccion, o.ciudad, o.provincia].filter(Boolean).join(", ") || "Sin dirección") +
      (o.responsable_id ? " · Responsable: <b>" + esc(nombrePersona({ nombre: o.responsable_nombre, apellidos: o.responsable_apellidos })) + "</b>" : "") + "</p>" +
      ((o.telefono || o.email)
        ? '<p class="icc-of-contacto">' + (o.telefono ? '📞 <a href="tel:' + esc(String(o.telefono).replace(/\s+/g, "")) + '">' + esc(o.telefono) + "</a>" : "") +
          (o.email ? ' ✉️ <a href="mailto:' + esc(o.email) + '">' + esc(o.email) + "</a>" : "") + "</p>"
        : "") +
      "</div>" +
      '<div class="icc-ag-hero-acc icc-of-acciones"><a class="icc-btn icc-btn-ghost" href="#/oficinas">← Oficinas</a>' +
      (gestiona
        ? '<button type="button" class="icc-btn icc-btn-ghost" id="of-editar">✏️ Editar</button>' +
          '<button type="button" class="icc-btn icc-btn-ghost" id="of-activar">' + (o.activa ? "⏸ Desactivar" : "▶ Activar") + "</button>" +
          '<button type="button" class="icc-btn icc-btn-ghost icc-of-btn-borrar" id="of-borrar">🗑 Borrar</button>'
        : "") +
      "</div></header>" +

      '<div class="icc-ag-kpis">' +
      kpi(num(m.personas), plural(m.personas, "Persona activa", "Personas activas"), "#FBBF24", "👥") +
      kpi(num(m.clientes), "Clientes", "#A78BFA", "📇") +
      kpi(num(m.contratos_mes), "Altas este mes", "#60A5FA", "📝") +
      kpi(num(m.ok_mes), "Contratos OK este mes", "#34D399", "🏆") +
      kpi(kw(m.kw), "kW en cartera (OK)", "#22D3EE", "⚡") +
      kpi(num(m.citas_mes), "Citas este mes", "#F472B6", "📅") +
      kpi(m.conversion == null ? "—" : m.conversion + "%", "Conversión de clientes", "#FB923C", "🎯") +
      "</div>" +

      '<section class="icc-of-equipo" id="of-equipo">' +
      '<div class="icc-of-equipo-cab"><h2>👥 Equipo de la oficina <span>' + activosM.length + "</span></h2>" +
      (miembros.length > 6 ? '<input class="icc-input" id="of-buscar-persona" type="search" placeholder="🔎 Buscar persona" aria-label="Buscar persona">' : "") +
      (gestiona ? '<button type="button" class="icc-btn icc-btn-primary" id="of-anadir">+ Añadir personas</button>' : "") + "</div>" +
      (miembros.length
        ? '<div class="icc-of-personas">' + miembros.map(persona).join("") + "</div>"
        : '<p class="icc-empty">Esta oficina aún no tiene personas.' + (gestiona ? " Pulsa «+ Añadir personas»." : "") + "</p>") +
      "</section>";

    var bp = document.getElementById("of-buscar-persona");
    if (bp) bp.addEventListener("input", function () {
      var t = bp.value.trim().toLowerCase();
      main().querySelectorAll(".icc-of-persona").forEach(function (el) { el.hidden = !!t && el.getAttribute("data-buscar").indexOf(t) === -1; });
    });
    if (!gestiona) return;
    document.getElementById("of-editar").addEventListener("click", function () { modalOficina(o); });
    document.getElementById("of-activar").addEventListener("click", async function (e) {
      e.target.disabled = true;
      try {
        await API.put("api/oficinas.php?id=" + o.id, { activa: o.activa ? 0 : 1 });
        U.toast(o.activa ? "Oficina desactivada" : "Oficina activada", "success");
        viewDetalle(o.id);
      } catch (err) {
        U.toast(err.message || "No se pudo guardar", "error");
        e.target.disabled = false;
      }
    });
    document.getElementById("of-borrar").addEventListener("click", function () { modalBorrar(o, miembros.length); });
    document.getElementById("of-anadir").addEventListener("click", function () { modalAnadir(o, d.disponibles || []); });
    main().querySelectorAll("[data-quitar-id]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        try {
          await API.put("api/oficinas.php?id=" + o.id + "&action=miembros", { quitar: [Number(btn.getAttribute("data-quitar-id"))] });
          U.toast("Persona quitada de la oficina", "success");
          viewDetalle(o.id);
        } catch (err) {
          U.toast(err.message || "No se pudo quitar", "error");
          btn.disabled = false;
        }
      });
    });
  }

  // ================================================================ MODALES
  async function modalOficina(o) {
    var agentes = await window.icc.data.listarAgentes({}).catch(function () { return []; });
    var candidatos = agentes.filter(function (a) { return !Number(a.bloqueado) && a.rol !== "comercial" || (o && String(a.id) === String(o.responsable_id)); });
    var editar = !!o;
    o = o || {};
    var campo = function (id, label, valor, tipo, extra) {
      return '<div class="icc-field"><label for="of-f-' + id + '">' + label + "</label><input class=\"icc-input\" id=\"of-f-" + id + '" name="' + id + '" type="' + (tipo || "text") + '" value="' + esc(valor || "") + '"' + (extra || "") + "></div>";
    };
    U.openModal(
      "<h2>" + (editar ? "Editar oficina" : "Nueva oficina") + "</h2>" +
      '<form id="form-oficina" class="icc-form">' +
      campo("nombre", "Nombre *", o.nombre, "text", ' required maxlength="150" placeholder="Ej.: Delegación Gijón"') +
      '<div class="icc-form-grid">' +
      '<div class="icc-field"><label for="of-f-provincia">Provincia</label><select class="icc-select" id="of-f-provincia" name="provincia"><option value="">Elige provincia…</option>' +
      PROVINCIAS.map(function (p) { return "<option" + (o.provincia === p ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select></div>" +
      campo("ciudad", "Ciudad", o.ciudad, "text", ' maxlength="100"') +
      "</div>" +
      campo("direccion", "Dirección", o.direccion, "text", ' maxlength="255"') +
      '<div class="icc-form-grid">' +
      campo("telefono", "Teléfono", o.telefono, "tel", ' maxlength="30"') +
      campo("email", "Email", o.email, "email", ' maxlength="190"') +
      "</div>" +
      '<div class="icc-field"><label for="of-f-responsable">Responsable</label><select class="icc-select" id="of-f-responsable" name="responsable_id"><option value="">Sin responsable</option>' +
      candidatos.map(function (a) {
        return '<option value="' + a.id + '"' + (String(o.responsable_id) === String(a.id) ? " selected" : "") + ">" + esc(nombrePersona(a)) + " · " + esc(C.ROLES[a.rol] || a.rol) + "</option>";
      }).join("") + "</select><span class=\"icc-ayuda\">Si aún no tiene oficina, pasa a formar parte de esta.</span></div>" +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">' + (editar ? "Guardar" : "Crear oficina") + "</button></div></form>"
    );
    var form = document.getElementById("form-oficina");
    form.nombre.focus();
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var body = {};
      ["nombre", "provincia", "ciudad", "direccion", "telefono", "email", "responsable_id"].forEach(function (k) { body[k] = String(fd.get(k) || "").trim(); });
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        if (editar) {
          await API.put("api/oficinas.php?id=" + o.id, body);
          U.closeModal();
          U.toast("Oficina guardada", "success");
          viewDetalle(o.id);
        } else {
          var r = await API.post("api/oficinas.php", body);
          U.closeModal();
          U.toast("Oficina creada", "success");
          location.hash = "#/oficinas/" + r.id;
        }
      } catch (err) {
        U.toast(err.message || "No se pudo guardar la oficina", "error");
        btn.disabled = false;
      }
    });
  }

  function modalAnadir(o, disponibles) {
    U.openModal(
      "<h2>Añadir personas a " + esc(o.nombre) + "</h2>" +
      '<p class="icc-muted">Marca quién trabaja en esta oficina. Si alguien está en otra, pasará a esta.</p>' +
      '<input class="icc-input" id="of-a-buscar" type="search" placeholder="🔎 Buscar por nombre, email o rol" aria-label="Buscar persona">' +
      '<form id="form-anadir" class="icc-form">' +
      (disponibles.length
        ? '<div class="icc-of-a-lista">' + disponibles.map(function (p) {
            return '<label class="icc-check icc-of-a-fila" data-buscar="' + esc((nombrePersona(p) + " " + (p.email || "") + " " + (C.ROLES[p.rol] || p.rol)).toLowerCase()) + '">' +
              '<input type="checkbox" name="persona" value="' + p.id + '"> <span><b>' + esc(nombrePersona(p)) + "</b> · " + esc(C.ROLES[p.rol] || p.rol) +
              (p.oficina_id ? ' <em class="icc-of-mueve">ahora en ' + esc(p.oficina_nombre) + "</em>" : "") + "</span></label>";
          }).join("") + "</div>"
        : '<p class="icc-empty">Todas las personas activas ya están en esta oficina.</p>') +
      '<div class="icc-modal-actions"><span class="icc-muted" id="of-a-n">0 seleccionadas</span><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary" id="of-a-ok" disabled>Añadir</button></div></form>'
    );
    var form = document.getElementById("form-anadir");
    var contar = function () {
      var n = form.querySelectorAll('input[name="persona"]:checked').length;
      document.getElementById("of-a-n").textContent = n + (n === 1 ? " seleccionada" : " seleccionadas");
      document.getElementById("of-a-ok").disabled = !n;
    };
    form.addEventListener("change", contar);
    document.getElementById("of-a-buscar").addEventListener("input", function (e) {
      var t = e.target.value.trim().toLowerCase();
      form.querySelectorAll(".icc-of-a-fila").forEach(function (el) { el.hidden = !!t && el.getAttribute("data-buscar").indexOf(t) === -1; });
    });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var ids = Array.prototype.map.call(form.querySelectorAll('input[name="persona"]:checked'), function (i) { return Number(i.value); });
      if (!ids.length) return;
      try {
        await API.put("api/oficinas.php?id=" + o.id + "&action=miembros", { agregar: ids });
        U.closeModal();
        U.toast(ids.length + (ids.length === 1 ? " persona añadida" : " personas añadidas"), "success");
        viewDetalle(o.id);
      } catch (err) {
        U.toast(err.message || "No se pudieron añadir", "error");
      }
    });
  }

  function modalBorrar(o, nPersonas) {
    U.openModal(
      "<h2>🗑 Borrar " + esc(o.nombre) + "</h2>" +
      (nPersonas
        ? '<p class="icc-muted">La oficina tiene <b>' + nPersonas + "</b> " + plural(nPersonas, "persona", "personas") +
          ". Quedarán sin oficina; sus clientes, contratos y citas no cambian.</p>"
        : '<p class="icc-muted">La oficina no tiene personas.</p>') +
      '<p class="icc-muted">Si solo quieres que deje de contar en la red, mejor <b>desactívala</b>.</p>' +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="button" class="icc-btn icc-of-btn-borrar-ok" id="of-borrar-ok">Borrar oficina</button></div>'
    );
    document.getElementById("of-borrar-ok").addEventListener("click", async function (e) {
      e.target.disabled = true;
      try {
        await API.del("api/oficinas.php?id=" + o.id + (nPersonas ? "&desasignar=1" : ""));
        U.closeModal();
        U.toast("Oficina borrada", "success");
        location.hash = "#/oficinas";
      } catch (err) {
        U.toast(err.message || "No se pudo borrar", "error");
        e.target.disabled = false;
      }
    });
  }

  // ============================================== IMPORTAR DESDE CSV / EXCEL
  function modalImportar() {
    var archivo = null;
    U.openModal(
      "<h2>⬆ Importar oficinas desde CSV / Excel</h2>" +
      '<form id="form-importar" class="icc-form icc-of-imp">' +
      '<ol class="icc-of-imp-pasos">' +
      '<li>Descarga la <a href="assets/plantilla-oficinas.csv" download="plantilla-oficinas.csv">plantilla de ejemplo</a> o usa tu hoja con estas columnas en la primera fila: ' +
      "<code>nombre;provincia;ciudad;direccion;telefono;email;responsable_email</code>. Solo <b>nombre</b> es obligatoria.</li>" +
      "<li>En Excel: <b>Archivo › Guardar como</b> y elige <b>«CSV UTF-8 (delimitado por comas)»</b> o <b>«CSV (delimitado por punto y coma)»</b>. " +
      "El separador y la codificación se detectan solos.</li>" +
      "<li>Sube el archivo: verás una vista previa y no se guarda nada hasta que confirmes.</li></ol>" +
      '<label class="icc-of-imp-drop" for="of-imp-file"><span aria-hidden="true">📄</span><b id="of-imp-nombre">Elige el archivo .csv</b><small>o arrástralo aquí · máx. 5 MB y 5.000 filas</small>' +
      '<input id="of-imp-file" name="archivo" type="file" accept=".csv,.txt,text/csv"></label>' +
      '<label class="icc-check"><input type="checkbox" id="of-imp-corregir"> Corregir las provincias mal escritas con la sugerencia más parecida</label>' +
      '<p class="icc-ayuda">Cada oficina se reconoce por <b>nombre + ciudad</b> (sin distinguir mayúsculas ni tildes): si ya existe se actualiza y reimportar el mismo archivo no duplica nada. ' +
      "Las celdas vacías no borran lo que ya hay. El responsable se enlaza por el email de su cuenta en el CRM.</p>" +
      '<div id="of-imp-previa" aria-live="polite"></div>' +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cerrar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary" id="of-imp-ok" disabled>Importar</button></div></form>'
    );
    var form = document.getElementById("form-importar");
    var input = document.getElementById("of-imp-file");
    var drop = form.querySelector(".icc-of-imp-drop");
    var caja = document.getElementById("of-imp-previa");
    var ok = document.getElementById("of-imp-ok");
    var corregir = document.getElementById("of-imp-corregir");

    var enviar = function (previa) {
      var fd = new FormData();
      fd.append("archivo", archivo);
      if (corregir.checked) fd.append("corregir_provincias", "1");
      return API.postForm("api/oficinas.php?action=importar" + (previa ? "&previa=1" : ""), fd);
    };
    var filaHtml = function (f) {
      var etiqueta = { nueva: "Nueva", actualizar: "Actualiza", igual: "Sin cambios", error: "No se importa" }[f.accion] || f.accion;
      return "<tr class=\"is-" + esc(f.accion) + '"><td class="num">' + f.fila + "</td><td><b>" + esc(f.nombre || "—") + "</b><small>" + esc([f.ciudad, f.provincia].filter(Boolean).join(" · ")) + "</small></td>" +
        '<td><span class="icc-of-imp-acc">' + etiqueta + "</span></td><td>" +
        (f.errores || []).map(function (t) { return '<span class="icc-of-imp-err">⛔ ' + esc(t) + "</span>"; }).join("") +
        (f.avisos || []).map(function (t) { return '<span class="icc-of-imp-av">⚠️ ' + esc(t) + "</span>"; }).join("") +
        ((f.cambios && f.cambios.length) ? '<span class="icc-muted">Cambia: ' + esc(f.cambios.join(", ")) + "</span>" : "") +
        "</td></tr>";
    };
    var analizar = async function () {
      if (!archivo) return;
      ok.disabled = true;
      caja.innerHTML = '<div class="icc-loading">Analizando ' + esc(archivo.name) + "…</div>";
      try {
        var r = await enviar(true);
        var s = r.resumen;
        var aImportar = s.nuevas + s.actualizar;
        caja.innerHTML =
          '<div class="icc-of-imp-res">' +
          "<div><b>" + num(s.total) + "</b><span>filas</span></div>" +
          '<div class="ok"><b>' + num(s.nuevas) + "</b><span>nuevas</span></div>" +
          '<div class="up"><b>' + num(s.actualizar) + "</b><span>se actualizan</span></div>" +
          "<div><b>" + num(s.iguales) + "</b><span>sin cambios</span></div>" +
          '<div class="mal"><b>' + num(s.errores) + "</b><span>con error</span></div>" +
          '<div class="av"><b>' + num(s.avisos) + "</b><span>con aviso</span></div></div>" +
          '<p class="icc-muted icc-of-imp-meta">Separador «' + esc(s.separador) + "» · " + esc(s.codificacion) + " · columnas: " + esc(s.columnas.join(", ")) + "</p>" +
          (r.problemas.length
            ? "<h3>Filas a revisar</h3>" + '<div class="icc-table-wrap icc-of-imp-tabla"><table class="icc-table"><thead><tr><th class="num">Fila</th><th>Oficina</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>' +
              r.problemas.map(filaHtml).join("") + "</tbody></table></div>"
            : '<p class="icc-of-imp-bien">✅ Ninguna fila con errores ni avisos.</p>') +
          (r.muestra.length
            ? "<details><summary>Ver una muestra de las filas correctas</summary>" + '<div class="icc-table-wrap icc-of-imp-tabla"><table class="icc-table"><tbody>' +
              r.muestra.map(filaHtml).join("") + "</tbody></table></div></details>"
            : "");
        ok.disabled = !aImportar;
        ok.textContent = aImportar ? "Importar " + num(aImportar) + " " + plural(aImportar, "oficina", "oficinas") : "Nada que importar";
      } catch (err) {
        caja.innerHTML = '<div class="icc-aviso icc-of-imp-error">⛔ ' + esc(err.message || "No se pudo leer el archivo") + "</div>";
        ok.textContent = "Importar";
      }
    };
    var elegir = function (f) {
      if (!f) return;
      archivo = f;
      document.getElementById("of-imp-nombre").textContent = f.name;
      analizar();
    };
    input.addEventListener("change", function () { elegir(input.files[0]); });
    corregir.addEventListener("change", analizar);
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-sobre"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-sobre"); });
    });
    drop.addEventListener("drop", function (e) { elegir(e.dataTransfer && e.dataTransfer.files[0]); });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!archivo) return;
      ok.disabled = true;
      ok.textContent = "Importando…";
      try {
        var r = await enviar(false);
        caja.innerHTML = '<div class="icc-of-imp-fin">✅ <b>Importación terminada</b>: ' + num(r.creadas) + " " + plural(r.creadas, "nueva", "nuevas") + ", " +
          num(r.actualizadas) + " " + plural(r.actualizadas, "actualizada", "actualizadas") + ", " + num(r.sin_cambios) + " sin cambios" +
          (r.omitidas ? ", <b>" + num(r.omitidas) + "</b> " + plural(r.omitidas, "fila omitida", "filas omitidas") + " por errores" : "") + ".</div>";
        ok.hidden = true;
        U.toast("Oficinas importadas", "success");
        form.querySelector("[data-close-btn]").addEventListener("click", function () { view(); });
      } catch (err) {
        U.toast(err.message || "No se pudo importar", "error");
        ok.disabled = false;
        ok.textContent = "Reintentar";
      }
    });
  }

  return { view: view, viewDetalle: viewDetalle, PROVINCIAS: PROVINCIAS };
})();
