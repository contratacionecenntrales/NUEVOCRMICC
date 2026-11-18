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

  function waLink(tel, nombre, sector) {
    var t = String(tel || "").replace(/[^\d]/g, "");
    if (t.length === 9) t = "34" + t;
    if (t.length < 11) return "";
    var yo = (S.d && S.d.nombre) || "";
    var txt = "Hola" + (nombre ? " " + nombre.split(" ")[0] : "") + ", soy " + yo + " de ICC Consultoría. Le he llamado por la propuesta de ahorro en " + (SERV[sector] || "sus servicios").toLowerCase() + " que le preparamos. ¿Cuándo le viene bien que lo hablemos 2 minutos?";
    return "https://wa.me/" + t + "?text=" + encodeURIComponent(txt);
  }

  function tarjeta(r, foco) {
    var hoy = new Date().toISOString().slice(0, 10), tarde = r.fecha < hoy;
    var tel = String(r.contacto_telefono || r.telefono || "").replace(/[^\d+]/g, "");
    var nombre = (r.contacto_nombre || r.decisor_nombre || "").trim();
    var wa = waLink(tel, nombre, r.sector);
    return '<article class="icc-card icc-rl-tarjeta' + (tarde ? " is-tarde" : "") + (foco ? " is-foco" : "") + '" data-rl="' + r.id + '">' +
      (foco ? '<span class="icc-rl-foco-eti">👉 Siguiente llamada</span>' : "") +
      '<header><div><strong><a href="#/clientes/' + r.cliente_id + '">' + esc(r.razon_social) + "</a></strong><small>" + esc(nombre || "Sin contacto") + " · " + esc(SERV[r.sector] || "Presupuesto") + (eur(r.valor_estimado) ? " · " + eur(r.valor_estimado) : "") + " · gestor " + esc((r.gestor || "—").trim()) + "</small></div>" +
      (tarde ? pill("Atrasada", "aviso") : pill(fechaCorta(r.fecha) + (r.hora_inicio ? " · " + String(r.hora_inicio).slice(0, 5) : ""), "")) + "</header>" +
      '<div class="icc-rl-acc">' + (tel ? '<a class="icc-btn icc-btn-primary icc-rl-tel" href="tel:' + esc(tel) + '">📞 Llamar ' + esc(tel) + "</a>" : '<span class="icc-muted">Sin teléfono en la ficha</span>') +
        (wa ? '<a class="icc-btn icc-btn-ghost icc-rl-wa" href="' + esc(wa) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : "") + "</div>" +
      '<details class="icc-rl-guion"' + (foco ? " open" : "") + '><summary>Guion (intento ' + r.intento + ")</summary><ol><li>«Buenos días" + (nombre ? ", " + esc(nombre) : "") + ". Le llamo de ICC Consultoría por la propuesta de ahorro en " + esc((SERV[r.sector] || "sus servicios").toLowerCase()) + " que le preparamos.»</li>" +
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

  function barra(v, max, clase) { var p = Math.min(100, Math.round(Number(v) / Math.max(1, Number(max)) * 100)); return '<div class="icc-rl-barra ' + (clase || "") + '"><i style="width:' + p + '%"></i></div>'; }

  function marcador(m) {
    if (!m) return "";
    var ritmo = m.sin_trabajo ? ["✅ Lista al día: no quedan presupuestos por rellamar", "ok"] : m.diferencia >= 0 ? ["💪 Vas " + (m.diferencia ? m.diferencia + " por delante" : "al ritmo"), "ok"] : ["⏱️ Vas " + (-m.diferencia) + " por detrás · a esta hora tocaban " + m.esperadas, "aviso"];
    var obj = Math.max(1, Math.min(m.objetivo, m.objetivo_efectivo || m.objetivo));
    var hecho = m.objetivo_efectivo > 0 && m.hechas >= obj;
    return '<section class="icc-card icc-rl-marcador' + (hecho ? " is-hecho" : "") + '"><div class="icc-rl-marc-cab"><h2>' + (hecho ? "🏆 ¡Objetivo cumplido!" : "🎯 Objetivo de hoy") + "</h2>" + (m.racha ? '<span class="icc-rl-racha">🔥 ' + m.racha + " día" + (m.racha === 1 ? "" : "s") + " cumpliendo</span>" : "") + "</div>" +
      '<div class="icc-rl-marc-fila"><div><b>' + m.hechas + "<small> / " + obj + "</small></b><span>llamadas</span>" + barra(m.hechas, obj, "is-llamadas") + "</div>" +
      "<div><b>" + m.aceptados + "<small> / " + m.objetivo_aceptados + "</small></b><span>aceptados</span>" + barra(m.aceptados, m.objetivo_aceptados || 1, "is-aceptados") + "</div></div>" +
      '<div class="icc-rl-marc-pie">' + (m.en_jornada || m.hechas || m.sin_trabajo ? pill(ritmo[0], ritmo[1]) : "") + (m.objetivo_efectivo < m.objetivo ? pill("Objetivo " + m.objetivo + " · hoy solo hay " + m.objetivo_efectivo + " para llamar", "") : "") + (m.pendientes ? pill(m.pendientes + " por llamar hoy", "") : "") + (m.record ? pill("Récord: " + m.record + " en un día", "") : "") +
      (Number(m.valor_aceptado_semana) > 0 ? pill(eur(m.valor_aceptado_semana) + " aceptados esta semana", "ok") : "") + "</div></section>";
  }

  function pintar() {
    var d = S.d, n = d.numeros || { hoy: 0, atrasadas: 0, hechas_hoy: 0, aceptan_semana: 0, hechas_semana: 0 };
    var tasa = n.hechas_semana ? Math.round(n.aceptan_semana / n.hechas_semana * 100) : 0;
    var hoy = new Date().toISOString().slice(0, 10);
    var deHoy = d.pendientes.filter(function (r) { return r.fecha <= hoy; }), proximas = d.pendientes.filter(function (r) { return r.fecha > hoy; });
    var nombreSel = (d.backoffice.filter(function (b) { return Number(b.id) === Number(d.usuario); })[0] || {}).nombre || "";
    var html = '<div class="icc-ia icc-mo icc-rl">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">Jefatura de Backoffice</span><h1>📞 Rellamadas de presupuestos</h1>' +
      "<p>Clientes con su propuesta presentada que todavía no han dicho sí. <b>El objetivo de cada llamada: que acepten hoy y empiecen a ahorrar.</b> Llama desde el móvil con el botón, marca el resultado con un clic y pasa a la siguiente: el CRM hace el resto (contrato, nueva rellamada o paso al gestor).</p>" +
      (d.es_dir && d.backoffice.length > 1 ? '<label class="icc-rl-quien"><span>Persona de backoffice</span><select class="icc-select" id="rl-quien">' + d.backoffice.map(function (b) { return '<option value="' + b.id + '"' + (Number(b.id) === Number(d.usuario) ? " selected" : "") + ">" + esc(b.nombre) + "</option>"; }).join("") + "</select></label>" : (nombreSel && !d.es_back ? "<p><b>" + esc(nombreSel) + "</b></p>" : "")) +
      "</div>" + ((d.es_back && Number(d.config.usuario_id) === Number(d.usuario)) || d.es_dir ? '<button class="icc-btn icc-btn-primary" id="rl-mas">🔥 Dame más rellamadas' + (d.candidatas ? " (" + d.candidatas + " esperando)" : "") + "</button>" : "") + "</section>" +
      marcador(d.marcador) +
      '<div class="icc-mo-kpis">' + [["📞", n.hoy, "Para hoy"], ["⏰", n.atrasadas, "Atrasadas"], ["✔️", n.hechas_hoy, "Hechas hoy"], ["✅", n.aceptan_semana, "Aceptados (7 días)"], ["🎯", tasa + "%", "Tasa de aceptación"]]
        .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
      (n.atrasadas >= 3 ? '<p class="icc-mo-aviso">⚠️ Hay ' + n.atrasadas + " rellamadas atrasadas: empieza por ellas. Coordinación recibe el aviso cada mañana mientras sigan así.</p>" : "") +
      '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">Hoy (' + deHoy.length + ")</h2>" + (deHoy.length ? tarjeta(deHoy[0], true) + (deHoy.length > 1 ? '<h3 class="icc-rl-h3">Después (' + (deHoy.length - 1) + ')</h3><div class="icc-rl-lista">' + deHoy.slice(1).map(function (r) { return tarjeta(r, false); }).join("") + "</div>" : "") : '<p class="icc-muted">Nada pendiente para hoy. ' + (d.candidatas ? "Pulsa «Dame más rellamadas»." : "¡Todo al día!") + "</p>") + "</section>" +
      (proximas.length ? '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">Próximos días (' + proximas.length + ')</h2><div class="icc-rl-lista">' + proximas.map(function (r) { return tarjeta(r, false); }).join("") + "</div></section>" : "") +
      '<section class="icc-card icc-ia-bloque"><h2>Últimos resultados</h2>' + (d.hechas.length ? '<ul class="icc-ia-lista">' + d.hechas.map(function (r) {
        return "<li><div><strong>" + esc(r.razon_social) + "</strong><small>" + esc(fechaCorta(r.resuelta_en)) + " · intento " + r.intento + (r.motivo ? " · " + esc(r.motivo) : "") + (r.rellamar_desde ? " · rellamar el " + esc(fechaCorta(r.rellamar_desde)) : "") + "</small></div><div class=\"icc-ia-fila\">" + pill(EST[r.estado][0], EST[r.estado][1]) + "</div></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Todavía no hay resultados.</p>') + "</section>";
    if (d.es_config) {
      var c = d.config;
      html += '<section class="icc-card icc-ia-bloque"><h2>Ajustes</h2><form id="rl-cfg" class="icc-ia-form"><div class="icc-mo-2">' +
        '<label><span>Quién hace las rellamadas</span><select class="icc-select" name="usuario_id">' + d.backoffice.map(function (b) { return '<option value="' + b.id + '"' + (Number(b.id) === Number(c.usuario_id) ? " selected" : "") + ">" + esc(b.nombre) + "</option>"; }).join("") + "</select></label>" +
        '<label><span>Rellamadas al día (máximo)</span><input class="icc-input" type="number" min="1" max="80" name="max_dia" value="' + c.max_dia + '"></label>' +
        '<label><span>Días sin respuesta para rellamar</span><input class="icc-input" type="number" min="1" max="30" name="dias" value="' + c.dias_sin_contacto + '"></label>' +
        '<label><span>Objetivo diario de llamadas</span><input class="icc-input" type="number" min="1" max="80" name="objetivo" value="' + c.objetivo + '"></label>' +
        '<label><span>Objetivo diario de aceptados</span><input class="icc-input" type="number" min="0" max="20" name="objetivo_aceptados" value="' + c.objetivo_aceptados + '"></label></div>' +
        '<label class="icc-ia-switch"><input type="checkbox" name="presion"' + (c.presion ? " checked" : "") + "><span><b>Presión durante el día</b><small>Avisos de ritmo a las 11:30, 13:30 y 17:30, aviso si pasa 1 hora sin marcar nada, celebración al cumplir y cierre del día a dirección a las 19:00.</small></span></label>" +
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
      hacer(ev.submitter, async function () { await API.put("api/rellamadas.php?action=config", { usuario_id: Number(cfg.usuario_id.value), max_dia: Number(cfg.max_dia.value), dias: Number(cfg.dias.value), activo: cfg.activo.checked, objetivo: Number(cfg.objetivo.value), objetivo_aceptados: Number(cfg.objetivo_aceptados.value), presion: cfg.presion.checked }); U.toast("✓ Guardado", "success"); await view(); });
    });
  }

  window.icc = window.icc || {};
  window.icc.rellamadas = { view: view };
})();
