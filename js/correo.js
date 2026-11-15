/* =============================================================================
   ICC CRM · Agente de correo (#/agente-correo)
   Bandeja, Para aprobar, Agentes, Buzones y Cómo responde. Dirección y jefes
   de equipo; buzones y agentes los configura la administración.
   API: api/correo.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null, tab: "bandeja", x: null, filtro: { estado: "", q: "" }, abierto: null };
  var ESTADOS = { nuevo: ["Nuevo", ""], archivado: ["Archivado", ""], respondido: ["Respondido por el agente", "ok"], para_aprobar: ["Para aprobar", "aviso"], enviado_manual: ["Respondido por una persona", "ok"], derivado: ["Derivado", ""], error: ["Error", "mal"] };
  var MODOS = { aprobacion: "Todo con aprobación", automatico: "Automático (solo lo de su departamento)", amplio: "Automático amplio" };
  var PERM = { solo: "Lo hace solo", aprobacion: "Pide aprobación", no: "No puede" };

  function main() { return document.getElementById("icc-main"); }
  function fecha(f) { if (!f) return "—"; return new Date(String(f).replace(" ", "T")).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Cargando el agente de correo…</div>';
    try { S.d = await API.get("api/correo.php?action=estado"); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    await cargar();
    pintar();
  }
  async function cargar() {
    S.x = null;
    try {
      if (S.tab === "bandeja") S.x = await API.get("api/correo.php?action=bandeja&" + new URLSearchParams(S.filtro).toString());
      if (S.tab === "aprobar") S.x = await API.get("api/correo.php?action=aprobar");
      if (S.tab === "agentes" || S.tab === "buzones") S.x = await API.get("api/correo.php?action=cuentas");
      if (S.tab === "config") S.x = await API.get("api/correo.php?action=config");
    } catch (e) { U.toast(e.message, "error"); }
  }

  function pintar() {
    var d = S.d, c = d.contadores || {};
    var pend = Number(c.para_aprobar || 0) + Number(d.acciones_pendientes || 0);
    var html = '<div class="icc-ia icc-mo icc-ca">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">IA · Un agente por buzón</span><h1>📬 Agente de correo</h1>' +
      "<p>Cada buzón corporativo tiene su agente: gestiona en el CRM lo que el correo necesita y contesta desde el propio buzón, en el mismo hilo. <b>Nunca sale sola</b> una respuesta con importes, descuentos, contratos o quejas: queda para una persona, con un acuse de recibo neutro.</p>" +
      '<div class="icc-ia-estado">' + pill(d.cuentas + " buzones activos", d.cuentas ? "ok" : "aviso") + pill(d.ia ? "Con IA" : "Sin IA: modo sencillo", d.ia ? "ok" : "aviso") + (pend ? pill("✍️ " + pend + " para aprobar", "aviso") : "") + "</div></div>" +
      (d.es_config ? '<button class="icc-btn icc-btn-secondary" id="ca-revisar">↻ Revisar buzones ahora</button>' : "") + "</section>" +
      '<nav class="icc-tabs icc-mo-tabs" role="tablist">' + [["bandeja", "📥 Bandeja"], ["aprobar", "✍️ Para aprobar" + (pend ? " <b>" + pend + "</b>" : "")], ["agentes", "🤖 Agentes"], ["buzones", "📮 Buzones"], ["config", "🗣️ Cómo responde"]]
        .map(function (t) { return '<button type="button" role="tab" class="icc-tab' + (S.tab === t[0] ? " is-active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</nav>" +
      '<div id="ca-cuerpo">' + (S.x ? ({ bandeja: bandeja, aprobar: aprobar, agentes: agentes, buzones: buzones, config: config }[S.tab])() : '<p class="icc-empty">No se pudo cargar.</p>') + "</div></div>";
    main().innerHTML = html;
    enlazar();
  }

  /* ------------------------------------------------------------- BANDEJA */
  function bandeja() {
    var f = S.filtro;
    var html = '<div class="icc-mo-filtros icc-ca-filtros"><input class="icc-input" id="ca-q" placeholder="Buscar remitente o asunto…" value="' + esc(f.q) + '">' +
      '<select class="icc-select" id="ca-estado"><option value="">Todos</option>' + Object.keys(ESTADOS).map(function (k) { return '<option value="' + k + '"' + (f.estado === k ? " selected" : "") + ">" + ESTADOS[k][0] + "</option>"; }).join("") + "</select></div>";
    if (!S.x.mensajes.length) return html + '<p class="icc-empty">No hay correos.</p>';
    return html + '<ul class="icc-ca-lista">' + S.x.mensajes.map(function (m) {
      var e = ESTADOS[m.estado] || [m.estado, ""];
      return '<li><button type="button" class="icc-ca-fila" data-msg="' + m.id + '"><div class="icc-ca-de"><strong>' + esc(m.de_nombre || m.de) + "</strong><small>" + esc(m.buzon) + " · " + esc(fecha(m.fecha)) + "</small></div>" +
        '<div class="icc-ca-asunto"><b>' + esc(m.asunto || "(sin asunto)") + "</b><small>" + esc(m.extracto || "") + "</small></div>" +
        '<div class="icc-ca-estado">' + pill(e[0], e[1]) + (m.categoria ? "<small>" + esc(S.d.categorias[m.categoria] || m.categoria) + (m.confianza != null ? " · " + m.confianza + "%" : "") + "</small>" : "") + (m.agente ? "<small>" + esc(m.agente) + "</small>" : "") + "</div></button></li>";
    }).join("") + "</ul>";
  }

  async function abrirMensaje(id) {
    var r;
    try { r = await API.get("api/correo.php?action=mensaje&id=" + id); } catch (e) { U.toast(e.message, "error"); return; }
    var m = r.mensaje;
    var dos = [];
    try { dos = (await API.get("api/correo.php?action=dosieres")).dosieres; } catch (e) {}
    var editable = ["para_aprobar", "nuevo", "error"].indexOf(m.estado) !== -1;
    var e = ESTADOS[m.estado] || [m.estado, ""];
    var html = '<div class="icc-ca-modal" role="dialog" aria-label="Correo"><div class="icc-ca-modal-caja"><header><div><strong>' + esc(m.asunto || "(sin asunto)") + "</strong><small>" + esc(m.de_nombre) + " &lt;" + esc(m.de) + "&gt; → " + esc(m.buzon) + " · " + esc(fecha(m.fecha)) + "</small></div>" +
      '<button type="button" class="icc-jv-x" data-cerrar aria-label="Cerrar">×</button></header><div class="icc-ca-modal-cuerpo">' +
      '<div class="icc-mo-chips">' + pill(e[0], e[1]) + (m.categoria ? pill(esc(S.d.categorias[m.categoria] || m.categoria)) : "") + (m.agente ? pill(esc(m.agente)) : "") + (m.cliente_id ? '<a class="icc-ia-pill" href="#/clientes/' + m.cliente_id + '">Ver cliente</a>' : "") + "</div>" +
      (m.motivo ? '<p class="icc-mo-aviso">' + esc(m.motivo) + "</p>" : "") +
      '<pre class="icc-mo-pre">' + esc(m.cuerpo) + "</pre>" +
      (m.adjuntos_entrada.length ? '<p class="icc-ca-adj">📎 ' + m.adjuntos_entrada.map(function (a, i) { return '<a href="api/correo.php?action=adjunto&id=' + m.id + "&n=" + i + '">' + esc(a.nombre) + "</a>"; }).join(" · ") + "</p>" : "");
    if (editable) {
      html += '<h3 class="icc-eq-h3">Respuesta</h3><div class="icc-ia-form"><input class="icc-input" id="ca-asunto" value="' + esc(m.borrador_asunto || "Re: " + m.asunto) + '" aria-label="Asunto">' +
        '<textarea class="icc-input" id="ca-texto" rows="8" aria-label="Texto">' + esc(m.borrador_cuerpo || "") + "</textarea>" +
        (dos.length ? '<div class="icc-ca-dos"><span>Dosieres (máx. 3)</span>' + dos.map(function (x) { return '<label><input type="checkbox" value="' + x.id + '"' + (m.dosieres_sugeridos.indexOf(Number(x.id)) !== -1 ? " checked" : "") + "> " + esc(x.titulo) + "</label>"; }).join("") + "</div>" : "") +
        '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" id="ca-enviar">Enviar desde ' + esc(m.buzon) + '</button><button class="icc-btn icc-btn-ghost" id="ca-archivar">Archivar</button></div></div>';
    } else if (m.borrador_cuerpo) {
      html += '<h3 class="icc-eq-h3">Respuesta enviada</h3><pre class="icc-mo-pre">' + esc(m.borrador_cuerpo) + "</pre>";
    }
    if (m.pendientes.length) html += '<h3 class="icc-eq-h3">Acciones del agente</h3><ul class="icc-ia-lista">' + m.pendientes.map(function (a) { return "<li><div><strong>" + esc(a.herramienta.replace(/_/g, " ")) + "</strong><small>" + esc(JSON.stringify(a.args)) + (a.motivo ? " · " + esc(a.motivo) : "") + "</small></div>" + pill(a.estado, a.estado === "aprobada" ? "ok" : a.estado === "pendiente" ? "aviso" : "") + "</li>"; }).join("") + "</ul>";
    html += '<h3 class="icc-eq-h3">Traza</h3><ol class="icc-ca-traza">' + m.traza.map(function (t) { return "<li><b>" + esc(t.t) + " · " + esc(t.paso) + "</b> " + esc(t.detalle) + "</li>"; }).join("") + "</ol></div></div></div>";
    var cont = document.createElement("div");
    cont.innerHTML = html;
    document.body.appendChild(cont);
    var cerrar = function () { cont.remove(); document.removeEventListener("keydown", esc_); };
    var esc_ = function (ev) { if (ev.key === "Escape") cerrar(); };
    document.addEventListener("keydown", esc_);
    cont.querySelector("[data-cerrar]").addEventListener("click", cerrar);
    cont.querySelector(".icc-ca-modal").addEventListener("click", function (ev) { if (ev.target === ev.currentTarget) cerrar(); });
    var env = cont.querySelector("#ca-enviar");
    if (env) env.addEventListener("click", function () {
      var dosieres = Array.prototype.map.call(cont.querySelectorAll(".icc-ca-dos input:checked"), function (x) { return Number(x.value); });
      hacer(env, async function () { await API.post("api/correo.php?action=enviar", { id: m.id, asunto: cont.querySelector("#ca-asunto").value, cuerpo: cont.querySelector("#ca-texto").value, dosieres: dosieres }); U.toast("✓ Enviado", "success"); cerrar(); await recargar(); });
    });
    var arc = cont.querySelector("#ca-archivar");
    if (arc) arc.addEventListener("click", function () { hacer(arc, async function () { await API.post("api/correo.php?action=archivar", { id: m.id }); cerrar(); await recargar(); }); });
  }
  async function recargar() { S.d = await API.get("api/correo.php?action=estado"); await cargar(); pintar(); }

  /* ------------------------------------------------------------- APROBAR */
  function aprobar() {
    var x = S.x;
    var html = "";
    if (x.acciones.length) html += '<section class="icc-card icc-ia-bloque"><h2>Acciones de los agentes</h2><ul class="icc-ia-lista">' + x.acciones.map(function (a) {
      return "<li><div><strong>" + esc(a.herramienta.replace(/_/g, " ")) + " · " + esc(a.agente) + "</strong><small>" + esc(a.buzon) + " · " + esc(a.de) + " · «" + esc(a.asunto) + "»</small><p>" + esc(JSON.stringify(a.args)) + "</p>" + (a.motivo ? '<small class="icc-ia-err">⚠ ' + esc(a.motivo) + "</small>" : "") + "</div>" +
        (x.es_dir ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary icc-mo-mini" data-acc="' + a.id + '" data-si="1">Aprobar</button><button class="icc-btn icc-btn-ghost icc-mo-mini" data-acc="' + a.id + '" data-si="0">Rechazar</button></div>' : "") + "</li>";
    }).join("") + "</ul></section>";
    html += '<section class="icc-card icc-ia-bloque"><h2>Correos pendientes</h2>' + (x.mensajes.length ? '<ul class="icc-ca-lista">' + x.mensajes.map(function (m) {
      return '<li><button type="button" class="icc-ca-fila" data-msg="' + m.id + '"><div class="icc-ca-de"><strong>' + esc(m.de_nombre || m.de) + "</strong><small>" + esc(m.buzon) + " · " + esc(fecha(m.created_at)) + "</small></div>" +
        '<div class="icc-ca-asunto"><b>' + esc(m.asunto) + "</b><small>" + esc(m.motivo || "") + "</small></div>" +
        '<div class="icc-ca-estado">' + pill(m.borrador_cuerpo ? "Con borrador" : "Sin borrador", m.borrador_cuerpo ? "ok" : "") + "</div></button></li>";
    }).join("") + "</ul>" : '<p class="icc-muted">Nada pendiente. 👌</p>') + "</section>";
    return html;
  }

  /* ------------------------------------------------------------- AGENTES */
  function agentes() {
    var cs = S.x.cuentas;
    if (!cs.length) return '<p class="icc-empty">Todavía no hay buzones conectados.</p>';
    return '<div class="icc-mo-camps">' + cs.map(function (c) {
      var a = c.agente;
      return '<article class="icc-card icc-mo-camp"><header><div><strong>' + esc(a.nombre) + "</strong><small>" + esc(c.email) + " · " + esc(MODOS[c.modo]) + "</small></div>" + pill(c.activo && a.activo ? "Activo" : c.activo ? "Modo sencillo" : "Apagado", c.activo && a.activo ? "ok" : "aviso") + "</header>" +
        '<p class="icc-eq-mision">' + esc(a.que_gestiona) + "</p>" + (a.propias.length ? '<div class="icc-mo-chips">' + a.propias.map(function (p) { return '<span class="icc-mo-chip">' + esc(S.d.categorias[p]) + "</span>"; }).join("") + "</div>" : "") +
        (S.x.es_config ? editorAgente(c) : "") + "</article>";
    }).join("") + "</div>";
  }
  function editorAgente(c) {
    var a = c.agente;
    return '<details class="icc-ca-ed"><summary>Editar agente</summary><form class="icc-ia-form" data-agente="' + c.id + '">' +
      '<div class="icc-mo-2"><label><span>Nombre</span><input class="icc-input" name="nombre" value="' + esc(a.nombre) + '"></label><label><span>Cargo</span><input class="icc-input" name="cargo" value="' + esc(a.cargo) + '"></label></div>' +
      '<div class="icc-mo-2"><label><span>Departamento</span><select class="icc-select" name="funcion">' + Object.keys(S.d.funciones).map(function (k) { return '<option value="' + k + '"' + (c.funcion === k ? " selected" : "") + ">" + esc(S.d.funciones[k]) + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Modo</span><select class="icc-select" name="modo">' + Object.keys(MODOS).map(function (k) { return '<option value="' + k + '"' + (c.modo === k ? " selected" : "") + ">" + MODOS[k] + "</option>"; }).join("") + "</select></label></div>" +
      '<label><span>Encargado</span><select class="icc-select" name="responsable_id"><option value="">—</option>' + S.x.usuarios.map(function (u) { return '<option value="' + u.id + '"' + (Number(c.responsable_id) === Number(u.id) ? " selected" : "") + ">" + esc(u.nombre) + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Instrucciones</span><textarea class="icc-input" name="instrucciones" rows="3">' + esc(a.instrucciones) + "</textarea></label>" +
      '<label><span>Conocimiento propio (lo que puede afirmar)</span><textarea class="icc-input" name="conocimiento" rows="3">' + esc(a.conocimiento) + "</textarea></label>" +
      '<label><span>Firma</span><textarea class="icc-input" name="firma" rows="2">' + esc(c.firma || "") + "</textarea></label>" +
      '<div class="icc-ca-perm"><span>Permisos</span>' + Object.keys(a.permisos).map(function (k) { return "<label>" + esc(k.replace(/_/g, " ")) + '<select class="icc-select" name="perm_' + k + '">' + Object.keys(PERM).filter(function (p) { return !(p === "solo" && S.d.siempre_aprobacion.indexOf(k) !== -1); }).map(function (p) { return '<option value="' + p + '"' + (a.permisos[k] === p ? " selected" : "") + ">" + PERM[p] + "</option>"; }).join("") + "</select></label>"; }).join("") + "</div>" +
      '<div class="icc-ca-dos"><span>Dosieres fijos (máx. 3)</span>' + (S.x.dosieres.length ? S.x.dosieres.map(function (x) { return '<label><input type="checkbox" name="adj" value="' + x.id + '"' + (String(c.adjuntos).split(",").indexOf(String(x.id)) !== -1 ? " checked" : "") + "> " + esc(x.titulo) + "</label>"; }).join("") : "<small>No hay dosieres en Formación y recursos.</small>") + "</div>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="activo"' + (c.activo ? " checked" : "") + "><span><b>Buzón activo</b></span></label>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="agente_activo"' + (a.activo ? " checked" : "") + "><span><b>Agente encendido</b><small>Apagado, funciona en modo sencillo.</small></span></label>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="adjuntar"' + (c.adjuntar ? " checked" : "") + "><span><b>La IA elige dosieres por sector</b></span></label>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="acuse"' + (c.acuse ? " checked" : "") + "><span><b>Acuse de recibo</b><small>Si la respuesta queda para una persona.</small></span></label>" +
      '<button class="icc-btn icc-btn-primary icc-mo-mini" type="submit">Guardar agente</button></form></details>';
  }

  /* ------------------------------------------------------------- BUZONES */
  function buzones() {
    var x = S.x;
    var lista = '<section class="icc-card icc-ia-bloque"><h2>Buzones conectados</h2>' + (x.cuentas.length ? '<ul class="icc-ia-lista">' + x.cuentas.map(function (c) {
      return "<li><div><strong>" + esc(c.email) + "</strong><small>" + esc(c.agente.nombre) + " · IMAP " + esc(c.host_imap || "—") + " · SMTP " + esc(c.host_smtp || "—") + (c.ultima_lectura ? " · leído " + esc(fecha(c.ultima_lectura)) : "") + (c.tiene_clave ? " · 🔒 contraseña guardada" : " · sin contraseña") + "</small>" +
        (c.error ? '<small class="icc-ia-err">⚠ ' + esc(c.error) + "</small>" : "") + "</div>" +
        (x.es_config ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-secondary icc-mo-mini" data-probar="' + c.id + '">Probar</button><button class="icc-btn icc-btn-ghost icc-mo-mini" data-borrar="' + c.id + '">Desconectar</button></div>' : "") + "</li>";
    }).join("") + "</ul>" : '<p class="icc-muted">Ninguno.</p>') + "</section>";
    if (!x.es_config) return lista + '<p class="icc-ia-nota">Los buzones los conecta la administración.</p>';
    return lista + '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>Conectar un buzón</h2><form id="ca-cuenta" class="icc-ia-form" autocomplete="off">' +
      '<div class="icc-mo-2"><label><span>Correo</span><input class="icc-input" name="email" required></label><label><span>Nombre visible</span><input class="icc-input" name="nombre"></label></div>' +
      '<div class="icc-mo-2"><label><span>IMAP</span><input class="icc-input" name="host_imap"></label><label><span>Puerto</span><input class="icc-input" type="number" name="puerto_imap" value="993"></label></div>' +
      '<div class="icc-mo-2"><label><span>SMTP</span><input class="icc-input" name="host_smtp"></label><label><span>Puerto</span><input class="icc-input" type="number" name="puerto_smtp" value="587"></label></div>' +
      '<div class="icc-mo-2"><label><span>Cifrado IMAP</span><select class="icc-select" name="seguridad_imap"><option value="ssl">SSL</option><option value="starttls">STARTTLS</option><option value="ninguna">Sin cifrar</option></select></label>' +
      '<label><span>Cifrado SMTP</span><select class="icc-select" name="seguridad_smtp"><option value="starttls">STARTTLS</option><option value="ssl">SSL</option><option value="ninguna">Sin cifrar</option></select></label></div>' +
      '<div class="icc-mo-2"><label><span>Usuario</span><input class="icc-input" name="usuario" placeholder="El propio correo"></label><label><span>Contraseña</span><input class="icc-input" type="password" name="clave" autocomplete="new-password"></label></div>' +
      '<label class="icc-ia-switch"><input type="checkbox" name="ultimos_7"><span><b>Gestionar también los últimos 7 días</b><small>Si no, empieza desde ahora: lo que ya había no se contesta.</small></span></label>' +
      '<div class="icc-ia-fila"><button type="button" class="icc-btn icc-btn-ghost" id="ca-hostalia">Datos de Hostalia</button><button class="icc-btn icc-btn-primary" type="submit">Conectar</button></div></form></section>' +
      '<section class="icc-card icc-ia-bloque"><h2>Conectar varios a la vez</h2><p class="icc-muted">Pega la lista de correos (uno por línea, con o sin tamaño). Cada uno recibe su agente por el nombre; se usan los datos de Hostalia.</p>' +
      '<textarea class="icc-input" id="ca-lote" rows="5" placeholder="info@tudominio.es\nsoporte@tudominio.es 2GB"></textarea><button class="icc-btn icc-btn-secondary" id="ca-lote-preparar">Preparar filas</button><div id="ca-lote-filas"></div></section></div>';
  }

  /* -------------------------------------------------------------- CONFIG */
  function config() {
    var c = S.x, dis = c.es_config ? "" : " disabled";
    return '<form id="ca-cfg" class="icc-card icc-ia-bloque icc-ia-form"><h2>🗣️ Cómo responde</h2>' +
      '<label><span>Tono</span><input class="icc-input" name="tono" value="' + esc(c.tono) + '"' + dis + "></label>" +
      '<label><span>Base de conocimiento (lo único que la IA puede afirmar: servicios, precios públicos, horario)</span><textarea class="icc-input" name="conocimiento" rows="10"' + dis + ">" + esc(c.conocimiento) + "</textarea></label>" +
      '<div class="icc-mo-2"><label><span>Modelo</span><select class="icc-select" name="modelo"' + dis + '><option value="">El de los ajustes de IA</option>' + c.modelos.map(function (m) { return '<option value="' + m + '"' + (c.modelo === m ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Límite diario de respuestas automáticas</span><input class="icc-input" type="number" name="limite_dia" value="' + c.limite_dia + '"' + dis + "></label></div>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="aviso_ia"' + (c.aviso_ia ? " checked" : "") + dis + "><span><b>Aviso de IA en las respuestas</b><small>AI Act art. 50 (transparencia).</small></span></label>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="crear_leads"' + (c.crear_leads ? " checked" : "") + dis + "><span><b>Crear leads desde el correo</b></span></label>" +
      '<p class="icc-ia-nota">Nunca sale sola una respuesta si: el buzón está en «todo con aprobación», la categoría no es de su departamento, la confianza es baja (&lt; 75), menciona importes que no están aquí o habla de descuentos, gratis, garantías, contratos, penalizaciones o devoluciones, ya hay 3 respuestas en la última hora (10 al día) al mismo remitente, o se ha llegado al límite diario.</p>' +
      (c.es_config ? '<button class="icc-btn icc-btn-primary" type="submit">Guardar</button>' : "") + "</form>";
  }

  /* ------------------------------------------------------------- EVENTOS */
  function enlazar() {
    var r = main();
    r.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", async function () { S.tab = b.dataset.tab; await cargar(); pintar(); }); });
    var rv = document.getElementById("ca-revisar");
    if (rv) rv.addEventListener("click", function () { hacer(rv, async function () { var x = await API.post("api/correo.php?action=revisar", {}); U.toast(x.texto, "success"); await recargar(); }); });
    r.querySelectorAll("[data-msg]").forEach(function (b) { b.addEventListener("click", function () { abrirMensaje(Number(b.dataset.msg)); }); });
    var q = document.getElementById("ca-q"), es = document.getElementById("ca-estado"), t;
    var filtrar = async function () { S.filtro = { q: q.value, estado: es.value }; await cargar(); pintar(); };
    if (q) q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(filtrar, 400); });
    if (es) es.addEventListener("change", filtrar);
    r.querySelectorAll("[data-acc]").forEach(function (b) {
      b.addEventListener("click", function () { hacer(b, async function () { var x = await API.post("api/correo.php?action=accion", { id: Number(b.dataset.acc), aprobar: b.dataset.si === "1" }); U.toast(x.resultado || "Hecho", "success"); await recargar(); }); });
    });
    r.querySelectorAll("[data-agente]").forEach(function (f) {
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var g = function (n) { return f.elements[n]; };
        var permisos = {};
        Array.prototype.forEach.call(f.querySelectorAll('[name^="perm_"]'), function (s) { permisos[s.name.slice(5)] = s.value; });
        hacer(ev.submitter, async function () {
          await API.post("api/correo.php?action=cuenta_agente", { id: Number(f.dataset.agente), funcion: g("funcion").value, modo: g("modo").value, responsable_id: g("responsable_id").value ? Number(g("responsable_id").value) : null,
            firma: g("firma").value, activo: g("activo").checked, adjuntar: g("adjuntar").checked, acuse: g("acuse").checked,
            adjuntos: Array.prototype.map.call(f.querySelectorAll('[name="adj"]:checked'), function (x) { return Number(x.value); }),
            agente: { nombre: g("nombre").value, cargo: g("cargo").value, instrucciones: g("instrucciones").value, conocimiento: g("conocimiento").value, activo: g("agente_activo").checked, permisos: permisos } });
          U.toast("✓ Agente guardado", "success"); await recargar();
        });
      });
    });
    r.querySelectorAll("[data-probar]").forEach(function (b) {
      b.addEventListener("click", function () { hacer(b, async function () { var x = await API.post("api/correo.php?action=cuenta_probar", { id: Number(b.dataset.probar) }); U.toast("IMAP " + (x.imap.ok ? "✓" : "✕ " + x.imap.error) + " · SMTP " + (x.smtp.ok ? "✓" : "✕ " + x.smtp.error), x.imap.ok && x.smtp.ok ? "success" : "error"); }); });
    });
    r.querySelectorAll("[data-borrar]").forEach(function (b) {
      b.addEventListener("click", function () { if (!confirm("¿Desconectar este buzón? Se borran también sus correos del CRM.")) return; hacer(b, async function () { await API.post("api/correo.php?action=cuenta_borrar", { id: Number(b.dataset.borrar) }); await recargar(); }); });
    });
    var fc = document.getElementById("ca-cuenta");
    if (fc) {
      document.getElementById("ca-hostalia").addEventListener("click", function () {
        fc.host_imap.value = "imap.servidor-correo.net"; fc.puerto_imap.value = 993; fc.seguridad_imap.value = "ssl";
        fc.host_smtp.value = "smtp.servidor-correo.net"; fc.puerto_smtp.value = 587; fc.seguridad_smtp.value = "starttls";
        if (!fc.usuario.value) fc.usuario.value = fc.email.value;
      });
      fc.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var d = Object.fromEntries(new FormData(fc)); d.ultimos_7 = fc.ultimos_7.checked;
        hacer(ev.submitter, async function () { await API.post("api/correo.php?action=cuenta", d); U.toast("✓ Buzón conectado: empieza desde ahora", "success"); await recargar(); });
      });
      document.getElementById("ca-lote-preparar").addEventListener("click", function () {
        var lineas = document.getElementById("ca-lote").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 50);
        var cont = document.getElementById("ca-lote-filas");
        cont.innerHTML = lineas.length ? '<ul class="icc-ia-lista">' + lineas.map(function (l, i) { return '<li><div><strong>' + esc(l) + '</strong><small data-res="' + i + '"></small></div><input class="icc-input icc-ca-clave" type="password" data-lote="' + i + '" placeholder="Contraseña" autocomplete="new-password"></li>'; }).join("") + '</ul><button class="icc-btn icc-btn-primary" id="ca-lote-conectar">Conectar todos</button>' : "";
        var btn = document.getElementById("ca-lote-conectar");
        if (btn) btn.addEventListener("click", function () {
          var filas = lineas.map(function (l, i) { return { linea: l, clave: cont.querySelector('[data-lote="' + i + '"]').value }; });
          hacer(btn, async function () {
            var x = await API.post("api/correo.php?action=cuentas_lote", { filas: filas });
            x.resultado.forEach(function (f, i) { var s = cont.querySelector('[data-res="' + i + '"]'); if (s) s.textContent = f.ok ? "✓ Conectado · " + f.agente : "✕ " + (f.error || "No conectó"); });
            U.toast("Buzones procesados", "success");
          });
        });
      });
    }
    var cfg = document.getElementById("ca-cfg");
    if (cfg) cfg.addEventListener("submit", function (ev) {
      ev.preventDefault();
      hacer(ev.submitter, async function () {
        await API.put("api/correo.php?action=config", { tono: cfg.tono.value, conocimiento: cfg.conocimiento.value, modelo: cfg.modelo.value, limite_dia: Number(cfg.limite_dia.value), aviso_ia: cfg.aviso_ia.checked, crear_leads: cfg.crear_leads.checked });
        U.toast("✓ Guardado", "success");
      });
    });
  }

  window.icc.correo = { view: view };
})();
