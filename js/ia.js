/* =============================================================================
   ICC CRM · Inteligencia artificial (#/inteligencia-artificial)
   Solo coordinación, admin y super admin. Clave de OpenAI (cifrada, nunca se
   muestra), encendido, modelo, consumo, registro de consultas y acciones de la
   IA, y el cron único del hosting. API: api/ia.php.
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = U.escapeHtml;
  var S = { d: null };
  var TIPOS = { factura: "Lectura de facturas", prueba: "Prueba de conexión", chat: "Consulta", transcripcion: "Voz a texto", voz: "Texto a voz" };
  var ESFUERZO = { minimal: "Mínimo (más rápido)", low: "Bajo (recomendado)", medium: "Medio (más preciso)" };
  var BLOQUES = { copias: "Copias de seguridad", purga: "Limpieza de registros (RGPD)", motor: "Motor de prospección: envíos y respuestas", motor_analisis: "Motor: lectura de webs", agentes: "Zona de agentes: turnos", flujos: "Automatizaciones" };

  function main() { return document.getElementById("icc-main"); }
  function fecha(f) {
    if (!f) return "—";
    var d = new Date(String(f).replace(" ", "T"));
    return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function num(n) { return Number(n || 0).toLocaleString("es-ES"); }
  function cada(m) { return m >= 60 ? "cada " + (m % 60 ? m + " min" : (m / 60 === 1 ? "hora" : m / 60 + " h")) : "cada " + m + " min"; }

  async function view() {
    if (!window.icc.auth.puedeVerCopias()) { location.hash = "#/dashboard"; return; }
    main().innerHTML = '<div class="icc-loading">Cargando la inteligencia artificial…</div>';
    try {
      S.d = await API.get("api/ia.php?action=estado");
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + esc(err.message || "No se pudo cargar") + "</p>";
      return;
    }
    pintar();
  }

  function pintar() {
    var d = S.d, c = d.config, k = d.clave;
    var estado = d.demo ? ['Modo demostración: IA desactivada', "mal"]
      : d.disponible ? ["IA activa · " + c.modelo, "ok"]
      : k.origen === "ninguna" ? ["Sin clave: el CRM funciona con plantillas y reglas", "aviso"]
      : ["IA apagada", "aviso"];
    var html = '<div class="icc-ia">' +
      '<section class="icc-ia-hero"><div><span class="icc-ia-eyebrow">Dirección · Inteligencia artificial</span>' +
      "<h1>🤖 Inteligencia artificial</h1>" +
      "<p>El CRM usa <b>solo OpenAI</b>. La IA ve únicamente lo que ve la persona que la usa, nunca aprueba dinero, contratos ni presupuestos por su cuenta, y todo lo que hace queda registrado y se puede deshacer. Sin clave, todo sigue funcionando con plantillas y reglas.</p>" +
      '<div class="icc-ia-estado"><span class="icc-ia-pill is-' + estado[1] + '">' + esc(estado[0]) + "</span>" +
      "<span>Hoy: " + num(d.uso_hoy.consultas) + " consultas" + (Number(d.uso_hoy.fallos) ? " · " + num(d.uso_hoy.fallos) + " con error" : "") + "</span></div></div></section>";

    // Clave
    html += '<div class="icc-ia-dos">' +
      '<section class="icc-card icc-ia-bloque"><h2>🔑 Clave de OpenAI</h2>' +
      '<p class="icc-muted">Se guarda <b>cifrada</b> y nunca vuelve a mostrarse. La del panel manda sobre la del archivo del servidor.</p>' +
      '<p class="icc-ia-clave">' + (k.origen === "panel" ? "✓ Guardada en el panel <code>" + esc(k.final) + "</code>"
        : k.origen === "archivo" ? "✓ Fijada en el archivo privado del servidor <code>" + esc(k.final) + "</code>"
        : "Todavía no hay clave.") + "</p>" +
      '<form id="ia-clave-form" class="icc-ia-fila" autocomplete="off">' +
      '<input class="icc-input" type="password" id="ia-clave" placeholder="sk-…" autocomplete="new-password" spellcheck="false" aria-label="Nueva clave de OpenAI">' +
      '<button class="icc-btn icc-btn-primary" type="submit">Guardar</button></form>' +
      '<div class="icc-ia-fila">' +
      '<button class="icc-btn icc-btn-secondary" type="button" id="ia-probar"' + (k.origen === "ninguna" ? " disabled" : "") + ">⚡ Probar conexión</button>" +
      (k.origen === "panel" ? '<button class="icc-btn icc-btn-ghost" type="button" id="ia-borrar">Borrar la del panel</button>' : "") +
      '</div><p class="icc-ia-resultado" id="ia-resultado" role="status"></p>' +
      '<p class="icc-ia-nota">Créala en platform.openai.com → API keys, con un límite de gasto mensual.</p></section>';

    // Ajustes
    html += '<section class="icc-card icc-ia-bloque"><h2>⚙️ Ajustes</h2>' +
      '<form id="ia-config" class="icc-ia-form">' +
      '<label class="icc-ia-switch"><input type="checkbox" id="ia-activa"' + (c.activa ? " checked" : "") + "><span><b>IA encendida</b><small>Apagada, el CRM usa solo plantillas y reglas.</small></span></label>" +
      '<label><span>Modelo</span><select class="icc-select" id="ia-modelo">' + d.modelos.map(function (m) {
        return '<option value="' + esc(m) + '"' + (m === c.modelo ? " selected" : "") + ">" + esc(m) + (m === "gpt-5-mini" ? " (recomendado)" : "") + "</option>";
      }).join("") + "</select></label>" +
      '<label><span>Razonamiento</span><select class="icc-select" id="ia-esfuerzo">' + Object.keys(ESFUERZO).map(function (e) {
        return '<option value="' + e + '"' + (e === c.esfuerzo ? " selected" : "") + ">" + ESFUERZO[e] + "</option>";
      }).join("") + "</select></label>" +
      '<label><span>Límite diario por persona</span><input class="icc-input" type="number" min="1" max="5000" id="ia-limite" value="' + c.limite_dia + '"></label>' +
      '<label><span>Voz del asistente</span><select class="icc-select" id="ia-voz">' + d.voces.map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === c.voz ? " selected" : "") + ">" + esc(v) + "</option>";
      }).join("") + "</select></label>" +
      '<button class="icc-btn icc-btn-primary" type="submit">Guardar ajustes</button></form></section></div>';

    // Cron
    var cr = d.cron;
    html += '<section class="icc-card icc-ia-bloque"><h2>⏱️ Tareas automáticas (cron)</h2>' +
      '<p class="icc-muted">Una sola tarea programada del hosting, <b>cada 5 minutos</b>, mueve todos los trabajos automáticos. Mientras alguien tiene el CRM abierto, el panel también hace de reloj.</p>' +
      '<div class="icc-ia-estado"><span class="icc-ia-pill is-' + (cr.funciona ? "ok" : "aviso") + '">' +
      (cr.funciona ? "✓ Funcionando" : cr.ultimo ? "Sin pasadas en los últimos 15 min" : "Todavía no ha pasado nunca") + "</span>" +
      (cr.ultimo ? "<span>Última pasada: " + esc(fecha(cr.ultimo)) + (cr.ultimo_origen === "cron" ? " (hosting)" : cr.ultimo_origen === "panel" ? " (panel abierto)" : " (manual)") + "</span>" : "") + "</div>" +
      '<label class="icc-ia-url"><span>URL para Plesk → Tareas programadas → «Buscar una URL», cada 5 minutos</span>' +
      '<div class="icc-ia-fila"><input class="icc-input" readonly id="ia-cron-url" value="' + esc(cr.url) + '" aria-label="URL del cron">' +
      '<button class="icc-btn icc-btn-secondary" type="button" id="ia-cron-copiar">Copiar</button></div></label>' +
      '<div class="icc-ia-fila"><button class="icc-btn icc-btn-secondary" type="button" id="ia-cron-ejecutar">▶ Ejecutar ahora</button>' +
      (cr.token_en_archivo ? "" : '<button class="icc-btn icc-btn-ghost" type="button" id="ia-cron-regenerar">Cambiar el token</button>') + "</div>" +
      '<ul class="icc-ia-bloques">' + cr.bloques.map(function (b) {
        var u = b.ultimo;
        return "<li><div><strong>" + esc(BLOQUES[b.nombre] || b.nombre) + "</strong><small>" + cada(b.cada_min) + "</small></div>" +
          (u ? '<span class="icc-ia-pill is-' + (Number(u.ok) ? "ok" : "mal") + '">' + (Number(u.ok) ? "✓ " : "✕ ") + esc(fecha(u.ts)) + "</span><small class=\"icc-ia-msg\">" + esc(u.mensaje || "") + "</small>"
            : '<span class="icc-ia-pill">Pendiente</span>') + "</li>";
      }).join("") + "</ul></section>";

    // Consumo y registro
    html += '<div class="icc-ia-dos">' +
      '<section class="icc-card icc-ia-bloque"><h2>📊 Consumo (30 días)</h2>' +
      (d.uso_30_dias.length ? '<ul class="icc-ia-uso">' + d.uso_30_dias.map(function (u) {
        return "<li><span>" + esc(TIPOS[u.tipo] || u.tipo) + "</span><b>" + num(u.n) + "</b><small>" + num(Number(u.entrada) + Number(u.salida)) + " tokens</small></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Sin consultas todavía.</p>') +
      '<p class="icc-ia-nota">Los registros de consultas se borran solos a los 90 días.</p></section>' +
      '<section class="icc-card icc-ia-bloque"><h2>🧾 Últimas consultas</h2>' +
      (d.recientes.length ? '<ul class="icc-ia-lista">' + d.recientes.map(function (r) {
        return "<li><div><strong>" + esc(TIPOS[r.tipo] || r.tipo) + "</strong><small>" + esc(r.usuario || "Sistema") + " · " + esc(fecha(r.ts)) + " · " + esc(r.modelo) + "</small>" +
          (Number(r.ok) ? "" : '<small class="icc-ia-err">' + esc(r.error || "Error") + "</small>") + "</div>" +
          '<span class="icc-ia-pill is-' + (Number(r.ok) ? "ok" : "mal") + '">' + (Number(r.ok) ? (r.ms / 1000).toFixed(1).replace(".", ",") + " s" : "Error") + "</span></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Sin consultas todavía.</p>') + "</section></div>";

    html += '<section class="icc-card icc-ia-bloque"><h2>📝 Lo que ha hecho la IA</h2>' +
      '<p class="icc-muted">Cada cambio de la IA o de un agente queda aquí con su valor anterior.</p>' +
      (d.acciones.length ? '<ul class="icc-ia-lista">' + d.acciones.map(function (a) {
        return "<li><div><strong>" + esc(a.accion) + (a.entidad ? " · " + esc(a.entidad) + (a.entidad_id ? " #" + a.entidad_id : "") : "") + "</strong><small>" +
          esc(a.agente || a.origen) + " · " + esc(fecha(a.ts)) + (a.detalle ? " · " + esc(a.detalle) : "") + "</small></div>" +
          (a.deshecha_en ? '<span class="icc-ia-pill">Deshecha</span>' : "") + "</li>";
      }).join("") + "</ul>" : '<p class="icc-muted">La IA todavía no ha hecho ningún cambio.</p>') + "</section></div>";

    main().innerHTML = html;
    enlazar();
  }

  function resultado(txt, tipo) {
    var el = document.getElementById("ia-resultado");
    if (!el) return;
    el.textContent = txt;
    el.className = "icc-ia-resultado" + (tipo ? " is-" + tipo : "");
  }

  async function accion(btn, fn) {
    btn.disabled = true;
    try { await fn(); } catch (err) { U.toast(err.message || "No se pudo completar", "error"); }
    btn.disabled = false;
  }

  function enlazar() {
    document.getElementById("ia-clave-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var inp = document.getElementById("ia-clave");
      var v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      accion(ev.submitter || inp, async function () {
        await API.post("api/ia.php?action=clave", { clave: v });
        inp.value = "";
        U.toast("✓ Clave guardada y cifrada", "success");
        await view();
      });
    });
    var probar = document.getElementById("ia-probar");
    if (probar) probar.addEventListener("click", function () {
      resultado("Probando…");
      accion(probar, async function () {
        var r = await API.post("api/ia.php?action=probar", {});
        if (r.ok) resultado("✓ Conexión correcta con " + r.modelo + " en " + (r.ms / 1000).toFixed(1).replace(".", ",") + " s", "ok");
        else resultado("✕ " + r.error, "mal");
      });
    });
    var borrar = document.getElementById("ia-borrar");
    if (borrar) borrar.addEventListener("click", function () {
      if (!confirm("¿Borrar la clave de OpenAI guardada en el panel?")) return;
      accion(borrar, async function () {
        await API.del("api/ia.php?action=clave");
        U.toast("Clave borrada", "success");
        await view();
      });
    });
    document.getElementById("ia-config").addEventListener("submit", function (ev) {
      ev.preventDefault();
      accion(ev.submitter || ev.target, async function () {
        await API.put("api/ia.php?action=config", {
          activa: document.getElementById("ia-activa").checked,
          modelo: document.getElementById("ia-modelo").value,
          esfuerzo: document.getElementById("ia-esfuerzo").value,
          limite_dia: parseInt(document.getElementById("ia-limite").value, 10) || 0,
          voz: document.getElementById("ia-voz").value,
        });
        U.toast("✓ Ajustes guardados", "success");
        await view();
      });
    });
    document.getElementById("ia-cron-copiar").addEventListener("click", function () {
      var inp = document.getElementById("ia-cron-url");
      inp.select();
      (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).then(function () {
        U.toast("✓ URL copiada", "success");
      }, function () { document.execCommand("copy"); });
    });
    var ejecutar = document.getElementById("ia-cron-ejecutar");
    ejecutar.addEventListener("click", function () {
      accion(ejecutar, async function () {
        var r = await API.post("api/ia.php?action=cron_ejecutar", {});
        var mal = Object.keys(r.bloques || {}).filter(function (k) { return r.bloques[k].ok === false; });
        U.toast(mal.length ? "Pasada hecha con errores en: " + mal.join(", ") : "✓ Pasada del cron hecha", mal.length ? "error" : "success");
        await view();
      });
    });
    var regen = document.getElementById("ia-cron-regenerar");
    if (regen) regen.addEventListener("click", function () {
      if (!confirm("Si cambias el token, tendrás que actualizar la URL en la tarea programada del hosting. ¿Seguir?")) return;
      accion(regen, async function () {
        await API.post("api/ia.php?action=cron_regenerar", {});
        U.toast("✓ Token cambiado: copia la URL nueva en Plesk", "success");
        await view();
      });
    });
  }

  window.icc.ia = { view: view };
})();
