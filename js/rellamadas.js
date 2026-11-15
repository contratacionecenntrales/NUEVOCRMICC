/* =============================================================================
   ICC CRM · Rellamadas de presupuestos (#/rellamadas)
   La Jefatura de Backoffice pone cada día en la agenda de backoffice las
   rellamadas a clientes con presupuesto sin respuesta, con su guion. Aquí se
   ven y se marca el resultado con un clic. Backoffice ve las suyas; dirección
   y jefes de equipo, todas. API: api/rellamadas.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null, usuario: 0 };
  var SERV = { energia: "Luz y gas", telecomunicaciones: "Telefonía", alarmas: "Alarma", seguros: "Seguros", financiero: "Financiero" };
  var EST = { acepta: ["✅ Acepta", "ok"], lo_piensa: ["🤔 Lo piensa", ""], no_contesta: ["📵 No contesta", "aviso"], no_acepta: ["✋ No acepta", "aviso"], cancelada: ["Cancelada", ""] };

  function main() { return document.getElementById("icc-main"); }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }
  function fechaCorta(f) { if (!f) return "—"; return new Date(String(f).replace(" ", "T")).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" }); }
  function eur(n) { return Number(n || 0) > 0 ? Number(n).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €" : ""; }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Cargando las rellamadas…</div>';
    try { S.d = await API.get("api/rellamadas.php?action=lista" + (S.usuario ? "&usuario=" + S.usuario : "")); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    pintar();
  }

  function tarjeta(r) {
    var hoy = new Date().toISOString().slice(0, 10), tarde = r.fecha < hoy;
    var tel = String(r.contacto_telefono || r.telefono || "").replace(/[^\d+]/g, "");
    var nombre = (r.contacto_nombre || r.decisor_nombre || "").trim();
    return '<article class="icc-card icc-rl-tarjeta' + (tarde ? " is-tarde" : "") + '" data-rl="' + r.id + '">' +
      '<header><div><strong><a href="#/clientes/' + r.cliente_id + '">' + esc(r.razon_social) + "</a></strong><small>" + esc(nombre || "Sin contacto") + " · " + esc(SERV[r.sector] || "Presupuesto") + (eur(r.valor_estimado) ? " · " + eur(r.valor_estimado) : "") + " · gestor " + esc((r.gestor || "—").trim()) + "</small></div>" +
      (tarde ? pill("Atrasada", "aviso") : pill(fechaCorta(r.fecha) + (r.hora_inicio ? " · " + String(r.hora_inicio).slice(0, 5) : ""), "")) + "</header>" +
      (tel ? '<a class="icc-btn icc-btn-primary icc-rl-tel" href="tel:' + esc(tel) + '">📞 Llamar ' + esc(tel) + "</a>" : "") +
      '<details class="icc-rl-guion"><summary>Guion (intento ' + r.intento + ")</summary><ol><li>«Buenos días" + (nombre ? ", " + esc(nombre) : "") + ". Le llamo de ICC Consultoría por la propuesta de ahorro en " + esc((SERV[r.sector] || "sus servicios").toLowerCase()) + " que le preparamos.»</li>" +
        "<li>«¿Ha podido verla? ¿Le surgió alguna duda?» Si hay una duda: «Aparte de eso, ¿hay algo más que le impida seguir?»</li>" +
        "<li>«Si lo dejamos en marcha esta semana, empieza a ahorrar desde la próxima factura. ¿Le preparo la documentación hoy o prefiere mañana por la mañana?»</li>" +
        "<li>Si lo piensa: «¿Qué día le llamo para cerrarlo?» y apunta la fecha.</li></ol><small>Sin descuentos ni cifras que no estén en su estudio.</small></details>" +
      '<div class="icc-rl-res">' +
        '<button class="icc-btn icc-btn-primary icc-mo-mini" data-res="acepta">✅ Acepta</button>' +
        '<button class="icc-btn icc-btn-secondary icc-mo-mini" data-res="lo_piensa">🤔 Lo piensa</button>' +
        '<button class="icc-btn icc-btn-secondary icc-mo-mini" data-res="no_contesta">📵 No contesta</button>' +
        '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-res="no_acepta">✋ No acepta</button></div>' +
      '<div class="icc-rl-extra" hidden><input class="icc-input" data-motivo placeholder="Nota o motivo (obligatorio si no acepta)"><label class="icc-rl-fecha" hidden><span>Rellamar el</span><input class="icc-input" type="date" data-fecha></label>' +
        '<button class="icc-btn icc-btn-primary icc-mo-mini" data-confirmar>Guardar resultado</button></div></article>';
  }

  function pintar() {
    var d = S.d, n = d.numeros || { hoy: 0, atrasadas: 0, hechas_hoy: 0, aceptan_semana: 0, hechas_semana: 0 };
    var tasa = n.hechas_semana ? Math.round(n.aceptan_semana / n.hechas_semana * 100) : 0;
    var hoy = new Date().toISOString().slice(0, 10);
    var deHoy = d.pendientes.filter(function (r) { return r.fecha <= hoy; }), proximas = d.pendientes.filter(function (r) { return r.fecha > hoy; });
    var nombreSel = (d.backoffice.filter(function (b) { return Number(b.id) === Number(d.usuario); })[0] || {}).nombre || "";
    var html = '<div class="icc-ia icc-mo icc-rl">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">Jefatura de Backoffice</span><h1>📞 Rellamadas de presupuestos</h1>' +
      "<p>Clientes con su propuesta presentada que todavía no han dicho sí. <b>El objetivo de cada llamada: que acepten hoy y empiecen a ahorrar.</b> Marca el resultado con un clic: el CRM hace el resto (contrato, nueva rellamada o paso al gestor).</p>" +
      (d.es_dir && d.backoffice.length > 1 ? '<label class="icc-rl-quien"><span>Persona de backoffice</span><select class="icc-select" id="rl-quien">' + d.backoffice.map(function (b) { return '<option value="' + b.id + '"' + (Number(b.id) === Number(d.usuario) ? " selected" : "") + ">" + esc(b.nombre) + "</option>"; }).join("") + "</select></label>" : (nombreSel && !d.es_back ? "<p><b>" + esc(nombreSel) + "</b></p>" : "")) +
      "</div>" + ((d.es_back && Number(d.config.usuario_id) === Number(d.usuario)) || d.es_dir ? '<button class="icc-btn icc-btn-primary" id="rl-mas">🔥 Dame más rellamadas' + (d.candidatas ? " (" + d.candidatas + " esperando)" : "") + "</button>" : "") + "</section>" +
      '<div class="icc-mo-kpis">' + [["📞", n.hoy, "Para hoy"], ["⏰", n.atrasadas, "Atrasadas"], ["✔️", n.hechas_hoy, "Hechas hoy"], ["✅", n.aceptan_semana, "Aceptados (7 días)"], ["🎯", tasa + "%", "Tasa de aceptación"]]
        .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
      (n.atrasadas >= 3 ? '<p class="icc-mo-aviso">⚠️ Hay ' + n.atrasadas + " rellamadas atrasadas: empieza por ellas. Coordinación recibe el aviso cada mañana mientras sigan así.</p>" : "") +
      '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">Hoy (' + deHoy.length + ")</h2>" + (deHoy.length ? '<div class="icc-rl-lista">' + deHoy.map(tarjeta).join("") + "</div>" : '<p class="icc-muted">Nada pendiente para hoy. ' + (d.candidatas ? "Pulsa «Dame más rellamadas»." : "¡Todo al día!") + "</p>") + "</section>" +
      (proximas.length ? '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">Próximos días (' + proximas.length + ')</h2><div class="icc-rl-lista">' + proximas.map(tarjeta).join("") + "</div></section>" : "") +
      '<section class="icc-card icc-ia-bloque"><h2>Últimos resultados</h2>' + (d.hechas.length ? '<ul class="icc-ia-lista">' + d.hechas.map(function (r) {
        return "<li><div><strong>" + esc(r.razon_social) + "</strong><small>" + esc(fechaCorta(r.resuelta_en)) + " · intento " + r.intento + (r.motivo ? " · " + esc(r.motivo) : "") + (r.rellamar_desde ? " · rellamar el " + esc(fechaCorta(r.rellamar_desde)) : "") + "</small></div><div class=\"icc-ia-fila\">" + pill(EST[r.estado][0], EST[r.estado][1]) + "</div></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Todavía no hay resultados.</p>') + "</section>";
    if (d.es_config) {
      var c = d.config;
      html += '<section class="icc-card icc-ia-bloque"><h2>Ajustes</h2><form id="rl-cfg" class="icc-ia-form"><div class="icc-mo-2">' +
        '<label><span>Quién hace las rellamadas</span><select class="icc-select" name="usuario_id">' + d.backoffice.map(function (b) { return '<option value="' + b.id + '"' + (Number(b.id) === Number(c.usuario_id) ? " selected" : "") + ">" + esc(b.nombre) + "</option>"; }).join("") + "</select></label>" +
        '<label><span>Rellamadas al día (máximo)</span><input class="icc-input" type="number" min="1" max="60" name="max_dia" value="' + c.max_dia + '"></label>' +
        '<label><span>Días sin respuesta para rellamar</span><input class="icc-input" type="number" min="1" max="30" name="dias" value="' + c.dias_sin_contacto + '"></label></div>' +
        '<label class="icc-ia-switch"><input type="checkbox" name="activo"' + (c.activo ? " checked" : "") + "><span><b>Jefatura de Backoffice encendida</b><small>Cada mañana pone las rellamadas en su agenda y le envía el parte.</small></span></label>" +
        '<button class="icc-btn icc-btn-primary icc-mo-mini" type="submit">Guardar</button></form></section>';
    }
    main().innerHTML = html + "</div>";
    enlazar();
  }

  function enlazar() {
    var r = main();
    var q = document.getElementById("rl-quien");
    if (q) q.addEventListener("change", function () { S.usuario = Number(q.value); view(); });
    var mas = document.getElementById("rl-mas");
    if (mas) mas.addEventListener("click", function () { hacer(mas, async function () { var x = await API.post("api/rellamadas.php?action=asignar", {}); U.toast(x.texto, "success"); await view(); }); });
    r.querySelectorAll("[data-rl]").forEach(function (art) {
      var extra = art.querySelector(".icc-rl-extra"), elegido = null;
      art.querySelectorAll("[data-res]").forEach(function (b) {
        b.addEventListener("click", function () {
          elegido = b.dataset.res;
          art.querySelectorAll("[data-res]").forEach(function (x) { x.classList.toggle("is-sel", x === b); });
          if (elegido === "no_contesta") return guardar(b);
          extra.hidden = false;
          art.querySelector(".icc-rl-fecha").hidden = elegido !== "lo_piensa";
          art.querySelector("[data-motivo]").placeholder = elegido === "no_acepta" ? "¿Por qué no acepta? (obligatorio)" : elegido === "acepta" ? "Nota (opcional): qué documentación falta…" : "Nota (opcional)";
          art.querySelector("[data-motivo]").focus();
        });
      });
      art.querySelector("[data-confirmar]").addEventListener("click", function () { guardar(this); });
      function guardar(btn) {
        var datos = { id: Number(art.dataset.rl), estado: elegido, motivo: art.querySelector("[data-motivo]").value };
        var f = art.querySelector("[data-fecha]").value; if (f && elegido === "lo_piensa") datos.fecha = f;
        hacer(btn, async function () { var x = await API.post("api/rellamadas.php?action=resultado", datos); U.toast("✓ " + x.texto, "success"); await view(); });
      }
    });
    var cfg = document.getElementById("rl-cfg");
    if (cfg) cfg.addEventListener("submit", function (ev) {
      ev.preventDefault();
      hacer(ev.submitter, async function () { await API.put("api/rellamadas.php?action=config", { usuario_id: Number(cfg.usuario_id.value), max_dia: Number(cfg.max_dia.value), dias: Number(cfg.dias.value), activo: cfg.activo.checked }); U.toast("✓ Guardado", "success"); await view(); });
    });
  }

  window.icc = window.icc || {};
  window.icc.rellamadas = { view: view };
})();
