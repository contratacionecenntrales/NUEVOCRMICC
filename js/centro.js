/* =============================================================================
   ICC CRM · Centro de control de la IA (#/centro-ia)
   Interruptor general (pausa toda la IA autónoma), un interruptor por módulo y
   por agente con su autonomía, uso de la IA y acceso a la configuración.
   Lo ven dirección y jefes de equipo; lo cambian coordinación y admin.
   API: api/centro_ia.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null };
  var AUT = { observa: "Solo observa", propone: "Propone (tú apruebas)", actua: "Actúa solo" };

  function main() { return document.getElementById("icc-main"); }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }
  function hace(f) {
    if (!f) return "Sin actividad registrada";
    var m = Math.round((Date.now() - new Date(String(f).replace(" ", "T")).getTime()) / 60000);
    return m < 1 ? "ahora mismo" : m < 60 ? "hace " + m + " min" : m < 1440 ? "hace " + Math.round(m / 60) + " h" : (Math.round(m / 1440) === 1 ? "hace 1 día" : "hace " + Math.round(m / 1440) + " días");
  }
  function num(n) { return Number(n || 0).toLocaleString("es-ES"); }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }
  function interruptor(attr, on, dis, etiqueta) {
    return '<label class="icc-ci-sw' + (dis ? " is-dis" : "") + '"><input type="checkbox" ' + attr + (on ? " checked" : "") + (dis ? " disabled" : "") + ' aria-label="' + esc(etiqueta) + '"><span class="icc-ci-sw-pista"><span class="icc-ci-sw-bola"></span></span><b>' + (on ? "Encendido" : "Apagado") + "</b></label>";
  }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Cargando el Centro de control…</div>';
    try { S.d = await API.get("api/centro_ia.php?action=estado"); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    pintar();
  }

  function pintar() {
    var d = S.d, dis = !d.es_config, ia = d.ia;
    var activos = d.modulos.filter(function (m) { return m.activo; }).length;
    var agOn = d.agentes.filter(function (a) { return a.activo; }).length;
    var deps = {}; d.agentes.forEach(function (a) { (deps[a.departamento] = deps[a.departamento] || []).push(a); });
    var html = '<div class="icc-ia icc-mo icc-ci">' +
      // Interruptor general
      '<section class="icc-ci-maestro ' + (d.pausa ? "is-pausa" : "is-on") + '"><div class="icc-ci-maestro-txt"><span class="icc-ia-eyebrow">Centro de control de la IA</span>' +
      "<h1>" + (d.pausa ? "⏸ La IA está en pausa" : "🟢 La IA está trabajando") + "</h1>" +
      "<p>" + (d.pausa ? "Nada se hace solo: ni turnos de agentes, ni envíos del Motor, ni respuestas de los buzones, ni automatizaciones, ni llamadas, ni entrevistas. Los mensajes de WhatsApp que lleguen se guardan" + (d.cola_whatsapp ? " (" + d.cola_whatsapp + " en espera)" : "") + " y se contestan al reanudar. Lo que pidáis a mano (Jarvis, botones) sigue funcionando." + (d.pausa_desde ? " En pausa desde el " + esc(new Date(d.pausa_desde.replace(" ", "T")).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })) + "." : "")
        : activos + " de " + d.modulos.length + " módulos y " + agOn + " de " + d.agentes.length + " agentes encendidos. Un clic lo para todo al momento; al reanudar, cada módulo vuelve a su estado.") + "</p></div>" +
      (d.es_config ? '<button class="icc-ci-boton ' + (d.pausa ? "is-reanudar" : "is-pausar") + '" id="ci-maestro">' + (d.pausa ? "▶ Reanudar la IA" : "⏸ Pausar toda la IA") + "</button>" : '<span class="icc-muted">Solo coordinación y administración pueden pausarla.</span>') + "</section>" +
      // Estado e uso
      '<div class="icc-mo-kpis">' + [["🔑", ia.disponible ? "Conectada" : (ia.clave === "ninguna" ? "Sin clave" : "Revisar"), "OpenAI"], ["💬", num(ia.uso_hoy.llamadas), "Llamadas a la IA hoy"], ["⚠️", num(ia.uso_hoy.errores), "Errores hoy"],
        ["🧮", num(Number(ia.uso_hoy.entrada) + Number(ia.uso_hoy.salida)), "Tokens hoy"], ["✍️", num(d.para_aprobar), "Esperan tu aprobación"]]
        .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
      (!ia.disponible ? '<p class="icc-mo-aviso">Sin conexión con OpenAI los agentes siguen trabajando con su manual de reglas. <a href="#/inteligencia-artificial">Configurar la clave →</a></p>' : "") +
      // Modulos
      '<section class="icc-ia-bloque"><div class="icc-mo-cab"><h2 class="icc-fl-h2">Módulos</h2><div class="icc-ia-fila"><a class="icc-btn icc-btn-ghost icc-mo-mini" href="#/puesta-en-marcha">🚀 Puesta en marcha</a><a class="icc-btn icc-btn-ghost icc-mo-mini" href="#/inteligencia-artificial">⚙️ Clave de OpenAI y cron</a></div></div><div class="icc-ci-modulos">' +
      d.modulos.map(function (m) {
        var u = m.ultima;
        return '<article class="icc-card icc-ci-mod' + (m.activo ? " is-on" : "") + (d.pausa && m.activo && m.clave !== "jarvis" ? " is-pausado" : "") + '"><header><span class="icc-ci-ico">' + m.icono + "</span><div><strong>" + esc(m.nombre) + "</strong><small>" + esc(m.descripcion) + "</small></div></header>" +
          '<div class="icc-ci-mod-pie">' + interruptor('data-modulo="' + m.clave + '"', m.activo, dis, m.nombre) +
          (d.pausa && m.activo && m.clave !== "jarvis" ? pill("En pausa general", "aviso") : "") + '<a class="icc-btn icc-btn-ghost icc-mo-mini" href="' + esc(m.enlace) + '">Configurar →</a></div>' +
          (u ? '<small class="icc-ci-ult">' + (Number(u.ok) ? "✓" : "⚠️") + " " + esc(hace(u.ts)) + " · " + esc(String(u.mensaje).slice(0, 110)) + "</small>" : "") + "</article>";
      }).join("") + "</div></section>" +
      // Agentes
      '<section class="icc-ia-bloque"><div class="icc-mo-cab"><div><h2 class="icc-fl-h2">Agentes</h2><p class="icc-ia-nota">Cada agente se puede apagar y elegir cuánto decide solo. Presupuestos, contratos, cobros, correos a clientes y perdidos esperan siempre a una persona, aunque esté en «Actúa solo».' + (!d.agentes_activos ? " <b>La Zona de agentes está apagada</b>: enciéndela en Módulos." : "") + "</p></div></div>" +
      Object.keys(deps).map(function (dep) {
        return '<h3 class="icc-eq-h3">' + esc(dep) + '</h3><div class="icc-ci-agentes">' + deps[dep].map(function (a) {
          return '<article class="icc-ci-ag' + (a.activo ? "" : " is-off") + '"><div class="icc-ci-ag-txt"><strong>' + esc(a.nombre) + "</strong><small>" + esc(a.mision) + "</small>" +
            (a.ultimo ? '<small class="icc-ci-ult">' + (a.ultimo.ok ? "✓" : "⚠️") + " Último turno " + esc(hace(a.ultimo.inicio)) + "</small>" : "") + "</div>" +
            '<div class="icc-ci-ag-ctrl">' + interruptor('data-agente="' + a.clave + '"', a.activo, dis, a.nombre) +
            '<select class="icc-select" data-autonomia="' + a.clave + '"' + (dis ? " disabled" : "") + ' aria-label="Autonomía de ' + esc(a.nombre) + '">' + Object.keys(AUT).map(function (k) { return '<option value="' + k + '"' + (a.autonomia === k ? " selected" : "") + ">" + AUT[k] + "</option>"; }).join("") + "</select></div></article>";
        }).join("") + "</div>";
      }).join("") + "</section>" +
      (ia.tipos.length ? '<section class="icc-card icc-ia-bloque"><h2>En qué se usa la IA hoy</h2><ul class="icc-ia-lista">' + ia.tipos.map(function (t) { return "<li><div><strong>" + esc(String(t.tipo).replace(/_/g, " ")) + '</strong></div><div class="icc-ia-fila">' + pill(num(t.n) + " llamadas", "") + "</div></li>"; }).join("") + "</ul><small class=\"icc-muted\">Últimos 7 días: " + num(ia.uso_7d.llamadas) + " llamadas · " + num(ia.uso_7d.tokens) + " tokens.</small></section>" : "") +
      "</div>";
    main().innerHTML = html;
    enlazar();
  }

  function enlazar() {
    var r = main();
    var m = document.getElementById("ci-maestro");
    if (m) m.addEventListener("click", function () {
      var pausar = !S.d.pausa;
      if (pausar && !confirm("Se pausará todo lo que la IA hace sola (agentes, Motor, buzones, automatizaciones, llamadas y entrevistas). ¿Continuar?")) return;
      hacer(m, async function () { var x = await API.post("api/centro_ia.php?action=pausa", { pausa: pausar }); U.toast(x.texto, "success"); await view(); });
    });
    r.querySelectorAll("[data-modulo]").forEach(function (i) { i.addEventListener("change", function () { hacer(i, async function () { await API.post("api/centro_ia.php?action=modulo", { clave: i.dataset.modulo, activo: i.checked }); U.toast((i.checked ? "✓ Encendido: " : "Apagado: ") + i.closest("article").querySelector("strong").textContent, "success"); await view(); }); }); });
    r.querySelectorAll("[data-agente]").forEach(function (i) { i.addEventListener("change", function () { hacer(i, async function () { await API.post("api/centro_ia.php?action=agente", { clave: i.dataset.agente, activo: i.checked }); await view(); }); }); });
    r.querySelectorAll("[data-autonomia]").forEach(function (s) {
      s.addEventListener("change", function () {
        if (s.value === "actua" && !confirm("Con «Actúa solo» el agente hace también lo de riesgo alto que no espera siempre a una persona. ¿Continuar?")) { s.value = S.d.agentes.filter(function (a) { return a.clave === s.dataset.autonomia; })[0].autonomia; return; }
        hacer(s, async function () { await API.post("api/centro_ia.php?action=agente", { clave: s.dataset.autonomia, autonomia: s.value }); U.toast("✓ Autonomía guardada", "success"); await view(); });
      });
    });
  }

  window.icc = window.icc || {};
  window.icc.centro = { view: view };
})();
