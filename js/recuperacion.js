/* =============================================================================
   ICC CRM · Recuperar no firmados (#/recuperacion)
   Por qué no firman (objeciones con su valor), qué necesita cada uno para
   firmar, cómo darle la vuelta, la lista con su plan y las ofertas exclusivas
   del mes. Dirección y jefes de equipo. API: api/recuperacion.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null, filtro: "", editOferta: null };
  var EST = { pendiente: ["Por recuperar", "aviso"], en_curso: ["En marcha", ""], recuperado: ["¡Recuperado!", "ok"], descartado: ["Descartado", ""] };

  function main() { return document.getElementById("icc-main"); }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }
  function eur(n) { return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"; }
  function fechaC(f) { if (!f) return ""; return new Date(String(f).replace(" ", "T")).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }); }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Analizando los no firmados…</div>';
    try { S.d = await API.get("api/recuperacion.php?action=panel"); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    pintar();
  }

  function pintar() {
    var d = S.d, t = d.totales;
    var max = Math.max.apply(null, d.objeciones.map(function (o) { return o.total; }).concat([1]));
    var filas = d.filas.filter(function (f) { return !S.filtro || f.objecion === S.filtro; });
    var mapa = {}; d.objeciones.forEach(function (o) { mapa[o.clave] = o; });
    var html = '<div class="icc-ia icc-mo icc-rc">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">Darle la vuelta</span><h1>🔄 Recuperar no firmados</h1>' +
      "<p>Un «no» casi siempre es un «así no» o un «ahora no». El agente <b>Recuperación</b> lee lo que dijo cada empresa que no firmó (motivo de pérdida, rellamadas, llamadas, correos y notas), averigua <b>qué le frena</b> y vuelve con la solución exacta: re-estudio con <b>todas las compañías</b>, la <b>oferta exclusiva del mes</b>, aviso antes del fin de su permanencia, reunión con quien decide o firma digital sin papeleo.</p></div>" +
      '<button class="icc-btn icc-btn-primary" id="rc-analizar">🔍 Analizar y poner planes en marcha</button></section>' +
      '<div class="icc-mo-kpis">' + [["🙅", t.total, "No firmados analizados"], ["🔄", t.en_curso, "Con plan en marcha"], ["🎉", t.recuperados, "Recuperados"], ["📈", t.tasa + " %", "Tasa de recuperación"], ["💶", eur(t.valor_recuperable), "Valor por recuperar"]]
        .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
      // Por que no firman
      '<section class="icc-card icc-ia-bloque"><h2>🤔 ¿Por qué no firman?</h2><div class="icc-rc-obj">' + d.objeciones.filter(function (o) { return o.total > 0; }).map(function (o) {
        return '<button type="button" class="icc-rc-barra' + (S.filtro === o.clave ? " is-sel" : "") + '" data-filtro="' + o.clave + '"><span class="icc-rc-barra-txt">' + o.icono + " <b>" + esc(o.nombre) + "</b> · " + o.total + " · " + eur(o.valor) + (o.recuperados ? " · " + o.recuperados + " recuperados" : "") + '</span><i style="--w:' + Math.round(o.total / max * 100) + '%"></i></button>';
      }).join("") + "</div>" + (S.filtro ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-filtro="">Ver todos</button>' : '<p class="icc-ia-nota">Pulsa una objeción para ver sus empresas.</p>') + "</section>" +
      // Manual
      '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">📚 Qué necesita cada uno para firmar y cómo darle la vuelta</h2><div class="icc-rc-manual">' + d.objeciones.map(function (o) {
        return '<article class="icc-card icc-rc-carta"><strong>' + o.icono + " " + esc(o.nombre) + "</strong><small><b>Necesita:</b> " + esc(o.necesita) + "</small><p>" + esc(o.guion.replace("{oferta}", "la oferta exclusiva del mes")) + "</p></article>";
      }).join("") + "</div></section>" +
      // Ofertas del mes
      '<section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><div><h2>🔥 Ofertas exclusivas del mes</h2><p class="icc-ia-nota">Trabajamos con todas las compañías: aquí van las ofertas reales de cada mes, con sus condiciones. Los agentes (correo en frío, buzones, llamadas de recuperación) solo mencionan las vigentes y tal cual.</p></div></div>' +
      (d.todas_ofertas.length ? '<ul class="icc-ia-lista">' + d.todas_ofertas.map(function (o) {
        var vig = Number(o.activo) && o.vigente_desde <= new Date().toISOString().slice(0, 10) && o.vigente_hasta >= new Date().toISOString().slice(0, 10);
        return "<li><div><strong>" + esc(o.titulo) + "</strong><small>" + esc(d.servicios[o.servicio] || o.servicio) + (o.compania ? " · " + esc(o.compania) : "") + " · " + esc(fechaC(o.vigente_desde)) + " → " + esc(fechaC(o.vigente_hasta)) + "</small><small>" + esc(o.condiciones || "") + '</small></div><div class="icc-ia-fila">' + pill(vig ? "Vigente" : Number(o.activo) ? "Fuera de fecha" : "Retirada", vig ? "ok" : "") +
          (d.puede_ofertas && vig ? '<button class="icc-btn icc-btn-primary icc-mo-mini" data-campana="' + o.id + '">📞 Llamar a los no firmados</button>' : "") + (d.puede_ofertas ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-editof="' + o.id + '">Editar</button>' : "") + "</div></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Todavía no hay ofertas. Da de alta las de este mes para que los agentes las usen.</p>') +
      (d.puede_ofertas ? formOferta() : "") + "</section>" +
      // Lista
      '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">' + (S.filtro ? mapa[S.filtro].icono + " " + esc(mapa[S.filtro].nombre) : "Todas las empresas") + " (" + filas.length + ')</h2>' + (filas.length ? '<div class="icc-rc-lista">' + filas.map(function (f) {
        var o = mapa[f.objecion] || mapa.otro;
        return '<article class="icc-card icc-rc-emp"><header><div><strong><a href="#/clientes/' + f.cliente_id + '">' + esc(f.razon_social) + "</a></strong><small>" + esc((f.gestor || "Sin gestor").trim()) + " · " + esc(d.servicios[f.servicio] || f.servicio) + (Number(f.valor_estimado) ? " · " + eur(f.valor_estimado) : "") + "</small></div>" + pill(EST[f.estado][0], EST[f.estado][1]) + "</header>" +
          '<div class="icc-rc-por"><b>' + o.icono + " " + esc(o.nombre) + "</b>" + (Number(f.ia) ? ' <small class="icc-muted">(IA)</small>' : "") + (f.detalle ? "<small>«" + esc(f.detalle) + "»</small>" : "") + (f.fin_permanencia ? "<small>⛓️ Fin de permanencia: " + esc(fechaC(f.fin_permanencia)) + "</small>" : "") + (f.plan ? "<small>📅 " + esc(f.plan) + "</small>" : "") + "</div>" +
          (["recuperado", "descartado"].indexOf(f.estado) === -1 ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary icc-mo-mini" data-lanzar="' + f.id + '">' + (f.estado === "en_curso" ? "Volver a lanzar" : "Poner plan en marcha") + '</button><select class="icc-select" data-obj="' + f.id + '" aria-label="Cambiar objeción">' + Object.keys(d.objeciones_lista).map(function (k) { return '<option value="' + k + '"' + (f.objecion === k ? " selected" : "") + ">" + esc(d.objeciones_lista[k]) + "</option>"; }).join("") + '</select><button class="icc-btn icc-btn-ghost icc-mo-mini" data-est="recuperado" data-id="' + f.id + '">🎉 Recuperado</button><button class="icc-btn icc-btn-ghost icc-mo-mini" data-est="descartado" data-id="' + f.id + '">Descartar</button></div>' : "") + "</article>";
      }).join("") + "</div>" : '<p class="icc-muted">' + (S.d.totales.total ? "Ninguna con este filtro." : "Pulsa «Analizar» para revisar a todos los que no han firmado.") + "</p>") + "</section></div>";
    main().innerHTML = html;
    enlazar();
  }

  function formOferta() {
    var o = S.editOferta || { id: 0, servicio: "energia", compania: "", titulo: "", condiciones: "", descripcion: "", vigente_desde: new Date().toISOString().slice(0, 10), vigente_hasta: "", activo: 1 };
    return '<form id="rc-of" class="icc-ia-form icc-rc-form"><h3 class="icc-eq-h3">' + (o.id ? "Editar oferta" : "＋ Nueva oferta del mes") + '</h3><input type="hidden" name="id" value="' + o.id + '">' +
      '<div class="icc-mo-3"><label><span>Servicio</span><select class="icc-select" name="servicio">' + Object.keys(S.d.servicios).map(function (k) { return '<option value="' + k + '"' + (o.servicio === k ? " selected" : "") + ">" + esc(S.d.servicios[k]) + "</option>"; }).join("") + '</select></label><label><span>Compañía</span><input class="icc-input" name="compania" value="' + esc(o.compania) + '"></label><label><span>Título (lo que dirán los agentes)</span><input class="icc-input" name="titulo" required value="' + esc(o.titulo) + '" placeholder="Fibra 1 Gb + 2 móviles a precio de empresa"></label></div>' +
      '<label><span>Condiciones reales (obligatorio)</span><input class="icc-input" name="condiciones" required value="' + esc(o.condiciones) + '" placeholder="Permanencia, a quién aplica, requisitos…"></label>' +
      '<div class="icc-mo-3"><label><span>Desde</span><input class="icc-input" type="date" name="vigente_desde" value="' + esc(o.vigente_desde) + '"></label><label><span>Hasta</span><input class="icc-input" type="date" name="vigente_hasta" value="' + esc(o.vigente_hasta) + '"></label><label class="icc-ia-switch"><input type="checkbox" name="activo"' + (Number(o.activo) ? " checked" : "") + "><span><b>Activa</b></span></label></div>" +
      '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary icc-mo-mini" type="submit">Guardar oferta</button>' + (o.id ? '<button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" id="rc-of-retirar">Retirar</button><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" id="rc-of-cancelar">Cancelar</button>' : "") + "</div></form>";
  }

  function enlazar() {
    var r = main();
    var an = document.getElementById("rc-analizar");
    an.addEventListener("click", function () { an.textContent = "Analizando…"; hacer(an, async function () { var x = await API.post("api/recuperacion.php?action=analizar", {}); U.toast("✓ " + x.texto, "success"); await view(); }); });
    r.querySelectorAll("[data-filtro]").forEach(function (b) { b.addEventListener("click", function () { S.filtro = b.dataset.filtro === S.filtro ? "" : b.dataset.filtro; pintar(); }); });
    r.querySelectorAll("[data-lanzar]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { var x = await API.post("api/recuperacion.php?action=lanzar", { id: Number(b.dataset.lanzar) }); U.toast("✓ " + x.texto, "success"); await view(); }); }); });
    r.querySelectorAll("[data-obj]").forEach(function (s) { s.addEventListener("change", function () { hacer(s, async function () { await API.post("api/recuperacion.php?action=objecion", { id: Number(s.dataset.obj), objecion: s.value }); U.toast("✓ Objeción cambiada", "success"); await view(); }); }); });
    r.querySelectorAll("[data-est]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { await API.post("api/recuperacion.php?action=estado", { id: Number(b.dataset.id), estado: b.dataset.est }); await view(); }); }); });
    r.querySelectorAll("[data-campana]").forEach(function (b) { b.addEventListener("click", function () { if (!confirm("Se pondrá una llamada con esta oferta a los no firmados de su servicio (precio, momento, contento o permanencia a punto de acabar). ¿Continuar?")) return; hacer(b, async function () { var x = await API.post("api/recuperacion.php?action=campana_oferta", { id: Number(b.dataset.campana) }); U.toast("✓ " + x.texto, "success"); await view(); }); }); });
    r.querySelectorAll("[data-editof]").forEach(function (b) { b.addEventListener("click", function () { S.editOferta = S.d.todas_ofertas.filter(function (o) { return Number(o.id) === Number(b.dataset.editof); })[0]; pintar(); document.getElementById("rc-of").scrollIntoView({ behavior: "smooth" }); }); });
    var fo = document.getElementById("rc-of");
    if (fo) {
      fo.addEventListener("submit", function (ev) { ev.preventDefault(); var dd = Object.fromEntries(new FormData(fo)); dd.activo = fo.activo.checked; dd.id = Number(dd.id); hacer(ev.submitter, async function () { await API.post("api/recuperacion.php?action=oferta", dd); U.toast("✓ Oferta guardada: los agentes ya la usan", "success"); S.editOferta = null; await view(); }); });
      var ca = document.getElementById("rc-of-cancelar"); if (ca) ca.addEventListener("click", function () { S.editOferta = null; pintar(); });
      var re = document.getElementById("rc-of-retirar"); if (re) re.addEventListener("click", function () { hacer(re, async function () { await API.post("api/recuperacion.php?action=oferta_borrar", { id: S.editOferta.id }); S.editOferta = null; await view(); }); });
    }
  }

  window.icc = window.icc || {};
  window.icc.recuperacion = { view: view };
})();
