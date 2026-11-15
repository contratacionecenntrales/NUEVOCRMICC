/* =============================================================================
   ICC CRM · Motor de prospección IA (#/motor)
   Dirección y jefes de equipo. Radar (Google Places + webs), campañas con
   aprobación de cada correo, revisión, respuestas, agente y lista de exclusión.
   API: api/motor.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null, tab: "radar", leads: [], sel: {}, filtro: { estado: "", sector: "", q: "" }, ubic: [], msgs: [], msgEstado: "pendiente", resp: [], bajas: [], cfg: null };
  var ESTADOS = { nuevo: "Nueva", en_campana: "En campaña", contactado: "Contactada", respondido: "Respondió", interesado: "Interesada", descartado: "Descartada", baja: "Baja", en_crm: "En el CRM" };
  var MODOS = { aprobacion: "Con aprobación de cada correo", borradores: "Solo borradores", autonomo: "Autónomo" };

  function main() { return document.getElementById("icc-main"); }
  function fecha(f) {
    if (!f) return "—";
    var d = new Date(String(f).replace(" ", "T"));
    return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function sectorNombre(id) { var s = (S.d.sectores || []).filter(function (x) { return x.id === id; })[0]; return s ? s.nombre : id || "—"; }
  async function hacer(btn, fn) {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); }
    if (btn) btn.disabled = false;
  }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Cargando el Motor de prospección…</div>';
    try { S.d = await API.get("api/motor.php?action=estado"); }
    catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    var m = /tab=([a-z]+)/.exec(location.hash);
    if (m) S.tab = m[1];
    await cargarTab();
    pintar();
  }

  async function cargarTab() {
    try {
      if (S.tab === "radar") S.leads = (await API.get("api/motor.php?action=leads&" + new URLSearchParams(S.filtro).toString())).leads;
      if (S.tab === "revisar") S.msgs = (await API.get("api/motor.php?action=mensajes&estado=" + S.msgEstado)).mensajes;
      if (S.tab === "respuestas") {
        S.resp = (await API.get("api/motor.php?action=respuestas")).respuestas;
        S.contactadas = (await API.get("api/motor.php?action=leads&estado=contactado")).leads;
      }
      if (S.tab === "exclusion") S.bajas = (await API.get("api/motor.php?action=bajas")).bajas;
      if (S.tab === "agente") S.cfg = await API.get("api/motor.php?action=config");
    } catch (e) { U.toast(e.message, "error"); }
  }

  function pintar() {
    var d = S.d, c = d.contadores;
    var avisos = [];
    if (!d.places) avisos.push("Falta la clave de Google Places");
    if (!d.buzon) avisos.push("Falta el buzón de envío");
    if (!d.ia) avisos.push("Sin IA: los correos salen de plantillas");
    var html = '<div class="icc-ia icc-mo">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">IA · Prospección B2B</span><h1>🛰️ Motor de prospección</h1>' +
      "<p>Encuentra empresas en Google y en sus webs, redacta correos personalizados, los envía con límites y clasifica las respuestas. Por defecto <b>una persona aprueba cada correo</b> (LSSI art. 21) y cada mensaje lleva baja en un clic.</p>" +
      '<div class="icc-ia-estado"><span class="icc-ia-pill is-' + (d.pausado ? "mal" : "ok") + '">' + (d.pausado ? "⏸ En pausa" : "● En marcha") + "</span>" +
      "<span>Hoy " + c.enviados_hoy + " de " + d.limite_dia + " envíos" + (d.motivo_espera && !d.pausado ? " · " + esc(d.motivo_espera) : "") + "</span>" +
      avisos.map(function (a) { return '<span class="icc-ia-pill is-aviso">' + esc(a) + "</span>"; }).join("") + "</div></div>" +
      '<button class="icc-btn ' + (d.pausado ? "icc-btn-primary" : "icc-btn-secondary") + '" id="mo-pausa">' + (d.pausado ? "▶ Reanudar el Motor" : "⏸ Pausa global") + "</button></section>" +
      '<div class="icc-mo-kpis">' +
      kpi(c.leads, "Empresas", "🏢") + kpi(c.nuevos, "Sin contactar", "🆕") + kpi(c.pendientes, "Para revisar", "✍️") + kpi(c.respuestas_7d, "Respuestas 7 días", "📨") + kpi(c.bajas, "En exclusión", "🚫") +
      "</div>" +
      '<nav class="icc-tabs icc-mo-tabs" role="tablist">' +
      tab("radar", "🛰️ Radar") + tab("campanas", "📣 Campañas") + tab("revisar", "✍️ Para revisar" + (c.pendientes ? " <b>" + c.pendientes + "</b>" : "")) +
      tab("respuestas", "📨 Respuestas") + tab("agente", "🤖 Agente y ajustes") + tab("exclusion", "🚫 Exclusión") + "</nav>" +
      '<div id="mo-cuerpo">' + cuerpo() + "</div></div>";
    main().innerHTML = html;
    enlazar();
  }
  function kpi(n, t, i) { return '<div class="icc-card icc-mo-kpi"><span>' + i + "</span><b>" + Number(n || 0).toLocaleString("es-ES") + "</b><small>" + t + "</small></div>"; }
  function tab(id, t) { return '<button type="button" role="tab" class="icc-tab' + (S.tab === id ? " is-active" : "") + '" data-tab="' + id + '">' + t + "</button>"; }

  function cuerpo() {
    if (S.tab === "radar") return radar();
    if (S.tab === "campanas") return campanas();
    if (S.tab === "revisar") return revisar();
    if (S.tab === "respuestas") return respuestas();
    if (S.tab === "agente") return agente();
    return exclusion();
  }

  /* --------------------------------------------------------------- RADAR */
  function radar() {
    var d = S.d;
    var opSect = '<option value="">— Sector —</option>' + d.sectores.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nombre) + " · CNAE " + s.cnae + "</option>"; }).join("");
    var comarcas = Object.keys(d.asturias).map(function (k) {
      return '<details class="icc-mo-comarca"><summary>' + esc(k) + " <small>" + d.asturias[k].length + " concejos</small></summary><div>" +
        '<button type="button" class="icc-mo-link" data-todos="' + esc(k) + '">Toda la comarca</button>' +
        d.asturias[k].map(function (c) { return '<label><input type="checkbox" data-concejo="' + esc(c) + '"' + (S.ubic.indexOf(c) !== -1 ? " checked" : "") + "> " + esc(c) + "</label>"; }).join("") + "</div></details>";
    }).join("");
    var html = '<section class="icc-card icc-ia-bloque"><h2>Buscar empresas</h2>' +
      '<p class="icc-muted">Google Places (API oficial) y la web de cada empresa: portada, contacto y aviso legal, respetando robots.txt. Solo correos genéricos (info@, contacto@…) con el dominio verificado. Los directorios como Páginas Amarillas no se rastrean: impórtalos en CSV.</p>' +
      '<div class="icc-mo-radar"><div class="icc-ia-form">' +
      '<label><span>Sector</span><select class="icc-select" id="mo-sector">' + opSect + "</select></label>" +
      '<label><span>o palabra clave</span><input class="icc-input" id="mo-palabra" placeholder="p. ej. sidrería, cámara frigorífica…"></label>' +
      '<label><span>Localidades o códigos postales libres</span><input class="icc-input" id="mo-libre" placeholder="Separados por comas: 33400, Lugones…"></label>' +
      '<div class="icc-mo-elegidas" id="mo-elegidas">' + chipsUbic() + "</div>" +
      '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" id="mo-buscar">🔎 Buscar empresas</button>' +
      '<label class="icc-btn icc-btn-secondary icc-mo-file">📥 Importar CSV<input type="file" id="mo-csv" accept=".csv,.txt" hidden></label></div>' +
      '<p class="icc-ia-resultado" id="mo-res" role="status"></p></div>' +
      '<div class="icc-mo-asturias"><b>Asturias · comunidad → comarca → concejo</b>' + comarcas + "</div></div></section>";

    var f = S.filtro;
    var sel = Object.keys(S.sel).filter(function (k) { return S.sel[k]; }).length;
    html += '<section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><h2>Empresas encontradas</h2>' +
      '<div class="icc-mo-filtros"><input class="icc-input" id="mo-q" placeholder="Buscar…" value="' + esc(f.q) + '">' +
      '<select class="icc-select" id="mo-f-estado"><option value="">Todos los estados</option>' + Object.keys(ESTADOS).map(function (k) { return '<option value="' + k + '"' + (f.estado === k ? " selected" : "") + ">" + ESTADOS[k] + "</option>"; }).join("") + "</select>" +
      '<select class="icc-select" id="mo-f-sector"><option value="">Todos los sectores</option>' + d.sectores.map(function (s) { return '<option value="' + s.id + '"' + (f.sector === s.id ? " selected" : "") + ">" + esc(s.nombre) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="icc-mo-acciones"' + (sel ? "" : " hidden") + '><b>' + sel + " seleccionadas</b>" +
      '<select class="icc-select" id="mo-a-camp"><option value="">Meter en campaña…</option>' + d.campanas.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nombre) + "</option>"; }).join("") + "</select>" +
      '<select class="icc-select" id="mo-a-gestor"><option value="">Pasar al CRM con…</option>' + d.gestores.map(function (g) { return '<option value="' + g.id + '">' + esc(g.nombre) + "</option>"; }).join("") + "</select>" +
      '<button class="icc-btn icc-btn-secondary" data-bulk="reanalizar">🔄 Releer webs</button><button class="icc-btn icc-btn-ghost" data-bulk="descartar">Descartar</button></div>';
    if (!S.leads.length) html += '<p class="icc-muted">Todavía no hay empresas. Haz una búsqueda o importa un CSV.</p>';
    else {
      html += '<div class="icc-mo-tabla"><div class="icc-mo-fila icc-mo-fila--cab"><label><input type="checkbox" id="mo-todas" aria-label="Seleccionar todas"></label><span>Empresa</span><span>Contacto</span><span>Madurez digital</span><span>Estado</span></div>' +
        S.leads.map(function (l) {
          return '<div class="icc-mo-fila"><label><input type="checkbox" data-sel="' + l.id + '"' + (S.sel[l.id] ? " checked" : "") + ' aria-label="Seleccionar"></label>' +
            '<div><strong>' + esc(l.nombre) + "</strong><small>" + esc(sectorNombre(l.sector)) + " · " + esc(l.localidad || "—") + (l.comarca ? " (" + esc(l.comarca) + ")" : "") + (l.cif ? " · " + esc(l.cif) : "") + "</small></div>" +
            "<div>" + (l.email ? '<span class="icc-mo-mail' + (l.mx_ok ? "" : " is-mal") + '">' + (l.mx_ok ? "✓ " : "✕ ") + esc(l.email) + "</span>" : '<small class="icc-muted">' + esc(l.analizado ? (l.analisis_error || "Sin correo genérico") : "Leyendo la web…") + "</small>") +
            (l.telefono ? "<small>📞 " + esc(l.telefono) + "</small>" : "") + (l.web ? '<small class="icc-mo-web">' + esc(l.web.replace(/^https?:\/\//, "")) + "</small>" : "") + "</div>" +
            '<div class="icc-mo-chips">' + (l.madurez.length ? l.madurez.map(function (m) { return '<span class="icc-mo-chip">' + esc(S.d.madurez[m] || m) + "</span>"; }).join("") : '<small class="icc-muted">—</small>') + "</div>" +
            '<div><span class="icc-ia-pill' + (l.estado === "en_crm" ? " is-ok" : l.estado === "baja" || l.excluido ? " is-mal" : "") + '">' + (l.excluido && l.estado !== "baja" ? "Excluida" : ESTADOS[l.estado] || l.estado) + "</span>" +
            (l.paso ? "<small>Correo " + l.paso + " de 3</small>" : "") + "</div></div>";
        }).join("") + "</div>";
    }
    return html + "</section>";
  }
  function chipsUbic() {
    return S.ubic.length ? S.ubic.map(function (u) { return '<span class="icc-mo-chip is-sel">' + esc(u) + ' <button type="button" data-quitar="' + esc(u) + '" aria-label="Quitar">×</button></span>'; }).join("")
      : '<small class="icc-muted">Elige concejos en el mapa de Asturias o escribe localidades.</small>';
  }

  /* ------------------------------------------------------------ CAMPAÑAS */
  function campanas() {
    var d = S.d;
    var html = '<div class="icc-mo-camps">' + (d.campanas.length ? d.campanas.map(function (c) {
      return '<article class="icc-card icc-mo-camp"><header><div><strong>' + esc(c.nombre) + "</strong><small>" + esc(MODOS[c.modo]) + " · " + esc(d.angulos[c.angulo] || c.angulo) + (c.sector ? " · " + esc(sectorNombre(c.sector)) : "") + "</small></div>" +
        '<span class="icc-ia-pill is-' + (c.estado === "activa" ? "ok" : "aviso") + '">' + (c.estado === "activa" ? "Activa" : "En pausa") + "</span></header>" +
        '<div class="icc-mo-nums">' + [["Empresas", c.leads], ["Verificadas", c.verificados], ["Enviados", c.enviados], ["Respuestas", c.respuestas], ["Positivas", c.positivas], ["Reuniones", c.reuniones], ["Bajas", c.bajas]]
          .map(function (x) { return "<div><b>" + x[1] + "</b><small>" + x[0] + "</small></div>"; }).join("") + "</div>" +
        (Number(c.pendientes) ? '<p class="icc-mo-aviso">✍️ ' + c.pendientes + ' correos esperan revisión</p>' : "") +
        '<div class="icc-ia-fila"><button class="icc-btn icc-btn-secondary" data-camp="' + c.id + '" data-estado="' + (c.estado === "activa" ? "pausada" : "activa") + '">' + (c.estado === "activa" ? "⏸ Pausar" : "▶ Activar") + "</button>" +
        '<button class="icc-btn icc-btn-ghost" data-camp="' + c.id + '" data-estado="terminada">Terminar</button></div></article>';
    }).join("") : '<p class="icc-muted">Aún no hay campañas.</p>') + "</div>";
    html += '<p class="icc-ia-nota">No se mide la apertura: los correos van en texto plano y sin píxel de seguimiento.</p>';
    html += '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>Nueva campaña</h2><form id="mo-camp-form" class="icc-ia-form">' +
      '<label><span>Nombre</span><input class="icc-input" name="nombre" required maxlength="160" placeholder="Panaderías de Oviedo · noviembre"></label>' +
      '<label><span>Sector</span><select class="icc-select" name="sector"><option value="">Varios</option>' + d.sectores.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nombre) + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Ángulo del mensaje</span><select class="icc-select" name="angulo">' + Object.keys(d.angulos).map(function (k) { return '<option value="' + k + '">' + esc(d.angulos[k]) + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Modo</span><select class="icc-select" name="modo"><option value="aprobacion">Con aprobación de cada correo (recomendado)</option><option value="borradores">Solo borradores (los envías tú)</option>' +
      (d.aviso_legal && d.es_config ? '<option value="autonomo">Autónomo</option>' : "") + "</select></label>" +
      '<label><span>Gestor que recibe a los interesados</span><select class="icc-select" name="gestor_id"><option value="">El que fije la administración</option>' + d.gestores.map(function (g) { return '<option value="' + g.id + '">' + esc(g.nombre) + "</option>"; }).join("") + "</select></label>" +
      '<button class="icc-btn icc-btn-primary" type="submit">Crear campaña</button></form></section>' +
      '<section class="icc-card icc-ia-bloque"><h2>📡 En directo</h2><ul class="icc-ia-lista">' + (d.feed.length ? d.feed.map(function (f) {
        return "<li><div><strong>" + esc(f.mensaje) + "</strong><small>" + esc(fecha(f.ts)) + "</small></div></li>";
      }).join("") : '<li><small class="icc-muted">Sin actividad todavía.</small></li>') + "</ul></section></div>";
    return html;
  }

  /* ------------------------------------------------------------- REVISAR */
  function revisar() {
    var html = '<div class="icc-tabs icc-mo-sub">' + [["pendiente", "Para aprobar"], ["borrador", "Borradores"], ["aprobado", "Aprobados (en cola)"], ["enviado", "Enviados"], ["error", "Con error"]].map(function (x) {
      return '<button type="button" class="icc-tab' + (S.msgEstado === x[0] ? " is-active" : "") + '" data-msgestado="' + x[0] + '">' + x[1] + "</button>";
    }).join("") + "</div>";
    if (!S.msgs.length) return html + '<p class="icc-empty">No hay correos aquí.</p>';
    var editable = ["pendiente", "borrador", "error", "aprobado"].indexOf(S.msgEstado) !== -1;
    return html + '<div class="icc-mo-msgs">' + S.msgs.map(function (m) {
      return '<article class="icc-card icc-mo-msg" data-msg="' + m.id + '"><header><div><strong>' + esc(m.nombre) + "</strong><small>" + esc(m.email) + " · " + esc(m.campana || "") + " · correo " + m.paso + " de 3 · " + (Number(m.ia) ? "redactado por IA" : "plantilla") + "</small></div>" +
        (m.web ? '<small class="icc-mo-web">' + esc(m.web.replace(/^https?:\/\//, "")) + "</small>" : "") + "</header>" +
        (editable ? '<input class="icc-input" data-campo="asunto" value="' + esc(m.asunto) + '" aria-label="Asunto"><textarea class="icc-input" rows="7" data-campo="cuerpo" aria-label="Texto">' + esc(m.cuerpo) + "</textarea>"
          : "<p><b>" + esc(m.asunto) + '</b></p><pre class="icc-mo-pre">' + esc(m.cuerpo) + "</pre>") +
        '<details><summary>Pie que añade el sistema (firma, motivo, responsable y baja)</summary><pre class="icc-mo-pre">' + esc(m.pie) + "</pre></details>" +
        (m.error ? '<p class="icc-ia-err">⚠ ' + esc(m.error) + "</p>" : "") +
        (editable ? '<div class="icc-ia-fila">' +
          (S.msgEstado === "borrador" ? '<button class="icc-btn icc-btn-primary" data-m="enviado">Lo he enviado yo</button>' : '<button class="icc-btn icc-btn-primary" data-m="aprobar">✓ Aprobar y enviar</button>') +
          '<button class="icc-btn icc-btn-secondary" data-m="editar">Guardar cambios</button><button class="icc-btn icc-btn-ghost" data-m="descartar">Descartar</button></div>' : "") + "</article>";
    }).join("") + "</div>";
  }

  /* ---------------------------------------------------------- RESPUESTAS */
  function respuestas() {
    var d = S.d;
    var html = '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>Respuestas recibidas</h2>' +
      '<p class="icc-muted">Llegan solas por IMAP o se pegan a mano. Cualquier respuesta (salvo «fuera de la oficina») para la secuencia; la baja entra en la lista de exclusión; si hay interés pasa al CRM con una llamada en la agenda del gestor.</p>' +
      (S.resp.length ? '<ul class="icc-ia-lista icc-mo-resp">' + S.resp.map(function (r) {
        var positiva = ["quiere_info", "pide_presupuesto", "acepta_reunion"].indexOf(r.clasificacion) !== -1;
        return "<li><div><strong>" + esc(r.nombre) + ' <span class="icc-ia-pill is-' + (positiva ? "ok" : r.clasificacion === "baja" ? "mal" : "aviso") + '">' + esc(d.clases[r.clasificacion] || r.clasificacion) + "</span></strong>" +
          "<small>" + esc(fecha(r.created_at)) + " · " + esc(r.email) + (r.cliente_id ? ' · <a href="#/clientes/' + r.cliente_id + '">ver en el CRM</a>' : "") + "</small><p>" + esc(String(r.cuerpo || "").slice(0, 400)) + "</p></div></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Sin respuestas todavía.</p>') + "</section>" +
      '<section class="icc-card icc-ia-bloque"><h2>Pegar una respuesta</h2><form id="mo-resp-form" class="icc-ia-form">' +
      '<label><span>Empresa</span><select class="icc-select" name="lead_id" required><option value="">Elige la empresa…</option>' + (S.contactadas || []).map(function (l) { return '<option value="' + l.id + '">' + esc(l.nombre) + " · " + esc(l.email) + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Asunto</span><input class="icc-input" name="asunto" value="Re:"></label>' +
      '<label><span>Texto</span><textarea class="icc-input" name="texto" rows="6" required></textarea></label>' +
      '<button class="icc-btn icc-btn-primary" type="submit">Clasificar y procesar</button></form></section></div>';
    return html;
  }

  /* -------------------------------------------------------------- AGENTE */
  function agente() {
    var c = S.cfg;
    if (!c) return '<p class="icc-empty">No se pudo cargar.</p>';
    var dis = c.es_config ? "" : " disabled";
    var s = c.smtp || {}, im = c.imap || {};
    var seg = function (n, v) { return '<select class="icc-select" name="' + n + '"' + dis + ">" + ["ssl", "starttls", "ninguna"].map(function (o) { return '<option value="' + o + '"' + (v === o ? " selected" : "") + ">" + { ssl: "SSL", starttls: "STARTTLS", ninguna: "Sin cifrar" }[o] + "</option>"; }).join("") + "</select>"; };
    var html = '<form id="mo-cfg" class="icc-mo-cfg">' + (c.es_config ? "" : '<p class="icc-mo-aviso">Solo la administración puede cambiar estos ajustes.</p>') +
      '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>🤖 Agente de Outreach</h2><div class="icc-ia-form">' +
      '<label><span>Firma</span><textarea class="icc-input" name="firma" rows="3"' + dis + ">" + esc(c.agente.firma) + "</textarea></label>" +
      '<label><span>Tono</span><input class="icc-input" name="tono" value="' + esc(c.agente.tono) + '"' + dis + "></label>" +
      '<label><span>Prompt maestro</span><textarea class="icc-input" name="prompt" rows="10"' + dis + ">" + esc(c.agente.prompt) + "</textarea></label>" +
      (c.es_config ? '<button type="button" class="icc-btn icc-btn-ghost" id="mo-restaurar">Restaurar el prompt original</button>' : "") +
      '<p class="icc-ia-nota">Cadencia: día 1 → 3 → 7. Lee la web de cada empresa y cita un detalle real; el texto de la web se le pasa como datos, nunca como instrucciones. Sin IA usa la plantilla del ángulo.</p></div></section>' +
      '<section class="icc-card icc-ia-bloque"><h2>📤 Envío y límites</h2><div class="icc-ia-form">' +
      '<label><span>Responsable (aparece en el pie)</span><input class="icc-input" name="responsable" value="' + esc(c.responsable) + '"' + dis + "></label>" +
      '<div class="icc-mo-2"><label><span>Límite diario</span><input class="icc-input" type="number" name="limite_dia" min="1" max="500" value="' + c.limite_dia + '"' + dis + "></label>" +
      '<label><span>Pausa entre envíos (min)</span><div class="icc-mo-2"><input class="icc-input" type="number" name="pausa_min" value="' + c.pausa_min + '"' + dis + '><input class="icc-input" type="number" name="pausa_max" value="' + c.pausa_max + '"' + dis + "></div></label></div>" +
      '<div class="icc-mo-2"><label><span>Desde</span><input class="icc-input" type="time" name="hora_desde" value="' + esc(c.hora_desde) + '"' + dis + '></label><label><span>Hasta</span><input class="icc-input" type="time" name="hora_hasta" value="' + esc(c.hora_hasta) + '"' + dis + "></label></div>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="solo_laborables"' + (c.solo_laborables ? " checked" : "") + dis + "><span><b>Solo días laborables</b></span></label>" +
      '<label><span>Gestor por defecto para los interesados</span><select class="icc-select" name="gestor_defecto"' + dis + '><option value="">El creador de la campaña</option>' + S.d.gestores.map(function (g) { return '<option value="' + g.id + '"' + (Number(c.gestor_defecto) === Number(g.id) ? " selected" : "") + ">" + esc(g.nombre) + "</option>"; }).join("") + "</select></label></div></section></div>" +
      '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>✉️ Buzón de envío (SMTP)</h2><div class="icc-ia-form">' +
      '<div class="icc-mo-2"><label><span>Correo</span><input class="icc-input" name="email" value="' + esc(s.email || "") + '"' + dis + '></label><label><span>Nombre visible</span><input class="icc-input" name="nombre" value="' + esc(s.nombre || "") + '"' + dis + "></label></div>" +
      '<div class="icc-mo-2"><label><span>Servidor SMTP</span><input class="icc-input" name="host_smtp" value="' + esc(s.host_smtp || "") + '"' + dis + '></label><label><span>Puerto</span><input class="icc-input" type="number" name="puerto_smtp" value="' + esc(s.puerto_smtp || 587) + '"' + dis + "></label></div>" +
      '<div class="icc-mo-2"><label><span>Cifrado</span>' + seg("seguridad_smtp", s.seguridad_smtp || "starttls") + '</label><label><span>Usuario</span><input class="icc-input" name="usuario" value="' + esc(s.usuario || "") + '"' + dis + "></label></div>" +
      '<label><span>Contraseña ' + (c.smtp_clave ? "(guardada, cifrada)" : "") + '</span><input class="icc-input" type="password" name="smtp_clave" autocomplete="new-password" placeholder="' + (c.smtp_clave ? "••••••• (déjalo vacío para no cambiarla)" : "") + '"' + dis + "></label>" +
      (c.es_config ? '<button type="button" class="icc-btn icc-btn-ghost" id="mo-hostalia">Rellenar con los datos de Hostalia</button>' : "") + "</div></section>" +
      '<section class="icc-card icc-ia-bloque"><h2>📨 Buzón de respuestas (IMAP) y Google</h2><div class="icc-ia-form">' +
      '<div class="icc-mo-2"><label><span>Servidor IMAP</span><input class="icc-input" name="host_imap" value="' + esc(im.host_imap || "") + '"' + dis + '></label><label><span>Puerto</span><input class="icc-input" type="number" name="puerto_imap" value="' + esc(im.puerto_imap || 993) + '"' + dis + "></label></div>" +
      '<label><span>Cifrado</span>' + seg("seguridad_imap", im.seguridad_imap || "ssl") + "</label>" +
      '<label><span>Clave de Google Places ' + (c.places_clave ? "(guardada, cifrada)" : "") + '</span><input class="icc-input" type="password" name="places_clave" autocomplete="off" placeholder="' + (c.places_clave ? "••••••• (déjalo vacío para no cambiarla)" : "AIza…") + '"' + dis + "></label>" +
      (c.es_config ? '<div class="icc-ia-fila"><button type="button" class="icc-btn icc-btn-secondary" data-probar="smtp">Probar SMTP</button><button type="button" class="icc-btn icc-btn-secondary" data-probar="imap">Probar IMAP</button><button type="button" class="icc-btn icc-btn-secondary" data-probar="places">Probar Google</button></div><p class="icc-ia-resultado" id="mo-probar-res" role="status"></p>' : "") +
      "</div></section></div>" +
      (c.es_config ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" type="submit">Guardar ajustes del Motor</button></div>' : "") + "</form>";
    html += '<section class="icc-card icc-ia-bloque icc-mo-legal"><h2>⚖️ Envío autónomo (LSSI art. 21)</h2>' +
      "<p>La ley exige consentimiento previo para enviar correos comerciales en frío, también a empresas. Por eso el Motor pide aprobar cada correo. El modo autónomo envía sin revisión: solo actívalo si tu empresa asume esa responsabilidad.</p>" +
      (c.aviso_legal ? '<p class="icc-ia-pill is-aviso">Aceptado: ' + esc(c.aviso_legal.split("|")[0]) + " por " + esc(c.aviso_legal.split("|")[2] || "") + "</p>" +
        (c.es_config ? '<button class="icc-btn icc-btn-ghost" id="mo-legal-no">Retirar la aceptación (las campañas autónomas vuelven a aprobación)</button>' : "")
        : c.es_config ? '<label class="icc-ia-switch"><input type="checkbox" id="mo-legal-ok"><span><b>He leído el aviso y acepto la responsabilidad</b><small>Queda registrado en la bitácora de seguridad.</small></span></label><button class="icc-btn icc-btn-secondary" id="mo-legal-si">Habilitar el modo autónomo</button>' : "<p>No aceptado.</p>") + "</section>";
    return html;
  }

  /* ----------------------------------------------------------- EXCLUSIÓN */
  function exclusion() {
    return '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>Lista de exclusión</h2><p class="icc-muted">Correos y dominios que nunca reciben nada: ni del Motor, ni de las automatizaciones, ni de los agentes de correo.</p>' +
      (S.bajas.length ? '<ul class="icc-ia-lista">' + S.bajas.map(function (b) {
        return "<li><div><strong>" + (b.tipo === "dominio" ? "🌐 " : "✉️ ") + esc(b.valor) + "</strong><small>" + esc(b.motivo) + " · " + esc(fecha(b.created_at)) + "</small></div>" +
          (S.d.es_config ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-quitarbaja="' + b.id + '">Quitar</button>' : "") + "</li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Vacía.</p>') + "</section>" +
      '<section class="icc-card icc-ia-bloque"><h2>Añadir</h2><form id="mo-baja-form" class="icc-ia-form"><label><span>Tipo</span><select class="icc-select" name="tipo"><option value="email">Correo</option><option value="dominio">Dominio entero</option></select></label>' +
      '<label><span>Correo o dominio</span><input class="icc-input" name="valor" required></label><label><span>Motivo</span><input class="icc-input" name="motivo" placeholder="Pidió no ser contactado por teléfono"></label>' +
      '<button class="icc-btn icc-btn-primary" type="submit">Añadir a la exclusión</button></form></section></div>';
  }

  /* ------------------------------------------------------------- EVENTOS */
  function enlazar() {
    var raiz = main();
    raiz.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", async function () { S.tab = b.dataset.tab; await cargarTab(); pintar(); });
    });
    document.getElementById("mo-pausa").addEventListener("click", function (ev) {
      hacer(ev.currentTarget, async function () { await API.post("api/motor.php?action=pausa", { pausado: !S.d.pausado }); await view(); });
    });
    if (S.tab === "radar") enlazarRadar(raiz);
    if (S.tab === "campanas") enlazarCampanas(raiz);
    if (S.tab === "revisar") enlazarRevisar(raiz);
    if (S.tab === "respuestas") {
      document.getElementById("mo-resp-form").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var f = new FormData(ev.target);
        hacer(ev.submitter, async function () {
          var r = await API.post("api/motor.php?action=respuesta", { lead_id: Number(f.get("lead_id")), asunto: f.get("asunto"), texto: f.get("texto") });
          U.toast("Clasificada: " + r.clase_txt + (r.cliente_id ? " · pasada al CRM" : ""), "success");
          await view();
        });
      });
    }
    if (S.tab === "agente") enlazarAgente(raiz);
    if (S.tab === "exclusion") {
      document.getElementById("mo-baja-form").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var f = new FormData(ev.target);
        hacer(ev.submitter, async function () { await API.post("api/motor.php?action=baja", Object.fromEntries(f)); U.toast("Añadido a la exclusión", "success"); await view(); });
      });
      raiz.querySelectorAll("[data-quitarbaja]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirm("¿Quitar de la lista de exclusión? Podrá volver a recibir correos.")) return;
          hacer(b, async function () { await API.post("api/motor.php?action=baja_quitar", { id: Number(b.dataset.quitarbaja) }); await view(); });
        });
      });
    }
  }

  function enlazarRadar(raiz) {
    var repintarChips = function () { document.getElementById("mo-elegidas").innerHTML = chipsUbic(); enlazarChips(); };
    var enlazarChips = function () {
      raiz.querySelectorAll("[data-quitar]").forEach(function (b) {
        b.addEventListener("click", function () {
          S.ubic = S.ubic.filter(function (u) { return u !== b.dataset.quitar; });
          var cb = raiz.querySelector('[data-concejo="' + CSS.escape(b.dataset.quitar) + '"]');
          if (cb) cb.checked = false;
          repintarChips();
        });
      });
    };
    enlazarChips();
    raiz.querySelectorAll("[data-concejo]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var c = cb.dataset.concejo;
        S.ubic = S.ubic.filter(function (u) { return u !== c; });
        if (cb.checked) S.ubic.push(c);
        repintarChips();
      });
    });
    raiz.querySelectorAll("[data-todos]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.d.asturias[b.dataset.todos].forEach(function (c) { if (S.ubic.indexOf(c) === -1) S.ubic.push(c); });
        b.parentNode.querySelectorAll("[data-concejo]").forEach(function (cb) { cb.checked = true; });
        repintarChips();
      });
    });
    document.getElementById("mo-buscar").addEventListener("click", function (ev) {
      var libres = document.getElementById("mo-libre").value.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      var ubic = S.ubic.concat(libres);
      var res = document.getElementById("mo-res");
      res.textContent = "Buscando en Google y leyendo las webs…";
      hacer(ev.currentTarget, async function () {
        try {
          var r = await API.post("api/motor.php?action=extraer", { sector: document.getElementById("mo-sector").value, palabra: document.getElementById("mo-palabra").value, ubicaciones: ubic, paginas: 2 });
          res.textContent = "✓ " + r.nuevos.length + " empresas nuevas de " + r.vistos + " encontradas (" + r.consultas + " consultas a Google)." + (r.errores.length ? " ⚠ " + r.errores.join(" ") : "") + (r.nuevos.length > r.analizados_ya ? " El resto de webs se leen solas en unos minutos." : "");
          res.className = "icc-ia-resultado is-" + (r.errores.length ? "mal" : "ok");
          S.leads = (await API.get("api/motor.php?action=leads")).leads;
          S.d = await API.get("api/motor.php?action=estado");
          var txt = res.textContent;
          pintar();
          var r2 = document.getElementById("mo-res"); r2.textContent = txt; r2.className = res.className;
        } catch (e) { res.textContent = "✕ " + e.message; res.className = "icc-ia-resultado is-mal"; }
      });
    });
    document.getElementById("mo-csv").addEventListener("change", function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      var lector = new FileReader();
      lector.onload = function () {
        hacer(null, async function () {
          var r = await API.post("api/motor.php?action=importar", { csv: lector.result });
          U.toast("✓ " + r.nuevos + " importadas · " + r.repetidos + " ya estaban" + (r.correos_descartados ? " · " + r.correos_descartados + " correos no válidos" : ""), "success");
          await view();
        });
      };
      lector.readAsText(f);
    });
    var filtrar = async function () {
      S.filtro = { q: document.getElementById("mo-q").value, estado: document.getElementById("mo-f-estado").value, sector: document.getElementById("mo-f-sector").value };
      S.leads = (await API.get("api/motor.php?action=leads&" + new URLSearchParams(S.filtro).toString())).leads;
      pintar();
    };
    var tq;
    document.getElementById("mo-q").addEventListener("input", function () { clearTimeout(tq); tq = setTimeout(filtrar, 400); });
    document.getElementById("mo-f-estado").addEventListener("change", filtrar);
    document.getElementById("mo-f-sector").addEventListener("change", filtrar);
    var todas = document.getElementById("mo-todas");
    if (todas) todas.addEventListener("change", function () { S.leads.forEach(function (l) { S.sel[l.id] = todas.checked; }); pintar(); });
    raiz.querySelectorAll("[data-sel]").forEach(function (cb) { cb.addEventListener("change", function () { S.sel[cb.dataset.sel] = cb.checked; pintar(); }); });
    var ids = function () { return Object.keys(S.sel).filter(function (k) { return S.sel[k]; }).map(Number); };
    var bulk = async function (accion, extra, btn) {
      await hacer(btn, async function () {
        var r = await API.post("api/motor.php?action=leads_accion", Object.assign({ ids: ids(), accion: accion }, extra || {}));
        U.toast("✓ " + r.hechos + " empresas" + (r.sin_correo ? " (" + r.sin_correo + " sin correo verificado o excluidas)" : ""), "success");
        S.sel = {};
        await view();
      });
    };
    var camp = document.getElementById("mo-a-camp");
    if (camp) camp.addEventListener("change", function () { if (camp.value) bulk("campana", { campana_id: Number(camp.value) }, camp); });
    var gest = document.getElementById("mo-a-gestor");
    if (gest) gest.addEventListener("change", function () { if (gest.value && confirm("¿Pasar las empresas seleccionadas al CRM con este gestor?")) bulk("crm", { gestor_id: Number(gest.value) }, gest); });
    raiz.querySelectorAll("[data-bulk]").forEach(function (b) { b.addEventListener("click", function () { bulk(b.dataset.bulk, null, b); }); });
  }

  function enlazarCampanas(raiz) {
    document.getElementById("mo-camp-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = Object.fromEntries(new FormData(ev.target));
      f.gestor_id = f.gestor_id ? Number(f.gestor_id) : null;
      hacer(ev.submitter, async function () { await API.post("api/motor.php?action=campana", f); U.toast("✓ Campaña creada. Añádele empresas desde el Radar.", "success"); await view(); });
    });
    raiz.querySelectorAll("[data-camp]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.estado === "terminada" && !confirm("¿Terminar la campaña? Los correos pendientes se descartan.")) return;
        hacer(b, async function () { await API.post("api/motor.php?action=campana_estado", { id: Number(b.dataset.camp), estado: b.dataset.estado }); await view(); });
      });
    });
  }

  function enlazarRevisar(raiz) {
    raiz.querySelectorAll("[data-msgestado]").forEach(function (b) {
      b.addEventListener("click", async function () { S.msgEstado = b.dataset.msgestado; await cargarTab(); pintar(); });
    });
    raiz.querySelectorAll("[data-m]").forEach(function (b) {
      b.addEventListener("click", function () {
        var art = b.closest("[data-msg]");
        var datos = { id: Number(art.dataset.msg), accion: b.dataset.m };
        var a = art.querySelector('[data-campo="asunto"]');
        if (a && b.dataset.m !== "descartar") { datos.asunto = a.value; datos.cuerpo = art.querySelector('[data-campo="cuerpo"]').value; }
        hacer(b, async function () {
          await API.post("api/motor.php?action=mensaje", datos);
          U.toast(b.dataset.m === "aprobar" ? "✓ Aprobado: saldrá respetando el límite y la pausa entre envíos" : "✓ Hecho", "success");
          S.d = await API.get("api/motor.php?action=estado");
          await cargarTab();
          pintar();
        });
      });
    });
  }

  function enlazarAgente(raiz) {
    var form = document.getElementById("mo-cfg");
    var rest = document.getElementById("mo-restaurar");
    if (rest) rest.addEventListener("click", function () { form.prompt.value = S.cfg.prompt_defecto; });
    var hos = document.getElementById("mo-hostalia");
    if (hos) hos.addEventListener("click", function () {
      form.host_smtp.value = "smtp.servidor-correo.net"; form.puerto_smtp.value = 587; form.seguridad_smtp.value = "starttls";
      form.host_imap.value = "imap.servidor-correo.net"; form.puerto_imap.value = 993; form.seguridad_imap.value = "ssl";
      if (!form.usuario.value) form.usuario.value = form.email.value;
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var g = function (n) { return form[n] ? form[n].value : ""; };
      hacer(ev.submitter, async function () {
        await API.put("api/motor.php?action=config", {
          agente: { firma: g("firma"), tono: g("tono"), prompt: g("prompt") }, responsable: g("responsable"),
          limite_dia: Number(g("limite_dia")), pausa_min: Number(g("pausa_min")), pausa_max: Number(g("pausa_max")), hora_desde: g("hora_desde"), hora_hasta: g("hora_hasta"),
          solo_laborables: form.solo_laborables.checked, gestor_defecto: g("gestor_defecto") ? Number(g("gestor_defecto")) : null,
          smtp: { email: g("email"), nombre: g("nombre"), host_smtp: g("host_smtp"), puerto_smtp: Number(g("puerto_smtp")), seguridad_smtp: g("seguridad_smtp"), usuario: g("usuario") },
          imap: { host_imap: g("host_imap"), puerto_imap: Number(g("puerto_imap")), seguridad_imap: g("seguridad_imap"), usuario: g("usuario") },
          smtp_clave: g("smtp_clave"), places_clave: g("places_clave"),
        });
        U.toast("✓ Ajustes del Motor guardados", "success");
        await view();
      });
    });
    raiz.querySelectorAll("[data-probar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var res = document.getElementById("mo-probar-res");
        res.textContent = "Probando…";
        hacer(b, async function () {
          var r = await API.post("api/motor.php?action=probar", { que: b.dataset.probar });
          res.textContent = r.ok ? "✓ " + b.textContent.replace("Probar ", "") + " correcto" + (r.resultados != null ? " (" + r.resultados + " resultados)" : "") : "✕ " + r.error;
          res.className = "icc-ia-resultado is-" + (r.ok ? "ok" : "mal");
        });
      });
    });
    var si = document.getElementById("mo-legal-si");
    if (si) si.addEventListener("click", function () {
      if (!document.getElementById("mo-legal-ok").checked) { U.toast("Marca la casilla para aceptar el aviso.", "error"); return; }
      hacer(si, async function () { await API.post("api/motor.php?action=aviso_legal", { acepto: true }); await view(); });
    });
    var no = document.getElementById("mo-legal-no");
    if (no) no.addEventListener("click", function () { hacer(no, async function () { await API.post("api/motor.php?action=aviso_legal", { acepto: false }); await view(); }); });
  }

  window.icc.motor = { view: view };
})();
