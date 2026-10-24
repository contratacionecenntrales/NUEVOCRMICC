/* =============================================================================
   ICC CRM · Cinta en directo (todas las pantallas menos la sala de ventas)
   Una franja fina bajo el menú con los anuncios de dirección y los últimos
   movimientos reales del equipo (anónimos fuera de tu equipo: lo decide
   api/sala.php). Se puede pausar y respeta "reducir movimiento".
   ============================================================================= */
(function () {
  var API = window.icc.api;
  var esc = window.icc.util.escapeHtml;
  var REFRESCO_MS = 45000;
  var CLAVE_PAUSA = "icc-cinta-pausa";

  var st = { eventos: [], anuncios: [], ahora: null, vistos: {}, nuevos: {}, timer: null, montada: false, pausa: false, oculta: false };

  function leerPausa() {
    try { return localStorage.getItem(CLAVE_PAUSA) === "1"; } catch (e) { return false; }
  }
  function guardarPausa(v) {
    try { localStorage.setItem(CLAVE_PAUSA, v ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
  }
  function reducido() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function el() {
    return document.getElementById("icc-cinta");
  }

  function hace(fecha) {
    if (!fecha || !st.ahora) return "";
    var s = Math.max(0, Math.round((new Date(String(st.ahora).replace(" ", "T")) - new Date(String(fecha).replace(" ", "T"))) / 1000));
    if (s < 60) return "ahora";
    if (s < 3600) return "hace " + Math.round(s / 60) + " min";
    if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
    return "hace " + Math.round(s / 86400) + " d";
  }

  function cara(foto, ico, clase) {
    return foto
      ? '<img class="icc-cinta-cara' + (clase || "") + '" src="' + esc(foto) + '" alt="" loading="lazy">'
      : '<i class="icc-cinta-ico' + (clase || "") + '" aria-hidden="true">' + ico + "</i>";
  }
  function n(v) { return Number(v || 0).toLocaleString("es-ES"); }
  /** Cifras reales de toda la red (sin nombres), para que la cinta no dependa de una sola persona. */
  function resumenItems() {
    var r = st.resumen;
    if (!r) return [];
    var it = function (ico, txt) { return '<span class="icc-cinta-item is-cifra"><i class="icc-cinta-ico" aria-hidden="true">' + ico + '</i><span class="icc-cinta-chip is-red">Red ICC</span><span>' + txt + "</span></span>"; };
    var out = [];
    var hoy = [];
    if (r.citas_hoy) hoy.push("<b>" + n(r.citas_hoy) + "</b> " + (r.citas_hoy === 1 ? "visita concertada" : "visitas concertadas"));
    if (r.visitas_hoy) hoy.push("<b>" + n(r.visitas_hoy) + "</b> " + (r.visitas_hoy === 1 ? "visita realizada" : "visitas realizadas"));
    if (r.contratos_hoy) hoy.push("<b>" + n(r.contratos_hoy) + "</b> " + (r.contratos_hoy === 1 ? "contrato" : "contratos"));
    if (r.clientes_hoy) hoy.push("<b>" + n(r.clientes_hoy) + "</b> " + (r.clientes_hoy === 1 ? "cliente nuevo" : "clientes nuevos"));
    if (hoy.length) out.push(it("📊", "Hoy en la red: " + hoy.join(" · ")));
    if (r.activos_hoy) out.push(it("👥", "<b>" + n(r.activos_hoy) + "</b> " + (r.activos_hoy === 1 ? "persona trabajando" : "personas trabajando") + " hoy en el CRM"));
    if (r.contratos_mes) out.push(it("📈", "Este mes: <b>" + n(r.contratos_mes) + "</b> " + (r.contratos_mes === 1 ? "contrato" : "contratos") + (r.ok_mes ? " · <b>" + n(r.ok_mes) + "</b> OK" : "")));
    if (r.citas_semana) out.push(it("📅", "<b>" + n(r.citas_semana) + "</b> " + (r.citas_semana === 1 ? "visita agendada" : "visitas agendadas") + " para los próximos 7 días"));
    if (r.oficinas) out.push(it("🏢", "<b>" + n(r.oficinas) + "</b> " + (r.oficinas === 1 ? "oficina o distribuidor" : "oficinas y distribuidores") + (r.provincias ? " en <b>" + n(r.provincias) + "</b> " + (r.provincias === 1 ? "provincia" : "provincias") : "")));
    if (r.oficinas_activas_hoy) out.push(it("⚡", "<b>" + n(r.oficinas_activas_hoy) + "</b> " + (r.oficinas_activas_hoy === 1 ? "oficina con actividad" : "oficinas con actividad") + " hoy"));
    if (r.equipo) out.push(it("🚀", "<b>" + n(r.equipo) + "</b> personas en el equipo comercial de ICC"));
    return out;
  }
  function esVenta(e) {
    return e.tipo === "contrato" || e.tipo === "contrato_ok" || (e.tipo === "fase" && e.estado === "cliente_activo");
  }
  function items() {
    var fmt = window.icc.sala && window.icc.sala.textoEvento;
    var out = st.anuncios.map(function (a) {
      var lugar = [a.ciudad, a.provincia].filter(Boolean).join(", ");
      return '<button type="button" class="icc-cinta-item is-anuncio" data-anuncio="' + a.id + '" title="Ver el anuncio">' +
        cara(a.foto, esc(a.emoji || "📣"), " is-grande") + '<span class="icc-cinta-chip">📣 Dirección</span>' +
        "<span>" + esc(a.texto) + "</span>" + (lugar ? " <small>📍 " + esc(lugar) + "</small>" : "") + "</button>";
    });
    // Variedad: como mucho 2 movimientos por persona y, si hay movimientos de
    // las últimas 24 h, solo esos (los antiguos solo rellenan si no hay nada).
    var ref = st.ahora ? new Date(String(st.ahora).replace(" ", "T")).getTime() : Date.now();
    var recientes = st.eventos.filter(function (e) { return e.tipo !== "anuncio" && ref - new Date(String(e.fecha).replace(" ", "T")).getTime() < 86400000; });
    var base = recientes.length >= 4 ? recientes : st.eventos.filter(function (e) { return e.tipo !== "anuncio"; });
    var porPersona = {};
    var elegidos = base.filter(function (e) {
      var k = e.quien || e.id;
      porPersona[k] = (porPersona[k] || 0) + 1;
      return porPersona[k] <= 2;
    }).slice(0, 10);
    var cifras = resumenItems();
    var mezcla = [];
    elegidos.forEach(function (e, i) {
      mezcla.push(e);
      if (i % 2 === 1 && cifras.length) mezcla.push(cifras.shift());
    });
    mezcla = mezcla.concat(cifras);
    var textos = {};
    mezcla.forEach(function (e) {
      if (typeof e === "string") { out.push(e); return; }
      if (!fmt) return;
      var t = fmt(e);
      if (textos[t.txt]) return; // el mismo movimiento repetido sale una sola vez
      textos[t.txt] = true;
      out.push('<span class="icc-cinta-item' + (esVenta(e) ? " is-venta" : "") + (st.nuevos[e.id] ? " is-reciente" : "") + '">' + cara(e.foto, t.ico) +
        (esVenta(e) ? '<span class="icc-cinta-chip is-venta">🔥 Venta</span>' : "") + "<span>" + t.txt + "</span> <small>" + esc(hace(e.fecha)) + "</small></span>");
    });
    return out;
  }

  function pintar() {
    var c = el();
    if (!c) return;
    var lista = items();
    var pista = c.querySelector(".icc-cinta-pista");
    if (!lista.length) {
      c.hidden = true;
      return;
    }
    c.hidden = st.oculta;
    var html = lista.join("");
    // Duplicado para que el desplazamiento sea continuo (solo si se mueve).
    var copia = '<span class="icc-cinta-copia">' + html + "</span>";
    pista.innerHTML = copia + (reducido() ? "" : copia.replace('class="icc-cinta-copia"', 'class="icc-cinta-copia" aria-hidden="true"'));
    pista.style.setProperty("--dur", Math.max(30, lista.length * 9) + "s");
    c.classList.toggle("is-pausa", st.pausa);
    var b = c.querySelector(".icc-cinta-pausa");
    b.textContent = st.pausa ? "▶" : "⏸";
    b.setAttribute("aria-label", st.pausa ? "Reanudar la cinta" : "Pausar la cinta");
    b.title = b.getAttribute("aria-label");
  }

  async function cargar(inicial) {
    var qs = inicial || !st.ahora ? "solo_eventos=1&ventana=72" : "solo_eventos=1&desde=" + encodeURIComponent(st.ahora);
    var r;
    try {
      r = await API.get("api/sala.php?" + qs);
    } catch (err) {
      return;
    }
    st.ahora = r.ahora;
    st.anuncios = r.anuncios || [];
    if (r.resumen) st.resumen = r.resumen;
    var nuevos = (r.eventos || []).filter(function (e) { return !st.vistos[e.id]; });
    nuevos.forEach(function (e) { st.vistos[e.id] = true; if (!inicial) st.nuevos[e.id] = true; });
    var E = window.icc.estelar;
    if (E) {
      // Los anuncios se celebran a pantalla completa (una vez por navegador).
      E.anuncios(st.anuncios);
      // Una venta que entra mientras trabajas también se celebra.
      if (!inicial) {
        var v = nuevos.filter(esVenta)[0];
        if (v && window.icc.sala) E.venta(v, window.icc.sala.textoEvento(v).txt.replace(/<[^>]+>/g, ""));
      }
    }
    if (nuevos.length || inicial) {
      st.eventos = nuevos.concat(st.eventos).slice(0, 30);
      var c = el();
      if (c && !inicial && nuevos.length) {
        c.classList.remove("is-nuevo");
        void c.offsetWidth;
        c.classList.add("is-nuevo");
      }
    }
    pintar();
  }

  function montar() {
    var sticky = document.querySelector(".icc-sticky-top");
    if (!sticky || el()) return;
    st.pausa = leerPausa();
    sticky.insertAdjacentHTML("beforeend",
      '<div class="icc-cinta" id="icc-cinta" hidden role="region" aria-label="Actividad en directo del equipo">' +
      (window.icc.auth.puedeVerSala()
        ? '<a class="icc-cinta-tit" href="#/sala-ventas" title="Abrir la sala de ventas"><i aria-hidden="true"></i>En directo</a>'
        : '<span class="icc-cinta-tit"><i aria-hidden="true"></i>En directo</span>') +
      '<div class="icc-cinta-vent"><div class="icc-cinta-pista"></div></div>' +
      '<button type="button" class="icc-cinta-pausa"></button>' +
      "</div>");
    el().addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-anuncio]");
      if (!b || !window.icc.estelar) return;
      var a = st.anuncios.filter(function (x) { return String(x.id) === b.getAttribute("data-anuncio"); })[0];
      if (a) window.icc.estelar.repetir(a);
    });
    el().querySelector(".icc-cinta-pausa").addEventListener("click", function () {
      st.pausa = !st.pausa;
      guardarPausa(st.pausa);
      pintar();
    });
    st.montada = true;
    st.vistos = {};
    st.eventos = [];
    cargar(true);
    if (st.timer) clearInterval(st.timer);
    st.timer = setInterval(function () {
      if (!el()) { clearInterval(st.timer); st.timer = null; return; }
      if (document.visibilityState === "visible" && !st.oculta) cargar(false);
    }, REFRESCO_MS);
  }

  // La sala de ventas ya tiene su propia cinta.
  function alNavegar() {
    if (!el()) montar();
    var ruta = (location.hash || "").split("?")[0];
    st.oculta = ruta === "#/sala-ventas";
    var c = el();
    if (c) c.hidden = st.oculta || !items().length;
  }

  window.icc = window.icc || {};
  window.icc.cinta = { alNavegar: alNavegar, recargar: function () { cargar(true); } };
})();
