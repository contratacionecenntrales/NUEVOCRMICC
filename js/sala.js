/* =============================================================================
   ICC CRM · Sala de ventas en directo (#/sala-ventas, modo TV: ?tv=1)
   Todo sale de api/sala.php (datos reales). Se refresca cada 30 s mientras la
   pestaña está visible y celebra cada contrato nuevo.
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var C = window.ICC_CONST;
  var API = window.icc.api;
  var esc = U.escapeHtml;

  var REFRESCO_MS = 30000;
  var COMPLETO_MS = 120000;
  var ROTACION_TV_MS = 20000;

  var st = {
    periodo: "mes",
    tv: false,
    datos: null,
    vistos: {},
    ahora: null,
    ultimoCompleto: 0,
    pestana: "comerciales",
    timers: [],
    activa: false,
  };

  function reducido() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function main() {
    return document.getElementById("icc-main");
  }
  function num(n, dec) {
    return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: dec == null ? 0 : dec });
  }
  function iniciales(n) {
    return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join("") || "?";
  }
  var PALETA = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#FB923C", "#4ADE80", "#E879F9", "#2DD4BF", "#F87171", "#93C5FD"];
  function colorDe(id) {
    return PALETA[Math.abs(Number(id) || 0) % PALETA.length];
  }
  function haceCuanto(fecha) {
    if (!fecha) return "";
    var d = new Date(String(fecha).replace(" ", "T"));
    var ref = st.ahora ? new Date(String(st.ahora).replace(" ", "T")) : new Date();
    var s = Math.max(0, Math.round((ref - d) / 1000));
    if (s < 60) return "ahora mismo";
    var m = Math.round(s / 60);
    if (m < 60) return "hace " + m + " min";
    var h = Math.round(m / 60);
    if (h < 24) return "hace " + h + " h";
    var dias = Math.round(h / 24);
    return dias === 1 ? "ayer" : "hace " + dias + " días";
  }

  // ---------------------------------------------------------- Texto de cada evento
  var SECTOR = { energia: "energía", telecomunicaciones: "telefonía", telefonia: "telefonía", alarmas: "alarmas", seguros: "seguros", financiero: "financiación", multisectorial: "varios servicios" };
  function sectorTxt(s) {
    return SECTOR[s] || (s ? String(s) : "");
  }
  function clienteTxt(e) {
    return e.cliente ? "<b>" + esc(e.cliente) + "</b>" : "un cliente" + (e.sector ? " de " + esc(sectorTxt(e.sector)) : "");
  }
  function evento(e) {
    var q = "<b>" + esc(e.quien || "El equipo") + "</b>";
    switch (e.tipo) {
      case "contrato":
        return { ico: "📝", c: "#60A5FA", txt: q + " ha dado de alta un contrato de " + esc(sectorTxt(e.sector) || "servicio") + (e.kw ? " · " + num(e.kw, 2) + " kW" : "") + (e.cliente ? " con " + clienteTxt(e) : "") };
      case "contrato_ok":
        return { ico: "✅", c: "#34D399", txt: "Contrato " + (e.estado === "verificado" ? "verificado" : "<b>OK</b>") + " para " + q + (e.cliente ? " · " + clienteTxt(e) : "") };
      case "cliente":
        return { ico: "🎯", c: "#22D3EE", txt: q + " ha captado " + (e.cliente ? "un nuevo cliente: " + clienteTxt(e) : "un nuevo cliente") };
      case "fase":
        if (e.estado === "cliente_activo") return { ico: "🏆", c: "#34D399", txt: "¡" + q + " ha ganado " + clienteTxt(e) + "!" };
        if (e.estado === "perdido") return { ico: "✖", c: "#94A3B8", txt: (e.cliente ? clienteTxt(e) : "Una oportunidad") + " de " + q + " se marca como perdida" };
        return { ico: "📈", c: "#A78BFA", txt: (e.cliente ? clienteTxt(e) : "Una oportunidad") + " de " + q + " avanza a «" + esc((C.ESTADOS[e.estado] || {}).label || e.estado) + "»" };
      case "cita":
        return { ico: "📅", c: "#FBBF24", txt: q + " ha concertado una visita" + (e.para ? " para <b>" + esc(e.para) + "</b>" : "") + (e.cliente ? " con " + clienteTxt(e) : "") + (e.dia ? " · " + esc(U.formatFecha(e.dia)) : "") };
      case "cita_ok":
        return { ico: "🤝", c: "#F472B6", txt: q + " ha realizado la visita" + (e.cliente ? " a " + clienteTxt(e) : "") };
      case "presupuesto":
        return { ico: "📄", c: "#FB923C", txt: "Presupuesto de " + esc(sectorTxt(e.sector) || "servicio") + " cerrado por " + q + (e.cliente ? " · " + clienteTxt(e) : "") };
      case "informe":
        return { ico: e.sector === "telefonia" ? "📶" : "⚡", c: "#2DD4BF", txt: q + " ha preparado un estudio de " + esc(sectorTxt(e.sector)) + (e.ahorro && e.ahorro > 0 ? " · ahorro de <b>" + num(e.ahorro) + " €/año</b>" : "") + (e.cliente ? " para " + clienteTxt(e) : "") };
      case "tarifa":
        return { ico: "🔔", c: "#E879F9", txt: "Tramitación: " + esc(e.titulo || "tarifas actualizadas") + (e.quien ? " (" + esc(e.quien) + ")" : "") };
      default:
        return { ico: "•", c: "#94A3B8", txt: q };
    }
  }
  function esContrato(e) {
    return e.tipo === "contrato" || e.tipo === "contrato_ok" || (e.tipo === "fase" && e.estado === "cliente_activo");
  }

  // ----------------------------------------------------------------- Datos
  function cargar(desde) {
    var qs = desde ? "solo_eventos=1&desde=" + encodeURIComponent(desde) : "periodo=" + encodeURIComponent(st.periodo);
    return API.get("api/sala.php?" + qs);
  }

  // ------------------------------------------------------------------- Vista
  async function view() {
    limpiar();
    var p = new URLSearchParams(location.hash.split("?")[1] || "");
    st.periodo = ["hoy", "semana", "mes"].indexOf(p.get("periodo")) !== -1 ? p.get("periodo") : "mes";
    st.tv = p.get("tv") === "1";
    st.activa = true;
    st.vistos = {};
    document.body.classList.toggle("icc-sala-tv", st.tv);
    main().innerHTML = '<div class="icc-loading">Abriendo la sala de ventas…</div>';
    try {
      st.datos = await cargar();
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + esc(err.message || "No se pudo cargar la sala de ventas") + "</p>";
      return;
    }
    st.ahora = st.datos.ahora;
    st.ultimoCompleto = Date.now();
    (st.datos.eventos || []).forEach(function (e) { st.vistos[e.id] = true; });
    if (st.pestana === "oficinas" && !(st.datos.ranking.oficinas || []).length) st.pestana = "comerciales";
    pintar();
    programar();
  }

  function href(cambios) {
    var x = Object.assign({ periodo: st.periodo === "mes" ? "" : st.periodo, tv: st.tv ? "1" : "" }, cambios || {});
    var q = new URLSearchParams();
    Object.keys(x).forEach(function (k) { if (x[k]) q.set(k, x[k]); });
    return "#/sala-ventas" + (q.toString() ? "?" + q.toString() : "");
  }

  function pintar() {
    var d = st.datos;
    var k = d.kpis;
    var nombrePeriodo = { hoy: "hoy", semana: "esta semana", mes: "este mes" }[st.periodo];
    var pestanas = [["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"]];
    main().innerHTML =
      '<div class="icc-sala' + (st.tv ? " is-tv" : "") + '">' +
      // Cabecera
      '<header class="icc-sala-hero">' +
      '<div class="icc-sala-hero-txt">' +
      '<span class="icc-sala-envivo"><i aria-hidden="true"></i>En directo</span>' +
      "<h1>Sala de ventas</h1>" +
      '<p class="icc-sala-hero-res"><b>' + num(k.contratos) + "</b> contratos y <b>" + num(k.citas) + "</b> visitas realizadas " + nombrePeriodo +
      " · <b>" + num(k.activos) + "</b> " + (k.activos === 1 ? "persona" : "personas") + " sumando puntos</p>" +
      "</div>" +
      '<div class="icc-sala-hero-acc">' +
      '<div class="icc-sala-reloj" id="sala-reloj" aria-hidden="true"></div>' +
      '<nav class="icc-sala-periodos" aria-label="Periodo">' +
      pestanas.map(function (t) {
        return '<a class="icc-sala-periodo' + (st.periodo === t[0] ? " is-activo" : "") + '" href="' + href({ periodo: t[0] === "mes" ? "" : t[0] }) + '">' + t[1] + "</a>";
      }).join("") + "</nav>" +
      (st.tv
        ? '<button type="button" class="icc-btn icc-btn-ghost" id="sala-pantalla">⛶ Pantalla completa</button><a class="icc-btn icc-btn-secondary" href="' + href({ tv: "" }) + '">✕ Salir del modo TV</a>'
        : '<a class="icc-btn icc-btn-primary icc-sala-btn-tv" href="' + href({ tv: "1" }) + '">📺 Modo TV</a>') +
      "</div></header>" +

      // Ticker horizontal
      '<div class="icc-sala-ticker" aria-label="Últimos movimientos"><div class="icc-sala-ticker-pista" id="sala-ticker">' + tickerHtml(d.eventos) + "</div></div>" +

      // KPIs
      '<div class="icc-sala-kpis">' +
      kpi("📝", "Contratos", k.contratos, "#60A5FA", "#/contratos") +
      kpi("✅", "Contratos OK", k.ok, "#34D399", "#/contratos?estado=ok") +
      kpi("⚡", "kW contratados", k.kw, "#FBBF24", "#/informes?ver=kw", 2) +
      kpi("🤝", "Visitas realizadas", k.citas, "#F472B6", "#/agenda?vista=lista&estado=realizada") +
      kpi("🎯", "Clientes nuevos", k.clientes, "#22D3EE", "#/pipeline") +
      kpi("🔥", "Puntos del equipo", k.puntos, "#A78BFA", null) +
      "</div>" +

      '<div class="icc-sala-grid">' +
      // Ranking
      '<section class="icc-sala-bloque icc-sala-ranking" id="sala-bloque-ranking">' + rankingHtml() + "</section>" +
      // Objetivo + mapa
      '<div class="icc-sala-col">' +
      '<section class="icc-sala-bloque icc-sala-objetivo">' + objetivoHtml() + "</section>" +
      '<section class="icc-sala-bloque icc-sala-mapa">' + mapaHtml() + "</section>" +
      "</div>" +
      // Actividad
      '<section class="icc-sala-bloque icc-sala-feed"><div class="icc-sala-bloque-tit"><h2>Actividad en directo</h2><span class="icc-sala-act" id="sala-act">Actualizado ' + haceCuanto(st.ahora) + "</span></div>" +
      '<ol class="icc-sala-eventos" id="sala-eventos">' + (d.eventos.length ? d.eventos.map(eventoHtml).join("") : '<li class="icc-sala-vacio">Todavía no hay movimientos en los últimos 30 días. En cuanto alguien dé de alta un cliente, un contrato o una visita, aparecerá aquí.</li>') + "</ol></section>" +
      "</div>" +
      '<p class="icc-sala-nota">Puntos: contrato OK 10 · contrato dado de alta 5 · visita realizada 2 · cliente nuevo 1. Todo sale de los datos reales del CRM.</p>' +
      "</div>";

    enlazar();
    animarContadores();
    reloj();
    celebrarObjetivo();
  }

  // Confeti una vez por mes y navegador cuando el equipo llega al objetivo.
  function celebrarObjetivo() {
    var c = st.datos.objetivos.contratos;
    if (!c.objetivo || c.actual < c.objetivo) return;
    var clave = "icc-sala-objetivo-" + String(st.ahora).slice(0, 7);
    try { if (localStorage.getItem(clave)) return; localStorage.setItem(clave, "1"); } catch (e) { /* sin almacenamiento */ }
    confeti();
  }

  function kpi(ico, label, valor, color, enlace, dec) {
    var inner = '<span class="icc-sala-kpi-ico" aria-hidden="true">' + ico + '</span><b class="icc-sala-num" data-valor="' + Number(valor || 0) + '" data-dec="' + (dec || 0) + '">' + num(valor, dec) + "</b><span>" + esc(label) + "</span>";
    return enlace
      ? '<a class="icc-sala-kpi" style="--c:' + color + '" href="' + enlace + '">' + inner + "</a>"
      : '<div class="icc-sala-kpi" style="--c:' + color + '">' + inner + "</div>";
  }

  function tickerHtml(eventos) {
    var lista = (eventos || []).slice(0, 16);
    if (!lista.length) return '<span class="icc-sala-ticker-item">Sala de ventas en directo · los movimientos del equipo aparecerán aquí</span>';
    var html = lista.map(function (e) {
      var t = evento(e);
      return '<span class="icc-sala-ticker-item"><i aria-hidden="true">' + t.ico + "</i>" + t.txt + " <small>" + esc(haceCuanto(e.fecha)) + "</small></span>";
    }).join("");
    return html + html; // duplicado para que el desplazamiento sea continuo
  }

  function eventoHtml(e, nuevo) {
    var t = evento(e);
    var cuerpo = '<span class="icc-sala-ev-ico" aria-hidden="true">' + t.ico + '</span><span class="icc-sala-ev-txt">' + t.txt + "<small>" + esc(haceCuanto(e.fecha)) + "</small></span>";
    return '<li class="icc-sala-ev' + (nuevo ? " is-nuevo" : "") + (esContrato(e) ? " is-contrato" : "") + '" style="--c:' + t.c + '" data-ev="' + esc(e.id) + '">' +
      (e.href ? '<a href="' + esc(e.href) + '">' + cuerpo + "</a>" : "<div>" + cuerpo + "</div>") + "</li>";
  }

  // ------------------------------------------------------------- Ranking
  function rankingHtml() {
    var r = st.datos.ranking;
    var pestanas = [["comerciales", "👤 Comerciales"], ["equipos", "🧭 Equipos"]];
    if ((r.oficinas || []).length) pestanas.push(["oficinas", "🏢 Oficinas"]);
    var lista = r[st.pestana] || [];
    var max = Math.max(1, Math.max.apply(null, lista.map(function (x) { return x.puntos; }).concat([0])));
    var conPuntos = lista.filter(function (x) { return x.puntos > 0; });
    var podio = conPuntos.slice(0, 3);
    var orden = podio.length === 3 ? [podio[1], podio[0], podio[2]] : podio;
    var medallas = ["🥇", "🥈", "🥉"];
    var miId = String((window.icc.auth.state.user || {}).id);
    return (
      '<div class="icc-sala-bloque-tit"><h2>Ranking</h2>' +
      (st.pestana === "comerciales" && r.mi_posicion ? '<span class="icc-sala-mipos">Tu posición: <b>#' + r.mi_posicion + "</b> de " + r.total_comerciales + "</span>" : "") +
      "</div>" +
      '<div class="icc-sala-tabs" role="tablist">' +
      pestanas.map(function (t) {
        return '<button type="button" role="tab" class="icc-sala-tab' + (st.pestana === t[0] ? " is-activo" : "") + '" aria-selected="' + (st.pestana === t[0]) + '" data-pestana="' + t[0] + '">' + t[1] + "</button>";
      }).join("") + "</div>" +
      (podio.length
        ? '<div class="icc-sala-podio">' +
          orden.map(function (x) {
            var pos = podio.indexOf(x);
            return '<div class="icc-sala-escalon is-' + (pos + 1) + '" style="--c:' + colorDe(x.id) + '">' +
              '<span class="icc-sala-medalla" aria-hidden="true">' + medallas[pos] + "</span>" +
              '<span class="icc-sala-ava">' + esc(iniciales(x.nombre.replace(/^Equipo de /, ""))) + "</span>" +
              "<strong>" + esc(x.nombre) + "</strong>" +
              '<span class="icc-sala-pts">' + num(x.puntos) + " pts</span>" +
              '<div class="icc-sala-peana"><span>' + (pos + 1) + "</span></div></div>";
          }).join("") + "</div>"
        : '<p class="icc-sala-vacio">Aún nadie ha sumado puntos ' + ({ hoy: "hoy", semana: "esta semana", mes: "este mes" }[st.periodo]) + ". ¡El primer contrato se lleva el podio!</p>") +
      (lista.length
        ? '<div class="icc-sala-tabla" role="table" aria-label="Ranking">' +
          '<div class="icc-sala-fila is-cab" role="row"><span>#</span><span>Nombre</span><span>Puntos</span><span title="Contratos dados de alta">Contr.</span><span>OK</span><span>kW</span><span title="Visitas realizadas">Visitas</span></div>' +
          lista.slice(0, st.tv ? 10 : 15).map(function (x, i) {
            return '<div class="icc-sala-fila' + (String(x.id) === miId && st.pestana === "comerciales" ? " is-yo" : "") + '" role="row" style="--c:' + colorDe(x.id) + ";--w:" + Math.round((x.puntos / max) * 100) + '%">' +
              '<span class="icc-sala-pos">' + (i + 1) + "</span>" +
              '<span class="icc-sala-nom"><i class="icc-sala-mini" aria-hidden="true">' + esc(iniciales(x.nombre.replace(/^Equipo de /, ""))) + "</i>" + esc(x.nombre) +
              (x.personas != null ? " <small>" + x.personas + (x.personas === 1 ? " persona" : " personas") + "</small>" : "") + "</span>" +
              '<span class="icc-sala-barra"><i></i><b>' + num(x.puntos) + "</b></span>" +
              "<span>" + num(x.contratos) + "</span><span>" + num(x.ok) + "</span><span>" + num(x.kw, 1) + "</span><span>" + num(x.citas) + "</span></div>";
          }).join("") + "</div>"
        : "")
    );
  }

  // ------------------------------------------------------------ Objetivo
  function objetivoHtml() {
    var o = st.datos.objetivos;
    var c = o.contratos;
    var pct = c.objetivo ? Math.min(100, Math.round((c.actual / c.objetivo) * 100)) : 0;
    var proyeccion = o.dia ? Math.round((c.actual / o.dia) * o.dias_mes) : 0;
    var R = 52, L = 2 * Math.PI * R;
    var faltan = Math.max(0, c.objetivo - c.actual);
    return (
      '<div class="icc-sala-bloque-tit"><h2>Objetivo del mes</h2><span class="icc-sala-act">Día ' + o.dia + " de " + o.dias_mes + "</span></div>" +
      '<div class="icc-sala-obj">' +
      '<svg class="icc-sala-anillo" viewBox="0 0 128 128" role="img" aria-label="' + pct + '% del objetivo">' +
      '<circle cx="64" cy="64" r="' + R + '" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="12"></circle>' +
      '<circle class="icc-sala-anillo-val" cx="64" cy="64" r="' + R + '" fill="none" stroke="url(#sala-grad)" stroke-width="12" stroke-linecap="round" transform="rotate(-90 64 64)" stroke-dasharray="' + L.toFixed(1) + '" stroke-dashoffset="' + (L * (1 - pct / 100)).toFixed(1) + '"></circle>' +
      '<defs><linearGradient id="sala-grad" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#22D3EE"></stop><stop offset="1" stop-color="#34D399"></stop></linearGradient></defs>' +
      '<text x="64" y="62" text-anchor="middle" class="icc-sala-anillo-pct" fill="currentColor">' + pct + '%</text>' +
      '<text x="64" y="82" text-anchor="middle" class="icc-sala-anillo-sub" fill="currentColor">' + c.actual + " / " + c.objetivo + "</text></svg>" +
      '<div class="icc-sala-obj-txt">' +
      "<p><b>" + num(c.actual) + "</b> contratos OK de <b>" + num(c.objetivo) + "</b>" + (c.fuente === "por_defecto" ? ' <small title="Nadie tiene objetivo en su ficha: se usa el objetivo general del CRM">(objetivo general)</small>' : " <small>(suma de objetivos de las fichas)</small>") + "</p>" +
      (faltan ? "<p>Faltan <b>" + num(faltan) + "</b> para llegar. A este ritmo cerraréis el mes con <b>" + num(proyeccion) + "</b>.</p>" : '<p class="icc-sala-logrado">🎉 ¡Objetivo conseguido!</p>') +
      (o.kw ? '<p>kW: <b>' + num(o.kw.actual, 1) + "</b> de " + num(o.kw.objetivo, 1) + "</p>" : "") +
      (o.mio ? '<p class="icc-sala-mio">Tu objetivo: <b>' + o.mio.ok + " / " + o.mio.objetivo + "</b> contratos OK</p>" : "") +
      "</div></div>"
    );
  }

  // ---------------------------------------------------------------- Mapa
  // Capitales de provincia (longitud, latitud). Canarias va en un recuadro.
  var PROV = {
    "alava": [-2.67, 42.85, "Álava"], "albacete": [-1.86, 38.99, "Albacete"], "alicante": [-0.49, 38.35, "Alicante"], "almeria": [-2.46, 36.84, "Almería"],
    "asturias": [-5.85, 43.36, "Asturias"], "avila": [-4.70, 40.66, "Ávila"], "badajoz": [-6.97, 38.88, "Badajoz"], "barcelona": [2.17, 41.39, "Barcelona"],
    "burgos": [-3.70, 42.34, "Burgos"], "caceres": [-6.37, 39.47, "Cáceres"], "cadiz": [-6.29, 36.53, "Cádiz"], "cantabria": [-3.81, 43.46, "Cantabria"],
    "castellon": [-0.05, 39.99, "Castellón"], "ciudad real": [-3.93, 38.99, "Ciudad Real"], "cordoba": [-4.78, 37.89, "Córdoba"], "a coruna": [-8.41, 43.36, "A Coruña"],
    "cuenca": [-2.13, 40.07, "Cuenca"], "girona": [2.82, 41.98, "Girona"], "granada": [-3.60, 37.18, "Granada"], "guadalajara": [-3.17, 40.63, "Guadalajara"],
    "gipuzkoa": [-1.98, 43.32, "Gipuzkoa"], "huelva": [-6.95, 37.26, "Huelva"], "huesca": [-0.41, 42.14, "Huesca"], "baleares": [2.65, 39.57, "Baleares"],
    "jaen": [-3.79, 37.77, "Jaén"], "leon": [-5.57, 42.60, "León"], "lleida": [0.62, 41.62, "Lleida"], "lugo": [-7.56, 43.01, "Lugo"],
    "madrid": [-3.70, 40.42, "Madrid"], "malaga": [-4.42, 36.72, "Málaga"], "murcia": [-1.13, 37.99, "Murcia"], "navarra": [-1.64, 42.81, "Navarra"],
    "ourense": [-7.86, 42.34, "Ourense"], "palencia": [-4.53, 42.01, "Palencia"], "las palmas": [-15.43, 28.12, "Las Palmas"], "pontevedra": [-8.64, 42.43, "Pontevedra"],
    "la rioja": [-2.45, 42.46, "La Rioja"], "salamanca": [-5.66, 40.97, "Salamanca"], "santa cruz de tenerife": [-16.25, 28.47, "S. C. de Tenerife"], "segovia": [-4.12, 40.95, "Segovia"],
    "sevilla": [-5.98, 37.39, "Sevilla"], "soria": [-2.46, 41.76, "Soria"], "tarragona": [1.25, 41.12, "Tarragona"], "teruel": [-1.11, 40.34, "Teruel"],
    "toledo": [-4.02, 39.86, "Toledo"], "valencia": [-0.38, 39.47, "Valencia"], "valladolid": [-4.72, 41.65, "Valladolid"], "bizkaia": [-2.93, 43.26, "Bizkaia"],
    "zamora": [-5.74, 41.50, "Zamora"], "zaragoza": [-0.88, 41.65, "Zaragoza"], "ceuta": [-5.32, 35.89, "Ceuta"], "melilla": [-2.94, 35.29, "Melilla"],
  };
  var ALIAS = {
    "araba": "alava", "vitoria": "alava", "alacant": "alicante", "oviedo": "asturias", "gijon": "asturias", "principado de asturias": "asturias",
    "santander": "cantabria", "castello": "castellon", "castellon de la plana": "castellon", "la coruna": "a coruna", "coruna": "a coruna", "la coruña": "a coruna",
    "gerona": "girona", "guipuzcoa": "gipuzkoa", "san sebastian": "gipuzkoa", "donostia": "gipuzkoa", "illes balears": "baleares", "islas baleares": "baleares",
    "mallorca": "baleares", "palma": "baleares", "palma de mallorca": "baleares", "lerida": "lleida", "orense": "ourense", "logrono": "la rioja", "rioja": "la rioja",
    "gran canaria": "las palmas", "palmas": "las palmas", "tenerife": "santa cruz de tenerife", "santa cruz": "santa cruz de tenerife", "vizcaya": "bizkaia", "bilbao": "bizkaia",
    "pamplona": "navarra", "iruna": "navarra", "comunidad de madrid": "madrid", "region de murcia": "murcia", "cartagena": "murcia", "vigo": "pontevedra", "jerez": "cadiz",
    "elche": "alicante", "marbella": "malaga",
  };
  function claveProv(n) {
    var k = String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^provincia de\s+/, "").replace(/\s*\(.*\)\s*$/, "").trim();
    if (PROV[k]) return k;
    if (ALIAS[k]) return ALIAS[k];
    return null;
  }
  // Silueta simplificada de la península (longitud, latitud).
  var PENINSULA = [[-9.3, 43.05], [-8.9, 43.4], [-8.2, 43.65], [-7.0, 43.56], [-5.8, 43.62], [-4.5, 43.42], [-3.8, 43.47], [-3.0, 43.4], [-1.8, 43.38], [-1.4, 43.0], [-0.7, 42.8],
    [0.0, 42.68], [0.7, 42.85], [1.4, 42.6], [2.2, 42.43], [3.17, 42.43], [3.3, 42.25], [3.2, 41.9], [2.4, 41.4], [1.6, 41.2], [0.9, 41.0], [0.5, 40.6], [0.0, 40.05],
    [-0.3, 39.5], [0.2, 38.85], [-0.5, 38.3], [-0.7, 37.6], [-1.6, 37.3], [-2.1, 36.72], [-3.0, 36.75], [-4.4, 36.7], [-5.0, 36.45], [-5.6, 36.0], [-6.1, 36.3], [-6.4, 36.8],
    [-7.0, 37.18], [-7.4, 37.18], [-7.5, 37.5], [-7.25, 38.0], [-7.1, 38.8], [-7.4, 39.5], [-7.0, 40.2], [-6.85, 41.0], [-6.4, 41.6], [-6.6, 41.95], [-7.4, 41.85],
    [-8.1, 41.85], [-8.9, 41.88], [-8.9, 42.2], [-9.1, 42.6]];
  var ISLAS = [
    [[2.35, 39.58], [3.0, 39.95], [3.47, 39.75], [3.2, 39.3], [2.7, 39.45]],
    [[3.8, 40.05], [4.3, 39.95], [4.25, 39.82], [3.85, 39.92]],
    [[1.2, 38.95], [1.6, 39.12], [1.62, 38.88], [1.35, 38.85]],
  ];
  var CANARIAS = [[-18.0, 27.75], [-17.3, 28.05], [-16.9, 28.4], [-16.3, 28.55], [-15.6, 28.0], [-14.3, 28.3], [-13.7, 29.0]];
  var K = 34;
  function xy(lon, lat) {
    if (lon < -12) return [12 + (lon + 18.4) * 26, 404 + (29.4 - lat) * 28]; // recuadro de Canarias
    return [(lon + 9.8) * K, (44.0 - lat) * K * 1.3];
  }
  function camino(puntos) {
    return puntos.map(function (p, i) { var c = xy(p[0], p[1]); return (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1); }).join(" ") + "Z";
  }
  function mapaHtml() {
    var m = st.datos.mapa;
    var lista = m.provincias || [];
    var sinUbicar = [];
    var puntos = [];
    lista.forEach(function (p) {
      var k = claveProv(p.provincia);
      if (!k) { sinUbicar.push(p.provincia); return; }
      puntos.push({ k: k, d: p });
    });
    var max = Math.max(1, Math.max.apply(null, puntos.map(function (p) { return p.d.puntos || p.d.contratos || 0; }).concat([0])));
    var marcas = puntos.map(function (p) {
      var c = xy(PROV[p.k][0], PROV[p.k][1]);
      var valor = p.d.puntos || p.d.contratos || 0;
      var r = 6 + Math.sqrt(valor / max) * 20;
      var titulo = PROV[p.k][2] + ": " + (p.d.oficinas ? p.d.oficinas + (p.d.oficinas === 1 ? " oficina, " : " oficinas, ") : "") + p.d.personas + (p.d.personas === 1 ? " persona" : " personas") + ", " + p.d.contratos + " contratos, " + p.d.puntos + " puntos";
      return '<g class="icc-sala-burbuja' + (valor && valor === max ? " is-top" : "") + '"><title>' + esc(titulo) + "</title>" +
        '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="' + r.toFixed(1) + '"></circle>' +
        '<text x="' + c[0].toFixed(1) + '" y="' + (c[1] + r + 12).toFixed(1) + '" text-anchor="middle">' + esc(PROV[p.k][2]) + "</text></g>";
    }).join("");
    var vacio = !puntos.length;
    var w = (14.6 * K).toFixed(0), h = 472;
    return (
      '<div class="icc-sala-bloque-tit"><h2>Mapa de actividad</h2><span class="icc-sala-act">' +
      (m.fuente === "oficinas" ? "Por oficinas" : m.fuente === "fichas" ? "Por la provincia de cada ficha" : "") + "</span></div>" +
      '<div class="icc-sala-mapa-caja">' +
      '<svg class="icc-sala-svg" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="Mapa de España con la actividad por provincia">' +
      '<path class="icc-sala-tierra" d="' + camino(PENINSULA) + '"></path>' +
      ISLAS.map(function (i) { return '<path class="icc-sala-tierra" d="' + camino(i) + '"></path>'; }).join("") +
      '<rect class="icc-sala-recuadro" x="4" y="394" width="150" height="72" rx="8"></rect>' +
      CANARIAS.map(function (p) { var c = xy(p[0], p[1]); return '<circle class="icc-sala-isla" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="5"></circle>'; }).join("") +
      marcas + "</svg>" +
      (vacio
        ? '<p class="icc-sala-mapa-vacio">El mapa se llena cuando las oficinas o las fichas de los agentes tienen <b>provincia</b>. ' +
          (window.icc.auth.esAdminOSuperior() ? 'Puedes ponerla en <a href="#/mi-ficha/informacion">las fichas</a>.' : "") + "</p>"
        : "") +
      "</div>" +
      (sinUbicar.length ? '<p class="icc-sala-sinubicar">Sin ubicar en el mapa: ' + esc(sinUbicar.join(", ")) + "</p>" : "")
    );
  }

  // ---------------------------------------------------------- Interacción
  function enlazar() {
    main().querySelectorAll("[data-pestana]").forEach(function (b) {
      b.addEventListener("click", function () {
        st.pestana = b.getAttribute("data-pestana");
        repintarRanking();
      });
    });
    var pant = document.getElementById("sala-pantalla");
    if (pant) {
      pant.addEventListener("click", function () {
        var el = document.documentElement;
        if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen().catch(function () {}); return; }
        if (el.requestFullscreen) el.requestFullscreen().catch(function () { U.toast("Tu navegador no permite pantalla completa aquí (prueba con F11)", "info"); });
      });
    }
  }
  function repintarRanking() {
    var b = document.getElementById("sala-bloque-ranking");
    if (!b) return;
    b.innerHTML = rankingHtml();
    b.querySelectorAll("[data-pestana]").forEach(function (x) {
      x.addEventListener("click", function () { st.pestana = x.getAttribute("data-pestana"); repintarRanking(); });
    });
  }

  function animarContadores() {
    var nums = main().querySelectorAll(".icc-sala-num");
    if (reducido()) return;
    var t0 = performance.now();
    var dur = 1100;
    var paso = function (t) {
      var f = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - f, 3);
      nums.forEach(function (n) {
        var v = Number(n.getAttribute("data-valor"));
        var dec = Number(n.getAttribute("data-dec"));
        n.textContent = num(f === 1 ? v : v * e, f === 1 ? dec : dec ? 1 : 0);
      });
      if (f < 1 && st.activa) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  function reloj() {
    var el = document.getElementById("sala-reloj");
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  // ------------------------------------------------------------- Refresco
  function programar() {
    st.timers.push(setInterval(function () {
      if (!st.activa || document.visibilityState !== "visible") return;
      refrescar();
    }, REFRESCO_MS));
    st.timers.push(setInterval(function () {
      if (!st.activa) return;
      reloj();
      var act = document.getElementById("sala-act");
      if (act) act.textContent = "Actualizado " + haceCuanto(st.ahora);
    }, 15000));
    if (st.tv) {
      st.timers.push(setInterval(function () {
        if (!st.activa) return;
        var orden = ["comerciales", "equipos"].concat((st.datos.ranking.oficinas || []).length ? ["oficinas"] : []);
        st.pestana = orden[(orden.indexOf(st.pestana) + 1) % orden.length];
        repintarRanking();
      }, ROTACION_TV_MS));
    }
  }

  async function refrescar() {
    var r;
    try {
      r = await cargar(st.ahora);
    } catch (err) {
      return; // sin conexión: se reintenta en el siguiente ciclo
    }
    if (!st.activa) return;
    var nuevos = (r.eventos || []).filter(function (e) { return !st.vistos[e.id]; });
    st.ahora = r.ahora;
    nuevos.forEach(function (e) { st.vistos[e.id] = true; });
    var hayContrato = nuevos.some(esContrato);
    if (nuevos.length) {
      st.datos.eventos = nuevos.concat(st.datos.eventos).slice(0, 40);
      var ol = document.getElementById("sala-eventos");
      if (ol) {
        var vacio = ol.querySelector(".icc-sala-vacio");
        if (vacio) vacio.remove();
        ol.insertAdjacentHTML("afterbegin", nuevos.map(function (e) { return eventoHtml(e, true); }).join(""));
        while (ol.children.length > 40) ol.removeChild(ol.lastElementChild);
      }
      var tk = document.getElementById("sala-ticker");
      if (tk) tk.innerHTML = tickerHtml(st.datos.eventos);
    }
    if (hayContrato || Date.now() - st.ultimoCompleto > COMPLETO_MS) {
      try {
        var completo = await cargar();
        if (!st.activa) return;
        var eventosPrevios = st.datos.eventos;
        st.datos = completo;
        st.datos.eventos = eventosPrevios;
        st.ahora = completo.ahora;
        st.ultimoCompleto = Date.now();
        actualizarNumeros();
      } catch (err) { /* se reintenta */ }
    }
    var act = document.getElementById("sala-act");
    if (act) act.textContent = "Actualizado " + haceCuanto(st.ahora);
    if (hayContrato) {
      var c = nuevos.filter(esContrato)[0];
      celebrar(c);
    }
  }

  // Repinta cifras, ranking, objetivo y mapa sin perder el feed.
  function actualizarNumeros() {
    var k = st.datos.kpis;
    var valores = [k.contratos, k.ok, k.kw, k.citas, k.clientes, k.puntos];
    main().querySelectorAll(".icc-sala-num").forEach(function (n, i) {
      n.setAttribute("data-valor", valores[i]);
      n.textContent = num(valores[i], Number(n.getAttribute("data-dec")));
    });
    repintarRanking();
    var o = main().querySelector(".icc-sala-objetivo");
    if (o) o.innerHTML = objetivoHtml();
    var m = main().querySelector(".icc-sala-mapa");
    if (m) m.innerHTML = mapaHtml();
  }

  // ------------------------------------------------------------ Celebración
  function celebrar(e) {
    var t = evento(e);
    var aviso = document.createElement("div");
    aviso.className = "icc-sala-celebra";
    aviso.setAttribute("role", "status");
    aviso.innerHTML = '<span aria-hidden="true">🎉</span><div><strong>¡Nuevo contrato!</strong><p>' + t.txt + "</p></div>";
    document.body.appendChild(aviso);
    setTimeout(function () { aviso.classList.add("is-sale"); }, 5200);
    setTimeout(function () { aviso.remove(); }, 6000);
    confeti();
  }
  function confeti() {
    if (reducido()) return;
    var cv = document.createElement("canvas");
    cv.className = "icc-sala-confeti";
    cv.width = innerWidth;
    cv.height = innerHeight;
    document.body.appendChild(cv);
    var ctx = cv.getContext("2d");
    var colores = ["#22D3EE", "#34D399", "#FBBF24", "#F472B6", "#A78BFA", "#60A5FA"];
    var piezas = [];
    for (var i = 0; i < 160; i++) {
      piezas.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight / 3, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
        r: Math.random() * 6 + 4, c: colores[i % colores.length], g: Math.random() * Math.PI, vg: (Math.random() - 0.5) * 0.3 });
    }
    var t0 = performance.now();
    var paso = function (now) {
      var dt = now - t0;
      ctx.clearRect(0, 0, cv.width, cv.height);
      piezas.forEach(function (p) {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.g += p.vg;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.g); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
      });
      if (dt < 3200) requestAnimationFrame(paso);
      else cv.remove();
    };
    requestAnimationFrame(paso);
  }

  // ------------------------------------------------------------- Limpieza
  function limpiar() {
    st.activa = false;
    st.timers.forEach(function (t) { clearInterval(t); });
    st.timers = [];
    document.body.classList.remove("icc-sala-tv");
  }
  window.addEventListener("hashchange", function () {
    if (location.hash.indexOf("#/sala-ventas") !== 0) limpiar();
  });

  window.icc = window.icc || {};
  window.icc.sala = { view: view };
})();
