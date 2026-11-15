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
  var S = { d: null, tab: "radar", leads: [], sel: {}, filtro: { estado: "", sector: "", q: "" }, ubic: [], msgs: [], msgEstado: "pendiente", resp: [], bajas: [], cfg: null, sectoresSel: [], fuente: "places", sectorCamp: "", subFab: "scraper", perfilEd: "icc", buzEd: null, perfilNuevo: "icc" };
  var reloj = null;
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
    main().innerHTML = '<div class="icc-loading">Cargando el Motor de Scraping IA…</div>';
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
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">IA · Prospección B2B</span><h1>🛰️ Motor de Scraping IA</h1>' +
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
      tab("respuestas", "📨 Respuestas") + tab("agente", "🏭 Fábrica de agentes") + tab("exclusion", "🚫 Exclusión") + "</nav>" +
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
    var fuentes = [["places", "📍 Google Maps"], ["webs", "🌐 Webs corporativas"], ["csv", "📥 Directorios y registros (CSV)"]];
    var html = '<section class="icc-card icc-ia-bloque"><h2>🛰️ Radar de extracción</h2>' +
      '<div class="icc-mo-fuentes" role="radiogroup" aria-label="Fuente">' + fuentes.map(function (f) { return '<button type="button" class="icc-mo-chip icc-mo-fuente' + (S.fuente === f[0] ? " is-sel" : "") + '" data-fuente="' + f[0] + '">' + f[1] + "</button>"; }).join("") + "</div>" +
      '<div class="icc-ia-form"><div><span class="icc-mo-etq">Sector / CNAE (puedes elegir varios)</span><div class="icc-mo-sectores">' + d.sectores.map(function (s) {
        return '<label class="icc-mo-chip' + (S.sectoresSel.indexOf(s.id) !== -1 ? " is-sel" : "") + '"><input type="checkbox" data-sect="' + s.id + '"' + (S.sectoresSel.indexOf(s.id) !== -1 ? " checked" : "") + " hidden> " + esc(s.nombre) + " <small>" + s.cnae + "</small></label>";
      }).join("") + "</div></div>";
    if (S.fuente === "places") {
      html += '<label><span>o palabra clave</span><input class="icc-input" id="mo-palabra" placeholder="p. ej. sidrería, clínica veterinaria…"></label>' +
        '<div><span class="icc-mo-etq">Ubicación: Asturias → comarca → localidad o código postal</span><div class="icc-mo-sectores">' + Object.keys(d.zonas).map(function (z) { return '<button type="button" class="icc-mo-chip" data-zona="' + esc(z) + '">＋ ' + esc(z) + "</button>"; }).join("") + "</div></div>" +
        '<div class="icc-mo-radar"><div class="icc-ia-form"><label><span>Localidades o códigos postales libres</span><input class="icc-input" id="mo-libre" placeholder="Separados por comas: 33400, Lugones…"></label>' +
        '<div class="icc-mo-elegidas" id="mo-elegidas">' + chipsUbic() + "</div></div>" +
        '<div class="icc-mo-asturias"><b>Comarcas oficiales</b>' + Object.keys(d.asturias).map(function (k) {
          return '<details class="icc-mo-comarca"><summary>' + esc(k) + " <small>" + d.asturias[k].length + " concejos</small></summary><div>" +
            '<button type="button" class="icc-mo-link" data-todos="' + esc(k) + '">Toda la comarca</button>' +
            d.asturias[k].map(function (c) { return '<label><input type="checkbox" data-concejo="' + esc(c) + '"' + (S.ubic.indexOf(c) !== -1 ? " checked" : "") + "> " + esc(c) + "</label>"; }).join("") + "</div></details>";
        }).join("") + "</div></div>" +
        '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" id="mo-buscar">🔎 Iniciar extracción</button></div>';
    } else if (S.fuente === "webs") {
      html += '<label><span>Webs de empresas (una por línea)</span><textarea class="icc-input" id="mo-webs" rows="5" placeholder="www.inmobiliariaejemplo.es\nclinicadentalcentro.com"></textarea></label>' +
        '<p class="icc-ia-nota">Se lee la portada, contacto y aviso legal de cada web (respetando robots.txt): correo genérico, teléfono, CIF, razón social y madurez digital.</p>' +
        '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" id="mo-rastrear">🌐 Rastrear webs</button></div>';
    } else {
      html += '<p class="icc-muted">Páginas Amarillas, directorios sectoriales y registros mercantiles no permiten el rastreo automático en sus condiciones de uso: exporta o descarga sus listados y súbelos aquí. Columnas reconocidas: <code>nombre</code> (o empresa), <code>email</code>, <code>telefono</code>, <code>web</code>, <code>sector</code>, <code>localidad</code>, <code>cif</code>. Luego el Motor rastrea la web de cada una.</p>' +
        '<div class="icc-ia-fila"><label class="icc-btn icc-btn-primary icc-mo-file">📥 Subir CSV<input type="file" id="mo-csv" accept=".csv,.txt" hidden></label></div>';
    }
    html += '<p class="icc-ia-resultado" id="mo-res" role="status"></p></div></section>';

    var f = S.filtro;
    var sel = Object.keys(S.sel).filter(function (k) { return S.sel[k]; }).length;
    var leyendo = S.leads.filter(function (l) { return !l.analizado; }).length;
    html += '<section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><h2>Resultados' + (leyendo ? ' <span class="icc-ia-pill is-aviso">⏳ leyendo ' + leyendo + " webs…</span>" : "") + "</h2>" +
      '<div class="icc-mo-filtros"><input class="icc-input" id="mo-q" placeholder="Buscar…" value="' + esc(f.q) + '">' +
      '<select class="icc-select" id="mo-f-estado"><option value="">Todos los estados</option>' + Object.keys(ESTADOS).map(function (k) { return '<option value="' + k + '"' + (f.estado === k ? " selected" : "") + ">" + ESTADOS[k] + "</option>"; }).join("") + "</select>" +
      '<select class="icc-select" id="mo-f-sector"><option value="">Todos los sectores</option>' + d.sectores.map(function (s) { return '<option value="' + s.id + '"' + (f.sector === s.id ? " selected" : "") + ">" + esc(s.nombre) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="icc-mo-acciones"' + (sel ? "" : " hidden") + '><b>' + sel + " seleccionadas</b>" +
      '<select class="icc-select" id="mo-a-camp"><option value="">Meter en campaña…</option>' + d.campanas.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nombre) + "</option>"; }).join("") + "</select>" +
      '<select class="icc-select" id="mo-a-gestor"><option value="">Pasar al CRM con…</option>' + d.gestores.map(function (g) { return '<option value="' + g.id + '">' + esc(g.nombre) + "</option>"; }).join("") + "</select>" +
      '<button class="icc-btn icc-btn-secondary" data-bulk="reanalizar">🔄 Releer webs</button><button class="icc-btn icc-btn-ghost" data-bulk="descartar">Descartar</button></div>';
    if (!S.leads.length) html += '<p class="icc-muted">Todavía no hay empresas. Lanza una extracción.</p>';
    else {
      html += '<div class="icc-mo-tabla"><div class="icc-mo-fila icc-mo-fila--cab"><label><input type="checkbox" id="mo-todas" aria-label="Seleccionar todas"></label><span>Empresa · sector · zona</span><span>Web · correo corporativo · teléfono</span><span>Madurez digital</span><span>Estado del agente</span></div>' +
        S.leads.map(function (l) {
          var est = l.rebotado ? ["Rebotado", "mal"] : l.excluido && l.estado !== "baja" ? ["Excluida", "mal"] : !l.analizado ? ["Leyendo la web", "aviso"] : [ESTADOS[l.estado] || l.estado, l.estado === "en_crm" ? "ok" : l.estado === "baja" ? "mal" : ""];
          return '<div class="icc-mo-fila"><label><input type="checkbox" data-sel="' + l.id + '"' + (S.sel[l.id] ? " checked" : "") + ' aria-label="Seleccionar"></label>' +
            '<div><strong>' + esc(l.nombre) + "</strong><small>" + esc(sectorNombre(l.sector)) + " · " + esc(l.localidad || "—") + (l.comarca ? " (" + esc(l.comarca) + ")" : "") + (l.cif ? " · " + esc(l.cif) : "") + "</small>" +
            (l.resumen ? '<small class="icc-mo-resumen">💡 ' + esc(l.resumen) + "</small>" : "") + "</div>" +
            "<div>" + (l.web ? '<small class="icc-mo-web">' + esc(l.web.replace(/^https?:\/\//, "")) + "</small>" : "") +
            (l.email ? '<span class="icc-mo-mail' + (l.mx_ok ? "" : " is-mal") + '">' + (l.mx_ok ? "✓ " : "✕ ") + esc(l.email) + "</span>" : '<small class="icc-muted">' + esc(l.analizado ? (l.analisis_error || "Sin correo genérico") : "") + "</small>") +
            (l.telefono ? "<small>📞 " + esc(l.telefono) + "</small>" : "") + "</div>" +
            '<div class="icc-mo-chips">' + (l.madurez.length ? l.madurez.map(function (m) { return '<span class="icc-mo-chip">' + esc(S.d.madurez[m] || m) + "</span>"; }).join("") : '<small class="icc-muted">—</small>') +
            (l.puntuacion != null ? '<span class="icc-mo-chip is-sel" title="Encaje según la cualificación IA">Encaje ' + l.puntuacion + "</span>" : "") + "</div>" +
            '<div><span class="icc-ia-pill' + (est[1] ? " is-" + est[1] : "") + '">' + est[0] + "</span>" + (l.paso ? "<small>Correo " + l.paso + " de 3</small>" : "") + "</div></div>";
        }).join("") + "</div>";
    }
    return html + "</section>";
  }
  function chipsUbic() {
    return S.ubic.length ? S.ubic.map(function (u) { return '<span class="icc-mo-chip is-sel">' + esc(u) + ' <button type="button" data-quitar="' + esc(u) + '" aria-label="Quitar">×</button></span>'; }).join("")
      : '<small class="icc-muted">Elige una zona, concejos de las comarcas o escribe localidades.</small>';
  }

  /* ------------------------------------------------------------ CAMPAÑAS */
  function campanas() {
    var d = S.d;
    var sectoresCamp = d.campanas.map(function (c) { return c.sector; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; });
    var lista = d.campanas.filter(function (c) { return !S.sectorCamp || c.sector === S.sectorCamp; });
    var html = (sectoresCamp.length > 1 ? '<div class="icc-mo-sectores icc-mo-sub">' + ['<button type="button" class="icc-mo-chip' + (!S.sectorCamp ? " is-sel" : "") + '" data-sectcamp="">Todos los nichos</button>']
      .concat(sectoresCamp.map(function (s) { return '<button type="button" class="icc-mo-chip' + (S.sectorCamp === s ? " is-sel" : "") + '" data-sectcamp="' + s + '">' + esc(sectorNombre(s)) + "</button>"; })).join("") + "</div>" : "");
    html += '<div class="icc-mo-camps">' + (lista.length ? lista.map(function (c) {
      var pf = d.perfiles[c.perfil] || d.perfiles.icc;
      return '<article class="icc-card icc-mo-camp"><header><div><strong>' + esc(c.nombre) + "</strong><small>" + esc(pf.empresa) + " · " + esc(MODOS[c.modo]) + " · " + esc(d.angulos[c.angulo] || c.angulo) + "</small></div>" +
        '<span class="icc-ia-pill is-' + (c.estado === "activa" ? "ok" : "aviso") + '">' + (c.estado === "activa" ? "Activa" : "En pausa") + "</span></header>" +
        '<div class="icc-mo-nums">' + [["Leads", c.leads], ["Verificados", c.verificados], ["Enviados", c.enviados], ["Respuestas", c.respuestas], ["Positivas", c.positivas], ["Reuniones", c.reuniones], ["Bajas", c.bajas], ["Tasa resp.", c.enviados > 0 ? Math.round(c.respuestas / c.enviados * 100) + "%" : "—"]]
          .map(function (x) { return "<div><b>" + x[1] + "</b><small>" + x[0] + "</small></div>"; }).join("") + "</div>" +
        (Number(c.pendientes) ? '<p class="icc-mo-aviso">✍️ ' + c.pendientes + ' correos esperan revisión · <button type="button" class="icc-mo-link" data-irrevisar>Revisar</button></p>' : "") +
        '<div class="icc-ia-fila"><button class="icc-btn icc-btn-secondary" data-camp="' + c.id + '" data-estado="' + (c.estado === "activa" ? "pausada" : "activa") + '">' + (c.estado === "activa" ? "⏸ Pausar" : "▶ Activar") + "</button>" +
        '<button class="icc-btn icc-btn-ghost" data-camp="' + c.id + '" data-estado="terminada">Terminar</button></div></article>';
    }).join("") : '<p class="icc-muted">Aún no hay campañas.</p>') + "</div>";
    html += '<p class="icc-ia-nota">No se mide la tasa de apertura a propósito: los píxeles de seguimiento empeoran la entrega (más correos a spam), los bloquean Apple Mail y Gmail, y en España requieren consentimiento. Las métricas que cuentan son respuestas, positivas y reuniones.</p>';
    var pfSel = S.perfilNuevo || "icc";
    html += '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>Nueva campaña</h2><form id="mo-camp-form" class="icc-ia-form">' +
      '<label><span>Nombre</span><input class="icc-input" name="nombre" required maxlength="160" placeholder="Inmobiliarias Asturias · normativa IA"></label>' +
      '<label><span>Identidad del agente</span><select class="icc-select" name="perfil" id="mo-camp-perfil">' + Object.keys(d.perfiles).map(function (k) { return '<option value="' + k + '"' + (k === pfSel ? " selected" : "") + ">" + esc(d.perfiles[k].nombre) + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Sector</span><select class="icc-select" name="sector"><option value="">Varios</option>' + d.sectores.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nombre) + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Ángulo del mensaje</span><select class="icc-select" name="angulo">' + d.perfiles[pfSel].angulos.map(function (k) { return '<option value="' + k + '">' + esc(d.angulos[k]) + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Modo</span><select class="icc-select" name="modo"><option value="aprobacion">Con aprobación de cada correo (recomendado)</option><option value="borradores">Solo borradores (los envías tú)</option>' +
      (d.aviso_legal && d.es_config ? '<option value="autonomo">Autónomo</option>' : "") + "</select></label>" +
      '<label><span>Gestor que recibe a los interesados</span><select class="icc-select" name="gestor_id"><option value="">El que fije la administración</option>' + d.gestores.map(function (g) { return '<option value="' + g.id + '">' + esc(g.nombre) + "</option>"; }).join("") + "</select></label>" +
      '<button class="icc-btn icc-btn-primary" type="submit">Crear campaña</button></form></section>' +
      '<section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><h2>📡 En directo</h2><span class="icc-ia-pill is-ok">● se actualiza solo</span></div><ul class="icc-ia-lista" id="mo-feed">' + feedHtml(d.feed) + "</ul></section></div>";
    return html;
  }
  function feedHtml(feed) {
    var ICO = { redactado: "✍️", enviado: "📤", aprobado: "✅", respuesta: "📨", radar: "🛰️", barrido: "🗺️", campana: "📣", error: "⚠️", rebote: "↩️", pausa: "⏸", importar: "📥" };
    return feed.length ? feed.map(function (f) {
      return "<li><div><strong>" + (ICO[f.tipo] || "•") + " " + esc(f.mensaje) + "</strong><small>" + esc(fecha(f.ts)) + "</small></div>" +
        (f.msg_pendiente ? '<button type="button" class="icc-btn icc-btn-secondary icc-mo-mini" data-irrevisar>Intervenir</button>' : "") +
        (f.campana_id ? '<button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" data-camp="' + f.campana_id + '" data-estado="pausada" title="Pausar esta campaña">⏸</button>' : "") + "</li>";
    }).join("") : '<li><small class="icc-muted">Sin actividad todavía.</small></li>';
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

  /* ------------------------------------------------- FÁBRICA DE AGENTES */
  function agente() {
    var c = S.cfg;
    if (!c) return '<p class="icc-empty">No se pudo cargar.</p>';
    var dis = c.es_config ? "" : " disabled";
    var sub = S.subFab || "scraper";
    var html = (c.es_config ? "" : '<p class="icc-mo-aviso">Solo la administración puede cambiar estos ajustes.</p>') +
      '<div class="icc-tabs icc-mo-sub">' + [["scraper", "🕷️ Agente Scraper"], ["outreach", "✍️ Agente de Outreach"], ["buzones", "📮 Buzones de envío"], ["envio", "⚖️ Envío y normativa"]]
        .map(function (t) { return '<button type="button" class="icc-tab' + (sub === t[0] ? " is-active" : "") + '" data-sub="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
    if (sub === "scraper") {
      var sc = c.scraper;
      html += '<form id="mo-f-scraper" class="icc-card icc-ia-bloque icc-ia-form"><h2>🕷️ Agente Scraper (el rastreador)</h2>' +
        '<label><span>Reglas de extracción: solo correos genéricos de empresa</span><input class="icc-input" name="prefijos" value="' + esc(sc.prefijos_texto) + '"' + dis + "></label>" +
        '<p class="icc-ia-nota">Solo se guardan correos que empiezan por estos prefijos (info@, contacto@, administracion@…). Los personales (nombre.apellido@) se descartan: B2B y RGPD.</p>' +
        '<label class="icc-ia-switch"><input type="checkbox" name="cualificar_ia"' + (sc.cualificar_ia ? " checked" : "") + dis + "><span><b>Filtro de cualificación IA</b><small>Antes de usar el lead, la IA lee su web: carencias (chatbot, WhatsApp, aviso de IA, política de IA, captación…), un detalle real para personalizar y su encaje de 0 a 100.</small></span></label>" +
        '<label><span>Encaje mínimo para entrar en campaña (0 = todos)</span><input class="icc-input" type="number" min="0" max="100" name="puntuacion_min" value="' + sc.puntuacion_min + '"' + dis + "></label>" +
        '<label><span>Clave de Google Places ' + (c.places_clave ? "(guardada, cifrada)" : "") + '</span><input class="icc-input" type="password" name="places_clave" autocomplete="off" placeholder="' + (c.places_clave ? "••••••• (déjalo vacío para no cambiarla)" : "AIza…") + '"' + dis + "></label>" +
        '<div class="icc-mo-aviso"><b>Verificación del correo.</b> Se comprueba que el dominio recibe correo (registro MX) y cada rebote saca ese correo para siempre. No se hace la «verificación SMTP» del buzón: los servidores la bloquean, Hostalia corta el puerto 25 y quema la reputación del dominio, justo lo contrario de lo que se busca.</div>' +
        (c.es_config ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" type="submit">Guardar el scraper</button><button type="button" class="icc-btn icc-btn-secondary" data-probarg>Probar Google</button></div>' : "") + "</form>";
    } else if (sub === "outreach") {
      var k = S.perfilEd || "icc", p = c.perfiles[k];
      html += '<div class="icc-mo-sectores">' + Object.keys(c.perfiles).map(function (id) { return '<button type="button" class="icc-mo-chip' + (id === k ? " is-sel" : "") + '" data-perfil="' + id + '">' + esc(c.perfiles[id].nombre) + "</button>"; }).join("") + "</div>" +
        '<form id="mo-f-perfil" class="icc-card icc-ia-bloque icc-ia-form" data-id="' + k + '"><h2>✍️ ' + esc(p.nombre) + "</h2>" +
        '<div class="icc-mo-2"><label><span>Tono</span><input class="icc-input" name="tono" value="' + esc(p.tono) + '"' + dis + '></label><label><span>Palabras máximas (1.er correo)</span><input class="icc-input" type="number" name="palabras" value="' + p.palabras + '"' + dis + "></label></div>" +
        '<label><span>Firma</span><textarea class="icc-input" name="firma" rows="3"' + dis + ">" + esc(p.firma) + "</textarea></label>" +
        '<label><span>Responsable del tratamiento (pie legal)</span><input class="icc-input" name="responsable" value="' + esc(p.responsable) + '"' + dis + "></label>" +
        '<label><span>Prompt maestro</span><textarea class="icc-input" name="prompt" rows="16"' + dis + ">" + esc(p.prompt) + "</textarea></label>" +
        '<div class="icc-mo-cadencia">' + [1, 2, 3].map(function (n) { return "<div><b>Día " + [1, 3, 7][n - 1] + "</b><span>" + esc(p.pasos[n]) + "</span></div>"; }).join("") + "</div>" +
        '<p class="icc-ia-nota">Hiper-personalización: antes de escribir lee su web y el detalle que sacó el Scraper; el texto de la web va como datos, nunca como instrucciones. Ha aprendido de ' + p.ejemplos + " correos corregidos por dirección. Firma, motivo del contacto, responsable y baja en un clic los añade siempre el sistema.</p>" +
        (c.es_config ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" type="submit">Guardar este agente</button><button type="button" class="icc-btn icc-btn-ghost" id="mo-restaurar">Restaurar el prompt original</button></div>' : "") + "</form>";
    } else if (sub === "buzones") {
      var bs = S.buzEd || c.buzones.map(function (b) { return Object.assign({}, b); });
      S.buzEd = bs;
      var seg = function (i, n, v) { return '<select class="icc-select" data-b="' + i + '" data-k="' + n + '"' + dis + ">" + ["ssl", "starttls", "ninguna"].map(function (o) { return '<option value="' + o + '"' + (v === o ? " selected" : "") + ">" + { ssl: "SSL", starttls: "STARTTLS", ninguna: "Sin cifrar" }[o] + "</option>"; }).join("") + "</select>"; };
      var inp = function (i, n, v, t) { return '<input class="icc-input" data-b="' + i + '" data-k="' + n + '" value="' + esc(v == null ? "" : v) + '"' + (t ? ' type="' + t + '"' : "") + dis + ">"; };
      html += '<section class="icc-card icc-ia-bloque"><h2>📮 Buzones de envío</h2><p class="icc-muted">Envío escalonado: cada buzón tiene su límite diario (30–40 recomendado), pausas aleatorias entre envíos y, si es nuevo, calentamiento progresivo (10 el primer día y +5 cada día). Los seguimientos salen siempre del mismo buzón, en el mismo hilo. Usa un subdominio dedicado (p. ej. <code>contacto.tudominio.es</code>) con SPF, DKIM y DMARC para no arriesgar el dominio principal.</p>' +
        bs.map(function (b, i) {
          return '<div class="icc-mo-buzon"><div class="icc-mo-cab"><strong>' + esc(b.email || "Buzón nuevo") + "</strong>" + (b.id ? '<small>Hoy ' + (b.enviados_hoy || 0) + " / " + (b.limite_hoy || b.limite) + (b.calentamiento ? " (calentando)" : "") + "</small>" : "") + "</div>" +
            '<div class="icc-mo-3"><label><span>Correo</span>' + inp(i, "email", b.email) + '</label><label><span>Nombre visible</span>' + inp(i, "nombre", b.nombre) + '</label><label><span>Usuario</span>' + inp(i, "usuario", b.usuario) + "</label></div>" +
            '<div class="icc-mo-3"><label><span>SMTP</span>' + inp(i, "host_smtp", b.host_smtp) + '</label><label><span>Puerto</span>' + inp(i, "puerto_smtp", b.puerto_smtp || 587, "number") + '</label><label><span>Cifrado</span>' + seg(i, "seguridad_smtp", b.seguridad_smtp || "starttls") + "</label></div>" +
            '<div class="icc-mo-3"><label><span>IMAP (respuestas y rebotes)</span>' + inp(i, "host_imap", b.host_imap) + '</label><label><span>Puerto</span>' + inp(i, "puerto_imap", b.puerto_imap || 993, "number") + '</label><label><span>Cifrado</span>' + seg(i, "seguridad_imap", b.seguridad_imap || "ssl") + "</label></div>" +
            '<div class="icc-mo-3"><label><span>Contraseña ' + (b.tiene_clave ? "(guardada)" : "") + '</span><input class="icc-input" type="password" data-b="' + i + '" data-k="clave" autocomplete="new-password" placeholder="' + (b.tiene_clave ? "••••• (vacío = no cambiar)" : "") + '"' + dis + "></label>" +
            '<label><span>Límite diario</span>' + inp(i, "limite", b.limite || 35, "number") + "</label>" +
            '<label><span>Solo para</span><select class="icc-select" data-b="' + i + '" data-k="perfil"' + dis + '><option value="">Cualquier identidad</option>' + Object.keys(c.perfiles).map(function (id) { return '<option value="' + id + '"' + (b.perfil === id ? " selected" : "") + ">" + esc(c.perfiles[id].empresa) + "</option>"; }).join("") + "</select></label></div>" +
            '<div class="icc-ia-fila"><label class="icc-ia-switch"><input type="checkbox" data-b="' + i + '" data-k="activo"' + (b.activo !== false ? " checked" : "") + dis + "><span><b>Activo</b></span></label>" +
            '<label class="icc-ia-switch"><input type="checkbox" data-b="' + i + '" data-k="calentamiento"' + (b.calentamiento ? " checked" : "") + dis + "><span><b>Calentamiento</b></span></label>" +
            (c.es_config ? (b.id ? '<button type="button" class="icc-btn icc-btn-secondary icc-mo-mini" data-probarb="' + esc(b.id) + '">Probar</button>' : "") + '<button type="button" class="icc-btn icc-btn-secondary icc-mo-mini" data-hostalia="' + i + '">Datos de Hostalia</button><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" data-quitarb="' + i + '">Quitar</button>' : "") + "</div></div>";
        }).join("") +
        (c.es_config ? '<div class="icc-ia-fila"><button type="button" class="icc-btn icc-btn-secondary" id="mo-addb">＋ Añadir buzón</button><button type="button" class="icc-btn icc-btn-primary" id="mo-saveb">Guardar buzones</button></div><p class="icc-ia-resultado" id="mo-probar-res" role="status"></p>' : "") + "</section>";
    } else {
      html += '<form id="mo-f-envio" class="icc-card icc-ia-bloque icc-ia-form"><h2>⚖️ Envío</h2>' +
        '<div class="icc-mo-2"><label><span>Pausa entre envíos de un buzón (min)</span><div class="icc-mo-2"><input class="icc-input" type="number" name="pausa_min" value="' + c.pausa_min + '"' + dis + '><input class="icc-input" type="number" name="pausa_max" value="' + c.pausa_max + '"' + dis + "></div></label>" +
        '<label><span>Horario</span><div class="icc-mo-2"><input class="icc-input" type="time" name="hora_desde" value="' + esc(c.hora_desde) + '"' + dis + '><input class="icc-input" type="time" name="hora_hasta" value="' + esc(c.hora_hasta) + '"' + dis + "></div></label></div>" +
        '<label class="icc-ia-switch"><input type="checkbox" name="solo_laborables"' + (c.solo_laborables ? " checked" : "") + dis + "><span><b>Solo días laborables</b></span></label>" +
        '<div class="icc-mo-2"><label><span>Gestor por defecto para los interesados</span><select class="icc-select" name="gestor_defecto"' + dis + '><option value="">El creador de la campaña</option>' + S.d.gestores.map(function (g) { return '<option value="' + g.id + '"' + (Number(c.gestor_defecto) === Number(g.id) ? " selected" : "") + ">" + esc(g.nombre) + "</option>"; }).join("") + "</select></label>" +
        '<label><span>Identidad del barrido automático</span><select class="icc-select" name="barrido_perfil"' + dis + ">" + Object.keys(c.perfiles).map(function (id) { return '<option value="' + id + '"' + (c.barrido_perfil === id ? " selected" : "") + ">" + esc(c.perfiles[id].nombre) + "</option>"; }).join("") + "</select></label></div>" +
        (c.es_config ? '<button class="icc-btn icc-btn-primary" type="submit">Guardar</button>' : "") + "</form>";
      html += '<section class="icc-card icc-ia-bloque icc-mo-legal"><h2>Envío autónomo (LSSI art. 21)</h2>' +
        "<p>La ley exige consentimiento previo para enviar correos comerciales en frío, también a empresas. Por eso el Motor pide aprobar cada correo. El modo autónomo envía sin revisión: solo actívalo si tu empresa asume esa responsabilidad.</p>" +
        (c.aviso_legal ? '<p class="icc-ia-pill is-aviso">Aceptado: ' + esc(c.aviso_legal.split("|")[0]) + " por " + esc(c.aviso_legal.split("|")[2] || "") + "</p>" + (c.es_config ? '<button class="icc-btn icc-btn-ghost" id="mo-legal-no">Retirar la aceptación</button>' : "")
          : c.es_config ? '<label class="icc-ia-switch"><input type="checkbox" id="mo-legal-ok"><span><b>He leído el aviso y acepto la responsabilidad</b><small>Queda registrado en la bitácora de seguridad.</small></span></label><button class="icc-btn icc-btn-secondary" id="mo-legal-si">Habilitar el modo autónomo</button>' : "<p>No aceptado.</p>") + "</section>";
    }
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
    raiz.querySelectorAll("[data-fuente]").forEach(function (b) { b.addEventListener("click", function () { S.fuente = b.dataset.fuente; pintar(); }); });
    raiz.querySelectorAll("[data-sect]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var s = cb.dataset.sect;
        S.sectoresSel = S.sectoresSel.filter(function (x) { return x !== s; });
        if (cb.checked) S.sectoresSel.push(s);
        cb.closest("label").classList.toggle("is-sel", cb.checked);
      });
    });
    var repintarChips = function () { var e = document.getElementById("mo-elegidas"); if (e) { e.innerHTML = chipsUbic(); enlazarChips(); } };
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
    var anadir = function (lista) { lista.forEach(function (c) { if (S.ubic.indexOf(c) === -1) S.ubic.push(c); var cb = raiz.querySelector('[data-concejo="' + CSS.escape(c) + '"]'); if (cb) cb.checked = true; }); repintarChips(); };
    raiz.querySelectorAll("[data-zona]").forEach(function (b) { b.addEventListener("click", function () { anadir(S.d.zonas[b.dataset.zona]); }); });
    raiz.querySelectorAll("[data-concejo]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var c = cb.dataset.concejo;
        S.ubic = S.ubic.filter(function (u) { return u !== c; });
        if (cb.checked) S.ubic.push(c);
        repintarChips();
      });
    });
    raiz.querySelectorAll("[data-todos]").forEach(function (b) { b.addEventListener("click", function () { anadir(S.d.asturias[b.dataset.todos]); }); });
    var res = function (t, ok) { var r = document.getElementById("mo-res"); if (r) { r.textContent = t; r.className = "icc-ia-resultado" + (ok == null ? "" : ok ? " is-ok" : " is-mal"); } };
    var trasExtraer = async function (texto, ok) {
      S.leads = (await API.get("api/motor.php?action=leads")).leads;
      S.d = await API.get("api/motor.php?action=estado");
      pintar(); res(texto, ok); vigilar();
    };
    var buscar = document.getElementById("mo-buscar");
    if (buscar) buscar.addEventListener("click", function () {
      var libres = document.getElementById("mo-libre").value.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      res("Buscando en Google y leyendo las webs…");
      hacer(buscar, async function () {
        try {
          var r = await API.post("api/motor.php?action=extraer", { sectores: S.sectoresSel, palabra: document.getElementById("mo-palabra").value, ubicaciones: S.ubic.concat(libres), paginas: 2 });
          await trasExtraer("✓ " + r.nuevos.length + " empresas nuevas de " + r.vistos + " encontradas (" + r.consultas + " consultas a Google)." + (r.errores.length ? " ⚠ " + r.errores.join(" ") : "") + (r.nuevos.length > r.analizados_ya ? " El resto de webs se leen solas: la tabla se actualiza." : ""), !r.errores.length);
        } catch (e) { res("✕ " + e.message, false); }
      });
    });
    var rastrear = document.getElementById("mo-rastrear");
    if (rastrear) rastrear.addEventListener("click", function () {
      res("Rastreando las webs…");
      hacer(rastrear, async function () {
        try {
          var r = await API.post("api/motor.php?action=webs", { lista: document.getElementById("mo-webs").value, sector: S.sectoresSel[0] || "" });
          await trasExtraer("✓ " + r.nuevos.length + " webs añadidas" + (r.repetidos ? " · " + r.repetidos + " ya estaban" : "") + ".", true);
        } catch (e) { res("✕ " + e.message, false); }
      });
    });
    var csv = document.getElementById("mo-csv");
    if (csv) csv.addEventListener("change", function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      var lector = new FileReader();
      lector.onload = function () {
        hacer(null, async function () {
          var r = await API.post("api/motor.php?action=importar", { csv: lector.result });
          await trasExtraer("✓ " + r.nuevos + " importadas · " + r.repetidos + " ya estaban" + (r.correos_descartados ? " · " + r.correos_descartados + " correos no válidos" : ""), true);
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
        U.toast("✓ " + r.hechos + " empresas" + (r.sin_correo ? " (" + r.sin_correo + " sin correo verificado, con poco encaje o excluidas)" : ""), "success");
        S.sel = {};
        await view();
      });
    };
    var camp = document.getElementById("mo-a-camp");
    if (camp) camp.addEventListener("change", function () { if (camp.value) bulk("campana", { campana_id: Number(camp.value) }, camp); });
    var gest = document.getElementById("mo-a-gestor");
    if (gest) gest.addEventListener("change", function () { if (gest.value && confirm("¿Pasar las empresas seleccionadas al CRM con este gestor?")) bulk("crm", { gestor_id: Number(gest.value) }, gest); });
    raiz.querySelectorAll("[data-bulk]").forEach(function (b) { b.addEventListener("click", function () { bulk(b.dataset.bulk, null, b); }); });
    vigilar();
  }

  /** Tiempo real: mientras haya webs por leer, la tabla se refresca sola; el feed, siempre. */
  function vigilar() {
    clearTimeout(reloj);
    reloj = setTimeout(async function () {
      if (!document.querySelector(".icc-mo") || document.hidden) return;
      try {
        if (S.tab === "radar" && S.leads.some(function (l) { return !l.analizado; }) && !Object.keys(S.sel).some(function (k) { return S.sel[k]; })) {
          var foco = document.activeElement && document.activeElement.id;
          S.leads = (await API.get("api/motor.php?action=leads&" + new URLSearchParams(S.filtro).toString())).leads;
          if (!foco || foco === "mo-res") { var t = document.getElementById("mo-res"); var txt = t ? t.textContent : ""; pintar(); var t2 = document.getElementById("mo-res"); if (t2) t2.textContent = txt; }
        }
        if (S.tab === "campanas") {
          S.d = await API.get("api/motor.php?action=estado");
          var feed = document.getElementById("mo-feed");
          if (feed) { feed.innerHTML = feedHtml(S.d.feed); enlazarFeed(main()); }
        }
      } catch (e) { /* sin red: se reintenta */ }
      vigilar();
    }, 8000);
  }

  function enlazarFeed(raiz) {
    raiz.querySelectorAll("[data-irrevisar]").forEach(function (b) { b.addEventListener("click", async function () { S.tab = "revisar"; S.msgEstado = "pendiente"; await cargarTab(); pintar(); }); });
    raiz.querySelectorAll("#mo-feed [data-camp]").forEach(function (b) {
      b.addEventListener("click", function () { hacer(b, async function () { await API.post("api/motor.php?action=campana_estado", { id: Number(b.dataset.camp), estado: "pausada" }); U.toast("Campaña en pausa", "success"); await view(); }); });
    });
  }

  function enlazarCampanas(raiz) {
    var pf = document.getElementById("mo-camp-perfil");
    if (pf) pf.addEventListener("change", function () {
      S.perfilNuevo = pf.value;
      var sel = raiz.querySelector('#mo-camp-form [name="angulo"]');
      sel.innerHTML = S.d.perfiles[pf.value].angulos.map(function (k) { return '<option value="' + k + '">' + esc(S.d.angulos[k]) + "</option>"; }).join("");
    });
    document.getElementById("mo-camp-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = Object.fromEntries(new FormData(ev.target));
      f.gestor_id = f.gestor_id ? Number(f.gestor_id) : null;
      hacer(ev.submitter, async function () { await API.post("api/motor.php?action=campana", f); U.toast("✓ Campaña creada. Añádele empresas desde el Radar.", "success"); await view(); });
    });
    raiz.querySelectorAll("[data-sectcamp]").forEach(function (b) { b.addEventListener("click", function () { S.sectorCamp = b.dataset.sectcamp; pintar(); }); });
    raiz.querySelectorAll(".icc-mo-camps [data-camp]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.estado === "terminada" && !confirm("¿Terminar la campaña? Los correos pendientes se descartan.")) return;
        hacer(b, async function () { await API.post("api/motor.php?action=campana_estado", { id: Number(b.dataset.camp), estado: b.dataset.estado }); await view(); });
      });
    });
    raiz.querySelectorAll(".icc-mo-camps [data-irrevisar]").forEach(function (b) { b.addEventListener("click", async function () { S.tab = "revisar"; await cargarTab(); pintar(); }); });
    enlazarFeed(raiz);
    vigilar();
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
    var c = S.cfg;
    raiz.querySelectorAll("[data-sub]").forEach(function (b) { b.addEventListener("click", function () { S.subFab = b.dataset.sub; pintar(); }); });
    raiz.querySelectorAll("[data-perfil]").forEach(function (b) { b.addEventListener("click", function () { S.perfilEd = b.dataset.perfil; pintar(); }); });
    var guardar = async function (btn, datos, msg) {
      await hacer(btn, async function () { await API.put("api/motor.php?action=config", datos); U.toast("✓ " + msg, "success"); S.cfg = await API.get("api/motor.php?action=config"); S.buzEd = null; S.d = await API.get("api/motor.php?action=estado"); pintar(); });
    };
    var fs = document.getElementById("mo-f-scraper");
    if (fs) fs.addEventListener("submit", function (ev) {
      ev.preventDefault();
      guardar(ev.submitter, { scraper: { prefijos: fs.prefijos.value, cualificar_ia: fs.cualificar_ia.checked, puntuacion_min: Number(fs.puntuacion_min.value) }, places_clave: fs.places_clave.value }, "Agente scraper guardado");
    });
    raiz.querySelectorAll("[data-probarg]").forEach(function (b) {
      b.addEventListener("click", function () { hacer(b, async function () { var r = await API.post("api/motor.php?action=probar", { que: "places" }); U.toast(r.ok ? "✓ Google responde (" + r.resultados + " resultados)" : "✕ " + r.error, r.ok ? "success" : "error"); }); });
    });
    var fp = document.getElementById("mo-f-perfil");
    if (fp) {
      fp.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var p = {}; p[fp.dataset.id] = { tono: fp.tono.value, palabras: Number(fp.palabras.value), firma: fp.firma.value, responsable: fp.responsable.value, prompt: fp.prompt.value };
        guardar(ev.submitter, { perfiles: p }, "Agente de Outreach guardado");
      });
      var rest = document.getElementById("mo-restaurar");
      if (rest) rest.addEventListener("click", function () { fp.prompt.value = c.perfiles[fp.dataset.id].prompt_defecto; });
    }
    // Buzones
    raiz.querySelectorAll("[data-b]").forEach(function (el) {
      el.addEventListener("change", function () {
        var b = S.buzEd[Number(el.dataset.b)];
        b[el.dataset.k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
      });
    });
    var add = document.getElementById("mo-addb");
    if (add) add.addEventListener("click", function () { S.buzEd.push({ email: "", activo: true, calentamiento: true, limite: 35, puerto_smtp: 587, seguridad_smtp: "starttls", puerto_imap: 993, seguridad_imap: "ssl", perfil: "" }); pintar(); });
    raiz.querySelectorAll("[data-quitarb]").forEach(function (b) { b.addEventListener("click", function () { if (confirm("¿Quitar este buzón del Motor?")) { S.buzEd.splice(Number(b.dataset.quitarb), 1); pintar(); } }); });
    raiz.querySelectorAll("[data-hostalia]").forEach(function (b) {
      b.addEventListener("click", function () {
        var x = S.buzEd[Number(b.dataset.hostalia)];
        Object.assign(x, { host_smtp: "smtp.servidor-correo.net", puerto_smtp: 587, seguridad_smtp: "starttls", host_imap: "imap.servidor-correo.net", puerto_imap: 993, seguridad_imap: "ssl" });
        if (!x.usuario) x.usuario = x.email;
        pintar();
      });
    });
    var sb = document.getElementById("mo-saveb");
    if (sb) sb.addEventListener("click", function () { guardar(sb, { buzones: S.buzEd }, "Buzones guardados"); });
    raiz.querySelectorAll("[data-probarb]").forEach(function (b) {
      b.addEventListener("click", function () {
        var res = document.getElementById("mo-probar-res");
        hacer(b, async function () {
          var r = await API.post("api/motor.php?action=probar", { que: "buzon", buzon: b.dataset.probarb });
          res.textContent = r.ok ? "✓ SMTP e IMAP correctos" : "✕ " + (r.error || ((r.smtp && !r.smtp.ok ? "SMTP: " + r.smtp.error + " " : "") + (r.imap && !r.imap.ok ? "IMAP: " + r.imap.error : "")));
          res.className = "icc-ia-resultado is-" + (r.ok ? "ok" : "mal");
        });
      });
    });
    var fe = document.getElementById("mo-f-envio");
    if (fe) fe.addEventListener("submit", function (ev) {
      ev.preventDefault();
      guardar(ev.submitter, { pausa_min: Number(fe.pausa_min.value), pausa_max: Number(fe.pausa_max.value), hora_desde: fe.hora_desde.value, hora_hasta: fe.hora_hasta.value, solo_laborables: fe.solo_laborables.checked,
        gestor_defecto: fe.gestor_defecto.value ? Number(fe.gestor_defecto.value) : null, barrido_perfil: fe.barrido_perfil.value }, "Envío guardado");
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
