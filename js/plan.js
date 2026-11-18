/* =============================================================================
   ICC CRM · Plan del día de backoffice (#/plan-del-dia)
   La Jefatura de Backoffice revisa cada mañana el día anterior y prepara el
   plan de hoy: todo el trabajo ordenado por lo que más acerca una venta, con
   cada cliente resumido y listo (ahorro, qué tiene, qué se le propone, cómo
   cerrarlo y un WhatsApp). Backoffice ve el suyo; dirección, el de cada
   persona. API: api/supervision.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null, usuario: 0, fecha: "", verHechas: false };

  function main() { return document.getElementById("icc-main"); }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }
  function eur(n) { return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"; }
  function fechaL(f) { return f ? new Date(f + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : ""; }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }
  function wa(tel, txt) {
    var t = String(tel || "").replace(/[^\d]/g, "");
    if (t.length === 9) t = "34" + t;
    return t.length >= 11 ? "https://wa.me/" + t + (txt ? "?text=" + encodeURIComponent(txt) : "") : "";
  }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Preparando tu plan…</div>';
    try { S.d = await API.get("api/supervision.php?action=ver" + (S.usuario ? "&usuario=" + S.usuario : "") + (S.fecha ? "&fecha=" + S.fecha : "")); }
    catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    pintar();
  }

  function tarjeta(it, n) {
    var tipo = S.d.tipos[it.tipo] || [it.tipo];
    var tel = String(it.telefono || "").replace(/[^\d+]/g, "");
    var w = wa(tel, it.mensaje);
    var datos = [];
    if (Number(it.ahorro) > 0) datos.push(pill("💶 Ahorro " + eur(it.ahorro) + "/año", "ok"));
    if (it.compania_actual) datos.push(pill("Hoy: " + esc(it.compania_actual), ""));
    if (it.propuesta) datos.push(pill("Propuesta: " + esc(it.propuesta), ""));
    if (it.permanencia) datos.push(pill("Permanencia hasta " + esc(new Date(it.permanencia + "T12:00").toLocaleDateString("es-ES")), "aviso"));
    if (it.objecion) datos.push(pill("Objeción: " + esc(it.objecion), "aviso"));
    if ((it.faltan || []).length) datos.push(pill("Falta: " + esc(it.faltan.join(", ")), "aviso"));
    return '<article class="icc-card icc-pd-item' + (it.hecha ? " is-hecha" : "") + (it.atrasada ? " is-tarde" : "") + '">' +
      '<div class="icc-pd-num">' + (it.hecha ? "✓" : n) + "</div>" +
      '<div class="icc-pd-cuerpo"><header><span class="icc-pd-tipo">' + esc(tipo[0]) + "</span>" + (it.atrasada ? pill(it.dias_vencida ? "Vencida hace " + it.dias_vencida + " d" : "Atrasada", "aviso") : "") + (it.hora ? pill("🕘 " + esc(it.hora), "") : "") + (it.hecha ? pill("Hecho", "ok") : "") + "</header>" +
        "<strong>" + (it.cliente_id ? '<a href="#/clientes/' + it.cliente_id + '">' + esc(it.empresa || it.titulo) + "</a>" : esc(it.titulo)) + "</strong>" +
        (it.contacto || it.gestor ? "<small>" + esc([it.contacto, it.servicio, it.gestor ? "gestor " + it.gestor : ""].filter(Boolean).join(" · ")) + "</small>" : "") +
        '<p class="icc-pd-res">' + esc(it.resumen || it.titulo) + "</p>" +
        (datos.length ? '<div class="icc-pd-datos">' + datos.join("") + "</div>" : "") +
        (it.como_cerrar ? '<p class="icc-pd-como"><b>Cómo:</b> ' + esc(it.como_cerrar) + "</p>" : "") +
        (!it.hecha ? '<div class="icc-ia-fila icc-pd-acc">' +
          (tel && (it.tipo === "llamada" || it.tipo === "contrato") ? '<a class="icc-btn icc-btn-primary icc-mo-mini" href="tel:' + esc(tel) + '">📞 Llamar</a>' : "") +
          (w && it.mensaje ? '<a class="icc-btn icc-btn-ghost icc-mo-mini" href="' + esc(w) + '" target="_blank" rel="noopener">💬 WhatsApp preparado</a>' : "") +
          (it.tipo === "llamada" ? '<a class="icc-btn icc-btn-ghost icc-mo-mini" href="#/rellamadas">Marcar resultado</a>' : '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-hecha="' + it.id + '">✓ Hecha</button>') +
          "</div>" : "") +
      "</div></article>";
  }

  function pintar() {
    var d = S.d, p = d.plan, m = d.marcador;
    var hoy = new Date().toISOString().slice(0, 10);
    var html = '<div class="icc-ia icc-mo icc-pd">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">Jefatura de Backoffice · ' + esc(p ? fechaL(p.fecha) : fechaL(hoy)) + "</span><h1>📋 Plan del día" + (d.nombre && !d.es_back ? " de " + esc(d.nombre) : "") + "</h1>" +
      "<p>" + (d.es_back ? "Todo tu trabajo de hoy, <b>ordenado por lo que más acerca una venta</b> y con cada cliente resumido: ahorro, qué tiene, qué se le propone, cómo cerrarlo y el WhatsApp ya escrito. Ve de arriba abajo." : "Lo que la Jefatura de Backoffice le ha preparado hoy, la revisión de su día anterior y lo que ya ha hecho.") + "</p>" +
      (d.es_dir && d.backoffice.length > 1 ? '<label class="icc-rl-quien"><span>Persona de backoffice</span><select class="icc-select" id="pd-quien">' + d.backoffice.map(function (b) { return '<option value="' + b.id + '"' + (Number(b.id) === Number(d.usuario) ? " selected" : "") + ">" + esc(b.nombre) + "</option>"; }).join("") + "</select></label>" : "") +
      "</div>" + (d.es_dir || d.es_back ? '<button class="icc-btn icc-btn-primary" id="pd-rehacer">' + (p ? "🔄 Rehacer con lo último" : "⚡ Preparar el plan ahora") + "</button>" : "") + "</section>";
    if (!p) {
      html += '<section class="icc-card"><p class="icc-muted">El plan de hoy se prepara solo a las 8:35 de cada día laborable. ' + (d.config.activo ? "" : "La supervisión está apagada en los ajustes. ") + "También puedes prepararlo ahora con el botón.</p></section>";
    } else {
      var r = p.revision || {};
      var pend = p.items.filter(function (i) { return !i.hecha; }), hechas = p.items.filter(function (i) { return i.hecha; });
      html += '<section class="icc-card icc-pd-progreso"><div><b>' + p.hechas + "<small> / " + p.total + "</small></b><span>hechas del plan</span></div>" +
        '<div class="icc-rl-barra"><i style="width:' + Math.round(p.hechas / Math.max(1, p.total) * 100) + '%"></i></div>' +
        (m ? '<div class="icc-pd-mini">' + pill("📞 " + m.hechas + "/" + Math.min(m.objetivo, m.objetivo_efectivo || m.objetivo) + " llamadas", m.diferencia >= 0 ? "ok" : "aviso") + pill("✅ " + m.aceptados + "/" + m.objetivo_aceptados + " aceptados", m.aceptados >= m.objetivo_aceptados ? "ok" : "") + (m.racha ? pill("🔥 Racha de " + m.racha + " días", "") : "") + "</div>" : "") + "</section>" +
        '<section class="icc-card icc-pd-rev"><h2>🧭 Revisión de ' + esc(fechaL(r.fecha_revisada)) + '</h2><div class="icc-pd-rev-num">' +
          [["📞", r.llamadas, "llamadas"], ["✅", r.aceptados, "aceptados"], ["📵", r.no_contesta, "no contestan"], ["🤔", r.lo_piensa, "lo piensan"], ["✔️", r.tareas_cerradas, "tareas cerradas"]].map(function (k) { return "<div><b>" + k[0] + " " + (k[1] || 0) + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
          ((r.bien || []).length ? '<ul class="icc-pd-bien">' + r.bien.map(function (x) { return "<li>✓ " + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
          ((r.mejorar || []).length ? '<ul class="icc-pd-mejorar">' + r.mejorar.map(function (x) { return "<li>→ " + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
          '<p class="icc-pd-consejo">💡 <b>Consejo del día:</b> ' + esc(r.consejo || "") + "</p></section>" +
        '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">' + (d.es_back ? "Tu plan" : "Su plan de hoy") + " (" + pend.length + " por hacer)</h2>" + (pend.length ? '<div class="icc-pd-lista">' + pend.map(function (it, i) { return tarjeta(it, i + 1); }).join("") + "</div>" : '<p class="icc-muted">🎉 ¡Plan del día completado!</p>') + "</section>" +
        (hechas.length ? '<section class="icc-ia-bloque"><button class="icc-btn icc-btn-ghost icc-mo-mini" id="pd-ver-hechas">' + (S.verHechas ? "Ocultar" : "Ver") + " lo hecho (" + hechas.length + ")</button>" + (S.verHechas ? '<div class="icc-pd-lista">' + hechas.map(function (it) { return tarjeta(it, "✓"); }).join("") + "</div>" : "") + "</section>" : "") +
        '<p class="icc-ia-nota">Plan preparado ' + esc(String(p.creado).slice(11, 16)) + (p.ia ? " · resúmenes con IA (las cifras salen de la ficha)" : " · resúmenes automáticos") + (p.correo ? " · enviado también por correo" : "") + "." +
        (d.dias.length > 1 ? ' Días anteriores: ' + d.dias.slice(0, 7).map(function (f) { return '<a href="#" data-fecha="' + esc(f) + '">' + esc(f.slice(8, 10) + "/" + f.slice(5, 7)) + "</a>"; }).join(" · ") : "") + "</p>";
    }
    if (d.es_config) {
      var c = d.config;
      html += '<section class="icc-card icc-ia-bloque"><h2>Ajustes de la supervisión</h2><form id="pd-cfg" class="icc-ia-form">' +
        '<label class="icc-ia-switch"><input type="checkbox" name="activo"' + (c.activo ? " checked" : "") + "><span><b>Plan del día y revisión diaria</b><small>A las 8:35 de cada día laborable revisa el día anterior, prepara el plan y avisa a coordinación de lo atascado.</small></span></label>" +
        '<label class="icc-ia-switch"><input type="checkbox" name="correo"' + (c.correo ? " checked" : "") + "><span><b>Enviarle también el plan por correo</b><small>Desde facturacion@, info@ o el buzón del Motor, a su correo de usuario.</small></span></label>" +
        '<label><span>Carga máxima en un día (si la pasa, aviso a coordinación para repartir)</span><input class="icc-input" type="number" min="10" max="100" name="carga_max" value="' + c.carga_max + '"></label>' +
        '<button class="icc-btn icc-btn-primary icc-mo-mini" type="submit">Guardar</button></form></section>';
    }
    main().innerHTML = html + "</div>";
    enlazar();
  }

  function enlazar() {
    var m = main();
    var q = document.getElementById("pd-quien");
    if (q) q.addEventListener("change", function () { S.usuario = Number(q.value); S.fecha = ""; view(); });
    var r = document.getElementById("pd-rehacer");
    if (r) r.addEventListener("click", function () { hacer(r, async function () { r.textContent = "Preparando…"; var x = await API.post("api/supervision.php?action=rehacer", { usuario: S.d.usuario }); U.toast("✓ " + x.texto, "success"); S.fecha = ""; await view(); }); });
    var vh = document.getElementById("pd-ver-hechas");
    if (vh) vh.addEventListener("click", function () { S.verHechas = !S.verHechas; pintar(); });
    m.querySelectorAll("[data-hecha]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { await API.post("api/supervision.php?action=hecha", { id: Number(b.dataset.hecha) }); U.toast("✓ Hecha", "success"); await view(); }); }); });
    m.querySelectorAll("[data-fecha]").forEach(function (a) { a.addEventListener("click", function (ev) { ev.preventDefault(); S.fecha = a.dataset.fecha; view(); }); });
    var cfg = document.getElementById("pd-cfg");
    if (cfg) cfg.addEventListener("submit", function (ev) { ev.preventDefault(); hacer(ev.submitter, async function () { await API.put("api/supervision.php?action=config", { activo: cfg.activo.checked, correo: cfg.correo.checked, carga_max: Number(cfg.carga_max.value) }); U.toast("✓ Guardado", "success"); await view(); }); });
  }

  window.icc = window.icc || {};
  window.icc.plan = { view: view };
})();
