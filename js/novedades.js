/* =============================================================================
   ICC CRM · Novedades de tarifas (#/comparador/novedades)
   Lo que tramitacion cambia en los comparadores (altas, cambios de precio,
   retiradas) contado para el comercial: una linea de tiempo por dias con
   flechas ↓ (bajada = buena noticia para vender) y ↑, filtros y buscador.
   Tambien pinta el contador de "no vistas" en el menu y un aviso flotante
   breve (una vez por sesion) cuando hay novedades nuevas.
   Datos: api/tarifas_novedades.php (solo cambios reales, nada inventado).
   ============================================================================= */
window.icc = window.icc || {};
window.icc.novedades = (function () {
  var API_URL = "api/tarifas_novedades.php";
  var CLAVE_AVISO = "icc_nov_aviso_mostrado";
  var CADA_MS = 60000; // el contador del menu se refresca como mucho cada minuto

  var filtro = { tipo: "", accion: "", periodo: "", q: "" };
  var estado = { items: [], pagina: 1, hayMas: false, resumen: null, noVistas: 0, cargando: false };
  var contador = { valor: 0, ultima: null, pedidoEn: 0, pendiente: null };

  function U() { return window.icc.util; }
  function esc(v) { return U().escapeHtml(v); }
  function main() { return document.getElementById("icc-main"); }
  function puedeVer() {
    var auth = window.icc.auth;
    return !!(auth && auth.state && auth.state.user && auth.puede("comparador.usar"));
  }

  // ------------------------------------------------------------ Contador menu
  function pintarBadges(n) {
    document.querySelectorAll("[data-nov-badge]").forEach(function (b) {
      if (n > 0) {
        b.hidden = false;
        b.textContent = b.classList.contains("icc-nov-badge--dot") ? "" : (n > 99 ? "99+" : String(n));
        b.setAttribute("aria-label", n + (n === 1 ? " novedad de tarifas sin ver" : " novedades de tarifas sin ver"));
        b.title = b.getAttribute("aria-label");
      } else {
        b.hidden = true;
        b.textContent = "";
      }
    });
  }

  function pedirContador(forzar) {
    if (!puedeVer()) return Promise.resolve(null);
    var ahora = Date.now();
    if (!forzar && contador.pedidoEn && ahora - contador.pedidoEn < CADA_MS) {
      pintarBadges(contador.valor);
      return Promise.resolve(contador);
    }
    if (contador.pendiente) return contador.pendiente;
    contador.pedidoEn = ahora;
    contador.pendiente = window.icc.api.get(API_URL + "?contador=1")
      .then(function (r) {
        contador.valor = r && r.disponible ? (r.no_vistas | 0) : 0;
        contador.ultima = r && r.ultima ? r.ultima : null;
        pintarBadges(contador.valor);
        return contador;
      })
      .catch(function () { return null; }) // sin migracion o sin red: el menu sigue igual
      .then(function (r) { contador.pendiente = null; return r; });
    return contador.pendiente;
  }

  function avisoYaMostrado() {
    try { return sessionStorage.getItem(CLAVE_AVISO) === "1"; } catch (e) { return false; }
  }
  function marcarAvisoMostrado() {
    try { sessionStorage.setItem(CLAVE_AVISO, "1"); } catch (e) { /* modo privado */ }
  }

  function mostrarAviso(c) {
    if (!c || c.valor <= 0 || avisoYaMostrado()) return;
    if ((location.hash || "").split("?")[0] === "#/comparador/novedades") { marcarAvisoMostrado(); return; }
    if (document.querySelector(".icc-nov-aviso")) return;
    marcarAvisoMostrado();
    var n = c.valor;
    var el = document.createElement("div");
    el.className = "icc-nov-aviso";
    el.setAttribute("role", "status");
    el.innerHTML =
      '<span class="icc-nov-aviso-ico" aria-hidden="true">🔔</span>' +
      '<div class="icc-nov-aviso-txt"><strong>' + n + (n === 1 ? " novedad de tarifas" : " novedades de tarifas") + "</strong>" +
      (c.ultima ? "<span>" + esc(c.ultima.titulo) + "</span>" : "<span>Tramitación ha actualizado los comparadores.</span>") +
      "</div>" +
      '<a class="icc-btn icc-btn-primary icc-nov-aviso-btn" href="#/comparador/novedades">Ver novedades</a>' +
      '<button type="button" class="icc-nov-aviso-x" aria-label="Cerrar aviso">×</button>';
    document.body.appendChild(el);
    var cerrar = function () {
      el.classList.remove("is-in");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    };
    el.querySelector(".icc-nov-aviso-x").addEventListener("click", cerrar);
    el.querySelector(".icc-nov-aviso-btn").addEventListener("click", cerrar);
    requestAnimationFrame(function () { el.classList.add("is-in"); });
    setTimeout(cerrar, 12000);
  }

  // Lo llama el router en cada navegacion (despues de pintar el menu).
  function alNavegar() {
    if (!puedeVer()) return;
    pedirContador(false).then(mostrarAviso);
  }

  // ------------------------------------------------------------ Formateo
  var DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  // DATETIME de MySQL ("2026-10-23 09:20:15") a Date, tambien en Safari/iOS.
  function fecha(v) {
    var s = String(v || "");
    return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(" ", "T") : s);
  }
  function claveDia(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function etiquetaDia(d) {
    var hoy = new Date();
    var ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
    if (claveDia(d) === claveDia(hoy)) return "Hoy";
    if (claveDia(d) === claveDia(ayer)) return "Ayer";
    var txt = DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES[d.getMonth()];
    if (d.getFullYear() !== hoy.getFullYear()) txt += " de " + d.getFullYear();
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  function hora(d) { return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  function desdePeriodo(p) {
    if (!p) return "";
    var d = new Date();
    if (p === "7") d.setDate(d.getDate() - 6);
    if (p === "30") d.setDate(d.getDate() - 29);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  var ACCIONES = {
    alta: { txt: "Nueva", cls: "is-alta", ico: "＋" },
    cambio: { txt: "Cambio", cls: "is-cambio", ico: "✎" },
    baja: { txt: "Retirada", cls: "is-baja", ico: "－" },
  };
  var TIPOS = {
    energia: { txt: "Energía", ico: "⚡", ruta: "#/comparador/energia" },
    telefonia: { txt: "Telefonía", ico: "📶", ruta: "#/comparador/telefonia" },
  };

  function lineaCambio(c) {
    var sentido = c.sentido === "baja" || c.sentido === "sube" ? c.sentido : "igual";
    var flecha = "";
    if (sentido !== "igual") {
      var pct = c.pct != null && c.pct !== "" ? (Number(c.pct) > 0 ? "+" : "") + String(c.pct).replace(".", ",") + " %" : "";
      // Comision que sube = buena noticia: el servidor ya la marca como "baja" (verde).
      var arrow = c.es_comision ? (sentido === "baja" ? "↑" : "↓") : (sentido === "baja" ? "↓" : "↑");
      flecha = '<span class="icc-nov-flecha is-' + sentido + '" title="' +
        (sentido === "baja" ? "Buena noticia para vender" : "Ojo: empeora para el cliente") + '">' +
        arrow + (pct ? " " + esc(pct) : "") + "</span>";
    }
    var unidad = c.unidad ? ' <small>' + esc(c.unidad) + "</small>" : "";
    var valores = c.antes !== "" && c.antes != null
      ? '<span class="icc-nov-antes">' + esc(c.antes) + "</span>" +
        '<span class="icc-nov-to" aria-hidden="true">→</span>' +
        '<span class="icc-nov-despues">' + esc(c.despues) + unidad + "</span>"
      : '<span class="icc-nov-despues">' + esc(c.despues) + unidad + "</span>";
    return (
      '<li class="icc-nov-cambio is-' + sentido + '">' +
      '<span class="icc-nov-label">' + esc(c.label) + "</span>" +
      '<span class="icc-nov-valores">' + valores + "</span>" + flecha +
      "</li>"
    );
  }

  function fichaTarifa(det) {
    var t = det && det.tarifa;
    if (!t) return det && det.perfil ? '<span class="icc-nov-meta-chip">Perfil: ' + esc(det.perfil) + "</span>" : "";
    var partes = [t.peaje, t.modalidad, t.cliente].filter(function (x) { return x; });
    return partes.map(function (p) { return '<span class="icc-nov-meta-chip">' + esc(p) + "</span>"; }).join("");
  }

  function tarjeta(n) {
    var d = fecha(n.created_at);
    var det = n.detalle || {};
    var cambios = Array.isArray(det.cambios) ? det.cambios : [];
    var acc = ACCIONES[n.accion] || ACCIONES.cambio;
    var tipo = TIPOS[n.tipo] || TIPOS.energia;
    var tendencia = det.tendencia || "neutra";
    var visibles = cambios.slice(0, 6);
    var resto = cambios.length - visibles.length;
    return (
      '<article class="icc-nov-item is-' + esc(n.tipo) + " tend-" + esc(tendencia) + (n.nueva ? " is-nueva" : "") + '">' +
      '<span class="icc-nov-dot ' + acc.cls + '" aria-hidden="true">' + acc.ico + "</span>" +
      '<div class="icc-nov-card">' +
      '<div class="icc-nov-card-top">' +
      '<span class="icc-nov-chip is-' + esc(n.tipo) + '">' + tipo.ico + " " + tipo.txt + "</span>" +
      '<span class="icc-nov-chip ' + acc.cls + '">' + acc.txt + "</span>" +
      (tendencia === "baja" ? '<span class="icc-nov-chip is-buena">' + (det.comisiones ? "↑ Más comisión" : "↓ Baja de precio") + "</span>" : "") +
      (tendencia === "sube" ? '<span class="icc-nov-chip is-mala">' + (det.comisiones ? "↓ Menos comisión" : "↑ Sube de precio") + "</span>" : "") +
      (tendencia === "mixta" ? '<span class="icc-nov-chip">↕ Suben y bajan</span>' : "") +
      (n.nueva ? '<span class="icc-nov-nueva">Nueva</span>' : "") +
      '<time class="icc-nov-hora" datetime="' + esc(n.created_at) + '" title="' + esc(U().formatFechaHora(n.created_at)) + '">' + hora(d) + "</time>" +
      "</div>" +
      "<h3>" + esc(n.titulo) + "</h3>" +
      (fichaTarifa(det) ? '<div class="icc-nov-meta">' + fichaTarifa(det) + "</div>" : "") +
      (visibles.length ? '<ul class="icc-nov-cambios">' + visibles.map(lineaCambio).join("") + "</ul>" : "") +
      (resto > 0 ? '<p class="icc-nov-resto">y ' + resto + (resto === 1 ? " cambio más" : " cambios más") + "</p>" : "") +
      '<div class="icc-nov-pie">' +
      '<span class="icc-nov-autor">' + (n.autor_nombre ? "Por " + esc(n.autor_nombre) : "Tramitación") + " · " + esc(U().haceCuanto(n.created_at)) + "</span>" +
      (n.accion !== "baja" ? '<a class="icc-nov-abrir" href="' + tipo.ruta + '">Abrir comparador →</a>' : "") +
      "</div>" +
      "</div></article>"
    );
  }

  function timeline(items) {
    if (!items.length) {
      var filtrando = filtro.tipo || filtro.accion || filtro.periodo || filtro.q;
      return (
        '<div class="icc-nov-vacio">' +
        '<span aria-hidden="true">🗂️</span>' +
        (filtrando
          ? "<h3>Nada con estos filtros</h3><p>Prueba con otro periodo o borra la búsqueda.</p>" +
            '<button type="button" class="icc-btn icc-btn-secondary" data-nov-limpiar>Quitar filtros</button>'
          : "<h3>Todavía no hay novedades</h3><p>Cuando tramitación dé de alta, cambie o retire una tarifa en los comparadores, aparecerá aquí al momento.</p>") +
        "</div>"
      );
    }
    var grupos = [];
    var actual = null;
    items.forEach(function (n) {
      var d = fecha(n.created_at);
      var k = claveDia(d);
      if (!actual || actual.k !== k) {
        actual = { k: k, d: d, items: [] };
        grupos.push(actual);
      }
      actual.items.push(n);
    });
    return grupos.map(function (g) {
      var nuevas = g.items.filter(function (n) { return n.nueva; }).length;
      return (
        '<section class="icc-nov-dia">' +
        '<h2 class="icc-nov-dia-titulo"><span>' + esc(etiquetaDia(g.d)) + "</span>" +
        "<small>" + g.items.length + (g.items.length === 1 ? " novedad" : " novedades") +
        (nuevas ? " · <b>" + nuevas + (nuevas === 1 ? " sin ver" : " sin ver") + "</b>" : "") + "</small></h2>" +
        '<div class="icc-nov-lista">' + g.items.map(tarjeta).join("") + "</div>" +
        "</section>"
      );
    }).join("");
  }

  // ------------------------------------------------------------ Pantalla
  function segmento(nombre, opciones) {
    return (
      '<div class="icc-nov-seg" role="group" aria-label="' + esc(nombre) + '">' +
      opciones.map(function (o) {
        var activo = filtro[nombre] === o[0];
        return '<button type="button" class="icc-nov-seg-btn' + (activo ? " is-active" : "") +
          '" data-nov-filtro="' + nombre + '" data-valor="' + o[0] + '" aria-pressed="' + activo + '">' + o[1] + "</button>";
      }).join("") +
      "</div>"
    );
  }

  function pintarCabecera() {
    var r = estado.resumen || { total_30d: 0, energia_30d: 0, telefonia_30d: 0, hoy: 0 };
    var nv = estado.noVistas;
    var kpi = function (cls, ico, valor, label) {
      return '<div class="icc-nov-kpi ' + cls + '"><span aria-hidden="true">' + ico + "</span><b>" + valor + "</b><small>" + label + "</small></div>";
    };
    return (
      '<header class="icc-nov-hero">' +
      '<div class="icc-nov-hero-txt">' +
      '<span class="icc-nov-kicker"><span class="icc-nov-pulso" aria-hidden="true"></span>En directo desde tramitación</span>' +
      "<h1>Novedades de tarifas</h1>" +
      "<p>Cada alta, cambio de precio o retirada en los comparadores, al momento. " +
      '<span class="icc-nov-leyenda"><b class="ok">↓ verde</b> = baja de precio, argumento para vender · <b class="ko">↑ rojo</b> = sube.</span></p>' +
      "</div>" +
      '<div class="icc-nov-hero-acc">' +
      '<button type="button" class="icc-btn icc-btn-primary" id="nov-marcar"' + (nv ? "" : " disabled") + ">✓ Marcar todo como visto" +
      (nv ? ' <span class="icc-nov-hero-n">' + nv + "</span>" : "") + "</button>" +
      "</div>" +
      "</header>" +
      '<div class="icc-nov-kpis">' +
      kpi("is-nv", "🔔", nv, nv === 1 ? "sin ver" : "sin ver") +
      kpi("is-hoy", "📅", r.hoy, "hoy") +
      kpi("is-energia", "⚡", r.energia_30d, "energía · 30 días") +
      kpi("is-telefonia", "📶", r.telefonia_30d, "telefonía · 30 días") +
      "</div>"
    );
  }

  function pintarFiltros() {
    return (
      '<div class="icc-nov-filtros">' +
      segmento("tipo", [["", "Todas"], ["energia", "⚡ Energía"], ["telefonia", "📶 Telefonía"]]) +
      segmento("accion", [["", "Todo"], ["alta", "Nuevas"], ["cambio", "Cambios"], ["baja", "Retiradas"]]) +
      '<label class="icc-nov-select"><span class="icc-nov-sr">Periodo</span><select id="nov-periodo">' +
      [["", "Todo el historial"], ["hoy", "Hoy"], ["7", "Últimos 7 días"], ["30", "Últimos 30 días"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (filtro.periodo === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") +
      "</select></label>" +
      '<label class="icc-nov-buscar"><span aria-hidden="true">🔎</span><span class="icc-nov-sr">Buscar</span>' +
      '<input type="search" id="nov-q" placeholder="Buscar compañía, tarifa, operador…" value="' + esc(filtro.q) + '" autocomplete="off"></label>' +
      "</div>"
    );
  }

  function pintar() {
    var m = main();
    if (!m) return;
    m.innerHTML =
      '<div class="icc-nov">' +
      pintarCabecera() +
      pintarFiltros() +
      '<div class="icc-nov-timeline" id="nov-timeline" aria-live="polite">' + timeline(estado.items) + "</div>" +
      (estado.hayMas ? '<div class="icc-nov-mas"><button type="button" class="icc-btn icc-btn-secondary" id="nov-mas">Ver novedades anteriores</button></div>' : "") +
      "</div>";
    enlazar();
  }

  function pintarSoloLista() {
    var tl = document.getElementById("nov-timeline");
    if (!tl) return pintar();
    tl.innerHTML = timeline(estado.items);
    var mas = document.querySelector(".icc-nov-mas");
    if (mas) mas.parentNode.removeChild(mas);
    if (estado.hayMas) {
      tl.insertAdjacentHTML("afterend", '<div class="icc-nov-mas"><button type="button" class="icc-btn icc-btn-secondary" id="nov-mas">Ver novedades anteriores</button></div>');
      document.getElementById("nov-mas").addEventListener("click", cargarMas);
    }
    enlazarLimpiar();
  }

  function enlazarLimpiar() {
    var b = document.querySelector("[data-nov-limpiar]");
    if (b) b.addEventListener("click", function () {
      filtro = { tipo: "", accion: "", periodo: "", q: "" };
      cargar(true).then(pintar);
    });
  }

  function enlazar() {
    document.querySelectorAll("[data-nov-filtro]").forEach(function (b) {
      b.addEventListener("click", function () {
        var nombre = b.getAttribute("data-nov-filtro");
        filtro[nombre] = b.getAttribute("data-valor");
        document.querySelectorAll('[data-nov-filtro="' + nombre + '"]').forEach(function (x) {
          var activo = x === b;
          x.classList.toggle("is-active", activo);
          x.setAttribute("aria-pressed", String(activo));
        });
        cargar(true).then(pintarSoloLista);
      });
    });
    var sel = document.getElementById("nov-periodo");
    if (sel) sel.addEventListener("change", function () {
      filtro.periodo = sel.value;
      cargar(true).then(pintarSoloLista);
    });
    var q = document.getElementById("nov-q");
    var t = null;
    if (q) q.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        filtro.q = q.value.trim();
        cargar(true).then(pintarSoloLista);
      }, 280);
    });
    var marcar = document.getElementById("nov-marcar");
    if (marcar) marcar.addEventListener("click", marcarVistas);
    var mas = document.getElementById("nov-mas");
    if (mas) mas.addEventListener("click", cargarMas);
    enlazarLimpiar();
  }

  function parametros(pagina) {
    var p = new URLSearchParams();
    if (filtro.tipo) p.set("tipo", filtro.tipo);
    if (filtro.accion) p.set("accion", filtro.accion);
    var desde = desdePeriodo(filtro.periodo);
    if (desde) p.set("desde", desde);
    if (filtro.q) p.set("q", filtro.q);
    if (pagina > 1) p.set("pagina", String(pagina));
    var s = p.toString();
    return API_URL + (s ? "?" + s : "");
  }

  var peticion = 0;
  function cargar(reiniciar) {
    var mia = ++peticion;
    var pagina = reiniciar ? 1 : estado.pagina + 1;
    return window.icc.api.get(parametros(pagina)).then(function (r) {
      if (mia !== peticion) return; // llego tarde: ya hay otra busqueda en marcha
      estado.disponible = r.disponible !== false;
      estado.items = reiniciar ? (r.novedades || []) : estado.items.concat(r.novedades || []);
      estado.pagina = pagina;
      estado.hayMas = !!r.hay_mas;
      estado.resumen = r.resumen || estado.resumen;
      estado.noVistas = r.no_vistas | 0;
      contador.valor = estado.noVistas;
      pintarBadges(contador.valor);
    });
  }

  function cargarMas() {
    var b = document.getElementById("nov-mas");
    if (b) { b.disabled = true; b.textContent = "Cargando…"; }
    cargar(false).then(pintarSoloLista).catch(function (err) {
      U().toast(err.message || "No se pudieron cargar más novedades", "error");
      if (b) { b.disabled = false; b.textContent = "Ver novedades anteriores"; }
    });
  }

  function marcarVistas() {
    var b = document.getElementById("nov-marcar");
    if (b) b.disabled = true;
    window.icc.api.post(API_URL + "?accion=vistas", {}).then(function () {
      estado.noVistas = 0;
      contador.valor = 0;
      contador.ultima = null;
      estado.items.forEach(function (n) { n.nueva = false; });
      pintarBadges(0);
      marcarAvisoMostrado();
      pintar();
      U().toast("Novedades marcadas como vistas", "success");
      // La campana tambien se limpia (las notificaciones de novedades quedan leidas).
      var dot = document.getElementById("notif-dot");
      if (dot && window.icc.data && window.icc.data.listarNotificaciones) {
        window.icc.data.listarNotificaciones().then(function (ns) {
          dot.hidden = !(ns || []).some(function (x) { return !x.leido; });
        }).catch(function () {});
      }
    }).catch(function (err) {
      if (b) b.disabled = false;
      U().toast(err.message || "No se pudo marcar como visto", "error");
    });
  }

  async function view() {
    var m = main();
    marcarAvisoMostrado(); // ya esta aqui: no hace falta el aviso flotante
    var aviso = document.querySelector(".icc-nov-aviso");
    if (aviso && aviso.parentNode) aviso.parentNode.removeChild(aviso);
    m.innerHTML = '<div class="icc-loading">Cargando novedades de tarifas…</div>';
    try {
      await cargar(true);
    } catch (err) {
      m.innerHTML = '<p class="icc-empty">No se pudieron cargar las novedades: ' + esc(err.message || "") + "</p>";
      return;
    }
    if (!estado.disponible) {
      m.innerHTML =
        '<div class="icc-nov">' +
        '<div class="icc-aviso icc-aviso-oro">⚠️ Falta importar <code>sql/migracion_tarifas_novedades.sql</code> en la base de datos para registrar las novedades de tarifas.</div>' +
        "</div>";
      return;
    }
    pintar();
  }

  return { view: view, alNavegar: alNavegar, refrescarContador: function () { return pedirContador(true); } };
})();
