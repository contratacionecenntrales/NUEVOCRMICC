/* =============================================================================
   ICC CRM · Zona de agentes (#/zona-agentes)
   17 agentes de IA por departamentos (con Jefatura de ventas y Coordinadores de equipo), Sala de cierre, agente de voz, Para aprobar, tareas, ritmo hacia el
   objetivo, laboratorio A/B, cerebro, calidad, cierre, cobros y registro.
   Dirección y jefes de equipo (aprobar y lanzar turnos: dirección). API: api/equipo.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null, tab: "equipo", x: null };
  var AUT = { observa: "Solo observa", propone: "Propone", actua: "Actúa" };
  var RIESGO = { lectura: "Lectura", bajo: "Riesgo bajo", alto: "Riesgo alto" };
  var TOOL = {
    preparar_presupuesto: "Preparar presupuesto", proponer_alternativa: "Proponer alternativa sin descuento", marcar_perdido: "Marcar como perdido",
    reasignar_contacto: "Pasar a otro gestor", crear_cobro: "Crear cobro", recordar_cobro: "Recordatorio de pago", preparar_contrato: "Preparar contrato",
    enviar_correo_cliente: "Correo al cliente", cambiar_instrucciones: "Cambiar instrucciones de un agente", programar_llamada: "Programar llamada",
    encargar_a_gestor: "Plan para un gestor", pausar_campana: "Pausar campaña", asignar_tarea: "Encargar tarea",
  };
  var ICONO_DEP = { "Dirección": "🧭", "Operaciones": "⚙️", "Marketing": "📣", "Innovación": "🧪", "Ventas": "🤝", "Finanzas": "💶", "Tecnología": "🛠️" };

  function main() { return document.getElementById("icc-main"); }
  function fecha(f) { if (!f) return "—"; return new Date(String(f).replace(" ", "T")).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function eur(n) { return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"; }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Cargando la Zona de agentes…</div>';
    try { S.d = await API.get("api/equipo.php?action=estado"); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    await cargar();
    pintar();
  }
  async function cargar() {
    var mapa = { autofix: "autofix", sala: "sala", voz: "voz", aprobar: "aprobar", tareas: "tareas", lab: "lab", cerebro: "cerebro", calidad: "calidad", cierre: "cierre", cobros: "cobros", registro: "registro", ajustes: "config" };
    S.x = null;
    if (mapa[S.tab]) { try { S.x = await API.get("api/equipo.php?action=" + mapa[S.tab]); } catch (e) { U.toast(e.message, "error"); } }
  }

  function pintar() {
    var d = S.d;
    var html = '<div class="icc-ia icc-mo icc-eq">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">IA · Empresa autónoma</span><h1>🧠 Zona de agentes</h1>' +
      "<p>20 agentes de IA en 7 departamentos trabajan por turnos sobre el CRM. Hacen lo de riesgo bajo; <b>presupuestos, contratos, cobros, correos a clientes y perdidos siempre esperan a una persona</b>. Marcar un cobro como pagado o un cliente como firmado solo lo hacen personas.</p>" +
      '<div class="icc-ia-estado">' + pill(d.activo ? "● Trabajando" : "⏸ Apagada", d.activo ? "ok" : "aviso") + pill(d.ia ? "Con IA" : "Sin IA: manual de reglas", d.ia ? "ok" : "aviso") +
      "<span>Turnos hoy " + d.turnos_hoy + " de " + d.turnos_dia + "</span>" + (d.pendientes ? pill("✍️ " + d.pendientes + " para aprobar", "aviso") : "") + "</div></div></section>" +
      '<nav class="icc-tabs icc-mo-tabs" role="tablist">' +
      [["equipo", "👥 Equipo"], ["aprobar", "✍️ Para aprobar" + (d.pendientes ? " <b>" + d.pendientes + "</b>" : "")], ["tareas", "📋 Tareas"], ["ritmo", "🎯 Ritmo"], ["lab", "🧪 Laboratorio"],
        ["cerebro", "🧠 Cerebro"], ["calidad", "🔍 Calidad"], ["sala", "🔥 Sala de cierre"], ["cierre", "🤝 Cadencia"], ["autofix", "🛠️ Autocorrector"]].concat(d.es_config ? [["voz", "📞 Agente de voz"]] : []).concat(d.es_dir ? [["cobros", "💶 Cobros"]] : []).concat([["registro", "🧾 Registro"], ["ajustes", "⚙️ Ajustes"]])
        .map(function (t) { return '<button type="button" role="tab" class="icc-tab' + (S.tab === t[0] ? " is-active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") +
      '</nav><div id="eq-cuerpo">' + cuerpo() + "</div></div>";
    main().innerHTML = html;
    enlazar();
  }

  function cuerpo() {
    var f = { autofix: autofix, sala: sala, voz: voz, equipo: equipo, aprobar: aprobar, tareas: tareas, ritmo: ritmo, lab: lab, cerebro: cerebro, calidad: calidad, cierre: cierre, cobros: cobros, registro: registro, ajustes: ajustes }[S.tab];
    if (S.tab !== "equipo" && S.tab !== "ritmo" && !S.x) return '<p class="icc-empty">No se pudo cargar.</p>';
    return f();
  }

  /* -------------------------------------------------------------- EQUIPO */
  function equipo() {
    var deps = {};
    S.d.agentes.forEach(function (a) { (deps[a.departamento] = deps[a.departamento] || []).push(a); });
    return Object.keys(deps).map(function (dep) {
      return '<section class="icc-eq-dep"><h2>' + (ICONO_DEP[dep] || "") + " " + esc(dep) + '</h2><div class="icc-eq-agentes">' + deps[dep].map(function (a) {
        var u = a.ultimo;
        var jefe = a.jefe ? S.d.agentes.filter(function (x) { return x.id === a.jefe; })[0] : null;
        return '<article class="icc-card icc-eq-agente"><header><div><strong>' + esc(a.nombre) + "</strong><small>" + (jefe ? "Reporta a " + esc(jefe.nombre.split(" ·")[0]) : "Dirige la empresa") + " · turno cada " + (a.cada_min >= 60 ? a.cada_min / 60 + " h" : a.cada_min + " min") + "</small></div>" +
          '<span class="icc-eq-nota is-' + (a.puntuacion >= 80 ? "ok" : a.puntuacion >= 60 ? "aviso" : "mal") + '" title="Puntuación semanal">' + a.puntuacion + "</span></header>" +
          '<p class="icc-eq-mision">' + esc(a.mision) + "</p>" +
          '<div class="icc-mo-chips">' + pill(AUT[a.autonomia], a.autonomia === "actua" ? "aviso" : "") + (a.pendientes ? pill(a.pendientes + " para aprobar", "aviso") : "") + (a.tareas ? pill(a.tareas + " tareas", "") : "") + "</div>" +
          (u ? '<p class="icc-eq-ultimo"><b>' + (Number(u.ok) ? "✓" : "✕") + " " + esc(fecha(u.inicio)) + (Number(u.ia) ? " · IA" : " · manual") + "</b> " + esc(String(u.resumen || u.error || "").slice(0, 220)) + "</p>" : '<p class="icc-eq-ultimo">Todavía no ha trabajado.</p>') +
          (S.d.es_dir ? '<button class="icc-btn icc-btn-secondary icc-mo-mini" data-turno="' + a.id + '">▶ Turno ahora</button>' : "") + "</article>";
      }).join("") + "</div></section>";
    }).join("");
  }

  /* ------------------------------------------------------------- APROBAR */
  function aprobar() {
    var x = S.x;
    if (!x.acciones.length) return '<p class="icc-empty">No hay nada esperando aprobación.</p>' + decididas(x.decididas);
    return '<div class="icc-mo-msgs">' + x.acciones.map(function (a) {
      var args = a.args || {};
      var editable = a.herramienta === "enviar_correo_cliente";
      var det = Object.keys(args).filter(function (k) { return !(editable && (k === "asunto" || k === "cuerpo")); }).map(function (k) { return "<li><b>" + esc(k.replace(/_/g, " ")) + ":</b> " + esc(args[k]) + "</li>"; }).join("");
      return '<article class="icc-card icc-mo-msg" data-accion="' + a.id + '"><header><div><strong>' + esc(TOOL[a.herramienta] || a.herramienta) + (a.razon_social ? " · " + esc(a.razon_social) : "") + "</strong>" +
        "<small>Propuesto por " + esc(a.agente_nombre) + " · " + esc(fecha(a.ts)) + "</small></div>" + pill(RIESGO[a.riesgo], a.riesgo === "alto" ? "aviso" : "") + "</header>" +
        '<p class="icc-muted">' + esc(a.descripcion) + "</p>" + (det ? '<ul class="icc-eq-args">' + det + "</ul>" : "") +
        (editable ? '<input class="icc-input" data-arg="asunto" value="' + esc(args.asunto) + '" aria-label="Asunto"><textarea class="icc-input" rows="7" data-arg="cuerpo" aria-label="Texto">' + esc(args.cuerpo) + "</textarea>" : "") +
        (a.motivo ? '<p class="icc-ia-err">⚠ Falta un dato: ' + esc(a.motivo) + "</p>" : "") +
        (S.x.es_dir ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" data-decidir="1">✓ Aprobar</button><button class="icc-btn icc-btn-ghost" data-decidir="0">Rechazar</button></div>' : '<p class="icc-ia-nota">Lo aprueba dirección.</p>') + "</article>";
    }).join("") + "</div>" + decididas(x.decididas);
  }
  function decididas(l) {
    if (!l || !l.length) return "";
    return '<section class="icc-card icc-ia-bloque"><h2>Decidido recientemente</h2><ul class="icc-ia-lista">' + l.map(function (a) {
      return "<li><div><strong>" + esc(TOOL[a.herramienta] || a.herramienta) + " · " + esc(a.agente_nombre) + "</strong><small>" + esc(fecha(a.decidido_en)) + " · " + esc(a.decidido_por_nombre || "") + (a.resultado ? " · " + esc(a.resultado) : "") + "</small></div>" +
        pill(a.estado === "aprobada" ? "Aprobada" : "Rechazada", a.estado === "aprobada" ? "ok" : "mal") + "</li>";
    }).join("") + "</ul></section>";
  }

  /* -------------------------------------------------------------- TAREAS */
  function tareas() {
    var t = S.x.tareas;
    if (!t.length) return '<p class="icc-empty">Sin tareas.</p>';
    return '<section class="icc-card icc-ia-bloque"><ul class="icc-ia-lista icc-eq-tareas">' + t.map(function (x) {
      return '<li><div><strong>' + esc(x.titulo) + "</strong><small>Para " + esc(x.agente_nombre || x.usuario_nombre || "—") + " · de " + esc(x.origen) + (x.razon_social ? " · " + esc(x.razon_social) : "") + (x.vence ? " · vence " + esc(x.vence) : "") + "</small>" +
        (x.detalle ? "<p>" + esc(x.detalle) + "</p>" : "") + "</div>" +
        (x.estado === "abierta" ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-secondary icc-mo-mini" data-tarea="' + x.id + '" data-estado="hecha">Hecha</button><button class="icc-btn icc-btn-ghost icc-mo-mini" data-tarea="' + x.id + '" data-estado="cancelada">Cancelar</button></div>'
          : pill(x.estado === "hecha" ? "Hecha" : "Cancelada", x.estado === "hecha" ? "ok" : "")) + "</li>";
    }).join("") + "</ul></section>";
  }

  /* --------------------------------------------------------------- RITMO */
  function ritmo() {
    var r = S.d.ritmo;
    var NOM = { cierre: "Propuesta → cliente", propuesta: "Auditoría → propuesta", estudio: "Lead → auditoría", respuesta: "Correo → interesado" };
    var html = '<section class="icc-card icc-ia-bloque"><h2>🎯 Ritmo hacia el objetivo del mes</h2>' +
      (r.sin_objetivo ? '<p class="icc-mo-aviso">Todavía no hay objetivo de facturación. Fíjalo en Ajustes y el CEO calculará al revés cuánto hace falta en cada paso.</p>' :
        '<div class="icc-mo-kpis">' + [["Objetivo", eur(r.objetivo_mes)], ["Facturado", eur(r.facturado_mes)], ["Falta", eur(r.falta)], ["Ticket medio", eur(r.ticket_medio)], ["Paso más estrecho", NOM[r.paso_mas_estrecho] || r.paso_mas_estrecho]]
          .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>•</span><b>' + esc(k[1]) + "</b><small>" + k[0] + "</small></div>"; }).join("") + "</div>" +
        '<h3 class="icc-eq-h3">Lo que hace falta cada semana</h3><div class="icc-eq-embudo">' +
        [["contactos", "Empresas a contactar"], ["interesados", "Interesados"], ["estudios", "Auditorías"], ["propuestas", "Propuestas"], ["clientes", "Clientes"]].map(function (p, i) {
          return '<div style="--w:' + (100 - i * 14) + '%"><b>' + Number(r.por_semana[p[0]]).toLocaleString("es-ES") + "</b><span>" + p[1] + "</span></div>";
        }).join("") + "</div>" +
        (r.capacidad_llega ? '<p class="icc-ia-resultado is-ok">✓ La capacidad de envío (' + r.capacidad_envio_semana + " por semana) llega.</p>" : '<p class="icc-ia-resultado is-mal">⚠ La capacidad de envío (' + r.capacidad_envio_semana + " por semana) no llega: hacen falta " + r.por_semana.contactos + ".</p>")) +
      '<h3 class="icc-eq-h3">Tasas reales de los últimos 90 días</h3><ul class="icc-ia-uso">' + Object.keys(r.tasas).map(function (k) {
        return "<li><span>" + esc(NOM[k] || k) + "</span><b>" + String(r.tasas[k]).replace(".", ",") + " %</b><small>" + r.muestras[k] + " casos" + (r.muestras[k] < 20 ? " · suavizada con valores de referencia" : "") + "</small></li>";
      }).join("") + "</ul></section>";
    return html;
  }

  /* ----------------------------------------------------------------- LAB */
  function lab() {
    var x = S.x;
    var EST = { propuesto: ["Propuesto", ""], en_marcha: ["En marcha", "ok"], ganador: ["Con ganador", "ok"], sin_diferencia: ["Sin diferencia", ""], detenido: ["Detenido", "mal"] };
    var html = '<section class="icc-card icc-ia-bloque"><h2>🧪 Experimentos</h2><p class="icc-muted">Las empresas se reparten al azar entre dos campañas. Decide una prueba de dos proporciones (mínimo 30 envíos por variante, p &lt; 0,10) y se frena si una variante supera el 5 % de bajas. El ganador pasa al cerebro y Copy lo fija como estándar del sector.</p>' +
      (x.experimentos.length ? '<div class="icc-mo-camps">' + x.experimentos.map(function (e) {
        var var2 = e.tipo === "nicho" ? x.sectores[e.sector_b] : x.angulos[e.variante_b];
        return '<article class="icc-card icc-mo-camp"><header><div><strong>#' + e.id + " · " + (e.tipo === "nicho" ? "Nicho" : "Ángulo") + " · " + esc(x.sectores[e.sector] || e.sector) + "</strong><small>" + esc(e.hipotesis || "") + "</small></div>" + pill(EST[e.estado][0], EST[e.estado][1]) + "</header>" +
          '<div class="icc-eq-ab"><div' + (e.ganador === "A" ? ' class="is-gana"' : "") + "><b>A</b> " + esc(e.tipo === "nicho" ? x.sectores[e.sector] : x.angulos[e.variante_a]) + (e.a ? "<small>" + e.a.positivas + "/" + e.a.enviados + " positivas · " + e.a.bajas + " bajas</small>" : "") + "</div>" +
          "<div" + (e.ganador === "B" ? ' class="is-gana"' : "") + "><b>B</b> " + esc(var2) + (e.b ? "<small>" + e.b.positivas + "/" + e.b.enviados + " positivas · " + e.b.bajas + " bajas</small>" : "") + "</div></div>" +
          (e.resultado ? '<p class="icc-ia-nota">' + esc(e.resultado) + "</p>" : "") +
          (x.es_dir && (e.estado === "propuesto" || e.estado === "en_marcha") ? '<div class="icc-ia-fila">' + (e.estado === "propuesto" ? '<button class="icc-btn icc-btn-primary icc-mo-mini" data-exp="' + e.id + '" data-acc="lanzar">Lanzar</button>' : '<button class="icc-btn icc-btn-secondary icc-mo-mini" data-exp="' + e.id + '" data-acc="evaluar">Evaluar ahora</button>') +
            '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-exp="' + e.id + '" data-acc="detener">Detener</button></div>' : "") + "</article>";
      }).join("") + "</div>" : '<p class="icc-muted">Aún no hay experimentos. Innovación propone uno en su turno, o créalo tú.</p>') + "</section>";
    if (x.es_dir) {
      var opS = Object.keys(x.sectores).map(function (k) { return '<option value="' + k + '">' + esc(x.sectores[k]) + "</option>"; }).join("");
      var opA = Object.keys(x.angulos).map(function (k) { return '<option value="' + k + '">' + esc(x.angulos[k]) + "</option>"; }).join("");
      html += '<section class="icc-card icc-ia-bloque"><h2>Nuevo experimento</h2><form id="eq-exp" class="icc-ia-form"><div class="icc-mo-2">' +
        '<label><span>Tipo</span><select class="icc-select" name="tipo"><option value="angulo">Ángulo del mensaje</option><option value="nicho">Nicho nuevo</option></select></label>' +
        '<label><span>Sector</span><select class="icc-select" name="sector">' + opS + "</select></label></div><div class=\"icc-mo-2\">" +
        '<label><span>Variante A (ángulo)</span><select class="icc-select" name="variante_a">' + opA + "</select></label>" +
        '<label><span>Variante B (ángulo) o nicho B</span><select class="icc-select" name="variante_b">' + opA + '</select><select class="icc-select" name="sector_b"><option value="">— nicho B —</option>' + opS + "</select></label></div>" +
        '<label><span>Hipótesis</span><input class="icc-input" name="hipotesis" placeholder="En talleres funciona mejor hablar de potencia"></label><button class="icc-btn icc-btn-primary" type="submit">Proponer</button></form></section>';
    }
    var c = x.cobertura;
    html += '<section class="icc-card icc-ia-bloque"><h2>🗺️ Cobertura del barrido de Asturias (90 días)</h2><p class="icc-muted">Consultas a Google hoy: ' + c.consultas_hoy + " de " + c.presupuesto + ". Cada casilla se vuelve a barrer a los 90 días.</p>" +
      '<div class="icc-eq-mapa"><table><thead><tr><th>Sector</th>' + c.comarcas.map(function (k) { return "<th>" + esc(k) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      c.filas.map(function (f) {
        return "<tr" + (f.activo ? "" : ' class="is-off"') + "><th>" + esc(f.nombre) + "</th>" + c.comarcas.map(function (k) {
          var v = f.comarcas[k], p = v.total ? v.hechas / v.total : 0;
          return '<td style="--p:' + p.toFixed(2) + '" title="' + v.hechas + " de " + v.total + " concejos · " + v.encontradas + ' empresas">' + (v.hechas ? Math.round(p * 100) + "%" : "") + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div></section>";
    html += queFunciona(x.que_funciona, x.angulos, x.sectores);
    return html;
  }
  function queFunciona(q, angulos, sectores) {
    var bloque = function (t, filas, nombre) {
      return '<div><h3 class="icc-eq-h3">' + t + "</h3>" + (filas.length ? '<ul class="icc-ia-uso">' + filas.map(function (f) {
        return "<li><span>" + esc(nombre(f.clave)) + "</span><b>" + String(f.tasa).replace(".", ",") + " %</b><small>" + f.positivas + " positivas de " + f.enviados + " envíos · " + f.bajas + " bajas</small></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Sin datos.</p>') + "</div>";
    };
    return '<section class="icc-card icc-ia-bloque"><h2>📈 Qué funciona (90 días)</h2><div class="icc-eq-tres">' +
      bloque("Por ángulo", q.angulo, function (k) { return angulos[k] || k || "—"; }) + bloque("Por sector", q.sector, function (k) { return sectores[k] || k || "—"; }) + bloque("Por localidad", q.localidad, function (k) { return k || "—"; }) + "</div></section>";
  }

  /* ------------------------------------------------------------- CEREBRO */
  function cerebro() {
    var x = S.x;
    var TIP = { casa: "🏠 Regla de la casa", regla: "📏 Regla", aviso: "⚠️ Aviso", aprendizaje: "💡 Aprendizaje" };
    return '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>🧠 Lo que saben todos los agentes</h2><p class="icc-muted">Todos lo leen al empezar su turno.</p>' +
      (x.memoria.length ? '<ul class="icc-ia-lista">' + x.memoria.map(function (m) {
        return "<li><div><strong>" + TIP[m.tipo] + (m.tipo === "aprendizaje" ? " · " + m.confianza + " %" : "") + "</strong><p>" + esc(m.texto) + "</p><small>" + esc(m.evidencia || "") + (m.autor ? " · " + esc(m.autor) : m.agente ? " · " + esc(m.agente) : "") + "</small></div>" +
          (x.es_dir ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-olvidar="' + m.id + '">Quitar</button>' : "") + "</li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Vacío.</p>') + "</section>" +
      (x.es_dir ? '<section class="icc-card icc-ia-bloque"><h2>Añadir regla de la casa</h2><form id="eq-mem" class="icc-ia-form"><label><span>Tipo</span><select class="icc-select" name="tipo"><option value="casa">Regla de la casa</option><option value="regla">Regla</option><option value="aviso">Aviso</option></select></label>' +
        '<label><span>Texto</span><textarea class="icc-input" name="texto" rows="3" required placeholder="Nunca llamar a hostelería entre 13:00 y 16:00"></textarea></label><label><span>Por qué (opcional)</span><input class="icc-input" name="evidencia"></label>' +
        '<button class="icc-btn icc-btn-primary" type="submit">Guardar</button></form></section>' : "") + "</div>" + queFunciona(x.que_funciona, x.angulos, x.sectores);
  }

  /* ------------------------------------------------------------- CALIDAD */
  function calidad() {
    var x = S.x;
    return '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><h2>🔍 Hallazgos</h2>' + (x.es_dir ? '<button class="icc-btn icc-btn-secondary icc-mo-mini" id="eq-auditar">Auditar ahora</button>' : "") + "</div>" +
      (x.hallazgos.length ? '<ul class="icc-ia-lista">' + x.hallazgos.map(function (h) {
        return "<li><div><strong>" + esc(h.texto) + "</strong><small>" + esc(h.evidencia || "") + " · responsable: " + esc(h.responsable_nombre) + " · " + esc(fecha(h.created_at)) + "</small></div>" +
          pill(h.estado === "abierto" ? h.gravedad : h.estado, h.estado !== "abierto" ? "ok" : h.gravedad === "alta" ? "mal" : "aviso") +
          (x.es_dir && h.estado === "abierto" ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-hallazgo="' + h.id + '">Descartar</button>' : "") + "</li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Sin hallazgos. 👌</p>') + '<p class="icc-ia-nota">Cada hallazgo se encarga como tarea y se cierra solo cuando deja de darse.</p></section>' +
      '<section class="icc-card icc-ia-bloque"><h2>Puntuación semanal</h2><p class="icc-muted">Por debajo de 60, su jefe lo revisa y puede proponer nuevas instrucciones (las aprueba dirección).</p><ul class="icc-ia-uso">' +
      x.puntuaciones.map(function (p) { return "<li><span>" + esc(p.nombre) + "</span><b class=\"icc-eq-nota is-" + (p.puntuacion >= 80 ? "ok" : p.puntuacion >= 60 ? "aviso" : "mal") + '">' + p.puntuacion + "</b><small>" + (p.jefe ? "Jefe: " + esc(p.jefe) : "") + "</small></li>"; }).join("") + "</ul></section></div>";
  }

  /* -------------------------------------------------------------- CIERRE */
  function cierre() {
    var x = S.x;
    var T = { correo_resumen: "Correo de resumen", llamada: "Llamada del gestor", correo_valor: "Correo de valor", escalado: "Escalado", correo_ruptura: "¿Cierro tu expediente?", decision: "Decisión" };
    return '<section class="icc-card icc-ia-bloque"><h2>🤝 Cadencia de cierre</h2><div class="icc-eq-toques">' + x.toques.map(function (t, i) { return "<div><b>Día " + t.dia + "</b><span>" + (i + 1) + " · " + T[t.tipo] + "</span></div>"; }).join("") + "</div>" +
      '<p class="icc-muted">Solo el presupuesto más reciente de cada cliente. Una demo, visita o firma agendada pausa la cadencia. Los correos al cliente y la decisión final esperan aprobación.</p>' +
      (x.cierre.length ? '<ul class="icc-ia-lista">' + x.cierre.map(function (c) {
        return '<li><div><strong><a href="#/clientes/' + c.cliente_id + '">' + esc(c.razon_social) + "</a></strong><small>" + esc(c.gestor || "Sin gestor") + " · toque " + c.toque + " de 6" + (c.valor_estimado ? " · " + eur(c.valor_estimado) : "") + "</small></div>" +
          '<div class="icc-eq-temp" title="Temperatura"><i style="--t:' + c.temperatura + '%"></i><span>' + c.temperatura + "°</span></div>" + pill(c.estado === "pausado" ? "Pausada (cita agendada)" : c.estado === "decision" ? "Decisión" : "En curso", c.estado === "pausado" ? "ok" : c.estado === "decision" ? "aviso" : "") + "</li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Ningún presupuesto en cadencia todavía.</p>') + "</section>";
  }

  /* ------------------------------------------------------ SALA DE CIERRE */
  var ACC = { llamada: "📞 Llamada", visita: "🚗 Visita", backoffice: "🗂️ Estudio a backoffice", firma: "✍️ Firma", escalar: "🤝 Jefe de equipo" };
  var PEST = { borrador: "Sin factura", factura_subida: "Factura subida", estudio_adjunto: "Estudio hecho", documentacion_contrato: "Documentación" };
  function sala() {
    var x = S.x, T = x.tecnicas, voz = x.voz.activo && x.voz.configurado;
    var parados = x.parados.filter(function (p) { return p.parado; }).length;
    var html = '<section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><div><h2>🔥 Sala de cierre</h2><p class="icc-muted">La <b>Jefatura de ventas</b> revisa cada hora todos los presupuestos abiertos y aplica la técnica que toca. <b>Da caña al equipo, nunca al cliente</b>: ningún presupuesto parado más de 48 h, urgencia solo con fechas reales y sin descuentos. Los correos al cliente esperan aprobación.</p></div>' +
      (x.es_dir ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" id="eq-empujar">🔥 Empujar los ' + parados + ' parados</button><button class="icc-btn icc-btn-secondary" id="eq-partes">📨 Enviar partes a los jefes</button></div>' : "") + "</div>" +
      '<div class="icc-mo-kpis icc-eq-salakpi">' + [["📂", x.parados.length, "Presupuestos abiertos"], ["🧊", parados, "Parados sin acción"], ["🤖", voz ? "Encendido" : "Apagado", "Agente de voz"],
        ["🏆", x.equipos.reduce(function (a, e) { return a + e.ganados_30; }, 0), "Ganados 30 días"], ["⏰", x.equipos.reduce(function (a, e) { return a + e.atrasadas; }, 0), "Llamadas atrasadas"]]
        .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>' + k[0] + "</span><b>" + esc(k[1]) + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
      (x.parados.length ? '<div class="icc-eq-sala">' + x.parados.map(function (p) {
        var t = T[p.tecnica];
        return '<article class="icc-eq-pres' + (p.parado ? " is-parado" : "") + '"><div class="icc-eq-pres-cab"><div><strong><a href="#/clientes/' + p.id + '">' + esc(p.razon_social) + "</a></strong><small>" + esc((p.gestor || "Sin gestor").trim()) + " · " + esc(PEST[p.pestado] || p.pestado) + " · " + p.dias + " días sin movimiento" + (p.proxima ? " · próxima cita " + esc(fecha(p.proxima)) : "") + "</small></div>" +
          (p.parado ? pill("Parado", "aviso") : pill("En marcha", "ok")) + "</div>" +
          '<div class="icc-eq-tec"><b>' + esc(t[0]) + "</b> → " + esc(ACC[p.accion] || p.accion) + (p.grande ? " · cuenta grande" : "") + (p.permanencia_cerca ? " · fin de permanencia cerca" : "") + "<small>" + esc(t[2]) + "</small></div>" +
          '<div class="icc-ia-fila"><button class="icc-btn icc-btn-secondary icc-mo-mini" data-empujar="' + p.id + '">Empujar ahora</button>' +
          (voz ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-vozllamar="' + p.id + '" data-motivo="' + (p.tecnica === "pedir_factura" ? "pedir_factura" : p.tecnica === "presentar_en_caliente" ? "presentar_estudio" : "seguimiento") + '">🤖 Llamar con IA</button>' : "") + "</div></article>";
      }).join("") + "</div>" : '<p class="icc-muted">No hay presupuestos abiertos.</p>') + "</section>";
    html += '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">👥 Coordinadores de equipo</h2><p class="icc-ia-nota">Cada mañana cada jefe de equipo recibe el parte de su equipo y una tarea de 15 minutos con quien se queda atrás (3 o más parados o llamadas atrasadas).</p><div class="icc-mo-camps">' +
      x.equipos.map(function (e) {
        return '<article class="icc-card icc-mo-camp"><header><div><strong>' + esc(e.jefe) + "</strong><small>" + e.gestores.length + " personas · " + e.ganados_30 + " ganados en 30 días</small></div>" + (e.parados ? pill(e.parados + " parados", "aviso") : pill("Al día", "ok")) + "</header>" +
          '<ol class="icc-eq-rank">' + e.gestores.map(function (g) { return "<li><span>" + esc(g.nombre) + "</span><small>" + g.ganados_30 + " ganados · " + g.abiertos + " abiertos" + (g.parados ? " · <b>" + g.parados + " parados</b>" : "") + (g.llamadas_atrasadas ? " · <b>" + g.llamadas_atrasadas + " llamadas atrasadas</b>" : "") + " · " + g.citas_7 + " citas en 7 días</small></li>"; }).join("") + "</ol></article>";
      }).join("") + "</div></section>";
    html += '<section class="icc-card icc-ia-bloque"><h2>📚 Manual de técnicas de cierre</h2><div class="icc-eq-tecnicas">' + Object.keys(T).map(function (k) {
      return "<div><b>" + esc(T[k][0]) + "</b><span>" + esc(T[k][1]) + "</span><small>" + esc(T[k][2]) + "</small></div>"; }).join("") + "</div></section>";
    html += '<section class="icc-card icc-ia-bloque"><h2>🤖 Llamadas del agente de voz</h2>' + (x.llamadas.length ? '<ul class="icc-ia-lista">' + x.llamadas.map(function (l) {
      return "<li><div><strong>" + esc(l.razon_social || l.nombre || l.telefono) + "</strong><small>" + esc(fecha(l.created_at)) + " · " + esc(x.motivos[l.motivo] || l.motivo) + " · " + esc(l.origen) + (l.duracion ? " · " + Math.round(l.duracion / 60 * 10) / 10 + " min" : "") + "</small>" +
        (l.resumen ? "<small>" + esc(l.resumen) + "</small>" : "") + (l.acciones ? "<small>✓ " + esc(l.acciones) + "</small>" : "") + (l.error && l.estado !== "terminada" ? '<small class="icc-ia-err">' + esc(l.error) + "</small>" : "") + "</div>" +
        pill(l.resultado ? (x.resultados[l.resultado] || l.resultado) : { pendiente: "Pendiente", en_curso: "En curso", error: "Error", descartada: "No llamada", terminada: "Terminada" }[l.estado], l.resultado && ["interesado_factura", "cita_visita", "cita_llamada"].indexOf(l.resultado) !== -1 ? "ok" : l.estado === "error" || l.estado === "descartada" ? "aviso" : "") + "</li>";
    }).join("") + "</ul>" : '<p class="icc-muted">Todavía no hay llamadas.</p>') + "</section>";
    return html;
  }

  /* ------------------------------------------------------- AUTOCORRECTOR */
  function autofix() {
    var x = S.x, c = x.config;
    var EST = { persona: ["Necesita a una persona", "aviso"], abierta: ["Arreglándose", ""], arreglada: ["Arreglado", "ok"] };
    var item = function (m) {
      return '<li><div><strong>' + esc(m.titulo) + "</strong><small>" + esc(m.proceso) + " · " + esc(fecha(m.ultima)) + (Number(m.veces) > 1 ? " · se ha repetido " + m.veces + " veces" : "") + (Number(m.intentos) ? " · " + m.intentos + " intentos" : "") + "</small>" +
        (m.detalle ? "<small>" + esc(m.detalle) + "</small>" : "") + (m.accion ? "<small>✓ " + esc(m.accion) + "</small>" : "") + "</div>" +
        '<div class="icc-ia-fila">' + pill(EST[m.estado][0], EST[m.estado][1]) + (m.enlace && m.estado !== "arreglada" ? '<a class="icc-btn icc-btn-ghost icc-mo-mini" href="' + esc(m.enlace) + '">Ir</a>' : "") + "</div></li>";
    };
    var grupo = function (est, titulo) { var l = x.memoria.filter(function (m) { return m.estado === est; }); return l.length ? '<h3 class="icc-eq-h3">' + titulo + " (" + l.length + ')</h3><ul class="icc-ia-lista">' + l.map(item).join("") + "</ul>" : ""; };
    var dis = x.es_config ? "" : " disabled";
    return '<section class="icc-card icc-ia-bloque"><div class="icc-mo-cab"><div><h2>🛠️ Autocorrector</h2><p class="icc-muted">Cada 10 minutos, también de noche, revisa todos los procesos y <b>arregla solo lo que requiere acción</b>: enciende lo que estaba apagado, pasa el mantenimiento del pipeline con llamadas, vuelve a conectar buzones, reprocesa correos atascados, reintenta envíos, pasa al gestor las llamadas de IA sin resultado y vuelve a lanzar los procesos que fallaron. Recuerda cada incidencia: como mucho 3 intentos y, si no se arregla, avisa a dirección con instrucciones. Nunca aprueba lo que por diseño decide una persona.</p>' +
      "<small>" + (x.ultimo ? "Última revisión: " + esc(fecha(x.ultimo)) : "Todavía no ha revisado") + "</small></div>" +
      (x.es_dir ? '<button class="icc-btn icc-btn-primary" id="eq-autofix">🛠️ Revisar y arreglar ahora</button>' : "") + "</div>" +
      '<div class="icc-mo-kpis icc-eq-salakpi">' + [["🧑‍💼", x.contadores.persona, "Necesitan a una persona"], ["🔧", x.contadores.abierta, "Arreglándose"], ["✅", x.contadores.arreglada, "Arreglados"]]
        .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
      (x.memoria.length ? grupo("persona", "🧑‍💼 Necesita a una persona") + grupo("abierta", "🔧 Arreglándose") + grupo("arreglada", "✅ Arreglado") : '<p class="icc-muted">Nada requiere acción.</p>') + "</section>" +
      '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>🧠 Memoria y aprendizajes</h2>' + (x.aprendido.length ? '<ul class="icc-ia-lista">' + x.aprendido.map(function (a) { return "<li><div><strong>" + esc(a.texto) + "</strong><small>" + esc(a.evidencia) + " · " + esc(fecha(a.created_at)) + "</small></div></li>"; }).join("") + "</ul>" : '<p class="icc-muted">Cuando un problema se repite 3 veces, lo anota aquí y en el Cerebro de la empresa para buscar la causa.</p>') + "</section>" +
      '<section class="icc-card icc-ia-bloque"><h2>Ajustes</h2><form id="eq-autofix-cfg" class="icc-ia-form">' +
      '<label class="icc-ia-switch"><input type="checkbox" name="activo"' + (c.activo ? " checked" : "") + dis + "><span><b>Autocorrector encendido</b><small>Cada 10 minutos.</small></span></label>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="interruptores"' + (c.interruptores ? " checked" : "") + dis + "><span><b>Encender lo que esté apagado</b><small>Zona de agentes, automatizaciones de la oficina, mantenimiento del pipeline y aprendizaje.</small></span></label>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="perdidos"' + (c.perdidos ? " checked" : "") + dis + "><span><b>Cerrar oportunidades sin vida</b><small>Primero una llamada de rescate; si a los 14 días sigue igual, pasa a Perdido y se vuelve a contactar a los 90 días.</small></span></label>" +
      (x.es_config ? '<button class="icc-btn icc-btn-primary icc-mo-mini" type="submit">Guardar</button>' : "") + '</form><p class="icc-ia-nota">También puedes pedírselo a Jarvis: «¿Qué requiere acción?» o «Arregla lo que requiere acción».</p></section></div>';
  }

  /* -------------------------------------------------------- AGENTE DE VOZ */
  function voz() {
    var c = S.x;
    var ch = function (n, t, s2) { return '<label class="icc-ia-switch"><input type="checkbox" name="' + n + '"' + (c[n] ? " checked" : "") + "><span><b>" + t + "</b>" + (s2 ? "<small>" + s2 + "</small>" : "") + "</span></label>"; };
    return '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>📞 Agente de voz (Vapi + Telnyx o Twilio)</h2><form id="eq-voz" class="icc-ia-form" autocomplete="off">' +
      ch("activo", "Agente de voz encendido", "Llama en el horario fijado, se presenta como asistente de IA y respeta «No contactar».") +
      '<label><span>Clave privada de Vapi</span><input class="icc-input" type="password" name="clave" autocomplete="new-password" placeholder="' + (c.tiene_clave ? "•••• guardada" : "Pega la clave privada") + '"></label>' +
      '<div class="icc-mo-2"><label><span>ID del asistente</span><input class="icc-input" name="assistant_id" value="' + esc(c.assistant_id) + '"></label><label><span>ID del número de teléfono</span><input class="icc-input" name="phone_number_id" value="' + esc(c.phone_number_id) + '"></label></div>' +
      '<div class="icc-mo-2"><label><span>Llamadas al día (máximo)</span><input class="icc-input" type="number" min="1" max="500" name="limite_dia" value="' + c.limite_dia + '"></label><label><span>Horario de llamadas</span><input class="icc-input" name="horario" value="' + esc(c.horario) + '" placeholder="09:00-14:00,16:00-19:30"></label></div>' +
      ch("solo_laborables", "Solo días laborables") +
      ch("auto_leads", "Llamar a los leads nuevos en minutos", "Automatización «Lead nuevo» y SDR. Han pedido que les contactemos.") +
      ch("auto_cierre", "La Jefatura de ventas llama a los presupuestos parados", "Seguimiento de clientes con presupuesto abierto.") +
      ch("frio", "Permitir llamadas en frío (solo sociedades)", "Apagado por defecto. Solo a empresas con CIF de sociedad (nunca autónomos ni particulares), sin «No contactar» y como mucho 2 intentos por semana. Revisa antes la normativa de llamadas comerciales.") +
      '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" type="submit">Guardar</button><button type="button" class="icc-btn icc-btn-secondary" id="eq-voz-probar">Probar conexión</button></div></form></section>' +
      '<section class="icc-card icc-ia-bloque"><h2>Cómo dejarlo listo en Vapi</h2><ol class="icc-eq-pasos">' +
      "<li>En Vapi, importa tu número de Telnyx o Twilio (Phone Numbers) y copia su ID aquí.</li>" +
      "<li>Crea un asistente: modelo de OpenAI, voz en español y este <b>primer mensaje</b>:<pre class=\"icc-mo-pre\">" + esc(c.primer_mensaje) + "</pre></li>" +
      '<li>Pega este <b>prompt</b> como instrucciones del sistema (usa las variables {{empresa}}, {{nombre}}, {{sector}}, {{servicio}}, {{motivo}} y {{gestor}} que manda el CRM):<textarea class="icc-input" rows="8" readonly id="eq-voz-prompt">' + esc(c.prompt) + '</textarea><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" data-copiar="eq-voz-prompt">Copiar prompt</button></li>' +
      '<li>En «Server URL» del asistente pon <code>' + esc(c.webhook) + '</code> y como secreto (cabecera X-Vapi-Secret): <input class="icc-input" readonly id="eq-voz-sec" value="' + esc(c.secreto) + '"><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" data-copiar="eq-voz-sec">Copiar secreto</button></li>' +
      "<li>Activa el informe de fin de llamada (end-of-call-report). Copia el ID del asistente aquí, guarda y pulsa «Probar conexión».</li></ol>" +
      '<p class="icc-ia-nota">Al terminar cada llamada, el CRM lee el resumen: si quedó en enviar la factura, etiqueta su interés y programa el seguimiento; si quiere visita (cuentas grandes), la pone en la agenda del gestor; si pide que no le llamemos, marca «No contactar».</p></section></div>';
  }

  /* -------------------------------------------------------------- COBROS */
  function cobros() {
    var x = S.x;
    return '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>💶 Cobros por hitos pendientes</h2>' +
      (x.cobros.length ? '<ul class="icc-ia-lista">' + x.cobros.map(function (c) {
        return "<li><div><strong>" + esc(c.concepto) + " · " + eur(c.importe) + "</strong><small>" + esc(c.razon_social || "") + (c.hito ? " · " + esc(c.hito) : "") + " · vence " + esc(c.vence || "—") + (Number(c.recordatorios) ? " · " + c.recordatorios + " recordatorios" : "") + "</small></div>" +
          '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary icc-mo-mini" data-cobro="' + c.id + '" data-acc="pagado">Marcar pagado</button><button class="icc-btn icc-btn-ghost icc-mo-mini" data-cobro="' + c.id + '" data-acc="anular">Anular</button></div></li>';
      }).join("") + "</ul>" : '<p class="icc-muted">Sin cobros pendientes.</p>') + '<p class="icc-ia-nota">Solo una persona marca un cobro como pagado.</p></section>' +
      '<section class="icc-card icc-ia-bloque"><h2>Proformas vencidas (más de 30 días)</h2>' + (x.proformas_vencidas.length ? '<ul class="icc-ia-lista">' + x.proformas_vencidas.map(function (p) {
        return "<li><div><strong>" + esc(p.numero) + " · " + eur(p.importe) + "</strong><small>" + esc(p.cliente_email || "") + " · " + esc(p.fecha) + "</small></div></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Ninguna.</p>') + "</section></div>";
  }

  /* ------------------------------------------------------------ REGISTRO */
  function registro() {
    var x = S.x;
    return '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>Turnos</h2><ul class="icc-ia-lista">' + x.turnos.map(function (t) {
      return "<li><div><strong>" + esc(t.agente_nombre) + "</strong><small>" + esc(fecha(t.inicio)) + " · " + (Number(t.ia) ? "IA, " + t.rondas + " rondas" : "manual") + " · " + t.acciones + " acciones · " + esc(t.origen) + "</small><p>" + esc(String(t.resumen || t.error || "").slice(0, 300)) + "</p></div>" + pill(Number(t.ok) ? "OK" : "Error", Number(t.ok) ? "ok" : "mal") + "</li>";
    }).join("") + "</ul></section>" +
      (x.acciones.length ? '<section class="icc-card icc-ia-bloque"><h2>Acciones</h2><ul class="icc-ia-lista">' + x.acciones.map(function (a) {
        return "<li><div><strong>" + esc(TOOL[a.herramienta] || a.herramienta.replace(/_/g, " ")) + " · " + esc(a.agente_nombre) + "</strong><small>" + esc(fecha(a.ts)) + " · " + RIESGO[a.riesgo] + "</small>" + (a.resultado ? "<p>" + esc(a.resultado) + "</p>" : "") + "</div>" +
          pill(a.estado, a.estado === "hecha" || a.estado === "aprobada" ? "ok" : a.estado === "pendiente" ? "aviso" : "mal") + "</li>";
      }).join("") + "</ul></section>" : "") + "</div>";
  }

  /* ------------------------------------------------------------- AJUSTES */
  function ajustes() {
    var c = S.x;
    var dis = c.es_config ? "" : " disabled";
    return '<form id="eq-cfg" class="icc-mo-cfg">' + (c.es_config ? "" : '<p class="icc-mo-aviso">Solo la administración puede cambiar estos ajustes.</p>') +
      '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>General</h2><div class="icc-ia-form">' +
      '<label class="icc-ia-switch"><input type="checkbox" name="activo"' + (c.activo ? " checked" : "") + dis + "><span><b>Interruptor general</b><small>Apagada, los agentes no hacen turnos automáticos.</small></span></label>" +
      '<div class="icc-mo-2"><label><span>Desde</span><input class="icc-input" type="time" name="hora_desde" value="' + esc(c.hora_desde) + '"' + dis + '></label><label><span>Hasta</span><input class="icc-input" type="time" name="hora_hasta" value="' + esc(c.hora_hasta) + '"' + dis + "></label></div>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="solo_laborables"' + (c.solo_laborables ? " checked" : "") + dis + "><span><b>Solo días laborables</b></span></label>" +
      '<div class="icc-mo-2"><label><span>Turnos al día</span><input class="icc-input" type="number" name="turnos_dia" value="' + c.turnos_dia + '"' + dis + '></label><label><span>Acciones por agente y día</span><input class="icc-input" type="number" name="acciones_agente" value="' + c.acciones_agente + '"' + dis + "></label></div>" +
      '<label><span>Objetivo de facturación del mes (€)</span><input class="icc-input" type="number" name="objetivo_mes" min="0" step="100" value="' + c.objetivo_mes + '"' + dis + "></label></div></section>" +
      '<section class="icc-card icc-ia-bloque"><h2>Autonomía por puesto</h2><p class="icc-muted">«Actúa» hace también lo de riesgo alto, salvo lo que siempre espera a una persona.</p><div class="icc-eq-aut">' +
      Object.keys(c.agentes).map(function (k) {
        var v = c.autonomia[k] || "propone";
        return "<label><span>" + esc(c.agentes[k]) + '</span><select class="icc-select" name="aut_' + k + '"' + dis + ">" + Object.keys(AUT).map(function (o) { return '<option value="' + o + '"' + (v === o ? " selected" : "") + ">" + AUT[o] + "</option>"; }).join("") + "</select></label>";
      }).join("") + "</div></section></div>" +
      '<section class="icc-card icc-ia-bloque"><h2>🗺️ Barrido de Asturias</h2><div class="icc-ia-form"><label><span>Consultas a Google al día</span><input class="icc-input" type="number" name="barrido_presupuesto" value="' + c.barrido_presupuesto + '"' + dis + "></label>" +
      '<div class="icc-eq-sect">' + Object.keys(c.sectores).map(function (k) { return '<label><input type="checkbox" name="sect" value="' + k + '"' + (c.barrido_sectores.indexOf(k) !== -1 ? " checked" : "") + dis + "> " + esc(c.sectores[k]) + "</label>"; }).join("") + "</div>" +
      '<label class="icc-ia-switch"><input type="checkbox" name="barrido_autonomo"' + (c.barrido_autonomo ? " checked" : "") + (c.aviso_legal ? dis : " disabled") + "><span><b>Envío autónomo de lo barrido</b><small>" + (c.aviso_legal ? "Sin revisar cada correo." : "Necesita aceptar antes el aviso legal en el Motor.") + "</small></span></label></div></section>" +
      (c.es_config ? '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary" type="submit">Guardar ajustes</button></div>' : "") + "</form>";
  }

  /* ------------------------------------------------------------- EVENTOS */
  function enlazar() {
    var r = main();
    r.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", async function () { S.tab = b.dataset.tab; await cargar(); pintar(); }); });
    var recargar = async function () { S.d = await API.get("api/equipo.php?action=estado"); await cargar(); pintar(); };
    r.querySelectorAll("[data-turno]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.textContent = "Trabajando…";
        hacer(b, async function () { var x = await API.post("api/equipo.php?action=turno", { agente: b.dataset.turno }); U.toast(x.ok ? "✓ " + String(x.resumen).slice(0, 160) : "✕ " + x.error, x.ok ? "success" : "error"); await recargar(); });
      });
    });
    r.querySelectorAll("[data-decidir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var art = b.closest("[data-accion]");
        var datos = { id: Number(art.dataset.accion), aprobar: b.dataset.decidir === "1" };
        var as = art.querySelector('[data-arg="asunto"]');
        if (as && datos.aprobar) {
          var orig = S.x.acciones.filter(function (a) { return a.id == art.dataset.accion; })[0].args;
          datos.args = Object.assign({}, orig, { asunto: as.value, cuerpo: art.querySelector('[data-arg="cuerpo"]').value });
        }
        hacer(b, async function () { var x = await API.post("api/equipo.php?action=decidir", datos); U.toast(datos.aprobar ? "✓ " + (x.resultado || "Aprobado") : "Rechazado: no se ha creado nada", "success"); await recargar(); });
      });
    });
    r.querySelectorAll("[data-tarea]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { await API.post("api/equipo.php?action=tarea", { id: Number(b.dataset.tarea), estado: b.dataset.estado }); await recargar(); }); }); });
    r.querySelectorAll("[data-exp]").forEach(function (b) {
      b.addEventListener("click", function () { hacer(b, async function () { var x = await API.post("api/equipo.php?action=experimento_accion", { id: Number(b.dataset.exp), accion: b.dataset.acc }); U.toast(x.texto, "success"); await recargar(); }); });
    });
    var exp = document.getElementById("eq-exp");
    if (exp) exp.addEventListener("submit", function (ev) { ev.preventDefault(); var f = Object.fromEntries(new FormData(exp)); hacer(ev.submitter, async function () { await API.post("api/equipo.php?action=experimento", f); U.toast("✓ Experimento propuesto", "success"); await recargar(); }); });
    var mem = document.getElementById("eq-mem");
    if (mem) mem.addEventListener("submit", function (ev) { ev.preventDefault(); hacer(ev.submitter, async function () { await API.post("api/equipo.php?action=memoria", Object.fromEntries(new FormData(mem))); U.toast("✓ Guardado en el cerebro", "success"); await recargar(); }); });
    r.querySelectorAll("[data-olvidar]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { await API.post("api/equipo.php?action=memoria_quitar", { id: Number(b.dataset.olvidar) }); await recargar(); }); }); });
    var afx = document.getElementById("eq-autofix");
    if (afx) afx.addEventListener("click", function () { afx.textContent = "Revisando…"; hacer(afx, async function () { var x = await API.post("api/equipo.php?action=autofix", {}); U.toast("✓ " + x.texto, "success"); await recargar(); }); });
    var afc = document.getElementById("eq-autofix-cfg");
    if (afc) afc.addEventListener("submit", function (ev) { ev.preventDefault(); hacer(ev.submitter, async function () { await API.put("api/equipo.php?action=autofix", { activo: afc.activo.checked, interruptores: afc.interruptores.checked, perdidos: afc.perdidos.checked }); U.toast("✓ Guardado", "success"); await recargar(); }); });
    var emp = document.getElementById("eq-empujar");
    if (emp) emp.addEventListener("click", function () { hacer(emp, async function () { var x = await API.post("api/equipo.php?action=empujar", {}); U.toast(String(x.texto).slice(0, 220), "success"); await recargar(); }); });
    var par = document.getElementById("eq-partes");
    if (par) par.addEventListener("click", function () { hacer(par, async function () { var x = await API.post("api/equipo.php?action=partes", {}); U.toast(x.texto, "success"); }); });
    r.querySelectorAll("[data-empujar]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { var x = await API.post("api/equipo.php?action=empujar", { cliente_id: Number(b.dataset.empujar) }); U.toast(String(x.texto).slice(0, 220), "success"); await recargar(); }); }); });
    r.querySelectorAll("[data-vozllamar]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { var x = await API.post("api/equipo.php?action=voz_llamar", { cliente_id: Number(b.dataset.vozllamar), motivo: b.dataset.motivo }); U.toast(x.texto, "success"); await recargar(); }); }); });
    r.querySelectorAll("[data-copiar]").forEach(function (b) { b.addEventListener("click", function () { var el = document.getElementById(b.dataset.copiar); el.select(); try { navigator.clipboard.writeText(el.value); } catch (e) { document.execCommand("copy"); } U.toast("Copiado", "success"); }); });
    var fv = document.getElementById("eq-voz");
    if (fv) {
      fv.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var d = { clave: fv.clave.value, assistant_id: fv.assistant_id.value.trim(), phone_number_id: fv.phone_number_id.value.trim(), limite_dia: Number(fv.limite_dia.value), horario: fv.horario.value.trim() };
        ["activo", "solo_laborables", "auto_leads", "auto_cierre", "frio"].forEach(function (k) { d[k] = fv[k].checked; });
        hacer(ev.submitter, async function () { await API.put("api/equipo.php?action=voz", d); U.toast("✓ Agente de voz guardado", "success"); await recargar(); });
      });
      var pv = document.getElementById("eq-voz-probar");
      pv.addEventListener("click", function () { hacer(pv, async function () { var x = await API.post("api/equipo.php?action=voz_probar", {}); U.toast(x.texto, "success"); }); });
    }
    var aud = document.getElementById("eq-auditar");
    if (aud) aud.addEventListener("click", function () { hacer(aud, async function () { var x = await API.post("api/equipo.php?action=auditar", {}); U.toast(x.texto, "success"); await recargar(); }); });
    r.querySelectorAll("[data-hallazgo]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { await API.post("api/equipo.php?action=hallazgo", { id: Number(b.dataset.hallazgo), accion: "descartar" }); await recargar(); }); }); });
    r.querySelectorAll("[data-cobro]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirm(b.dataset.acc === "pagado" ? "¿Confirmas que este cobro está pagado?" : "¿Anular este cobro?")) return;
        hacer(b, async function () { await API.post("api/equipo.php?action=cobro", { id: Number(b.dataset.cobro), accion: b.dataset.acc }); await recargar(); });
      });
    });
    var cfg = document.getElementById("eq-cfg");
    if (cfg) cfg.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var aut = {};
      Object.keys(S.x.agentes).forEach(function (k) { aut[k] = cfg["aut_" + k].value; });
      hacer(ev.submitter, async function () {
        await API.put("api/equipo.php?action=config", {
          activo: cfg.activo.checked, hora_desde: cfg.hora_desde.value, hora_hasta: cfg.hora_hasta.value, solo_laborables: cfg.solo_laborables.checked,
          turnos_dia: Number(cfg.turnos_dia.value), acciones_agente: Number(cfg.acciones_agente.value), objetivo_mes: Number(cfg.objetivo_mes.value), autonomia: aut,
          barrido_presupuesto: Number(cfg.barrido_presupuesto.value), barrido_autonomo: cfg.barrido_autonomo.checked,
          barrido_sectores: Array.prototype.map.call(cfg.querySelectorAll('[name="sect"]:checked'), function (x) { return x.value; }),
        });
        U.toast("✓ Ajustes guardados", "success");
        await recargar();
      });
    });
  }

  window.icc.equipo = { view: view };
})();
