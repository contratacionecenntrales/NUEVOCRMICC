/* =============================================================================
   ICC CRM · Zona de entrevistas (#/entrevistas)
   Agentes de WhatsApp que entrevistan solos con los filtros y preguntas de cada
   vacante; panel, vacantes, embudo de candidatos con ficha y chat, simulador
   para probar la entrevista y conexión con la API oficial de WhatsApp (Meta).
   Las decisiones (descartar, avanzar, contratar) son siempre de una persona.
   Dirección y jefes de equipo; los agentes, coordinación y admin. API: api/rrhh.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { tab: "panel", d: null, x: null, vac: null, filtroVac: "", ficha: null, prueba: null };
  var COL = [["invitado", "📨 Invitados"], ["en_curso", "💬 En entrevista"], ["revisar", "🧐 Para revisar"], ["no_cumple", "⛔ No cumple un filtro"], ["preseleccionado", "⭐ Preseleccionados"], ["agendada", "📅 Entrevista final"], ["contratado", "🎉 Contratados"], ["descartado", "Descartados"], ["abandonada", "Abandonaron"]];

  function main() { return document.getElementById("icc-main"); }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }
  function fecha(f) { if (!f) return "—"; return new Date(String(f).replace(" ", "T")).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }
  function nota(p) { var n = Number(p); return p == null ? "" : '<b class="icc-en-nota ' + (n >= 70 ? "is-alta" : n >= 50 ? "is-media" : "is-baja") + '">' + n + "</b>"; }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Cargando la Zona de entrevistas…</div>';
    try { S.d = await API.get("api/rrhh.php?action=panel"); await cargar(); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    pintar();
  }
  async function cargar() {
    S.x = null;
    if (S.tab === "vacantes" || S.tab === "probar") S.x = await API.get("api/rrhh.php?action=vacantes");
    if (S.tab === "candidatos") S.x = await API.get("api/rrhh.php?action=candidatos" + (S.filtroVac ? "&vacante=" + S.filtroVac : ""));
    if (S.tab === "agentes") { S.x = await API.get("api/rrhh.php?action=agentes"); if (S.d.es_config) S.x.cfg = await API.get("api/rrhh.php?action=config"); }
  }
  async function recargar() { S.d = await API.get("api/rrhh.php?action=panel"); await cargar(); pintar(); }

  function pintar() {
    var d = S.d, c = d.contadores || {};
    var html = '<div class="icc-ia icc-mo icc-en">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">Selección con IA · WhatsApp</span><h1>🧑‍💼 Zona de entrevistas</h1>' +
      "<p>Agentes de WhatsApp que entrevistan solos, 24 horas, con los filtros y preguntas de cada vacante: se presentan como asistentes de IA, filtran, evalúan cada respuesta, resuelven dudas y agendan la entrevista final en tu agenda. <b>La decisión de descartar o contratar es siempre de una persona</b> (Reglamento Europeo de IA y RGPD): aquí se confirma con un clic.</p>" +
      '<div class="icc-ia-estado">' + pill(d.whatsapp ? "● WhatsApp conectado" : "WhatsApp sin conectar: puedes probar en el simulador", d.whatsapp ? "ok" : "aviso") + pill(d.ia ? "Evaluación con IA" : "Sin IA: valoración orientativa", d.ia ? "ok" : "aviso") + "</div></div></section>" +
      '<div class="icc-mo-kpis">' + [["💬", (c.en_curso || 0) + (c.invitado || 0), "En proceso"], ["🧐", (c.revisar || 0) + (c.no_cumple || 0), "Para revisar"], ["⭐", c.preseleccionado || 0, "Preseleccionados"], ["📅", c.agendada || 0, "Entrevistas finales"], ["✅", d.finalizacion + "%", "Terminan la entrevista"]]
        .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
      '<nav class="icc-tabs icc-mo-tabs" role="tablist">' + [["panel", "📊 Panel"], ["vacantes", "💼 Vacantes"], ["candidatos", "🧑‍💼 Candidatos"], ["probar", "🧪 Probar la entrevista"], ["agentes", "🤖 Agentes de WhatsApp"]]
        .map(function (t) { return '<button type="button" role="tab" class="icc-tab' + (S.tab === t[0] ? " is-active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</nav>" +
      '<div id="en-cuerpo">' + ({ panel: panel, vacantes: vacantes, candidatos: candidatos, probar: probar, agentes: agentes }[S.tab])() + "</div></div>";
    main().innerHTML = html;
    enlazar();
  }

  /* ---------------------------------------------------------------- PANEL */
  function panel() {
    var d = S.d;
    return '<section class="icc-card icc-ia-bloque"><h2>Vacantes</h2>' + (d.vacantes.length ? '<div class="icc-en-tabla"><div class="icc-en-fila icc-en-fila--cab"><span>Vacante</span><span>Candidatos</span><span>En entrevista</span><span>Avanzan</span><span>Para revisar</span><span>Contratados</span><span>Nota media</span></div>' +
      d.vacantes.map(function (v) {
        return '<div class="icc-en-fila"><span><strong>' + esc(v.titulo) + "</strong><small>" + esc(v.agente || "Sin agente") + " · " + pill(v.estado === "activa" ? "Activa" : v.estado === "pausada" ? "En pausa" : v.estado === "cerrada" ? "Cerrada" : "Borrador", v.estado === "activa" ? "ok" : "") + "</small></span><span>" + (v.total || 0) + "</span><span>" + (v.en_curso || 0) + "</span><span>" + (v.avanzan || 0) + "</span><span>" + (v.revisar || 0) + "</span><span>" + (v.contratados || 0) + " / " + v.plazas + "</span><span>" + (v.media != null ? nota(v.media) : "—") + "</span></div>";
      }).join("") + "</div>" : '<p class="icc-muted">Crea tu primera vacante en «Vacantes» (hay plantillas listas).</p>') + "</section>" +
      '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>📅 Próximas entrevistas finales</h2>' + (d.citas.length ? '<ul class="icc-ia-lista">' + d.citas.map(function (x) { return "<li><div><strong>" + esc(x.nombre) + "</strong><small>" + esc(x.titulo) + " · " + esc(fecha(x.cita_en)) + '</small></div><div class="icc-ia-fila"><button class="icc-btn icc-btn-ghost icc-mo-mini" data-ficha="' + x.id + '">Ver ficha</button></div></li>'; }).join("") + "</ul>" : '<p class="icc-muted">Ninguna agendada.</p>') + "</section>" +
      '<section class="icc-card icc-ia-bloque"><h2>Cómo trabaja</h2><ol class="icc-en-pasos"><li>El candidato se inscribe en el <b>formulario</b> de la oferta, escribe al <b>WhatsApp</b> con el código de la vacante o lo importas tú.</li><li>El agente se presenta como asistente de IA, pide el consentimiento y hace los <b>filtros eliminatorios</b>.</li><li>Hace la <b>entrevista</b> (repregunta si una respuesta es vaga), resuelve dudas con los datos de la oferta y puntúa de 0 a 100.</li><li>Si supera el mínimo, le ofrece <b>2 huecos reales</b> de la agenda del responsable y agenda la entrevista final con recordatorio.</li><li>Lo demás queda <b>para revisar</b>: confirmas los descartes (en bloque si quieres) y el agente avisa con respeto y ofrece la bolsa de talento.</li></ol></section></div>';
  }

  /* -------------------------------------------------------------- VACANTES */
  function vacantes() {
    var x = S.x;
    if (S.vac) return editor();
    return '<section class="icc-ia-bloque"><div class="icc-mo-cab"><h2 class="icc-fl-h2">Vacantes</h2><div class="icc-ia-fila"><button class="icc-btn icc-btn-primary icc-mo-mini" id="en-nueva">＋ Vacante en blanco</button>' +
      Object.keys(x.plantillas).map(function (k) { return '<button class="icc-btn icc-btn-secondary icc-mo-mini" data-plantilla="' + k + '">＋ ' + esc(x.plantillas[k]) + "</button>"; }).join("") + "</div></div>" +
      (x.vacantes.length ? '<div class="icc-mo-camps">' + x.vacantes.map(function (v) {
        return '<article class="icc-card icc-mo-camp"><header><div><strong>' + esc(v.titulo) + "</strong><small>" + esc([v.ubicacion, v.jornada].filter(Boolean).join(" · ")) + " · " + v.filtros.length + " filtros · " + v.preguntas.length + " preguntas · mínimo " + v.puntuacion_min + "</small></div>" +
          pill(v.estado === "activa" ? "Activa" : v.estado === "pausada" ? "En pausa" : v.estado === "cerrada" ? "Cerrada" : "Borrador", v.estado === "activa" ? "ok" : "aviso") + "</header>" +
          (v.estado === "activa" ? '<div class="icc-en-enlaces"><label><span>Formulario de la oferta</span><input class="icc-input" readonly value="' + esc(v.enlace_formulario) + '"></label><small>O que escriban al WhatsApp del agente con el código <b>VAC' + v.id + "</b>.</small></div>" : "") +
          '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary icc-mo-mini" data-editar="' + v.id + '">Editar</button>' +
          (v.estado !== "activa" ? '<button class="icc-btn icc-btn-secondary icc-mo-mini" data-vestado="activa" data-id="' + v.id + '">▶ Activar</button>' : '<button class="icc-btn icc-btn-secondary icc-mo-mini" data-vestado="pausada" data-id="' + v.id + '">⏸ Pausar</button>') +
          '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-importar="' + v.id + '">Añadir candidatos</button>' + (v.estado !== "cerrada" ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-vestado="cerrada" data-id="' + v.id + '">Cerrar</button>' : "") + "</div>" +
          '<div class="icc-en-import" data-imp="' + v.id + '" hidden><textarea class="icc-input" rows="4" placeholder="Una persona por línea: Nombre; teléfono; correo (opcional)"></textarea><label class="icc-ia-switch"><input type="checkbox" data-consent><span><b>Estas personas han pedido o aceptado que les escribamos por WhatsApp</b><small>Por ejemplo, se inscribieron en la oferta. Sin consentimiento no se les puede escribir.</small></span></label><button class="icc-btn icc-btn-primary icc-mo-mini" data-invitar="' + v.id + '">Invitar a la entrevista</button></div></article>';
      }).join("") + "</div>" : '<p class="icc-muted">Todavía no hay vacantes. Empieza por una plantilla: viene con filtros y preguntas profesionales que puedes ajustar.</p>') + "</section>";
  }

  function editor() {
    var v = S.vac, x = S.x;
    var fila = function (f, i) { return '<div class="icc-en-item" data-filtro="' + i + '"><input class="icc-input" data-k="pregunta" value="' + esc(f.pregunta) + '" placeholder="Pregunta eliminatoria"><select class="icc-select" data-k="tipo">' + [["si_no", "Sí / No"], ["opcion", "Opciones"], ["numero", "Número mínimo (años, meses…)"]].map(function (t) { return '<option value="' + t[0] + '"' + (f.tipo === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + '</select><input class="icc-input" data-k="esperado" value="' + esc(f.esperado) + '" placeholder="Respuesta que pasa (si, no, opciones separadas por comas o número)"><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" data-quitar-f="' + i + '">✕</button></div>'; };
    var preg = function (p, i) { return '<div class="icc-en-item icc-en-item--p" data-preg="' + i + '"><textarea class="icc-input" rows="2" data-k="pregunta" placeholder="Pregunta">' + esc(p.pregunta) + '</textarea><textarea class="icc-input" rows="2" data-k="criterio" placeholder="Qué es una buena respuesta (criterio de evaluación)">' + esc(p.criterio) + '</textarea><label><span>Peso</span><input class="icc-input" type="number" min="1" max="5" data-k="peso" value="' + (p.peso || 1) + '"></label><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" data-quitar-p="' + i + '">✕</button></div>'; };
    return '<section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><h2>' + (v.id ? "Editar vacante" : "Nueva vacante") + '</h2><button class="icc-btn icc-btn-ghost icc-mo-mini" id="en-volver">← Vacantes</button></div><form id="en-vac" class="icc-ia-form" autocomplete="off">' +
      '<div class="icc-mo-2"><label><span>Puesto</span><input class="icc-input" name="titulo" required value="' + esc(v.titulo) + '"></label><label><span>Ubicación</span><input class="icc-input" name="ubicacion" value="' + esc(v.ubicacion) + '"></label></div>' +
      '<div class="icc-mo-3"><label><span>Modalidad</span><input class="icc-input" name="modalidad" value="' + esc(v.modalidad) + '"></label><label><span>Jornada</span><input class="icc-input" name="jornada" value="' + esc(v.jornada) + '"></label><label><span>Salario (lo que el agente puede decir)</span><input class="icc-input" name="salario" value="' + esc(v.salario) + '"></label></div>' +
      '<label><span>Descripción (el agente responde dudas solo con esto)</span><textarea class="icc-input" name="descripcion" rows="3">' + esc(v.descripcion || "") + "</textarea></label>" +
      '<div class="icc-mo-3"><label><span>Agente de WhatsApp</span><select class="icc-select" name="agente_id"><option value="">—</option>' + x.agentes.map(function (a) { return '<option value="' + a.id + '"' + (Number(v.agente_id) === Number(a.id) ? " selected" : "") + ">" + esc(a.nombre) + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Responsable (agenda de la entrevista final)</span><select class="icc-select" name="responsable_id"><option value="">—</option>' + x.responsables.map(function (u) { return '<option value="' + u.id + '"' + (Number(v.responsable_id) === Number(u.id) ? " selected" : "") + ">" + esc(u.nombre) + "</option>"; }).join("") + "</select></label>" +
      '<div class="icc-mo-2"><label><span>Nota mínima</span><input class="icc-input" type="number" min="0" max="100" name="puntuacion_min" value="' + (v.puntuacion_min || 60) + '"></label><label><span>Plazas</span><input class="icc-input" type="number" min="1" name="plazas" value="' + (v.plazas || 1) + '"></label></div></div>' +
      '<label class="icc-ia-switch"><input type="checkbox" name="auto_agendar"' + (Number(v.auto_agendar) !== 0 ? " checked" : "") + "><span><b>Agendar sola la entrevista final</b><small>Si supera la nota mínima, el agente ofrece 2 huecos reales de la agenda del responsable.</small></span></label>" +
      '<h3 class="icc-eq-h3">⛔ Filtros eliminatorios</h3><p class="icc-ia-nota">Requisitos objetivos del puesto (carné, disponibilidad, permiso de trabajo…). Quien no cumple queda «para revisar»: nunca se descarta solo. No se pueden usar edad, nacionalidad, sexo, familia, salud, religión ni ideología: es discriminación y el CRM lo bloquea. En su lugar: «Mayor de edad», «Permiso de trabajo en España» y «Nivel de español».</p><div id="en-filtros">' + v.filtros.map(fila).join("") + '</div>' +
      '<div class="icc-ia-fila icc-en-rapidos"><span>Añadir filtro:</span>' + Object.keys(x.filtros_rapidos || {}).map(function (k) { return '<button type="button" class="icc-btn icc-btn-secondary icc-mo-mini" data-rapido="' + k + '">＋ ' + esc(x.filtros_rapidos[k][0]) + "</button>"; }).join("") + '<button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" id="en-add-f">＋ Filtro propio</button></div>' +
      '<h3 class="icc-eq-h3">💬 Preguntas de la entrevista</h3><p class="icc-ia-nota">Cada respuesta se puntúa de 0 a 10 según su criterio; la nota final (0-100) pondera por el peso.</p><div id="en-preguntas">' + v.preguntas.map(preg).join("") + '</div><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" id="en-add-p">＋ Pregunta</button>' +
      '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" type="submit">💾 Guardar vacante</button></div></form></section>';
  }
  function leerEditor() {
    var f = document.getElementById("en-vac"), v = S.vac;
    ["titulo", "ubicacion", "modalidad", "jornada", "salario", "descripcion", "agente_id", "responsable_id", "puntuacion_min", "plazas"].forEach(function (k) { v[k] = f[k].value; });
    v.auto_agendar = f.auto_agendar.checked;
    v.filtros = [].map.call(document.querySelectorAll("[data-filtro]"), function (el) { return { pregunta: el.querySelector('[data-k="pregunta"]').value, tipo: el.querySelector('[data-k="tipo"]').value, esperado: el.querySelector('[data-k="esperado"]').value }; });
    v.preguntas = [].map.call(document.querySelectorAll("[data-preg]"), function (el) { return { pregunta: el.querySelector('[data-k="pregunta"]').value, criterio: el.querySelector('[data-k="criterio"]').value, peso: Number(el.querySelector('[data-k="peso"]').value) || 1 }; });
  }

  /* ------------------------------------------------------------ CANDIDATOS */
  function candidatos() {
    var x = S.x;
    if (S.ficha) return ficha();
    var por = {}; x.candidatos.forEach(function (c) { (por[c.estado] = por[c.estado] || []).push(c); });
    var revisables = (por.revisar || []).concat(por.no_cumple || []).concat(por.abandonada || []);
    return '<div class="icc-mo-cab"><div class="icc-mo-filtros"><select class="icc-select" id="en-fvac"><option value="">Todas las vacantes</option>' + (S.d.vacantes || []).map(function (v) { return '<option value="' + v.id + '"' + (String(S.filtroVac) === String(v.id) ? " selected" : "") + ">" + esc(v.titulo) + "</option>"; }).join("") + "</select></div>" +
      (revisables.length ? '<button class="icc-btn icc-btn-secondary icc-mo-mini" id="en-bloque">Confirmar descartes seleccionados</button>' : "") + "</div>" +
      '<div class="icc-en-kanban">' + COL.map(function (col) {
        var l = por[col[0]] || [];
        if (!l.length && ["descartado", "abandonada", "contratado"].indexOf(col[0]) !== -1) return "";
        return '<section class="icc-en-col"><h3>' + col[1] + " <small>" + l.length + "</small></h3>" + l.map(function (c) {
          var sel = ["revisar", "no_cumple", "abandonada"].indexOf(c.estado) !== -1;
          return '<article class="icc-en-card" data-ficha="' + c.id + '">' + (sel ? '<input type="checkbox" class="icc-en-sel" value="' + c.id + '" aria-label="Seleccionar para descartar">' : "") +
            "<div><strong>" + esc(c.nombre || "+" + c.telefono) + "</strong> " + nota(c.puntuacion) + "<small>" + esc(c.titulo) + "</small>" + (c.motivo ? '<small class="icc-en-motivo">' + esc(c.motivo) + "</small>" : "") + (c.cita_en ? "<small>📅 " + esc(fecha(c.cita_en)) + "</small>" : "") + (c.bolsa_hasta ? "<small>⭐ En la bolsa de talento</small>" : "") + "</div></article>";
        }).join("") + "</section>";
      }).join("") + "</div>";
  }

  function ficha() {
    var e = S.ficha;
    var dec = ["descartado", "contratado", "baja"].indexOf(e.estado) === -1;
    return '<section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><div><h2>' + esc(e.cand_nombre || "+" + e.telefono) + " " + nota(e.puntuacion) + '</h2><small class="icc-muted">' + esc(e.titulo) + " · +" + esc(e.telefono) + " · " + esc(S.x.estados[e.estado] || e.estado) + (e.cita_en ? " · entrevista final " + esc(fecha(e.cita_en)) : "") + "</small></div><button class=\"icc-btn icc-btn-ghost icc-mo-mini\" id=\"en-cerrar\">← Candidatos</button></div>" +
      (e.motivo ? '<p class="icc-mo-aviso">' + esc(e.motivo) + "</p>" : "") +
      (e.resumen ? '<div class="icc-en-resumen"><b>Resumen para el responsable</b><p>' + esc(e.resumen) + "</p></div>" : "") +
      (dec ? '<div class="icc-ia-fila icc-en-decision"><input class="icc-input" id="en-nota" placeholder="Nota interna (opcional)"><button class="icc-btn icc-btn-primary icc-mo-mini" data-decidir="avanzar">⭐ Avanzar (agendar entrevista final)</button><button class="icc-btn icc-btn-secondary icc-mo-mini" data-decidir="contratar">🎉 Contratar</button><button class="icc-btn icc-btn-ghost icc-mo-mini" data-decidir="descartar">Descartar con respeto</button></div>' : "") +
      '<div class="icc-ia-dos"><div><h3 class="icc-eq-h3">Respuestas</h3>' + (e.respuestas.length ? '<ul class="icc-ia-lista">' + e.respuestas.map(function (r) {
        return "<li><div><strong>" + esc(r.pregunta) + "</strong><small>«" + esc(r.respuesta) + "»</small>" + (r.nota ? "<small>💡 " + esc(r.nota) + "</small>" : "") + "</div>" + (r.puntuacion != null ? pill(r.puntuacion + "/10 · peso " + r.peso, r.puntuacion >= 7 ? "ok" : r.puntuacion < 5 ? "aviso" : "") : r.cumple === false ? pill("No cumple", "aviso") : r.cumple ? pill("Cumple", "ok") : "") + "</li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Todavía sin respuestas.</p>') + "</div>" +
      '<div><h3 class="icc-eq-h3">Conversación de WhatsApp</h3><div class="icc-en-chat">' + e.mensajes.map(function (m) { return '<div class="icc-en-msg is-' + m.direccion + '"><p>' + esc(m.texto) + "</p><small>" + esc(fecha(m.created_at)) + (m.direccion === "salida" && m.estado !== "enviado" ? " · " + esc(m.estado) : "") + "</small></div>"; }).join("") + "</div></div></div>" +
      '<p class="icc-ia-nota">Derechos RGPD: el candidato puede pedir el borrado respondiendo BORRAR; también puedes <button class="icc-btn icc-btn-ghost icc-mo-mini" data-borrar="' + e.candidato_id + '">borrar sus datos ahora</button></p></section>';
  }

  /* --------------------------------------------------------------- PROBAR */
  function probar() {
    var x = S.x, p = S.prueba;
    return '<section class="icc-card icc-ia-bloque"><h2>🧪 Probar la entrevista</h2><p class="icc-muted">Haz tú de candidato: el agente se comporta igual que en WhatsApp (sin enviar nada). Úsalo para afinar filtros y preguntas antes de activar una vacante.</p>' +
      '<div class="icc-ia-fila"><select class="icc-select" id="en-pvac">' + x.vacantes.map(function (v) { return '<option value="' + v.id + '">' + esc(v.titulo) + "</option>"; }).join("") + '</select><button class="icc-btn icc-btn-primary icc-mo-mini" id="en-pini">' + (p ? "Reiniciar" : "Empezar") + "</button></div>" +
      (p ? '<div class="icc-en-movil"><div class="icc-en-chat" id="en-pchat">' + p.mensajes.map(function (m) { return '<div class="icc-en-msg is-' + m.direccion + '"><p>' + esc(m.texto) + "</p></div>"; }).join("") + "</div>" +
        '<form id="en-pform" class="icc-en-escribir"><input class="icc-input" name="t" placeholder="Escribe como candidato…" autocomplete="off"><button class="icc-btn icc-btn-primary icc-mo-mini">Enviar</button></form></div>' +
        (p.puntuacion != null ? '<p><b>Resultado:</b> ' + nota(p.puntuacion) + " · " + esc(p.estado) + "</p>" + (p.resumen ? '<div class="icc-en-resumen"><p>' + esc(p.resumen) + "</p></div>" : "") : "") : "") + "</section>";
  }

  /* ------------------------------------------------------------- AGENTES */
  function agentes() {
    var x = S.x, cfg = x.cfg;
    var lista = '<section class="icc-card icc-ia-bloque"><h2>🤖 Agentes de WhatsApp</h2><p class="icc-muted">Cada agente es un número de WhatsApp Business (API oficial de Meta) con su nombre y tono. Puedes tener varios (por puesto o por zona) y asignar cada vacante a uno.</p>' +
      (x.agentes.length ? '<ul class="icc-ia-lista">' + x.agentes.map(function (a) { return "<li><div><strong>" + esc(a.nombre) + "</strong><small>" + esc(a.numero_visible || "Sin número") + " · ID " + esc(a.phone_number_id || "—") + " · " + a.vacantes + " vacantes activas · " + a.mensajes_hoy + " mensajes hoy</small></div>" + (x.es_config ? '<div class="icc-ia-fila">' + pill(Number(a.activo) ? "Activo" : "Apagado", Number(a.activo) ? "ok" : "aviso") + '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-agedit="' + a.id + '">Editar</button><button class="icc-btn icc-btn-ghost icc-mo-mini" data-agprobar="' + a.id + '">Probar</button></div>' : "") + "</li>"; }).join("") + "</ul>" : '<p class="icc-muted">Ninguno todavía.</p>') +
      (x.es_config ? '<form id="en-ag" class="icc-ia-form"><input type="hidden" name="id"><div class="icc-mo-3"><label><span>Nombre del agente</span><input class="icc-input" name="nombre" placeholder="Lucía · Selección comercial"></label><label><span>ID del número (phone_number_id)</span><input class="icc-input" name="phone_number_id"></label><label><span>Número visible</span><input class="icc-input" name="numero_visible" placeholder="+34 600 000 000"></label></div>' +
        '<label><span>Tono</span><input class="icc-input" name="tono" value="cercano y profesional, de tú"></label><label class="icc-ia-switch"><input type="checkbox" name="activo" checked><span><b>Activo</b></span></label><button class="icc-btn icc-btn-primary icc-mo-mini" type="submit">Guardar agente</button></form>' : "") + "</section>";
    if (!x.es_config || !cfg) return lista + '<p class="icc-ia-nota">Los agentes y la conexión con Meta los configura la administración.</p>';
    return lista + '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>Conexión con WhatsApp (Meta)</h2><form id="en-cfg" class="icc-ia-form" autocomplete="off">' +
      '<label class="icc-ia-switch"><input type="checkbox" name="activo"' + (cfg.activo ? " checked" : "") + "><span><b>Entrevistas automáticas encendidas</b></span></label>" +
      '<label><span>Token de acceso permanente (usuario del sistema)</span><input class="icc-input" type="password" name="token" autocomplete="new-password" placeholder="' + (cfg.tiene_token ? "•••• guardado" : "Pega el token") + '"></label>' +
      '<label><span>App Secret (firma del webhook)</span><input class="icc-input" type="password" name="app_secret" autocomplete="new-password" placeholder="' + (cfg.tiene_secreto ? "•••• guardado" : "Pega el App Secret") + '"></label>' +
      '<div class="icc-mo-3"><label><span>Plantilla de invitación</span><input class="icc-input" name="plantilla_invitacion" value="' + esc(cfg.plantilla_invitacion) + '"></label><label><span>Plantilla de recordatorio</span><input class="icc-input" name="plantilla_recordatorio" value="' + esc(cfg.plantilla_recordatorio) + '"></label><label><span>Plantilla de novedades</span><input class="icc-input" name="plantilla_novedades" value="' + esc(cfg.plantilla_novedades) + '"></label></div>' +
      '<div class="icc-mo-3"><label><span>Enviar desde</span><input class="icc-input" name="hora_desde" value="' + esc(cfg.hora_desde) + '"></label><label><span>Hasta</span><input class="icc-input" name="hora_hasta" value="' + esc(cfg.hora_hasta) + '"></label><label><span>Mensajes al día (máximo)</span><input class="icc-input" type="number" name="limite_dia" value="' + cfg.limite_dia + '"></label></div>' +
      '<div class="icc-mo-2"><label><span>Política de privacidad (URL)</span><input class="icc-input" name="privacidad_url" value="' + esc(cfg.privacidad_url) + '"></label><label><span>Conservar datos (meses)</span><input class="icc-input" type="number" min="1" max="24" name="meses_conservar" value="' + cfg.meses_conservar + '"></label></div>' +
      '<button class="icc-btn icc-btn-primary icc-mo-mini" type="submit">Guardar</button></form></section>' +
      '<section class="icc-card icc-ia-bloque"><h2>Cómo conectarlo</h2><ol class="icc-en-pasos"><li>En Meta for Developers crea una app de tipo Business con el producto <b>WhatsApp</b> y añade tus números (uno por agente).</li>' +
      "<li>Crea un usuario del sistema con permiso <code>whatsapp_business_messaging</code> y genera un <b>token permanente</b>; copia también el <b>App Secret</b>.</li>" +
      '<li>En Configuración del webhook pon esta URL: <input class="icc-input" readonly value="' + esc(cfg.webhook) + '"> y este token de verificación: <input class="icc-input" readonly value="' + esc(cfg.verify_token) + '"> Suscríbete a <b>messages</b>.</li>' +
      "<li>Crea y envía a aprobar las 3 plantillas (categoría Utilidad, español):<ul>" + Object.keys(cfg.textos_plantillas).map(function (k) { return "<li><b>" + esc(cfg["plantilla_" + k]) + "</b>: «" + esc(cfg.textos_plantillas[k]) + "»</li>"; }).join("") + "</ul></li>" +
      "<li>Crea los agentes con el ID de cada número, pulsa «Probar» y activa una vacante.</li></ol></section></div>";
  }

  /* --------------------------------------------------------------- EVENTOS */
  function enlazar() {
    var r = main();
    r.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", async function () { S.tab = b.dataset.tab; S.vac = null; S.ficha = null; await cargar(); pintar(); }); });
    r.querySelectorAll("[data-ficha]").forEach(function (b) {
      b.addEventListener("click", async function (ev) {
        if (ev.target.classList.contains("icc-en-sel")) return;
        var x = await API.get("api/rrhh.php?action=entrevista&id=" + b.dataset.ficha);
        if (S.tab !== "candidatos") { S.tab = "candidatos"; await cargar(); }
        S.ficha = x.entrevista; pintar();
      });
    });
    var cer = document.getElementById("en-cerrar"); if (cer) cer.addEventListener("click", function () { S.ficha = null; pintar(); });
    r.querySelectorAll("[data-decidir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = b.dataset.decidir;
        if (d === "descartar" && !confirm("Se enviará al candidato un mensaje amable de descarte y se le ofrecerá la bolsa de talento. ¿Continuar?")) return;
        hacer(b, async function () { var x = await API.post("api/rrhh.php?action=decidir", { id: S.ficha.id, decision: d, nota: document.getElementById("en-nota").value }); U.toast("✓ " + x.texto, "success"); S.ficha = (await API.get("api/rrhh.php?action=entrevista&id=" + S.ficha.id)).entrevista; await recargar(); });
      });
    });
    var bl = document.getElementById("en-bloque");
    if (bl) bl.addEventListener("click", function () {
      var ids = [].map.call(r.querySelectorAll(".icc-en-sel:checked"), function (i) { return Number(i.value); });
      if (!ids.length) return U.toast("Marca primero los candidatos a descartar", "error");
      if (!confirm("Vas a confirmar " + ids.length + " descartes. Cada candidato recibirá un mensaje amable y la opción de quedarse en la bolsa de talento. ¿Continuar?")) return;
      hacer(bl, async function () { var x = await API.post("api/rrhh.php?action=descartar_bloque", { ids: ids }); U.toast("✓ " + x.texto, "success"); await recargar(); });
    });
    var fv = document.getElementById("en-fvac"); if (fv) fv.addEventListener("change", async function () { S.filtroVac = fv.value; await cargar(); pintar(); });
    r.querySelectorAll("[data-borrar]").forEach(function (b) { b.addEventListener("click", function () { if (!confirm("Se borrarán todos los datos y conversaciones de este candidato. ¿Continuar?")) return; hacer(b, async function () { await API.post("api/rrhh.php?action=borrar_candidato", { id: Number(b.dataset.borrar) }); S.ficha = null; U.toast("Datos borrados", "success"); await recargar(); }); }); });
    // Vacantes
    var nv = document.getElementById("en-nueva"); if (nv) nv.addEventListener("click", function () { S.vac = { id: 0, titulo: "", filtros: [], preguntas: [{ pregunta: "", criterio: "", peso: 1 }], puntuacion_min: 60, plazas: 1, auto_agendar: 1 }; pintar(); });
    r.querySelectorAll("[data-plantilla]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { var x = await API.post("api/rrhh.php?action=vacante_plantilla", { clave: b.dataset.plantilla }); await cargar(); S.vac = JSON.parse(JSON.stringify(S.x.vacantes.filter(function (v) { return Number(v.id) === Number(x.id); })[0])); U.toast("✓ Vacante creada en borrador: revísala", "success"); pintar(); }); }); });
    r.querySelectorAll("[data-editar]").forEach(function (b) { b.addEventListener("click", function () { S.vac = JSON.parse(JSON.stringify(S.x.vacantes.filter(function (v) { return Number(v.id) === Number(b.dataset.editar); })[0])); pintar(); }); });
    r.querySelectorAll("[data-vestado]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { await API.post("api/rrhh.php?action=vacante_estado", { id: Number(b.dataset.id), estado: b.dataset.vestado }); U.toast("✓ Hecho", "success"); await recargar(); }); }); });
    r.querySelectorAll("[data-importar]").forEach(function (b) { b.addEventListener("click", function () { var el = r.querySelector('[data-imp="' + b.dataset.importar + '"]'); el.hidden = !el.hidden; }); });
    r.querySelectorAll("[data-invitar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var box = b.closest(".icc-en-import");
        var filas = box.querySelector("textarea").value.split("\n").map(function (l) { var p = l.split(/[;,\t]/).map(function (x) { return x.trim(); }); return { nombre: p[0] || "", telefono: p[1] || "", email: p[2] || "" }; }).filter(function (f) { return f.telefono; });
        hacer(b, async function () { var x = await API.post("api/rrhh.php?action=invitar", { vacante_id: Number(b.dataset.invitar), consentimiento: box.querySelector("[data-consent]").checked, filas: filas }); U.toast("✓ " + x.ok + " invitados (el agente les escribe en unos minutos)", "success"); await recargar(); });
      });
    });
    var vol = document.getElementById("en-volver"); if (vol) vol.addEventListener("click", function () { S.vac = null; pintar(); });
    r.querySelectorAll("[data-rapido]").forEach(function (b) { b.addEventListener("click", function () { leerEditor(); var q = S.x.filtros_rapidos[b.dataset.rapido][1]; if (S.vac.filtros.some(function (f) { return f.pregunta === q.pregunta; })) return U.toast("Ese filtro ya está", "error"); S.vac.filtros.push(Object.assign({}, q)); pintar(); }); });
    var af = document.getElementById("en-add-f"); if (af) af.addEventListener("click", function () { leerEditor(); S.vac.filtros.push({ pregunta: "", tipo: "si_no", esperado: "si" }); pintar(); });
    var ap = document.getElementById("en-add-p"); if (ap) ap.addEventListener("click", function () { leerEditor(); S.vac.preguntas.push({ pregunta: "", criterio: "", peso: 1 }); pintar(); });
    r.querySelectorAll("[data-quitar-f]").forEach(function (b) { b.addEventListener("click", function () { leerEditor(); S.vac.filtros.splice(Number(b.dataset.quitarF), 1); pintar(); }); });
    r.querySelectorAll("[data-quitar-p]").forEach(function (b) { b.addEventListener("click", function () { leerEditor(); S.vac.preguntas.splice(Number(b.dataset.quitarP), 1); pintar(); }); });
    var fvac = document.getElementById("en-vac");
    if (fvac) fvac.addEventListener("submit", function (ev) { ev.preventDefault(); leerEditor(); hacer(ev.submitter, async function () { var x = await API.post("api/rrhh.php?action=vacante", S.vac); U.toast("✓ Vacante guardada", "success"); S.vac = null; await recargar(); }); });
    // Probar
    var pi = document.getElementById("en-pini");
    if (pi) pi.addEventListener("click", function () { hacer(pi, async function () { var x = await API.post("api/rrhh.php?action=prueba_iniciar", { vacante_id: Number(document.getElementById("en-pvac").value) }); S.prueba = { id: x.id, mensajes: x.mensajes }; pintar(); }); });
    var pf = document.getElementById("en-pform");
    if (pf) {
      var ch = document.getElementById("en-pchat"); ch.scrollTop = ch.scrollHeight; pf.t.focus();
      pf.addEventListener("submit", function (ev) { ev.preventDefault(); var t = pf.t.value.trim(); if (!t) return; hacer(ev.submitter, async function () { var x = await API.post("api/rrhh.php?action=prueba_mensaje", { id: S.prueba.id, texto: t }); S.prueba = { id: S.prueba.id, mensajes: x.mensajes, puntuacion: x.puntuacion, estado: x.estado, resumen: x.resumen }; pintar(); }); });
    }
    // Agentes y conexión
    var fa = document.getElementById("en-ag");
    if (fa) fa.addEventListener("submit", function (ev) { ev.preventDefault(); var d = Object.fromEntries(new FormData(fa)); d.activo = fa.activo.checked; hacer(ev.submitter, async function () { await API.post("api/rrhh.php?action=agente", d); U.toast("✓ Agente guardado", "success"); await recargar(); }); });
    r.querySelectorAll("[data-agedit]").forEach(function (b) { b.addEventListener("click", function () { var a = S.x.agentes.filter(function (x) { return Number(x.id) === Number(b.dataset.agedit); })[0]; ["id", "nombre", "phone_number_id", "numero_visible", "tono"].forEach(function (k) { fa[k].value = a[k] || ""; }); fa.activo.checked = Number(a.activo) === 1; fa.nombre.focus(); }); });
    r.querySelectorAll("[data-agprobar]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { var x = await API.post("api/rrhh.php?action=probar_wa", { agente_id: Number(b.dataset.agprobar) }); U.toast(x.texto, "success"); }); }); });
    var fc = document.getElementById("en-cfg");
    if (fc) fc.addEventListener("submit", function (ev) { ev.preventDefault(); var d = Object.fromEntries(new FormData(fc)); d.activo = fc.activo.checked; d.limite_dia = Number(d.limite_dia); d.meses_conservar = Number(d.meses_conservar); hacer(ev.submitter, async function () { await API.put("api/rrhh.php?action=config", d); U.toast("✓ Guardado", "success"); await recargar(); }); });
  }

  window.icc = window.icc || {};
  window.icc.entrevistas = { view: view };
})();
