/* =============================================================================
   ICC CRM · Puesta en marcha de la capa de IA (#/puesta-en-marcha)
   Lista de comprobación en directo, piloto automático y aprendizaje.
   Coordinación, admin y super admin. API: api/puesta.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var ICO = { ok: "✅", aviso: "🟡", falta: "⭕" };

  function main() { return document.getElementById("icc-main"); }
  async function hacer(btn, fn) { btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message, "error"); } btn.disabled = false; }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Comprobando la instalación…</div>';
    var d;
    try { d = await API.get("api/puesta.php?action=estado"); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    var total = d.lista.length, ok = d.resumen.ok;
    var grupos = {};
    d.lista.forEach(function (x) { (grupos[x.grupo] = grupos[x.grupo] || []).push(x); });
    var html = '<div class="icc-ia icc-mo icc-pm">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">IA · De principio a fin</span><h1>🚀 Puesta en marcha</h1>' +
      "<p>Todo lo que necesita la plataforma para trabajar sola, comprobado en directo. Resuelve lo que está en rojo, enciende el piloto automático y los agentes empezarán a prospectar, vender, mantener el pipeline, atender el correo y <b>aprender cada día</b> de los resultados.</p>" +
      '<div class="icc-pm-barra" role="progressbar" aria-valuenow="' + ok + '" aria-valuemax="' + total + '"><i style="width:' + Math.round(ok / total * 100) + '%"></i></div>' +
      '<div class="icc-ia-estado"><span>' + ok + " de " + total + " listos</span>" + (d.resumen.falta ? '<span class="icc-ia-pill is-mal">' + d.resumen.falta + " por hacer</span>" : "") + (d.resumen.aviso ? '<span class="icc-ia-pill is-aviso">' + d.resumen.aviso + " recomendados</span>" : "") + "</div></div></section>";
    html += '<section class="icc-card icc-ia-bloque icc-pm-piloto"><div><h2>' + (d.piloto ? "🟢 Piloto automático encendido" : "✈️ Piloto automático") + "</h2>" +
      "<p>Lo enciende todo con la configuración recomendada:</p><ul>" +
      "<li>Los 19 agentes (con la Jefatura de ventas, la Jefatura de Backoffice, los Coordinadores de equipo y el Autocorrector) con autonomía «actúa» (8 a 20 h, laborables).</li>" +
      "<li>Barrido de Asturias de todos los sectores con " + (d.aviso_legal ? "<b>envío autónomo</b> (aviso legal aceptado)" : "<b>aprobación de cada correo</b> (para enviar solo, acepta antes el aviso legal en el Motor)") + ".</li>" +
      "<li>Automatizaciones: " + d.flujos_piloto.map(esc).join(", ") + ".</li>" +
      "<li>Mantenimiento del pipeline cada hora con llamadas en la agenda; agentes de correo en automático; Jarvis; aprendizaje diario.</li></ul>" +
      '<p class="icc-ia-nota">Aunque esté encendido, <b>siempre esperan a una persona</b>: presupuestos, contratos, cobros, recordatorios de pago, correos con importes o descuentos, quejas, perdidos y cambios de instrucciones. Es lo que protege a ICC de un error caro.</p></div>' +
      '<div class="icc-pm-acc">' + (d.piloto ? '<button class="icc-btn icc-btn-secondary" id="pm-apagar">Volver a modo prudente</button>' : '<button class="icc-btn icc-btn-primary" id="pm-encender">✈️ Encender el piloto automático</button>') + "</div></section>";
    Object.keys(grupos).forEach(function (g) {
      html += '<section class="icc-card icc-ia-bloque"><h2>' + esc(g) + '</h2><ul class="icc-pm-lista">' + grupos[g].map(function (x) {
        return '<li class="is-' + x.estado + '"><span class="icc-pm-ico" aria-hidden="true">' + ICO[x.estado] + "</span><div><strong>" + esc(x.titulo) + "</strong><small>" + esc(x.texto) + "</small></div>" +
          (x.enlace && x.estado !== "ok" ? '<a class="icc-btn icc-btn-secondary icc-mo-mini" href="' + esc(x.enlace) + '">Ir</a>' : "") + "</li>";
      }).join("") + "</ul></section>";
    });
    html += '<section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><h2>🧠 Lo último que han aprendido</h2><button class="icc-btn icc-btn-secondary icc-mo-mini" id="pm-aprender">Aprender ahora</button></div>' +
      '<p class="icc-muted">Cada día comparan ángulos, sectores y zonas con pruebas estadísticas, fijan lo que gana, toman nota de lo que dirección rechaza e imitan los correos que una persona corrige (' + d.ejemplos.motor + " correos del Motor aprendidos). " + (d.aprendizaje_ultimo ? "Último ciclo: " + esc(new Date(d.aprendizaje_ultimo.replace(" ", "T")).toLocaleString("es-ES")) + "." : "") + "</p>" +
      (d.memoria.length ? '<ul class="icc-ia-lista">' + d.memoria.map(function (m) { return "<li><div><strong>" + esc(m.texto) + "</strong><small>" + esc(m.evidencia) + (m.tipo === "aprendizaje" ? " · confianza " + m.confianza + " %" : "") + "</small></div></li>"; }).join("") + "</ul>" : '<p class="icc-muted">Todavía sin aprendizajes: hacen falta envíos y respuestas reales.</p>') + "</section></div>";
    main().innerHTML = html;
    var en = document.getElementById("pm-encender"), ap = document.getElementById("pm-apagar"), apr = document.getElementById("pm-aprender");
    if (en) en.addEventListener("click", function () {
      if (!confirm("¿Encender el piloto automático? Los agentes empezarán a trabajar solos dentro de los límites de seguridad.")) return;
      hacer(en, async function () { var r = await API.post("api/puesta.php?action=piloto", { encender: true }); U.toast("✓ " + r.hecho.join(" · "), "success"); await view(); });
    });
    if (ap) ap.addEventListener("click", function () { hacer(ap, async function () { await API.post("api/puesta.php?action=piloto", { encender: false }); U.toast("Modo prudente: todo con aprobación", "success"); await view(); }); });
    apr.addEventListener("click", function () { hacer(apr, async function () { var r = await API.post("api/puesta.php?action=aprender", {}); U.toast(r.texto, "success"); await view(); }); });
  }

  window.icc.puesta = { view: view };
})();
