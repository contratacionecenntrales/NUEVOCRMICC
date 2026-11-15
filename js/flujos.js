/* =============================================================================
   ICC CRM · Automatizaciones y Embudos (#/automatizaciones)
   Lista de flujos con estadísticas, 11 plantillas, editor visual del árbol
   (inspector para editar, añadir o quitar pasos), formulario web y registro.
   Dirección y jefes de equipo. API: api/flujos.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null, ed: null, sel: null, det: null };
  var COND = { etiqueta: "Tiene la etiqueta", fase: "Está en la fase", cita_futura: "Tiene una cita futura", presupuesto_aceptado: "Presupuesto aceptado", tiene_telefono: "Tiene teléfono", tiene_email: "Tiene correo", origen: "Origen es" };
  var VARS = "{{nombre}} {{empresa}} {{gestor}} {{fecha_cita}} {{presupuesto}} {{importe}}";

  function main() { return document.getElementById("icc-main"); }
  function fecha(f) { if (!f) return "—"; return new Date(String(f).replace(" ", "T")).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Cargando las automatizaciones…</div>';
    try { S.d = await API.get("api/flujos.php?action=lista"); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    var m = /[?&]id=(\d+)/.exec(location.hash);
    if (m) return abrir(Number(m[1]));
    S.ed = null;
    pintarLista();
  }

  /* --------------------------------------------------------------- LISTA */
  function pintarLista() {
    var d = S.d;
    var html = '<div class="icc-ia icc-mo icc-fl">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">IA · Embudos sin n8n ni Make</span><h1>⚡ Automatizaciones y Embudos</h1>' +
      "<p>Un flujo es un <b>disparador</b>, un <b>árbol de pasos</b> y un <b>objetivo</b>. Quien llega al objetivo (una fase, una reunión real, un presupuesto aceptado o una etiqueta) sale del embudo. Nunca se escribe a quien tiene «No contactar» o pidió la baja.</p>" +
      '<div class="icc-ia-estado">' + pill(d.flujos.filter(function (f) { return f.estado === "activo"; }).length + " activos", "ok") + (d.buzon ? "" : pill("Sin buzón de salida: configúralo en el Motor", "aviso")) + "</div></div>" +
      '<button class="icc-btn icc-btn-primary" id="fl-nuevo">＋ Flujo en blanco</button></section>';
    html += '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">Tus flujos</h2>' + (d.flujos.length ? '<div class="icc-mo-camps">' + d.flujos.map(function (f) {
      var s = f.stats;
      return '<article class="icc-card icc-mo-camp"><header><div><strong>' + esc(f.nombre) + "</strong><small>⚡ " + esc(d.disparadores[f.disparador]) + " · " + Object.keys(f.pasos.nodos || {}).length + " pasos</small></div>" +
        pill(f.estado === "activo" ? "Activo" : f.estado === "pausado" ? "En pausa" : "Borrador", f.estado === "activo" ? "ok" : "aviso") + "</header>" +
        '<div class="icc-mo-nums">' + [["En curso", s.en_curso], ["Terminados", s.terminados], ["Objetivo", s.objetivo], ["Conversión", s.conversion + "%"], ["Correos", s.correos], ["Tareas", s.tareas], ["A / B", s.a + " / " + s.b]]
          .map(function (x) { return "<div><b>" + x[1] + "</b><small>" + x[0] + "</small></div>"; }).join("") + "</div>" +
        '<div class="icc-ia-fila"><button class="icc-btn icc-btn-primary icc-mo-mini" data-abrir="' + f.id + '">Abrir editor</button>' +
        '<button class="icc-btn icc-btn-secondary icc-mo-mini" data-estado="' + (f.estado === "activo" ? "pausado" : "activo") + '" data-id="' + f.id + '">' + (f.estado === "activo" ? "⏸ Pausar" : "▶ Activar") + "</button></div></article>";
    }).join("") + "</div>" : '<p class="icc-muted">Todavía no hay flujos. Empieza por una plantilla: se activan en dos clics y se pueden editar.</p>') + "</section>";
    ["basica", "profesional"].forEach(function (g) {
      html += '<section class="icc-ia-bloque"><h2 class="icc-fl-h2">' + (g === "basica" ? "📦 Automáticas básicas" : "🚀 Embudos profesionales") + '</h2><div class="icc-fl-plantillas">' +
        d.plantillas.filter(function (p) { return p.grupo === g; }).map(function (p) {
          return '<article class="icc-card icc-fl-plantilla"><strong>' + esc(p.nombre) + "</strong><small>⚡ " + esc(d.disparadores[p.disparador]) + " · " + p.pasos + ' pasos</small><button class="icc-btn icc-btn-secondary icc-mo-mini" data-plantilla="' + p.clave + '">Usar plantilla</button></article>';
        }).join("") + "</div></section>";
    });
    main().innerHTML = html + "</div>";
    var r = main();
    document.getElementById("fl-nuevo").addEventListener("click", function () {
      S.ed = { id: 0, nombre: "Nuevo flujo", descripcion: "", disparador: "lead_nuevo", disparador_cfg: {}, filtro: {}, objetivo: {}, solo_horario: true, estado: "borrador", gracias_url: "", pasos: { inicio: "p1", nodos: { p1: { tipo: "aviso", cfg: { mensaje: "Nuevo contacto: {{empresa}}", a: "gestor" }, sig: null } } } };
      S.det = { stats: { por_paso: {} }, registro: [] }; S.sel = "p1"; pintarEditor();
    });
    r.querySelectorAll("[data-abrir]").forEach(function (b) { b.addEventListener("click", function () { location.hash = "#/automatizaciones?id=" + b.dataset.abrir; }); });
    r.querySelectorAll("[data-plantilla]").forEach(function (b) {
      b.addEventListener("click", function () { hacer(b, async function () { var x = await API.post("api/flujos.php?action=plantilla", { clave: b.dataset.plantilla }); U.toast("✓ Flujo creado en borrador: revísalo y actívalo", "success"); location.hash = "#/automatizaciones?id=" + x.id; }); });
    });
    r.querySelectorAll("[data-estado]").forEach(function (b) {
      b.addEventListener("click", function () { hacer(b, async function () { await API.post("api/flujos.php?action=estado", { id: Number(b.dataset.id), estado: b.dataset.estado }); await view(); }); });
    });
  }

  /* -------------------------------------------------------------- EDITOR */
  async function abrir(id) {
    try { S.det = await API.get("api/flujos.php?action=flujo&id=" + id); } catch (e) { U.toast(e.message, "error"); location.hash = "#/automatizaciones"; return; }
    S.ed = JSON.parse(JSON.stringify(S.det.flujo));
    if (Array.isArray(S.ed.disparador_cfg)) S.ed.disparador_cfg = {};
    if (Array.isArray(S.ed.filtro)) S.ed.filtro = {};
    if (Array.isArray(S.ed.objetivo)) S.ed.objetivo = {};
    S.sel = S.ed.pasos.inicio;
    pintarEditor();
  }

  function salidas(n) {
    if (n.tipo === "condicion" || n.tipo === "esperar_condicion") return [["si", n.tipo === "esperar_condicion" ? "Se cumple" : "Sí"], ["no", n.tipo === "esperar_condicion" ? "No a tiempo" : "No"]];
    if (n.tipo === "ab") return [["a", "A"], ["b", "B"]];
    return [["sig", ""]];
  }
  function resumen(n) {
    var c = n.cfg || {};
    switch (n.tipo) {
      case "correo": return c.asunto || "(sin asunto)";
      case "esperar": return (c.cantidad || 0) + " " + (c.unidad || "dias").replace("dias", "días");
      case "esperar_cita": return (c.horas || 24) + " h antes de la cita";
      case "esperar_condicion": return (COND[c.tipo] || "…") + (c.valor ? " «" + c.valor + "»" : "") + " · máx. " + (c.max_horas || 48) + " h";
      case "condicion": return (COND[c.tipo] || "…") + (c.valor ? " «" + c.valor + "»" : "");
      case "ab": return "Mitad A, mitad B al azar";
      case "tarea": return c.titulo || "Tarea";
      case "llamada": return (c.en_minutos ? "En " + c.en_minutos + " min · " : "") + (c.motivo || "Llamada");
      case "whatsapp": return String(c.mensaje || "").slice(0, 60);
      case "fase": return S.d.fases[c.estado] || "Elige la fase";
      case "etiqueta": return (c.quitar ? "Quita " : "Pone ") + (c.etiqueta || "…");
      case "reparto": return "Al siguiente gestor por turno";
      case "aviso": return (c.a === "direccion" ? "A dirección: " : "Al gestor: ") + String(c.mensaje || "").slice(0, 50);
      case "webhook": return c.url || "https://…";
    }
    return "";
  }

  function arbol() {
    var p = S.ed.pasos, hechos = {}, n = 0, orden = {};
    Object.keys(p.nodos).forEach(function (k) { orden[k] = ++n; });
    var porPaso = (S.det && S.det.stats && S.det.stats.por_paso) || {};
    function nodo(id) {
      if (!id) return '<div class="icc-fl-fin">🏁 Fin</div>';
      if (hechos[id]) return '<button type="button" class="icc-fl-salto" data-nodo="' + id + '">↪ Sigue en el paso ' + orden[id] + "</button>";
      hechos[id] = 1;
      var x = p.nodos[id];
      var t = S.d.pasos[x.tipo] || ["•", x.tipo];
      var h = '<button type="button" class="icc-fl-nodo' + (S.sel === id ? " is-sel" : "") + '" data-nodo="' + id + '"><span class="icc-fl-ico">' + t[0] + '</span><span class="icc-fl-txt"><b>' + orden[id] + " · " + esc(t[1]) + "</b><small>" + esc(resumen(x)) + "</small></span>" +
        (porPaso[id] ? '<span class="icc-fl-cuenta" title="Contactos en este paso">' + porPaso[id] + "</span>" : "") + "</button>";
      var sal = salidas(x);
      if (sal.length === 1) return h + '<div class="icc-fl-linea"></div>' + nodo(x.sig);
      return h + '<div class="icc-fl-ramas">' + sal.map(function (s) { return '<div class="icc-fl-rama"><span class="icc-fl-etq">' + s[1] + '</span><div class="icc-fl-linea"></div>' + nodo(x[s[0]]) + "</div>"; }).join("") + "</div>";
    }
    return '<div class="icc-fl-disp">⚡ ' + esc(S.d.disparadores[S.ed.disparador]) + '</div><div class="icc-fl-linea"></div>' + nodo(p.inicio);
  }

  function campo(etq, html) { return "<label><span>" + etq + "</span>" + html + "</label>"; }
  function inp(k, v, extra) { return '<input class="icc-input" data-cfg="' + k + '" value="' + esc(v == null ? "" : v) + '"' + (extra || "") + ">"; }
  function sel(k, v, ops) { return '<select class="icc-select" data-cfg="' + k + '">' + Object.keys(ops).map(function (o) { return '<option value="' + o + '"' + (String(v) === o ? " selected" : "") + ">" + esc(ops[o]) + "</option>"; }).join("") + "</select>"; }

  function inspector() {
    var id = S.sel, x = S.ed.pasos.nodos[id];
    if (!x) return '<p class="icc-muted">Elige un paso del diagrama.</p>';
    var c = x.cfg || {}, f = "";
    switch (x.tipo) {
      case "correo": f = campo("Asunto", inp("asunto", c.asunto)) + campo("Texto", '<textarea class="icc-input" rows="8" data-cfg="cuerpo">' + esc(c.cuerpo) + "</textarea>") + '<p class="icc-ia-nota">Variables: ' + VARS + ". La firma del gestor y el pie de baja los pone el sistema.</p>"; break;
      case "esperar": f = '<div class="icc-mo-2">' + campo("Cantidad", inp("cantidad", c.cantidad, ' type="number" min="0"')) + campo("Unidad", sel("unidad", c.unidad || "dias", { minutos: "Minutos", horas: "Horas", dias: "Días" })) + "</div>"; break;
      case "esperar_cita": f = campo("Horas antes de la cita", inp("horas", c.horas || 24, ' type="number" min="1"')); break;
      case "esperar_condicion": case "condicion":
        f = campo("Condición", sel("tipo", c.tipo || "etiqueta", COND)) + campo("Valor (etiqueta, fase u origen)", inp("valor", c.valor)) + (x.tipo === "esperar_condicion" ? campo("Esperar como máximo (horas)", inp("max_horas", c.max_horas || 48, ' type="number" min="1"')) : ""); break;
      case "tarea": f = campo("Tarea", inp("titulo", c.titulo)) + campo("Dentro de (horas)", inp("en_horas", c.en_horas || 24, ' type="number" min="0"')); break;
      case "llamada": f = campo("Motivo", inp("motivo", c.motivo)) + campo("Dentro de (minutos)", inp("en_minutos", c.en_minutos || 0, ' type="number" min="0"')); break;
      case "whatsapp": f = campo("Mensaje", '<textarea class="icc-input" rows="4" data-cfg="mensaje">' + esc(c.mensaje) + "</textarea>") + '<p class="icc-ia-nota">Crea una tarea al gestor con el mensaje listo y el enlace wa.me.</p>'; break;
      case "fase": f = campo("Nueva fase", sel("estado", c.estado || "estudio_backoffice", S.d.fases)); break;
      case "etiqueta": f = campo("Etiqueta", inp("etiqueta", c.etiqueta, ' list="fl-etq"')) + '<label class="icc-ia-switch"><input type="checkbox" data-cfg="quitar"' + (c.quitar ? " checked" : "") + "><span><b>Quitarla en vez de ponerla</b></span></label>"; break;
      case "reparto": f = '<label class="icc-ia-switch"><input type="checkbox" data-cfg="forzar"' + (c.forzar ? " checked" : "") + "><span><b>Repartir aunque ya tenga gestor</b></span></label>"; break;
      case "aviso": f = campo("Mensaje", inp("mensaje", c.mensaje)) + campo("Para", sel("a", c.a || "gestor", { gestor: "Su gestor", direccion: "Dirección" })); break;
      case "webhook": f = campo("URL (https)", inp("url", c.url, ' placeholder="https://hook.eu1.make.com/…"')) + '<p class="icc-ia-nota">Envía los datos del contacto en JSON (Make, n8n, Zapier o tu proveedor de WhatsApp). Solo la administración puede añadirlos.</p>'; break;
      default: f = '<p class="icc-muted">Este paso no necesita ajustes.</p>';
    }
    var tipos = Object.keys(S.d.pasos).map(function (k) { return '<option value="' + k + '">' + S.d.pasos[k][0] + " " + esc(S.d.pasos[k][1]) + "</option>"; }).join("");
    var sal = salidas(x);
    return '<h3 class="icc-eq-h3">' + S.d.pasos[x.tipo][0] + " " + esc(S.d.pasos[x.tipo][1]) + '</h3><div class="icc-ia-form" id="fl-cfg">' + f + "</div>" +
      '<div class="icc-fl-anadir"><span>Añadir paso ' + (sal.length > 1 ? "en la rama" : "después") + "</span>" +
      (sal.length > 1 ? '<select class="icc-select" id="fl-rama">' + sal.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + "</select>" : "") +
      '<select class="icc-select" id="fl-tipo">' + tipos + '</select><button type="button" class="icc-btn icc-btn-secondary icc-mo-mini" id="fl-add">＋ Añadir</button></div>' +
      '<div class="icc-ia-fila"><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" id="fl-add-antes">＋ Paso antes del primero</button><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" id="fl-del">🗑 Quitar este paso</button></div>';
  }

  function pintarEditor() {
    var e = S.ed, d = S.d;
    var dc = e.disparador_cfg || {}, ob = e.objetivo || {}, fi = e.filtro || {};
    var cfgDisp = "";
    if (e.disparador === "fase_cambiada") cfgDisp = '<select class="icc-select" id="fl-d-fase"><option value="">Cualquier fase</option>' + Object.keys(d.fases).map(function (k) { return '<option value="' + k + '"' + (dc.fase === k ? " selected" : "") + ">" + d.fases[k] + "</option>"; }).join("") + "</select>";
    if (e.disparador === "etiqueta_anadida") cfgDisp = '<input class="icc-input" id="fl-d-etq" list="fl-etq" placeholder="Etiqueta" value="' + esc(dc.etiqueta || "") + '">';
    if (e.disparador === "dias_sin_actividad") cfgDisp = '<input class="icc-input" id="fl-d-dias" type="number" min="1" value="' + esc(dc.dias || 30) + '" aria-label="Días">';
    if (e.disparador === "cita_agendada" || e.disparador === "cita_realizada") cfgDisp = '<select class="icc-select" id="fl-d-cita"><option value="">Cualquier tipo</option>' + ["visita", "reunion", "llamada", "firma", "seguimiento"].map(function (t) { return '<option value="' + t + '"' + (dc.tipo_cita === t ? " selected" : "") + ">" + t + "</option>"; }).join("") + "</select>";
    var html = '<div class="icc-ia icc-mo icc-fl">' +
      '<div class="icc-fl-cab"><a href="#/automatizaciones" class="icc-btn icc-btn-ghost icc-mo-mini">← Flujos</a>' +
      '<input class="icc-input icc-fl-nombre" id="fl-nombre" value="' + esc(e.nombre) + '" aria-label="Nombre del flujo">' +
      pill(e.estado === "activo" ? "Activo" : e.estado === "pausado" ? "En pausa" : "Borrador", e.estado === "activo" ? "ok" : "aviso") +
      '<button class="icc-btn icc-btn-primary" id="fl-guardar">💾 Guardar</button>' +
      (e.id ? '<button class="icc-btn icc-btn-secondary" id="fl-activar">' + (e.estado === "activo" ? "⏸ Pausar" : "▶ Activar") + "</button>" : "") + "</div>" +
      '<datalist id="fl-etq">' + (d.etiquetas || []).map(function (t) { return '<option value="' + esc(t.etiqueta) + '">'; }).join("") + '<option value="Urgente"></datalist>' +
      '<section class="icc-card icc-ia-bloque"><div class="icc-fl-config">' +
      '<label><span>Disparador</span><select class="icc-select" id="fl-disp">' + Object.keys(d.disparadores).map(function (k) { return '<option value="' + k + '"' + (e.disparador === k ? " selected" : "") + ">" + esc(d.disparadores[k]) + "</option>"; }).join("") + "</select>" + cfgDisp + "</label>" +
      '<label><span>Solo si el origen es</span><select class="icc-select" id="fl-f-origen"><option value="">Cualquiera</option>' + ["motor", "formulario", "manual"].map(function (o) { return '<option value="' + o + '"' + (fi.origen === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></label>" +
      '<label><span>Solo del sector (contiene)</span><input class="icc-input" id="fl-f-sector" value="' + esc(fi.sector || "") + '"></label>' +
      '<fieldset class="icc-fl-obj"><legend>🎯 Objetivo: sale del embudo si…</legend>' +
      '<label><input type="checkbox" id="fl-o-cita"' + (ob.cita ? " checked" : "") + "> agenda una reunión real</label>" +
      '<label><input type="checkbox" id="fl-o-pres"' + (ob.presupuesto_aceptado ? " checked" : "") + "> acepta un presupuesto</label>" +
      '<label>llega a <select class="icc-select" id="fl-o-fase"><option value="">—</option>' + Object.keys(d.fases).map(function (k) { return '<option value="' + k + '"' + (ob.fase === k ? " selected" : "") + ">" + d.fases[k] + "</option>"; }).join("") + "</select></label>" +
      '<label>tiene la etiqueta <input class="icc-input" id="fl-o-etq" list="fl-etq" value="' + esc(ob.etiqueta || "") + '"></label></fieldset>' +
      '<label class="icc-ia-switch"><input type="checkbox" id="fl-horario"' + (e.solo_horario ? " checked" : "") + "><span><b>Enviar solo en horario laboral</b><small>Correos y WhatsApp de 9:00 a 19:00, laborables.</small></span></label></div></section>";
    if (e.disparador === "formulario") {
      var url = e.entrada_url || "(guarda el flujo para obtener la dirección)";
      var formHtml = '<form action="' + url + '" method="post">\n  <input name="nombre" placeholder="Nombre" required>\n  <input name="empresa" placeholder="Empresa">\n  <input name="email" type="email" placeholder="Correo">\n  <input name="telefono" placeholder="Teléfono">\n  <select name="urgencia"><option value="">¿Urgencia?</option><option>Alta</option><option>Normal</option></select>\n  <textarea name="mensaje" placeholder="¿En qué podemos ayudarle?"></textarea>\n  <input name="website" style="display:none" tabindex="-1" autocomplete="off">\n  <button>Enviar</button>\n</form>';
      html += '<section class="icc-card icc-ia-bloque"><h2>📝 Formulario de entrada</h2><p class="icc-muted">Pega este HTML en tu landing. Lleva un campo trampa antirrobots y admite como mucho 10 envíos por hora y conexión. Para integraciones: POST con JSON a la misma dirección. Si «urgencia» es alta o urgente, el contacto se etiqueta como <b>Urgente</b>.</p>' +
        '<label class="icc-ia-url"><span>Dirección</span><input class="icc-input" readonly value="' + esc(url) + '"></label>' +
        '<label class="icc-ia-url"><span>Página de gracias (opcional)</span><input class="icc-input" id="fl-gracias" value="' + esc(e.gracias_url || "") + '" placeholder="https://tu-web.es/gracias"></label>' +
        '<pre class="icc-mo-pre icc-fl-code">' + esc(formHtml) + "</pre></section>";
    }
    html += '<div class="icc-fl-editor"><section class="icc-card icc-fl-lienzo"><h2>Diagrama</h2><div class="icc-fl-arbol">' + arbol() + "</div></section>" +
      '<aside class="icc-card icc-fl-insp" id="fl-insp">' + inspector() + "</aside></div>";
    if (S.det && S.det.stats && e.id) {
      var s = S.det.stats;
      html += '<section class="icc-card icc-ia-bloque"><h2>📊 Estadísticas</h2><div class="icc-mo-nums icc-fl-nums">' + [["En curso", s.en_curso], ["Terminados", s.terminados], ["Objetivo", s.objetivo], ["Conversión", s.conversion + "%"], ["Correos", s.correos], ["Tareas", s.tareas], ["Variante A", s.a + " (" + s.a_obj + " obj.)"], ["Variante B", s.b + " (" + s.b_obj + " obj.)"], ["Salidos", s.salidos], ["Errores", s.errores]]
        .map(function (x) { return "<div><b>" + x[1] + "</b><small>" + x[0] + "</small></div>"; }).join("") + "</div>" +
        '<div class="icc-mo-2 icc-fl-insc"><div><h3 class="icc-eq-h3">Inscribir a mano</h3><div class="icc-ia-fila"><select class="icc-select" id="fl-i-fase"><option value="">Por fase…</option>' + Object.keys(d.fases).map(function (k) { return '<option value="' + k + '">' + d.fases[k] + "</option>"; }).join("") + "</select>" +
        '<input class="icc-input" id="fl-i-etq" list="fl-etq" placeholder="o por etiqueta"><button class="icc-btn icc-btn-secondary icc-mo-mini" id="fl-inscribir">Inscribir</button></div></div></div>' +
        '<h3 class="icc-eq-h3">Registro</h3><ul class="icc-ia-lista">' + (S.det.registro.length ? S.det.registro.map(function (r) {
          return "<li><div><strong>" + esc(r.accion) + (r.razon_social ? " · " + esc(r.razon_social) : "") + "</strong><small>" + esc(fecha(r.ts)) + (r.paso_id ? " · paso " + esc(r.paso_id) : "") + (r.detalle ? " · " + esc(r.detalle) : "") + "</small></div></li>";
        }).join("") : '<li><small class="icc-muted">Sin actividad todavía.</small></li>') + "</ul></section>";
    }
    main().innerHTML = html + "</div>";
    enlazarEditor();
  }

  function leerCabecera() {
    var e = S.ed, g = function (id) { var x = document.getElementById(id); return x ? x : null; };
    e.nombre = g("fl-nombre").value;
    e.disparador = g("fl-disp").value;
    var dc = {};
    if (g("fl-d-fase") && g("fl-d-fase").value) dc.fase = g("fl-d-fase").value;
    if (g("fl-d-etq") && g("fl-d-etq").value) dc.etiqueta = g("fl-d-etq").value;
    if (g("fl-d-dias")) dc.dias = Number(g("fl-d-dias").value) || 30;
    if (g("fl-d-cita") && g("fl-d-cita").value) dc.tipo_cita = g("fl-d-cita").value;
    if (e.disparador === "llamada_resultado") dc.resultado = "no_contesta";
    e.disparador_cfg = dc;
    e.filtro = {}; if (g("fl-f-origen").value) e.filtro.origen = g("fl-f-origen").value; if (g("fl-f-sector").value.trim()) e.filtro.sector = g("fl-f-sector").value.trim();
    e.objetivo = {}; if (g("fl-o-cita").checked) e.objetivo.cita = true; if (g("fl-o-pres").checked) e.objetivo.presupuesto_aceptado = true;
    if (g("fl-o-fase").value) e.objetivo.fase = g("fl-o-fase").value; if (g("fl-o-etq").value.trim()) e.objetivo.etiqueta = g("fl-o-etq").value.trim();
    e.solo_horario = g("fl-horario").checked;
    if (g("fl-gracias")) e.gracias_url = g("fl-gracias").value.trim();
  }
  function leerInspector() {
    var x = S.ed.pasos.nodos[S.sel];
    if (!x) return;
    document.querySelectorAll("#fl-cfg [data-cfg]").forEach(function (el) {
      var k = el.dataset.cfg;
      x.cfg = x.cfg || {};
      x.cfg[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
    });
  }
  function nuevoId() { var i = 1; while (S.ed.pasos.nodos["p" + i]) i++; return "p" + i; }
  function nodoNuevo(tipo, destino) {
    var n = { tipo: tipo, cfg: {} };
    if (tipo === "correo") n.cfg = { asunto: "Asunto", cuerpo: "Hola {{nombre}}:\n\n\n\nUn saludo,\n{{gestor}}" };
    if (tipo === "esperar") n.cfg = { cantidad: 1, unidad: "dias" };
    if (tipo === "fase") n.cfg = { estado: "estudio_backoffice" };
    if (tipo === "condicion" || tipo === "esperar_condicion") { n.cfg = { tipo: "cita_futura", valor: "", max_horas: 48 }; n.si = destino; n.no = null; }
    else if (tipo === "ab") { n.a = destino; n.b = null; }
    else n.sig = destino;
    return n;
  }

  function enlazarEditor() {
    var r = main();
    var repintar = function () { leerCabecera(); leerInspector(); pintarEditor(); };
    r.querySelectorAll("[data-nodo]").forEach(function (b) { b.addEventListener("click", function () { leerCabecera(); leerInspector(); S.sel = b.dataset.nodo; pintarEditor(); }); });
    ["fl-disp", "fl-d-fase"].forEach(function (id) { var x = document.getElementById(id); if (x) x.addEventListener("change", repintar); });
    r.querySelectorAll("#fl-cfg [data-cfg]").forEach(function (el) {
      el.addEventListener("change", function () { leerInspector(); var b = r.querySelector('.icc-fl-nodo[data-nodo="' + S.sel + '"] small'); if (b) b.textContent = resumen(S.ed.pasos.nodos[S.sel]); });
    });
    var add = document.getElementById("fl-add");
    if (add) add.addEventListener("click", function () {
      leerCabecera(); leerInspector();
      var p = S.ed.pasos.nodos[S.sel], rama = document.getElementById("fl-rama"), k = rama ? rama.value : "sig";
      var id = nuevoId();
      S.ed.pasos.nodos[id] = nodoNuevo(document.getElementById("fl-tipo").value, p[k] || null);
      p[k] = id;
      S.sel = id;
      pintarEditor();
    });
    var antes = document.getElementById("fl-add-antes");
    if (antes) antes.addEventListener("click", function () {
      leerCabecera(); leerInspector();
      var id = nuevoId();
      S.ed.pasos.nodos[id] = nodoNuevo(document.getElementById("fl-tipo").value, S.ed.pasos.inicio);
      S.ed.pasos.inicio = id;
      S.sel = id;
      pintarEditor();
    });
    var del = document.getElementById("fl-del");
    if (del) del.addEventListener("click", function () {
      var nodos = S.ed.pasos.nodos, x = nodos[S.sel];
      if (Object.keys(nodos).length === 1) { U.toast("El flujo necesita al menos un paso.", "error"); return; }
      var sal = salidas(x);
      if (sal.length > 1 && !confirm("Se quita la división y se conserva solo la rama «" + sal[0][1] + "». ¿Seguir?")) return;
      leerCabecera();
      var destino = x[sal[0][0]] || null;
      Object.keys(nodos).forEach(function (k) { salidas(nodos[k]).forEach(function (s) { if (nodos[k][s[0]] === S.sel) nodos[k][s[0]] = destino; }); });
      if (S.ed.pasos.inicio === S.sel) S.ed.pasos.inicio = destino;
      delete nodos[S.sel];
      if (!S.ed.pasos.inicio) { U.toast("El flujo necesita al menos un paso.", "error"); return; }
      S.sel = S.ed.pasos.inicio;
      pintarEditor();
    });
    document.getElementById("fl-guardar").addEventListener("click", function (ev) {
      leerCabecera(); leerInspector();
      var e = S.ed;
      hacer(ev.currentTarget, async function () {
        var x = await API.post("api/flujos.php?action=guardar", { id: e.id || 0, nombre: e.nombre, descripcion: e.descripcion, disparador: e.disparador, disparador_cfg: e.disparador_cfg, filtro: e.filtro, objetivo: e.objetivo, solo_horario: e.solo_horario, gracias_url: e.gracias_url, pasos: e.pasos });
        U.toast("✓ Flujo guardado", "success");
        S.d = await API.get("api/flujos.php?action=lista");
        if (location.hash !== "#/automatizaciones?id=" + x.id) location.hash = "#/automatizaciones?id=" + x.id; else await abrir(x.id);
      });
    });
    var act = document.getElementById("fl-activar");
    if (act) act.addEventListener("click", function () {
      hacer(act, async function () { await API.post("api/flujos.php?action=estado", { id: S.ed.id, estado: S.ed.estado === "activo" ? "pausado" : "activo" }); U.toast(S.ed.estado === "activo" ? "Flujo en pausa" : "✓ Flujo activo", "success"); await abrir(S.ed.id); });
    });
    var ins = document.getElementById("fl-inscribir");
    if (ins) ins.addEventListener("click", function () {
      hacer(ins, async function () { var x = await API.post("api/flujos.php?action=inscribir", { id: S.ed.id, fase: document.getElementById("fl-i-fase").value, etiqueta: document.getElementById("fl-i-etq").value }); U.toast("✓ " + x.inscritos + " contactos inscritos", "success"); await abrir(S.ed.id); });
    });
  }

  window.icc.flujos = { view: view };
})();
