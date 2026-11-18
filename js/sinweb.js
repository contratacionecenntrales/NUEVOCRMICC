/* =============================================================================
   ICC CRM · Campaña de llamadas a negocios de Asturias sin web (#/sin-web)
   Búsqueda en Google Places por sector y zona, lista con el teléfono para
   llamar, guion, resultado en un clic, reparto entre comerciales y exportación.
   Dirección y jefes: todo; comerciales y backoffice: lo suyo. API: api/sinweb.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null, f: { estado: "hoy", comarca: "", sector: "", q: "" }, sect: [], zonas: [] };
  var COLOR = { pendiente: "", volver: "aviso", no_contesta: "", interesado: "ok", no_interesa: "", no_llamar: "aviso", agotado: "", "": "" };

  function main() { return document.getElementById("icc-main"); }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }
  function fecha(f) { if (!f) return ""; return new Date(String(f).replace(" ", "T")).toLocaleString("es-ES", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Cargando la campaña…</div>';
    await cargar();
  }
  async function cargar() {
    var f = S.f, q = "api/sinweb.php?action=lista&estado=" + encodeURIComponent(f.estado) + "&comarca=" + encodeURIComponent(f.comarca) + "&sector=" + encodeURIComponent(f.sector) + "&q=" + encodeURIComponent(f.q);
    try { S.d = await API.get(q); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    pintar();
  }

  function tarjeta(n) {
    var tel = String(n.telefono || "").replace(/[^\d+]/g, "");
    var mapa = n.place_id ? "https://www.google.com/maps/place/?q=place_id:" + encodeURIComponent(n.place_id) : "https://www.google.com/maps/search/" + encodeURIComponent(n.nombre + " " + (n.concejo || "") + " Asturias");
    var fin = ["interesado", "no_interesa", "no_llamar", "agotado"].indexOf(n.llamada_estado) !== -1;
    var mio = Number(n.llamada_asignado) === Number(S.d.yo);
    return '<article class="icc-card icc-sw-card" data-id="' + n.id + '"><header><div><strong>' + esc(n.nombre) + "</strong><small>" + esc(n.sector_nombre) + " · " + esc([n.concejo, n.comarca].filter(Boolean).join(", ") || n.localidad || "Asturias") + "</small>" +
      (n.direccion ? "<small>📍 " + esc(n.direccion) + "</small>" : "") + "</div>" + pill(S.d.estados[n.llamada_estado] || "Por llamar", COLOR[n.llamada_estado]) + "</header>" +
      '<div class="icc-sw-acciones"><a class="icc-btn icc-btn-primary icc-sw-tel" href="tel:' + esc(tel) + '">📞 ' + esc(n.telefono) + '</a><a class="icc-btn icc-btn-ghost icc-mo-mini" href="' + esc(mapa) + '" target="_blank" rel="noopener">Ver en Maps</a>' +
        (S.d.es_dir && !n.llamada_asignado && !fin ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-tomar="' + n.id + '">Me lo quedo</button>' : "") + "</div>" +
      "<small class=\"icc-sw-meta\">" + (n.asignado ? "👤 " + esc(n.asignado.trim()) : "Sin asignar") + (n.llamada_intentos > 0 ? " · " + n.llamada_intentos + " intentos" : "") + (n.llamada_proxima && !fin ? " · próxima: " + esc(fecha(n.llamada_proxima)) : "") + (n.llamada_nota ? " · «" + esc(n.llamada_nota) + "»" : "") + "</small>" +
      (!fin && (mio || S.d.es_dir) ? '<div class="icc-sw-res">' + Object.keys(S.d.resultados).map(function (k) { return '<button class="icc-btn ' + (k === "interesado" ? "icc-btn-primary" : k === "no_llamar" ? "icc-btn-ghost" : "icc-btn-secondary") + ' icc-mo-mini" data-res="' + k + '">' + esc(S.d.resultados[k]) + "</button>"; }).join("") + "</div>" +
        '<div class="icc-sw-extra" hidden><input class="icc-input" data-nota placeholder="Nota (con quién hablaste, qué necesita…)"><label class="icc-sw-cuando" hidden><span>Día y hora</span><input class="icc-input" type="datetime-local" data-cuando></label><button class="icc-btn icc-btn-primary icc-mo-mini" data-guardar>Guardar</button></div>' : "") + "</article>";
  }

  function pintar() {
    var d = S.d, c = d.contadores || {}, f = S.f;
    var total = Object.keys(c).reduce(function (a, k) { return a + Number(c[k]); }, 0);
    var html = '<div class="icc-ia icc-mo icc-sw">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">Motor de Scraping · Campaña prioritaria</span><h1>📞 Negocios de Asturias sin página web</h1>' +
      "<p>Negocios que aparecen en Google Maps sin web y con teléfono: <b>llámales</b>. Les ofrecemos su página web y, de paso, el estudio gratuito de luz y teléfono (100 % servicios). Marca el resultado de cada llamada: los interesados pasan al CRM con visita o llamada en tu agenda.</p></div>" +
      (d.es_dir ? '<a class="icc-btn icc-btn-secondary" href="api/sinweb.php?action=exportar">⬇ Exportar CSV</a>' : "") + "</section>" +
      '<div class="icc-mo-kpis">' + [["🏪", total, "Negocios sin web con teléfono"], ["📞", d.para_hoy, "Para llamar ahora"], ["✔️", d.mis_llamadas_hoy, "Mis llamadas hoy"], ["⭐", c.interesado || 0, "Interesados"], ["🕓", c.volver || 0, "Volver a llamar"]]
        .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>";
    if (d.es_dir) {
      html += '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>🔎 Buscar negocios sin web</h2>' + (d.places ? "" : '<p class="icc-mo-aviso">Falta la clave de Google Places: Motor → Fábrica de agentes → Agente Scraper.</p>') +
        '<p class="icc-ia-nota">Busca en Google Maps los sectores y zonas que elijas y guarda solo lo nuevo. Cada sector × zona son 1-2 búsquedas (máximo 40 por vez).</p>' +
        '<span class="icc-mo-etq">Sectores</span><div class="icc-mo-sectores">' + Object.keys(d.sectores).map(function (k) { return '<label class="icc-mo-chip' + (S.sect.indexOf(k) !== -1 ? " is-sel" : "") + '"><input type="checkbox" hidden data-sect="' + k + '"' + (S.sect.indexOf(k) !== -1 ? " checked" : "") + ">" + esc(d.sectores[k]) + "</label>"; }).join("") + "</div>" +
        '<span class="icc-mo-etq">Zonas de Asturias</span><div class="icc-mo-sectores">' + Object.keys(d.zonas).map(function (z) { return '<label class="icc-mo-chip' + (S.zonas.indexOf(z) !== -1 ? " is-sel" : "") + '"><input type="checkbox" hidden data-zona="' + esc(z) + '"' + (S.zonas.indexOf(z) !== -1 ? " checked" : "") + ">" + esc(z) + "</label>"; }).join("") + "</div>" +
        '<button class="icc-btn icc-btn-primary" id="sw-buscar"' + (d.places ? "" : " disabled") + ">🔎 Buscar negocios sin web</button></section>" +
        '<section class="icc-card icc-ia-bloque"><h2>👥 Repartir entre el equipo</h2><p class="icc-ia-nota">Reparte por igual los negocios sin asignar (por comarca y concejo, para que cada uno llame a una zona). Cada persona recibe un aviso.</p>' +
        '<div class="icc-sw-usuarios">' + d.usuarios.map(function (u) { return '<label class="icc-sw-u"><input type="checkbox" data-usuario="' + u.id + '"><span><b>' + esc(u.nombre.trim()) + "</b><small>" + (u.pendientes || 0) + " por llamar · " + (u.interesados || 0) + " interesados · " + u.llamadas_hoy + " llamadas hoy</small></span></label>"; }).join("") + "</div>" +
        '<div class="icc-mo-3"><label><span>Por persona</span><input class="icc-input" type="number" id="sw-pp" min="1" max="200" value="30"></label><label><span>Comarca</span><select class="icc-select" id="sw-rcom"><option value="">Todas</option>' + d.comarcas.map(function (x) { return '<option value="' + esc(x.comarca) + '">' + esc(x.comarca) + " (" + x.n + ")</option>"; }).join("") + '</select></label><label><span>Sector</span><select class="icc-select" id="sw-rsec"><option value="">Todos</option>' + Object.keys(d.sectores).map(function (k) { return '<option value="' + k + '">' + esc(d.sectores[k]) + "</option>"; }).join("") + "</select></label></div>" +
        '<button class="icc-btn icc-btn-primary" id="sw-repartir">Repartir (' + (c[""] || 0) + " sin asignar)</button></section></div>";
    }
    html += '<details class="icc-card icc-ia-bloque icc-sw-guion"' + (d.es_dir ? "" : " open") + "><summary><b>📋 Guion de la llamada</b></summary>" +
      (d.es_config ? '<textarea class="icc-input" id="sw-guion" rows="8">' + esc(d.guion) + '</textarea><button class="icc-btn icc-btn-secondary icc-mo-mini" id="sw-gguion">Guardar guion</button>' : '<pre class="icc-mo-pre">' + esc(d.guion.replace(/\{negocio\}/g, "el negocio").replace(/\{sector\}/g, "su sector")) + "</pre>") +
      '<p class="icc-ia-nota">Si es un autónomo o un número personal, consulta antes la Lista Robinson. Si alguien pide que no le llamemos, marca «No llamar más»: no vuelve a salir en ninguna campaña.</p></details>' +
      '<div class="icc-mo-cab"><div class="icc-mo-filtros"><select class="icc-select" id="sw-est">' + [["hoy", "📞 Para llamar ahora"], ["", "Todos"]].concat(Object.keys(d.estados).filter(function (k) { return k !== ""; }).map(function (k) { return [k, d.estados[k]]; })).concat(d.es_dir ? [["sin_asignar", "Sin asignar"]] : [])
        .map(function (o) { return '<option value="' + o[0] + '"' + (f.estado === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" +
      '<select class="icc-select" id="sw-com"><option value="">Todas las comarcas</option>' + d.comarcas.map(function (x) { return '<option value="' + esc(x.comarca) + '"' + (f.comarca === x.comarca ? " selected" : "") + ">" + esc(x.comarca) + "</option>"; }).join("") + "</select>" +
      '<select class="icc-select" id="sw-sec"><option value="">Todos los sectores</option>' + Object.keys(d.sectores).map(function (k) { return '<option value="' + k + '"' + (f.sector === k ? " selected" : "") + ">" + esc(d.sectores[k]) + "</option>"; }).join("") + "</select>" +
      '<input class="icc-input" id="sw-q" placeholder="Buscar negocio o teléfono" value="' + esc(f.q) + '"></div><small class="icc-muted">' + d.negocios.length + " negocios</small></div>" +
      (d.negocios.length ? '<div class="icc-sw-lista">' + d.negocios.map(tarjeta).join("") + "</div>" : '<p class="icc-empty">' + (f.estado === "hoy" ? (d.es_dir ? "Nada para llamar ahora. Busca negocios sin web o repártelos al equipo." : "No tienes llamadas pendientes ahora mismo. ¡Buen trabajo!") : "Ningún negocio con estos filtros.") + "</p>") + "</div>";
    main().innerHTML = html;
    enlazar();
  }

  function enlazar() {
    var r = main();
    ["sw-est", "sw-com", "sw-sec"].forEach(function (id) { var el = document.getElementById(id); if (el) el.addEventListener("change", function () { S.f = { estado: r.querySelector("#sw-est").value, comarca: r.querySelector("#sw-com").value, sector: r.querySelector("#sw-sec").value, q: r.querySelector("#sw-q").value }; cargar(); }); });
    var q = document.getElementById("sw-q"); if (q) q.addEventListener("keydown", function (e) { if (e.key === "Enter") { S.f.q = q.value; cargar(); } });
    r.querySelectorAll("[data-sect]").forEach(function (i) { i.addEventListener("change", function () { var k = i.dataset.sect; S.sect = i.checked ? S.sect.concat(k) : S.sect.filter(function (x) { return x !== k; }); i.parentNode.classList.toggle("is-sel", i.checked); }); });
    r.querySelectorAll("[data-zona]").forEach(function (i) { i.addEventListener("change", function () { var k = i.dataset.zona; S.zonas = i.checked ? S.zonas.concat(k) : S.zonas.filter(function (x) { return x !== k; }); i.parentNode.classList.toggle("is-sel", i.checked); }); });
    var b = document.getElementById("sw-buscar");
    if (b) b.addEventListener("click", function () {
      if (!S.sect.length || !S.zonas.length) return U.toast("Elige al menos un sector y una zona", "error");
      var ubic = []; S.zonas.forEach(function (z) { ubic = ubic.concat(S.d.zonas[z]); });
      b.textContent = "Buscando en Google Maps…";
      hacer(b, async function () { var x = await API.post("api/sinweb.php?action=buscar", { sectores: S.sect, ubicaciones: ubic }); U.toast("✓ " + x.texto, "success"); S.f.estado = "sin_asignar"; await cargar(); });
    });
    var rp = document.getElementById("sw-repartir");
    if (rp) rp.addEventListener("click", function () {
      var us = [].map.call(r.querySelectorAll("[data-usuario]:checked"), function (i) { return Number(i.value || i.dataset.usuario); });
      if (!us.length) return U.toast("Marca a quién repartir", "error");
      hacer(rp, async function () { var x = await API.post("api/sinweb.php?action=repartir", { usuarios: us, por_persona: Number(document.getElementById("sw-pp").value), comarca: document.getElementById("sw-rcom").value, sector: document.getElementById("sw-rsec").value }); U.toast("✓ " + x.texto, "success"); await cargar(); });
    });
    var gg = document.getElementById("sw-gguion"); if (gg) gg.addEventListener("click", function () { hacer(gg, async function () { await API.put("api/sinweb.php?action=guion", { guion: document.getElementById("sw-guion").value }); U.toast("✓ Guion guardado", "success"); }); });
    r.querySelectorAll("[data-tomar]").forEach(function (t) { t.addEventListener("click", function () { hacer(t, async function () { await API.post("api/sinweb.php?action=tomar", { id: Number(t.dataset.tomar) }); await cargar(); }); }); });
    r.querySelectorAll(".icc-sw-card").forEach(function (art) {
      var elegido = null, extra = art.querySelector(".icc-sw-extra");
      art.querySelectorAll("[data-res]").forEach(function (bt) {
        bt.addEventListener("click", function () {
          elegido = bt.dataset.res;
          art.querySelectorAll("[data-res]").forEach(function (x) { x.classList.toggle("is-sel", x === bt); });
          if (elegido === "no_contesta") return guardar(bt);
          extra.hidden = false;
          var cu = art.querySelector(".icc-sw-cuando"); cu.hidden = !(elegido === "volver" || elegido === "interesado");
          cu.querySelector("span").textContent = elegido === "interesado" ? "Visita (opcional)" : "Volver a llamar el";
          art.querySelector("[data-nota]").focus();
        });
      });
      var g = art.querySelector("[data-guardar]"); if (g) g.addEventListener("click", function () { guardar(g); });
      function guardar(btn) {
        var d = { id: Number(art.dataset.id), resultado: elegido, nota: art.querySelector("[data-nota]").value };
        var cu = art.querySelector("[data-cuando]").value; if (cu) d.cuando = cu;
        if (elegido === "no_llamar" && !confirm("No se le volverá a llamar en ninguna campaña. ¿Continuar?")) return;
        hacer(btn, async function () { var x = await API.post("api/sinweb.php?action=resultado", d); U.toast("✓ " + x.texto, "success"); await cargar(); });
      }
    });
  }

  window.icc = window.icc || {};
  window.icc.sinweb = { view: view };
})();
