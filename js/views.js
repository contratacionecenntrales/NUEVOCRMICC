/* =============================================================================
   ICC CRM · Vistas (render de pantallas + eventos)
   ============================================================================= */
window.icc = window.icc || {};

window.icc.views = (function () {
  var U = window.icc.util;
  var C = window.ICC_CONST;
  var D = window.icc.data;

  function main() {
    return document.getElementById("icc-main");
  }

  // --------------------------------------------------------------- Dashboard
  async function viewDashboard() {
    var st = window.icc.auth.state;
    var auth = window.icc.auth;
    var gestor = auth.esBackofficeOAdmin();
    main().innerHTML = '<div class="icc-loading">Cargando panel…</div>';
    var hoy = hoyIso();
    var [clientes, contratos, citasHoyLista, citasProximas, pipeline] = await Promise.all([
      D.listarClientes(),
      auth.puede("contratos.ver") ? D.listarContratos({}).catch(function () { return []; }) : Promise.resolve([]),
      // Jefes, backoffice y admin ven el dia de su equipo; el comercial, el suyo.
      auth.puede("agenda.ver") ? D.listarCitas(gestor ? { fecha: hoy } : { comercial_id: st.user.id, fecha: hoy }).catch(function () { return []; }) : Promise.resolve([]),
      auth.puede("agenda.ver") ? D.listarCitas({ comercial_id: st.user.id, desde: hoy }).catch(function () { return []; }) : Promise.resolve([]),
      window.icc.api.get("api/pipeline.php").catch(function () { return null; }),
    ]);

    var abiertas = ["programada", "confirmada", "reprogramada"];
    var citasHoy = (citasHoyLista || []).filter(function (c) { return c.estado !== "ko"; })
      .sort(function (a, b) { return String(a.hora_inicio).localeCompare(String(b.hora_inicio)); });
    var pendientesHoy = citasHoy.filter(function (c) { return abiertas.indexOf(c.estado) !== -1; });
    var proximaCita = (citasProximas || [])
      .filter(function (c) { return abiertas.indexOf(c.estado) !== -1 && citaEsFutura(c); })
      .sort(function (a, b) { return (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio); })[0];

    var conteos = {};
    C.ESTADOS_ORDEN.forEach(function (e) { conteos[e] = 0; });
    clientes.forEach(function (c) { conteos[c.estado] = (conteos[c.estado] || 0) + 1; });

    // Objetivo y puntos del MES en curso (antes se contaban todos los contratos de la historia).
    var mes = hoy.slice(0, 7);
    var delMes = function (c) { return String(c.fecha_activacion || c.fecha_alta || "").slice(0, 7) === mes; };
    var conteosContrato = {};
    C.ESTADOS_CONTRATO_ORDEN.forEach(function (e) { conteosContrato[e] = 0; });
    contratos.forEach(function (c) { conteosContrato[c.estado] = (conteosContrato[c.estado] || 0) + 1; });
    var okMes = contratos.filter(function (c) { return c.estado === "ok" && delMes(c); }).length;
    var verificadosMes = contratos.filter(function (c) { return c.estado === "verificado" && delMes(c); }).length;
    var altasMes = contratos.filter(function (c) { return String(c.fecha_alta || "").slice(0, 7) === mes; }).length;
    var objetivoMensual = 20;
    var puntos = okMes * 10 + verificadosMes * 5;
    var pctObjetivo = Math.min(100, Math.round((okMes / objetivoMensual) * 100));

    var propios = clientes.filter(function (c) { return c.comercial_id === st.user.id; });
    var enCurso = clientes.filter(function (c) { return c.estado !== "cliente_activo" && c.estado !== "perdido"; }).length;

    // Datos del pipeline (si la seccion esta disponible).
    var pl = null;
    if (pipeline && pipeline.oportunidades) {
      var probs = { lead_captado: 10, estudio_backoffice: 25, oferta_presentada: 50, en_cierre: 75 };
      var alertas = { lead_captado: 7, estudio_backoffice: 5, oferta_presentada: 10, en_cierre: 14 };
      var ab = pipeline.oportunidades.filter(function (o) { return probs[o.estado] != null; });
      pl = {
        valor: ab.reduce(function (s, o) { return s + (o.valor_estimado || 0); }, 0),
        prevision: ab.reduce(function (s, o) { return s + (o.valor_estimado || 0) * probs[o.estado] / 100; }, 0),
        estancadas: ab.filter(function (o) { return o.dias_en_fase >= alertas[o.estado]; }).length,
        sinAccion: pipeline.con_citas ? ab.filter(function (o) { return !o.proxima_cita; }).length : null,
        tasa: pipeline.metricas ? pipeline.metricas.tasa_cierre : null,
        conValor: pipeline.con_valor,
      };
    }

    var h = new Date().getHours();
    var saludo = h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
    var nombre = U.escapeHtml((st.user.nombre || "").split(" ")[0] || "equipo");
    var fechaHoy = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    var eur = function (n) { return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"; };
    var esc = U.escapeHtml;

    var kpi = function (valor, label, color, icono, href, extra) {
      var inner = '<span class="icc-ag-kpi-ico">' + icono + '</span><span class="icc-stat-value">' + valor + '</span><span class="icc-stat-label">' + label + "</span>" + (extra || "");
      return href
        ? '<a class="icc-stat-card icc-ag-kpi" style="--stat-color:' + color + '" href="' + href + '">' + inner + "</a>"
        : '<div class="icc-stat-card icc-ag-kpi" style="--stat-color:' + color + '">' + inner + "</div>";
    };

    // Embudo visual (mismo estilo que el Pipeline).
    var fases = C.ESTADOS_ORDEN.filter(function (e) { return e !== "perdido"; });
    var maxFase = Math.max(1, Math.max.apply(null, fases.map(function (e) { return conteos[e] || 0; })));
    var iconosFase = { lead_captado: "🎯", estudio_backoffice: "🔎", oferta_presentada: "📄", en_cierre: "🤝", cliente_activo: "🏆" };

    var accesos = [];
    if (auth.puede("clientes.ver")) accesos.push({ href: "#/pipeline", label: "Pipeline", desc: "Oportunidades por fase", icon: "📈", c: "#34d399" });
    if (auth.puede("clientes.ver")) accesos.push({ href: "#/clientes", label: "Leads y clientes", desc: "Fichas y documentación", icon: "👥", c: "#818cf8" });
    if (auth.puede("agenda.ver")) accesos.push({ href: "#/agenda", label: "Agenda", desc: gestor ? "Citas del equipo" : "Tus citas", icon: "📅", c: "#22d3ee" });
    if (auth.puede("comparador.usar")) accesos.push({ href: "#/comparador", label: "Comparador", desc: "Energía y telefonía", icon: "⚡", c: "#fbbf24" });
    if (gestor) accesos.push({ href: "#/clientes?estado=estudio_backoffice", label: "Cola de backoffice", desc: (conteos.estudio_backoffice || 0) + " pendientes de estudio", icon: "🧮", c: "#f472b6" });
    if (auth.puede("contratos.ver")) accesos.push({ href: "#/contratos", label: "Contratos", desc: contratos.length + " en total", icon: "📄", c: "#60a5fa" });
    if (gestor) accesos.push({ href: "#/agentes", label: "Agentes", desc: "Equipo y permisos", icon: "🛡️", c: "#a78bfa" });
    accesos.push({ href: "firmar.html", label: "Firma digital", desc: "Firma de contratos", icon: "✍️", c: "#fb923c" });

    main().innerHTML =
      // --- Cabecera
      '<header class="icc-ag-hero icc-dash-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">' + esc(C.ROLES[st.rolPrincipal] || "") + " · Integral Connection Consulting</span>" +
      "<h1>" + saludo + ", " + nombre + "</h1>" +
      '<p class="icc-ag-hero-res">' + esc(fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)) +
      (auth.puede("agenda.ver") ? " · <b>" + pendientesHoy.length + "</b> " + (pendientesHoy.length === 1 ? "cita pendiente hoy" : "citas pendientes hoy") : "") +
      (pl && pl.estancadas ? ' · <b class="mal">' + pl.estancadas + "</b> oportunidades estancadas" : "") +
      "</p></div>" +
      '<div class="icc-ag-hero-acc icc-dash-acciones">' +
      (auth.puede("clientes.crear") ? '<button type="button" class="icc-btn icc-btn-ghost" id="btn-dashboard-nuevo-cliente">+ Cliente</button>' : "") +
      (auth.puede("agenda.gestionar") ? '<button type="button" class="icc-btn icc-btn-primary icc-ag-btn-nueva" id="btn-dashboard-nueva-cita">+ Nueva cita</button>' : "") +
      "</div></header>" +

      // --- Indicadores
      '<div class="icc-ag-kpis">' +
      kpi(okMes + " / " + objetivoMensual, "Contratos OK este mes", "#34d399", "🎯", "#/contratos?estado=ok",
        '<span class="icc-dash-progreso"><i style="width:' + pctObjetivo + '%"></i></span>') +
      kpi(puntos, "Puntos del mes (OK ×10 · verificados ×5)", "#d4a62a", "⭐", "#/contratos?estado=verificado") +
      kpi(enCurso, "Expedientes en curso", "#22d3ee", "📂", "#/pipeline") +
      kpi(st.rolPrincipal === "comercial" ? propios.length : clientes.length, st.rolPrincipal === "comercial" ? "Mis leads" : "Total clientes", "#818cf8", "👥", "#/clientes") +
      (pl && pl.conValor ? kpi(eur(pl.prevision), "Previsión ponderada", "#10b981", "💶", "#/pipeline") : "") +
      (pl && pl.tasa != null ? kpi(pl.tasa + "%", "Tasa de cierre (90 días)", "#a78bfa", "🏆", "#/pipeline") : "") +
      (auth.puede("contratos.ver") ? kpi(altasMes, "Contratos dados de alta este mes", "#60a5fa", "📝", "#/contratos") : "") +
      "</div>" +

      // --- Embudo + agenda de hoy
      '<div class="icc-dash-grid">' +
      '<section class="icc-card icc-dash-embudo">' +
      '<div class="icc-dash-tit"><h2>Embudo comercial</h2><a class="icc-link-btn" href="#/pipeline">Abrir pipeline →</a></div>' +
      fases.map(function (e) {
        var n = conteos[e] || 0;
        return (
          '<a class="icc-dash-fase" style="--c:' + C.ESTADOS[e].color + ";--w:" + Math.max(6, Math.round((n / maxFase) * 100)) + '%" href="#/pipeline?fase=' + e + '" title="Ver ' + esc(C.ESTADOS[e].label) + ' en el pipeline">' +
          '<span class="icc-dash-fase-ico">' + (iconosFase[e] || "•") + "</span>" +
          '<span class="icc-dash-fase-txt">' + esc(C.ESTADOS[e].label) + "</span>" +
          '<span class="icc-dash-fase-barra"><i></i></span><b>' + n + "</b></a>"
        );
      }).join("") +
      (conteos.perdido ? '<a class="icc-muted icc-dash-nota" href="#/pipeline?cerrados_dias=365&fase=perdido">✖ ' + conteos.perdido + " perdidas en total →</a>" : "") +
      (pl && pl.sinAccion ? '<a class="icc-muted icc-dash-nota" href="#/pipeline?sin_accion=1">⚠ ' + pl.sinAccion + " oportunidades sin próxima acción en la agenda →</a>" : "") +
      "</section>" +

      '<section class="icc-card icc-dash-hoy">' +
      '<div class="icc-dash-tit"><h2>📅 ' + (gestor ? "Hoy en el equipo" : "Mi agenda de hoy") + '</h2><a class="icc-link-btn" href="#/agenda?vista=' + (gestor ? "equipo" : "dia") + '">Ver agenda →</a></div>' +
      (citasHoy.length
        ? '<div class="icc-dash-citas">' + citasHoy.slice(0, 7).map(function (c) {
            var est = (C.ESTADOS_CITA || {})[c.estado] || { color: "#94a3b8", label: c.estado };
            var tipo = (C.TIPOS_CITA || {})[c.tipo] || { icono: "📌" };
            return (
              '<a class="icc-dash-cita' + (c.estado === "realizada" ? " is-hecha" : "") + '" href="#/agenda?vista=dia&fecha=' + c.fecha + "&cita=" + c.id + '" style="--e:' + est.color + '">' +
              '<span class="icc-dash-cita-hora">' + String(c.hora_inicio).slice(0, 5) + "</span>" +
              '<span class="icc-dash-cita-txt"><strong>' + tipo.icono + " " + esc(c.cliente_nombre) + "</strong>" +
              "<small>" + esc([gestor ? c.comercial_nombre || (c.comercial_id ? "" : "📥 Por asignar") : "", c.direccion].filter(Boolean).join(" · ")) + "</small></span>" +
              '<span class="icc-dash-cita-est" title="' + esc(est.label) + '"></span></a>'
            );
          }).join("") +
          (citasHoy.length > 7 ? '<a class="icc-link-btn" href="#/agenda?vista=dia">+' + (citasHoy.length - 7) + " citas más</a>" : "") + "</div>"
        : '<p class="icc-empty">Hoy no hay citas.</p>') +
      (proximaCita && !gestor
        ? '<a class="icc-dash-proxima" href="#/agenda?vista=dia&fecha=' + proximaCita.fecha + "&cita=" + proximaCita.id + '">⏰ Próxima: <strong>' + esc(proximaCita.cliente_nombre) + "</strong> · " + esc(formatearCuentaAtras(proximaCita)) + "</a>"
        : "") +
      "</section>" +
      "</div>" +

      // --- Contratos + accesos
      '<div class="icc-dash-grid">' +
      (auth.puede("contratos.ver")
        ? '<section class="icc-card"><div class="icc-dash-tit"><h2>📄 Estado de los contratos</h2><a class="icc-link-btn" href="#/contratos">Ver contratos →</a></div>' +
          '<div class="icc-dash-contratos">' +
          C.ESTADOS_CONTRATO_ORDEN.map(function (e) {
            return (
              '<a class="icc-dash-contrato" style="--c:' + C.ESTADOS_CONTRATO[e].color + '" href="#/contratos?estado=' + e + '">' +
              "<b>" + (conteosContrato[e] || 0) + "</b><span>" + esc(C.ESTADOS_CONTRATO[e].label) + "</span></a>"
            );
          }).join("") +
          "</div></section>"
        : "") +
      '<section class="icc-card"><div class="icc-dash-tit"><h2>🚀 Accesos rápidos</h2></div>' +
      '<div class="icc-dash-accesos">' +
      accesos.map(function (a) {
        return '<a class="icc-dash-acceso" style="--c:' + a.c + '" href="' + a.href + '"><span class="icc-dash-acceso-ico">' + a.icon + "</span><span><strong>" + esc(a.label) + "</strong><small>" + esc(a.desc) + "</small></span></a>";
      }).join("") +
      "</div></section>" +
      "</div>";

    var btnDashboardNuevaCita = document.getElementById("btn-dashboard-nueva-cita");
    if (btnDashboardNuevaCita) btnDashboardNuevaCita.addEventListener("click", abrirModalCitaRapida);
    var btnDashboardNuevoCliente = document.getElementById("btn-dashboard-nuevo-cliente");
    if (btnDashboardNuevoCliente) btnDashboardNuevoCliente.addEventListener("click", function () { modalNuevoCliente(null); });
  }

  function statCard(label, value, color) {
    return (
      '<div class="icc-stat-card" style="--stat-color:' +
      color +
      '"><span class="icc-stat-value">' +
      (value || 0) +
      "</span><span class=\"icc-stat-label\">" +
      U.escapeHtml(label) +
      "</span></div>"
    );
  }

  // ------------------------------------------------------------------- Agenda
  // Administrador, Gerente, Coordinador y Super Admin tienen el mismo nivel.
  function esRolAdmin(rol) {
    return C.ROLES_ADMIN.indexOf(rol) !== -1;
  }

  function hoyIso() {
    return isoDate(new Date());
  }

  function isoDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fechaLocal(iso) {
    var p = (iso || hoyIso()).split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function sumarDias(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function lunesDe(iso) {
    var d = fechaLocal(iso);
    var dow = d.getDay(); // 0 = domingo
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d;
  }

  function horaCorta(hhmmss) {
    return (hhmmss || "").slice(0, 5);
  }

  function citaEsFutura(c) {
    var fechaHora = fechaLocal(c.fecha);
    var partes = horaCorta(c.hora_inicio).split(":");
    fechaHora.setHours(parseInt(partes[0], 10) || 0, parseInt(partes[1], 10) || 0, 0, 0);
    return fechaHora.getTime() > Date.now();
  }

  function formatearCuentaAtras(c) {
    var fechaHora = fechaLocal(c.fecha);
    var partes = horaCorta(c.hora_inicio).split(":");
    fechaHora.setHours(parseInt(partes[0], 10) || 0, parseInt(partes[1], 10) || 0, 0, 0);
    var diffMin = Math.round((fechaHora.getTime() - Date.now()) / 60000);
    if (diffMin <= 0) return "Es ahora · " + horaCorta(c.hora_inicio);
    if (c.fecha === hoyIso()) {
      var h = Math.floor(diffMin / 60);
      var m = diffMin % 60;
      return "Hoy a las " + horaCorta(c.hora_inicio) + " · en " + (h ? h + "h " : "") + m + "min";
    }
    return (
      fechaHora.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "short" }) +
      " a las " +
      horaCorta(c.hora_inicio)
    );
  }

  // La agenda vive en js/agenda.js (vistas Dia/Semana/Mes/Año/Lista y ficha de cita).
  function viewAgenda() {
    return window.icc.agenda.view();
  }

  function abrirModalCitaRapida() {
    return window.icc.agenda.abrirModalCitaRapida();
  }

  // ---------------------------------------------------------------- Clientes
  async function viewClientes() {
    var params = new URLSearchParams((location.hash.split("?")[1] || ""));
    var filtroActivo = params.get("estado") || "todos";
    var comercialId = params.get("comercial_id") || "";

    main().innerHTML = '<div class="icc-loading">Cargando clientes…</div>';
    var [clientes, agenteFiltrado] = await Promise.all([
      D.listarClientes(comercialId ? { comercial_id: comercialId } : {}),
      comercialId ? D.listarAgentes({}).then(function (ags) { return ags.filter(function (a) { return String(a.id) === comercialId; })[0]; }) : Promise.resolve(null),
    ]);

    var filtrados =
      filtroActivo === "todos"
        ? clientes
        : clientes.filter(function (c) {
            return c.estado === filtroActivo;
          });

    var sufijoComercial = comercialId ? "&comercial_id=" + comercialId : "";
    var chips =
      '<a class="icc-tab' +
      (filtroActivo === "todos" ? " is-active" : "") +
      '" href="#/clientes' + (comercialId ? "?comercial_id=" + comercialId : "") + '">Todos (' +
      clientes.length +
      ")</a>" +
      C.ESTADOS_ORDEN.map(function (e) {
        var n = clientes.filter(function (c) {
          return c.estado === e;
        }).length;
        return (
          '<a class="icc-tab' +
          (filtroActivo === e ? " is-active" : "") +
          '" href="#/clientes?estado=' +
          e +
          sufijoComercial +
          '">' +
          C.ESTADOS[e].label +
          " (" +
          n +
          ")</a>"
        );
      }).join("");

    main().innerHTML =
      '<div class="icc-page-head">' +
      "<h1>Leads y clientes" + (agenteFiltrado ? " · " + U.escapeHtml(agenteFiltrado.nombre) : "") + "</h1>" +
      '<button class="icc-btn icc-btn-primary" id="btn-nuevo-cliente">+ Nuevo cliente</button>' +
      "</div>" +
      (comercialId
        ? '<p class="icc-muted">Mostrando solo las cuentas de ' + U.escapeHtml(agenteFiltrado ? agenteFiltrado.nombre : "este agente") +
          '. <a href="#/clientes">Ver todos los clientes →</a></p>'
        : "") +
      '<div class="icc-tabs">' +
      chips +
      "</div>" +
      '<div class="icc-card icc-table-wrap">' +
      (filtrados.length ? tablaClientes(filtrados) : '<p class="icc-empty">No hay clientes en este estado.</p>') +
      "</div>";

    document.getElementById("btn-nuevo-cliente").addEventListener("click", function () {
      modalNuevoCliente(null);
    });
    main()
      .querySelectorAll("[data-cliente-id]")
      .forEach(function (row) {
        row.addEventListener("click", function () {
          location.hash = "#/clientes/" + row.getAttribute("data-cliente-id");
        });
      });
  }

  function tablaClientes(clientes) {
    return (
      '<table class="icc-table"><thead><tr>' +
      "<th>Empresa</th><th>Sector</th><th>Servicios</th><th>Estado</th><th>Alta</th>" +
      "</tr></thead><tbody>" +
      clientes
        .map(function (c) {
          return (
            '<tr data-cliente-id="' +
            c.id +
            '">' +
            "<td><strong>" +
            U.escapeHtml(c.razon_social) +
            "</strong><br><span class=\"icc-muted\">" +
            U.escapeHtml(c.cif) +
            "</span></td>" +
            "<td>" +
            U.escapeHtml(c.sector || "-") +
            "</td>" +
            "<td>" +
            U.servicioChips(c.servicios) +
            "</td>" +
            "<td>" +
            U.estadoBadge(c.estado) +
            "</td>" +
            "<td>" +
            U.formatFecha(c.created_at) +
            "</td>" +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table>"
    );
  }

  // alCrear(id): opcional; sin ella, tras crear se abre la ficha del cliente.
  function modalNuevoCliente(alCrear) {
    U.openModal(
      '<h2>Nuevo cliente</h2>' +
      '<form id="form-nuevo-cliente" class="icc-form">' +
      campoTexto("razon_social", "Razon social", true) +
      campoTexto("cif", "CIF", true) +
      campoTexto("contacto_nombre", "Persona de contacto") +
      campoTexto("contacto_telefono", "Telefono de contacto") +
      campoTexto("contacto_email", "Email de contacto", false, "email") +
      campoTexto("sector", "Sector") +
      '<div class="icc-field"><label>Tipo de cliente</label><select class="icc-select" name="tipo_cliente">' +
      Object.keys(C.TIPO_CLIENTE)
        .map(function (t) {
          return '<option value="' + t + '"' + (t === "residencial" ? " selected" : "") + ">" + C.TIPO_CLIENTE[t] + "</option>";
        })
        .join("") +
      "</select></div>" +
      campoTexto("telefono", "Telefono empresa") +
      campoTexto("email", "Email empresa", false, "email") +
      campoTexto("direccion_suministro", "Direccion de suministro") +
      '<div class="icc-field"><label>Servicios de interes</label><div class="icc-checks">' +
      Object.keys(C.SERVICIOS)
        .map(function (s) {
          return (
            '<label class="icc-check"><input type="checkbox" name="servicio" value="' +
            s +
            '"> ' +
            C.SERVICIOS[s] +
            "</label>"
          );
        })
        .join("") +
      "</div></div>" +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Crear ficha</button>' +
      "</div></form>"
    );

    document.getElementById("form-nuevo-cliente").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var servicios = fd.getAll("servicio");
      var payload = {
        razon_social: fd.get("razon_social"),
        cif: fd.get("cif"),
        contacto_nombre: fd.get("contacto_nombre") || "",
        contacto_telefono: fd.get("contacto_telefono") || "",
        contacto_email: fd.get("contacto_email") || "",
        sector: fd.get("sector") || "",
        tipo_cliente: fd.get("tipo_cliente") || "residencial",
        telefono: fd.get("telefono") || "",
        email: fd.get("email") || "",
        direccion_suministro: fd.get("direccion_suministro") || "",
      };
      try {
        var id = await D.crearCliente(payload, servicios);
        U.closeModal();
        U.toast("Cliente creado correctamente", "success");
        if (typeof alCrear === "function") alCrear(id);
        else location.hash = "#/clientes/" + id;
      } catch (err) {
        U.toast(err.message || "No se pudo crear el cliente", "error");
      }
    });
  }

  function modalMotivoPerdida(cliente) {
    U.openModal(
      "<h2>Marcar como Perdido</h2>" +
      '<p class="icc-muted">Elige el motivo para ' + U.escapeHtml(cliente.razon_social) + ".</p>" +
      '<form id="form-motivo-perdida" class="icc-form">' +
      '<div class="icc-field"><label>Motivo</label><select class="icc-select" name="motivo_preset">' +
      C.MOTIVOS_PERDIDA.map(function (m) { return '<option value="' + U.escapeHtml(m) + '">' + U.escapeHtml(m) + "</option>"; }).join("") +
      "</select></div>" +
      '<div class="icc-field"><label>Detalle (opcional)</label><textarea class="icc-textarea" name="detalle" placeholder="Anade cualquier detalle util…"></textarea></div>' +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary" style="background:var(--red)">Marcar como Perdido</button>' +
      "</div></form>"
    );

    document.getElementById("form-motivo-perdida").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var detalle = (fd.get("detalle") || "").trim();
      var motivo = fd.get("motivo_preset") + (detalle ? " — " + detalle : "");
      try {
        await D.actualizarCliente(cliente.id, { estado: "perdido", motivo_perdida: motivo });
        U.toast("Cliente marcado como Perdido", "success");
        U.closeModal();
        viewClienteDetalle(cliente.id);
      } catch (err) {
        U.toast(err.message || "No se pudo guardar", "error");
      }
    });
  }

  function modalEditarCliente(cliente) {
    U.openModal(
      "<h2>Editar cliente</h2>" +
      '<form id="form-editar-cliente" class="icc-form">' +
      campoTexto("razon_social", "Razon social", true, "text", cliente.razon_social) +
      campoTexto("cif", "CIF", true, "text", cliente.cif) +
      campoTexto("contacto_nombre", "Persona de contacto", false, "text", cliente.contacto_nombre) +
      campoTexto("contacto_telefono", "Telefono de contacto", false, "text", cliente.contacto_telefono) +
      campoTexto("contacto_email", "Email de contacto", false, "email", cliente.contacto_email) +
      campoTexto("sector", "Sector", false, "text", cliente.sector) +
      '<div class="icc-field"><label>Tipo de cliente</label><select class="icc-select" name="tipo_cliente">' +
      Object.keys(C.TIPO_CLIENTE)
        .map(function (t) {
          return '<option value="' + t + '"' + (cliente.tipo_cliente === t ? " selected" : "") + ">" + C.TIPO_CLIENTE[t] + "</option>";
        })
        .join("") +
      "</select></div>" +
      campoTexto("telefono", "Telefono empresa", false, "text", cliente.telefono) +
      campoTexto("email", "Email empresa", false, "email", cliente.email) +
      campoTexto("direccion_suministro", "Direccion de suministro", false, "text", cliente.direccion_suministro) +
      '<div class="icc-field"><label>Notas internas</label><textarea class="icc-textarea" name="notas">' +
      U.escapeHtml(cliente.notas || "") +
      "</textarea></div>" +
      '<div class="icc-field"><label>Servicios de interes</label><div class="icc-checks">' +
      Object.keys(C.SERVICIOS)
        .map(function (s) {
          return (
            '<label class="icc-check"><input type="checkbox" name="servicio" value="' +
            s +
            '"' +
            (cliente.servicios.indexOf(s) !== -1 ? " checked" : "") +
            "> " +
            C.SERVICIOS[s] +
            "</label>"
          );
        })
        .join("") +
      "</div></div>" +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Guardar cambios</button>' +
      "</div></form>"
    );

    document.getElementById("form-editar-cliente").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var servicios = fd.getAll("servicio");
      var payload = {
        razon_social: fd.get("razon_social"),
        cif: fd.get("cif"),
        contacto_nombre: fd.get("contacto_nombre") || "",
        contacto_telefono: fd.get("contacto_telefono") || "",
        contacto_email: fd.get("contacto_email") || "",
        sector: fd.get("sector") || "",
        tipo_cliente: fd.get("tipo_cliente") || "residencial",
        telefono: fd.get("telefono") || "",
        email: fd.get("email") || "",
        direccion_suministro: fd.get("direccion_suministro") || "",
        notas: fd.get("notas") || "",
      };
      try {
        await D.actualizarCliente(cliente.id, payload);
        await D.reemplazarServicios(cliente.id, servicios);
        U.closeModal();
        U.toast("Cliente actualizado", "success");
        viewClienteDetalle(cliente.id);
      } catch (err) {
        U.toast(err.message || "No se pudo actualizar el cliente", "error");
      }
    });
  }

  function campoTexto(name, label, required, type, valor) {
    return (
      '<div class="icc-field"><label>' +
      label +
      (required ? " *" : "") +
      '</label><input class="icc-input" name="' +
      name +
      '" type="' +
      (type || "text") +
      '" value="' +
      U.escapeHtml(valor || "") +
      '"' +
      (required ? " required" : "") +
      "></div>"
    );
  }

  // ------------------------------------------------------------- Ficha cliente
  async function viewClienteDetalle(id) {
    main().innerHTML = '<div class="icc-loading">Cargando ficha…</div>';
    var [cliente, documentos, estudios, firmas, informesComparador, presupuestos] = await Promise.all([
      D.obtenerCliente(id),
      D.listarDocumentos(id),
      D.listarEstudios(id),
      D.listarFirmas(id),
      window.icc.auth.puede("comparador.usar") ? D.informesComparadorCliente(id) : Promise.resolve([]),
      D.listarPresupuestos({ cliente_id: id }).catch(function () { return []; }),
    ]);
    if (!cliente) {
      main().innerHTML = '<p class="icc-empty">Cliente no encontrado o sin acceso.</p>';
      return;
    }

    var puedeEstudio = window.icc.auth.puede("estudios.subir");
    var enlacePublico = location.href.replace(/index\.html.*$/, "").replace(/#.*$/, "") + "subir.html?token=" + cliente.upload_token;

    main().innerHTML =
      '<div class="icc-page-head">' +
      '<div><a href="#/clientes" class="icc-back">← Volver al listado</a><h1>' +
      U.escapeHtml(cliente.razon_social) +
      "</h1><p class=\"icc-muted\">" +
      U.escapeHtml(cliente.cif) +
      " · " +
      U.escapeHtml(cliente.sector || "Sin sector") +
      " · " +
      U.escapeHtml(C.TIPO_CLIENTE[cliente.tipo_cliente] || "Residencial") +
      "</p></div>" +
      '<div class="icc-head-actions">' +
      '<button class="icc-btn icc-btn-ghost" id="btn-editar-cliente">Editar datos</button>' +
      U.estadoBadge(cliente.estado) +
      '<select class="icc-select" id="select-estado">' +
      C.ESTADOS_ORDEN.map(function (e) {
        return (
          '<option value="' +
          e +
          '"' +
          (e === cliente.estado ? " selected" : "") +
          ">" +
          C.ESTADOS[e].label +
          "</option>"
        );
      }).join("") +
      "</select>" +
      "</div></div>" +
      '<div class="icc-grid-2">' +
      '<section class="icc-card">' +
      "<h2>Datos del cliente</h2>" +
      (cliente.estado === "perdido" && cliente.motivo_perdida
        ? '<p style="color:var(--red)"><strong>Motivo de perdida:</strong> ' + U.escapeHtml(cliente.motivo_perdida) + "</p>"
        : "") +
      filaDato("Contacto", cliente.contacto_nombre) +
      filaDato("Telefono contacto", cliente.contacto_telefono) +
      filaDato("Email contacto", cliente.contacto_email) +
      filaDato("Telefono empresa", cliente.telefono) +
      filaDato("Email empresa", cliente.email) +
      filaDato("Direccion de suministro", cliente.direccion_suministro) +
      '<div class="icc-field"><label>Servicios de interes</label>' +
      U.servicioChips(cliente.servicios) +
      "</div>" +
      "<h3>Enlace rapido para el cliente</h3>" +
      '<p class="icc-muted">Comparte este enlace para que el propio cliente suba sus facturas sin necesidad de iniciar sesion.</p>' +
      '<div class="icc-copy-row"><input class="icc-input" readonly value="' +
      U.escapeHtml(enlacePublico) +
      '" id="input-enlace"><button class="icc-btn icc-btn-ghost" id="btn-copiar-enlace">Copiar</button></div>' +
      "</section>" +
      '<section class="icc-card">' +
      "<h2>Documentacion y estudios</h2>" +
      '<div class="icc-doc-actions">' +
      '<button class="icc-btn icc-btn-secondary" id="btn-subir-factura">Subir factura</button>' +
      (puedeEstudio
        ? '<button class="icc-btn icc-btn-secondary" id="btn-subir-estudio">Subir estudio comparativo</button>'
        : "") +
      "</div>" +
      renderListaDocumentos(documentos) +
      (estudios.length ? "<h3>Estudios comparativos</h3>" + renderEstudios(estudios, documentos) : "") +
      "</section>" +
      "</div>" +
      '<section class="icc-card">' +
      "<h2>Presupuestos</h2>" +
      '<div class="icc-doc-actions">' +
      '<button class="icc-btn icc-btn-secondary" id="btn-nuevo-presupuesto">+ Nuevo presupuesto</button>' +
      "</div>" +
      renderPresupuestosCliente(presupuestos) +
      "</section>" +
      '<section class="icc-card">' +
      "<h2>Auditorías del Comparador</h2>" +
      '<div class="icc-doc-actions">' +
      '<button class="icc-btn icc-btn-secondary" id="btn-nueva-comparativa">+ Nueva auditoría de factura</button>' +
      "</div>" +
      window.icc.comparador.listaInformesCliente(informesComparador) +
      "</section>" +
      '<section class="icc-card">' +
      "<h2>Firmas registradas</h2>" +
      (firmas.length
        ? renderFirmas(firmas)
        : '<p class="icc-empty">Sin firmas todavia. <a href="firmar.html?cliente=' +
          cliente.id +
          '">Iniciar proceso de firma →</a></p>') +
      '<a class="icc-btn icc-btn-primary" href="firmar.html?cliente=' +
      cliente.id +
      '" style="margin-top:12px;display:inline-block">Ir a firma digital</a>' +
      "</section>";

    document.getElementById("btn-editar-cliente").addEventListener("click", function () {
      modalEditarCliente(cliente);
    });

    document.getElementById("select-estado").addEventListener("change", async function (e) {
      var nuevoEstado = e.target.value;
      if (nuevoEstado === "perdido") {
        e.target.value = cliente.estado; // revertir hasta que se confirme el motivo
        modalMotivoPerdida(cliente);
        return;
      }
      try {
        await D.actualizarEstado(cliente.id, nuevoEstado);
        U.toast("Estado actualizado", "success");
        viewClienteDetalle(cliente.id);
      } catch (err) {
        U.toast(err.message || "No se pudo actualizar el estado", "error");
      }
    });

    document.getElementById("btn-copiar-enlace").addEventListener("click", function () {
      var input = document.getElementById("input-enlace");
      input.select();
      navigator.clipboard && navigator.clipboard.writeText(input.value);
      U.toast("Enlace copiado", "success");
    });

    document.getElementById("btn-subir-factura").addEventListener("click", function () {
      modalSubirDocumento(cliente, "factura");
    });

    var btnEstudioDoc = document.getElementById("btn-subir-estudio");
    if (btnEstudioDoc) {
      btnEstudioDoc.addEventListener("click", function () {
        modalSubirEstudio(cliente, documentos);
      });
    }

    document.getElementById("btn-nuevo-presupuesto").addEventListener("click", function () {
      modalNuevoPresupuesto(cliente);
    });

    document.getElementById("btn-nueva-comparativa").addEventListener("click", function () {
      window.icc.comparador.modalNuevoInformeCliente(cliente);
    });
  }

  function renderPresupuestosCliente(presupuestos) {
    if (!presupuestos || !presupuestos.length) {
      return '<p class="icc-empty">Aun no hay presupuestos para este cliente.</p>';
    }
    return (
      '<ul class="icc-doc-list">' +
      presupuestos
        .map(function (p) {
          var meta = C.ESTADOS_PRESUPUESTO[p.estado] || { label: p.estado, color: "#94a3b8" };
          return (
            '<li><a href="#/presupuestos/' + p.id + '"><span>📋 ' +
            U.escapeHtml(C.SECTORES[p.sector] || p.sector) +
            "</span></a><span class=\"icc-badge\" style=\"--badge-color:" + meta.color + "\">" +
            U.escapeHtml(meta.label) +
            "</span><span class=\"icc-muted\">" +
            U.formatFecha(p.created_at) +
            "</span></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  // CUPS espanol: ES + 16 digitos + 2 letras de control (+ opcionalmente
  // 1 digito y 1 letra mas para el punto de suministro). ~20-22 caracteres.
  var REGEX_CUPS = /^ES\d{16}[A-Z]{2}([0-9][A-Z])?$/i;

  function camposSectorPresupuesto(sectorInicial) {
    return (
      '<div id="bloque-sector-energia"' + (sectorInicial !== "energia" ? ' style="display:none"' : "") + ">" +
      '<h4>⚡ Suministro actual</h4>' +
      '<div class="icc-field"><label>Tipo de suministro</label><select class="icc-select" name="tipo_suministro">' +
      '<option value="">Selecciona…</option>' +
      Object.keys(C.TIPO_SUMINISTRO)
        .map(function (t) { return '<option value="' + t + '">' + C.TIPO_SUMINISTRO[t] + "</option>"; })
        .join("") +
      "</select></div>" +
      campoTexto("cups", "CUPS", false, "text") +
      '<p class="icc-muted" id="aviso-cups" style="display:none;color:var(--red);margin:-8px 0 8px">El CUPS no tiene el formato habitual (ES + 16 digitos + 2 letras). Puedes guardarlo igual si estas seguro.</p>' +
      campoTexto("comercializadora_actual", "Comercializadora actual", false, "text") +
      campoTexto("tarifa_actual", "Tarifa actual", false, "text") +
      campoTexto("potencias_contratadas", "Potencias contratadas (P1, P2, P3…)", false, "text") +
      campoTexto("consumo_anual_kwh", "Consumo anual estimado (kWh)", false, "number") +
      "</div>" +
      '<div id="bloque-sector-otros"' + (sectorInicial === "energia" ? ' style="display:none"' : "") + ">" +
      campoTexto("operador_actual", "Operador / Compañia / Instaladora actual", false, "text") +
      '<div class="icc-field"><label>Servicio / lineas / equipamiento actual</label>' +
      '<textarea class="icc-textarea" name="datos_actuales_otros" placeholder="Telco: fibra, num. de lineas moviles, centralita… · Alarmas: tipo de sistema (residencial/negocio), equipamiento instalado…"></textarea></div>' +
      "</div>" +
      campoTexto("fecha_permanencia", "Fecha fin de contrato / permanencia", false, "date") +
      '<p class="icc-muted" style="margin-top:-8px">Se usara para avisar antes de que acabe la permanencia con la compania actual.</p>'
    );
  }

  function wirearCamposSectorPresupuesto(form) {
    var selectSector = form.querySelector('[name="sector"]');
    var bloqueEnergia = form.querySelector("#bloque-sector-energia");
    var bloqueOtros = form.querySelector("#bloque-sector-otros");
    selectSector.addEventListener("change", function () {
      var esEnergia = selectSector.value === "energia";
      bloqueEnergia.style.display = esEnergia ? "" : "none";
      bloqueOtros.style.display = esEnergia ? "none" : "";
    });

    var inputCups = form.querySelector('#bloque-sector-energia [name="cups"]');
    var avisoCups = form.querySelector("#aviso-cups");
    if (inputCups && avisoCups) {
      inputCups.addEventListener("blur", function () {
        var valor = inputCups.value.trim();
        avisoCups.style.display = valor && !REGEX_CUPS.test(valor) ? "" : "none";
      });
    }
  }

  function leerCamposSectorPresupuesto(fd) {
    var esEnergia = (fd.get("sector") || "") === "energia";
    return {
      tipo_suministro: fd.get("tipo_suministro") || "",
      cups: fd.get("cups") || "",
      comercializadora_actual: esEnergia ? (fd.get("comercializadora_actual") || "") : (fd.get("operador_actual") || ""),
      tarifa_actual: fd.get("tarifa_actual") || "",
      potencias_contratadas: fd.get("potencias_contratadas") || "",
      consumo_anual_kwh: fd.get("consumo_anual_kwh") || "",
      datos_actuales_otros: fd.get("datos_actuales_otros") || "",
      fecha_permanencia: fd.get("fecha_permanencia") || "",
    };
  }

  async function subirFacturaSiHay(clienteId, presupuestoId, form) {
    var input = form.querySelector('[name="archivo_factura"]');
    var file = input && input.files[0];
    if (!file) return;
    try {
      await D.subirDocumento(clienteId, "factura", file, "", presupuestoId);
    } catch (err) {
      U.toast("Presupuesto creado, pero la factura no se pudo subir: " + (err.message || ""), "error");
    }
  }

  function modalNuevoPresupuesto(cliente) {
    U.openModal(
      "<h2>Nuevo presupuesto</h2>" +
      '<p class="icc-muted">Para ' + U.escapeHtml(cliente.razon_social) + ".</p>" +
      '<form id="form-nuevo-presupuesto-cliente" class="icc-form">' +
      '<div class="icc-field"><label>Sector</label><select class="icc-select" name="sector">' +
      Object.keys(C.SECTORES)
        .map(function (s) {
          return '<option value="' + s + '">' + C.SECTORES[s] + "</option>";
        })
        .join("") +
      "</select></div>" +
      camposSectorPresupuesto(Object.keys(C.SECTORES)[0]) +
      '<div class="icc-field"><label>Factura del cliente (opcional, PDF o imagen)</label>' +
      '<input class="icc-input" type="file" name="archivo_factura" accept="application/pdf,image/*"></div>' +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Crear presupuesto</button>' +
      "</div></form>"
    );

    var form = document.getElementById("form-nuevo-presupuesto-cliente");
    wirearCamposSectorPresupuesto(form);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var payload = Object.assign({ cliente_id: cliente.id, sector: fd.get("sector") }, leerCamposSectorPresupuesto(fd));
      try {
        var id = await D.crearPresupuesto(payload);
        await subirFacturaSiHay(cliente.id, id, form);
        U.closeModal();
        location.hash = "#/presupuestos/" + id;
      } catch (err) {
        U.toast(err.message || "No se pudo crear el presupuesto", "error");
      }
    });
  }

  function filaDato(label, valor) {
    return (
      '<div class="icc-data-row"><span class="icc-muted">' +
      label +
      "</span><span>" +
      U.escapeHtml(valor || "-") +
      "</span></div>"
    );
  }

  function renderListaDocumentos(documentos) {
    var facturas = documentos.filter(function (d) {
      return d.tipo === "factura";
    });
    if (!facturas.length) return '<p class="icc-empty">Aun no hay facturas subidas.</p>';
    return (
      '<ul class="icc-doc-list">' +
      facturas
        .map(function (d) {
          return (
            '<li><span>📄 ' +
            U.escapeHtml(d.nombre_archivo) +
            "</span><span class=\"icc-muted\">" +
            U.formatFecha(d.created_at) +
            '</span><a class="icc-link-btn" target="_blank" href="' +
            D.urlDescarga("facturas", d.ruta_archivo) +
            '">Ver</a></li>'
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderEstudios(estudios, documentos) {
    return (
      '<ul class="icc-doc-list">' +
      estudios
        .map(function (est) {
          var doc = documentos.filter(function (d) {
            return d.id === est.documento_id;
          })[0];
          return (
            "<li><span>📊 " +
            (est.ahorro_estimado ? "Ahorro estimado " + U.formatEur(est.ahorro_estimado) : "Estudio") +
            "</span><span class=\"icc-muted\">" +
            U.formatFecha(est.created_at) +
            "</span>" +
            (doc
              ? '<a class="icc-link-btn" target="_blank" href="' + D.urlDescarga("estudios", doc.ruta_archivo) + '">Ver PDF</a>'
              : "") +
            "</li>" +
            (est.resumen ? '<li class="icc-doc-note">' + U.escapeHtml(est.resumen) + "</li>" : "")
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderFirmas(firmas) {
    return (
      '<ul class="icc-doc-list">' +
      firmas
        .map(function (f) {
          return (
            "<li><span>✍️ " +
            U.escapeHtml(f.firmante_nombre) +
            " (" +
            U.escapeHtml(f.firmante_dni) +
            ")</span><span class=\"icc-muted\">" +
            U.formatFechaHora(f.firmado_en) +
            "</span><a class=\"icc-link-btn\" target=\"_blank\" href=\"" +
            D.urlDescarga("firmas", f.ruta_archivo) +
            '">Ver firma</a></li>'
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function modalSubirDocumento(cliente, tipo) {
    U.openModal(
      "<h2>Subir factura / documentacion</h2>" +
      '<form id="form-subir-doc" class="icc-form">' +
      '<div class="icc-field"><label>Archivo (PDF o imagen)</label><input class="icc-input" type="file" name="archivo" accept="application/pdf,image/*" required></div>' +
      '<div class="icc-field"><label>Notas (opcional)</label><textarea class="icc-textarea" name="notas"></textarea></div>' +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Subir</button>' +
      "</div></form>"
    );
    document.getElementById("form-subir-doc").addEventListener("submit", async function (e) {
      e.preventDefault();
      var file = e.target.archivo.files[0];
      var notas = e.target.notas.value;
      if (!file) return;
      try {
        await D.subirDocumento(cliente.id, tipo, file, notas);
        U.closeModal();
        U.toast("Documento subido", "success");
        viewClienteDetalle(cliente.id);
      } catch (err) {
        U.toast(err.message || "No se pudo subir el archivo", "error");
      }
    });
  }

  function modalSubirEstudio(cliente, documentosExistentes) {
    var facturas = documentosExistentes.filter(function (d) {
      return d.tipo === "factura";
    });
    U.openModal(
      "<h2>Estudio comparativo de ahorro</h2>" +
      '<form id="form-estudio" class="icc-form">' +
      '<div class="icc-field"><label>PDF del estudio comparativo</label><input class="icc-input" type="file" name="archivo" accept="application/pdf,image/*" required></div>' +
      '<div class="icc-field"><label>Ahorro estimado anual (€)</label><input class="icc-input" type="number" step="0.01" name="ahorro"></div>' +
      '<div class="icc-field"><label>Resumen para el comercial</label><textarea class="icc-textarea" name="resumen" placeholder="Puntos clave para defender la propuesta"></textarea></div>' +
      (facturas.length
        ? '<p class="icc-muted">Factura de referencia: ' + U.escapeHtml(facturas[0].nombre_archivo) + "</p>"
        : "") +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Publicar estudio</button>' +
      "</div></form>"
    );
    document.getElementById("form-estudio").addEventListener("submit", async function (e) {
      e.preventDefault();
      var file = e.target.archivo.files[0];
      if (!file) return;
      try {
        await D.crearEstudio(cliente.id, file, parseFloat(e.target.ahorro.value) || null, e.target.resumen.value);
        U.closeModal();
        U.toast("Estudio publicado. El comercial ha sido notificado.", "success");
        viewClienteDetalle(cliente.id);
      } catch (err) {
        U.toast(err.message || "No se pudo publicar el estudio", "error");
      }
    });
  }

  // --------------------------------------------------------------- Contratos
  async function viewContratos() {
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var filtros = {};
    ["estado", "sector", "comercializadora", "tarifa", "desde", "hasta", "q", "comercial_id"].forEach(function (k) {
      if (params.get(k)) filtros[k] = params.get(k);
    });
    var vista = params.get("vista") === "tablero" ? "tablero" : "lista";
    var esc = U.escapeHtml;
    var auth = window.icc.auth;
    var puedeFiltrarComercial = auth.esBackofficeOAdmin();
    var puedeEditar = auth.puede("contratos.crear");

    main().innerHTML = '<div class="icc-loading">Cargando contratos…</div>';
    // El estado se filtra en el navegador para poder contar todas las fases.
    var filtrosServidor = Object.assign({}, filtros);
    delete filtrosServidor.estado;
    var [todos, agentes] = await Promise.all([
      D.listarContratos(filtrosServidor),
      puedeFiltrarComercial ? D.listarAgentes({}).catch(function () { return []; }) : Promise.resolve([]),
    ]);
    var contratos = filtros.estado ? todos.filter(function (c) { return c.estado === filtros.estado; }) : todos;

    var hoy = hoyIso();
    var mes = hoy.slice(0, 7);
    var dias = function (f) { return f ? Math.floor((new Date(hoy + "T12:00:00") - new Date(String(f).slice(0, 10) + "T12:00:00")) / 86400000) : 0; };
    var num = function (v) { return String(Math.round(Number(v || 0) * 100) / 100).replace(".", ","); };
    var cuenta = {};
    C.ESTADOS_CONTRATO_ORDEN.forEach(function (e) { cuenta[e] = 0; });
    todos.forEach(function (c) { cuenta[c.estado] = (cuenta[c.estado] || 0) + 1; });
    var okMes = todos.filter(function (c) { return c.estado === "ok" && String(c.fecha_activacion || c.fecha_alta || "").slice(0, 7) === mes; }).length;
    var altasMes = todos.filter(function (c) { return String(c.fecha_alta || "").slice(0, 7) === mes; }).length;
    var kwTotal = todos.reduce(function (s, c) { return s + (c.estado !== "ko" && c.estado !== "decomisionado" ? Number(c.kw || 0) : 0); }, 0);
    // Tramitado y sin activar desde hace mas de 30 dias: hay que empujarlo.
    var atascado = function (c) { return c.estado === "tramitado" && dias(c.fecha_alta) > 30; };
    var nAtascados = todos.filter(atascado).length;
    var nProblemas = (cuenta.incidencias || 0) + (cuenta.ko || 0);

    var iconoSector = { energia: "⚡", telecomunicaciones: "📶", alarmas: "🚨", seguros: "🛡️", financiero: "💳" };
    var colorSector = { energia: "#60a5fa", telecomunicaciones: "#34d399", alarmas: "#f87171", seguros: "#a78bfa", financiero: "#fbbf24" };
    var paleta = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#FB923C", "#4ADE80", "#E879F9", "#2DD4BF", "#F87171", "#93C5FD", "#FDE047", "#C084FC"];
    var ids = {};
    agentes.forEach(function (a) { ids[a.id] = 1; });
    todos.forEach(function (c) { if (c.comercial_id) ids[c.comercial_id] = 1; });
    var colorCom = {};
    Object.keys(ids).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id, i) { colorCom[id] = paleta[i % paleta.length]; });
    var avatarC = function (c, t) {
      var n = c.comercial_nombre || "Sin asignar";
      var ini = n.split(/\s+/).filter(Boolean).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join("");
      return '<span class="icc-ag-ava" style="--c:' + (c.comercial_id ? colorCom[c.comercial_id] || "#64748B" : "#64748B") + ";--t:" + (t || 26) + 'px" title="' + esc(n) + '">' + esc(ini || "?") + "</span>";
    };
    var linkQs = function (cambios) {
      var x = Object.assign({}, filtros, { vista: vista === "tablero" ? "tablero" : "" }, cambios || {});
      var p = new URLSearchParams();
      Object.keys(x).forEach(function (k) { if (x[k]) p.set(k, x[k]); });
      return "#/contratos" + (p.toString() ? "?" + p.toString() : "");
    };
    var hayMasFiltros = !!(filtros.comercializadora || filtros.tarifa || filtros.desde || filtros.hasta);
    var hayFiltros = Object.keys(filtros).length > 0;
    var tituloSector = filtros.sector ? (iconoSector[filtros.sector] || "") + " " + (C.SECTORES[filtros.sector] || filtros.sector) : "";

    var selectorEstado = function (c) {
      return '<select class="icc-select icc-ct-estado-sel" data-estado-contrato="' + c.id + '" aria-label="Estado del contrato de ' + esc(c.titular) + '">' +
        C.ESTADOS_CONTRATO_ORDEN.map(function (e) { return '<option value="' + e + '"' + (c.estado === e ? " selected" : "") + ">" + esc(C.ESTADOS_CONTRATO[e].label) + "</option>"; }).join("") +
        "</select>";
    };

    var fila = function (c) {
      var meta = C.ESTADOS_CONTRATO[c.estado] || { label: c.estado, color: "#94a3b8" };
      var producto = [c.comercializadora, c.tarifa].filter(Boolean).join(" · ");
      return (
        '<article class="icc-ct-fila' + (atascado(c) ? " is-atascado" : "") + '" style="--e:' + meta.color + ";--s:" + (colorSector[c.sector] || "#94a3b8") + '">' +
        '<div class="icc-ct-titular"><span class="icc-ct-sector" title="' + esc(C.SECTORES[c.sector] || c.sector || "") + '">' + (iconoSector[c.sector] || "📄") + "</span>" +
        '<div><button type="button" class="icc-ct-abrir" data-contrato-id="' + c.id + '"><strong>' + esc(c.titular) + "</strong></button>" +
        "<small>" + esc([c.cif_titular, c.numero_contrato ? "Nº " + c.numero_contrato : ""].filter(Boolean).join(" · ") || "Sin número de contrato") + "</small>" +
        (atascado(c) ? '<span class="icc-ct-alerta">⏳ ' + dias(c.fecha_alta) + " d tramitado sin activar</span>" : "") +
        "</div></div>" +
        '<div class="icc-ct-producto"><b>' + esc(producto || "—") + "</b><small>" + (c.kw ? num(c.kw) + " kW" : "Sin kW") + "</small></div>" +
        '<div class="icc-ct-estado">' + (puedeEditar ? selectorEstado(c) : '<span class="icc-badge" style="--badge-color:' + meta.color + '">' + esc(meta.label) + "</span>") + "</div>" +
        '<div class="icc-ct-comercial">' + avatarC(c, 26) + "<span>" + esc(c.comercial_nombre || "Sin asignar") + "</span></div>" +
        '<div class="icc-ct-fecha"><b>' + esc(U.formatFecha(c.fecha_alta)) + "</b><small>" + (c.fecha_activacion ? "Activo " + esc(U.formatFecha(c.fecha_activacion)) : "Sin activar") + "</small></div>" +
        '<div class="icc-ct-acciones">' +
        (c.cliente_id ? '<a class="icc-btn icc-btn-ghost icc-ct-btn" href="#/clientes/' + c.cliente_id + '" title="Abrir la ficha del cliente">👤 Cliente</a>' : "") +
        '<button type="button" class="icc-btn icc-btn-secondary icc-ct-btn" data-contrato-id="' + c.id + '">' + (puedeEditar ? "✏️ Editar" : "Ver") + "</button>" +
        "</div></article>"
      );
    };

    var tarjeta = function (c) {
      var producto = [c.comercializadora, c.tarifa].filter(Boolean).join(" · ");
      return (
        '<button type="button" class="icc-ct-card' + (atascado(c) ? " is-atascado" : "") + '" data-contrato-id="' + c.id + '" style="--c:' + (c.comercial_id ? colorCom[c.comercial_id] || "#64748B" : "#64748B") + '">' +
        "<header><strong>" + esc(c.titular) + "</strong><span>" + (iconoSector[c.sector] || "📄") + "</span></header>" +
        "<small>" + esc(producto || C.SECTORES[c.sector] || "") + "</small>" +
        (c.kw ? '<small class="icc-ct-card-kw">' + num(c.kw) + " kW</small>" : "") +
        (atascado(c) ? '<span class="icc-ct-alerta">⏳ ' + dias(c.fecha_alta) + " d sin activar</span>" : "") +
        "<footer>" + avatarC(c, 22) + "<span>" + esc(c.comercial_nombre || "Sin asignar") + "</span><em>" + esc(U.formatFecha(c.fecha_alta)) + "</em></footer></button>"
      );
    };

    main().innerHTML =
      '<header class="icc-ag-hero icc-ct-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">📑 Contratos' + (tituloSector ? " · " + esc(tituloSector) : "") + "</span>" +
      "<h1>" + todos.length + (todos.length === 1 ? " contrato" : " contratos") + (hayFiltros && !filtros.estado ? " con este filtro" : "") + "</h1>" +
      '<p class="icc-ag-hero-res"><b class="ok">' + okMes + "</b> OK este mes · <b>" + altasMes + "</b> altas este mes · <b>" + num(kwTotal) + "</b> kW vivos" +
      (nProblemas ? ' · <b class="mal">' + nProblemas + "</b> con KO o incidencias" : "") + "</p></div>" +
      '<div class="icc-ag-hero-acc icc-ct-hero-acc">' +
      '<button class="icc-btn icc-btn-ghost" id="btn-exportar-contratos-csv">⬇ CSV</button>' +
      '<button class="icc-btn icc-btn-ghost" id="btn-exportar-contratos-xlsx">⬇ Excel</button>' +
      (puedeEditar ? '<button class="icc-btn icc-btn-primary icc-ag-btn-nueva" id="btn-nuevo-contrato">+ Nuevo contrato</button>' : "") +
      "</div></header>" +

      '<nav class="icc-ct-fases" aria-label="Filtrar por estado">' +
      '<a class="icc-ct-fase' + (!filtros.estado ? " is-activa" : "") + '" style="--c:#e2e8f0" href="' + linkQs({ estado: "" }) + '"><b>' + todos.length + "</b><span>Todos</span></a>" +
      C.ESTADOS_CONTRATO_ORDEN.map(function (e) {
        return '<a class="icc-ct-fase' + (filtros.estado === e ? " is-activa" : "") + '" style="--c:' + C.ESTADOS_CONTRATO[e].color + '" href="' + linkQs({ estado: filtros.estado === e ? "" : e }) + '">' +
          "<b>" + (cuenta[e] || 0) + "</b><span>" + esc(C.ESTADOS_CONTRATO[e].label) + "</span></a>";
      }).join("") +
      "</nav>" +
      (nAtascados
        ? '<a class="icc-aviso icc-ct-aviso" href="' + linkQs({ estado: "tramitado" }) + '">⏳ <b>' + nAtascados + "</b> " + (nAtascados === 1 ? "contrato lleva" : "contratos llevan") + " más de 30 días tramitado sin activar. Revísalos →</a>"
        : "") +
      ((cuenta.incidencias || 0) && filtros.estado !== "incidencias"
        ? '<a class="icc-aviso icc-ct-aviso is-alerta" href="' + linkQs({ estado: "incidencias" }) + '">⚠️ <b>' + cuenta.incidencias + "</b> " + (cuenta.incidencias === 1 ? "contrato tiene" : "contratos tienen") + " incidencias pendientes →</a>"
        : "") +

      '<section class="icc-card icc-ct-barra">' +
      '<form id="form-filtros-contrato" class="icc-ct-filtros">' +
      '<input class="icc-input" name="q" placeholder="🔎 Buscar por número, titular o CIF" value="' + esc(filtros.q || "") + '">' +
      '<select class="icc-select" name="sector"><option value="">Todos los sectores</option>' +
      Object.keys(C.SECTORES).map(function (s) { return '<option value="' + s + '"' + (filtros.sector === s ? " selected" : "") + ">" + (iconoSector[s] || "") + " " + C.SECTORES[s] + "</option>"; }).join("") + "</select>" +
      (puedeFiltrarComercial
        ? '<select class="icc-select" name="comercial_id"><option value="">Todo el equipo</option>' +
          agentes.map(function (a) { return '<option value="' + a.id + '"' + (filtros.comercial_id === String(a.id) ? " selected" : "") + ">" + esc(a.nombre + " " + (a.apellidos || "")) + "</option>"; }).join("") + "</select>"
        : "") +
      (filtros.estado ? '<input type="hidden" name="estado" value="' + esc(filtros.estado) + '">' : "") +
      (vista === "tablero" ? '<input type="hidden" name="vista" value="tablero">' : "") +
      '<details class="icc-ct-mas"' + (hayMasFiltros ? " open" : "") + "><summary>Más filtros" + (hayMasFiltros ? " •" : "") + "</summary>" +
      '<div class="icc-ct-mas-campos">' +
      '<label><span>Compañía</span><input class="icc-input" name="comercializadora" placeholder="Exacta, p. ej. Iberdrola" value="' + esc(filtros.comercializadora || "") + '"></label>' +
      '<label><span>Tarifa</span><input class="icc-input" name="tarifa" placeholder="Exacta, p. ej. 2.0TD" value="' + esc(filtros.tarifa || "") + '"></label>' +
      '<label><span>Alta desde</span><input class="icc-input" type="date" name="desde" value="' + esc(filtros.desde || "") + '"></label>' +
      '<label><span>Alta hasta</span><input class="icc-input" type="date" name="hasta" value="' + esc(filtros.hasta || "") + '"></label>' +
      "</div></details>" +
      '<div class="icc-ct-filtros-acc"><button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      (hayFiltros ? '<a class="icc-btn icc-btn-ghost" href="#/contratos' + (vista === "tablero" ? "?vista=tablero" : "") + '">Limpiar</a>' : "") +
      '<div class="icc-tabs icc-ct-vistas"><a class="icc-tab' + (vista === "lista" ? " is-active" : "") + '" href="' + linkQs({ vista: "" }) + '">☰ Lista</a>' +
      '<a class="icc-tab' + (vista === "tablero" ? " is-active" : "") + '" href="' + linkQs({ vista: "tablero" }) + '">▦ Tablero</a></div></div>' +
      "</form></section>" +

      (vista === "tablero"
        ? '<section class="icc-ct-tablero">' +
          C.ESTADOS_CONTRATO_ORDEN.filter(function (e) { return !filtros.estado || filtros.estado === e; }).map(function (e) {
            var lista = contratos.filter(function (c) { return c.estado === e; });
            return '<div class="icc-ct-col" style="--f:' + C.ESTADOS_CONTRATO[e].color + '"><div class="icc-pl-col-head"><div class="icc-pl-col-tit"><strong>' + esc(C.ESTADOS_CONTRATO[e].label) + "</strong><b>" + lista.length + "</b></div></div>" +
              '<div class="icc-pl-col-body">' + (lista.length ? lista.map(tarjeta).join("") : '<p class="icc-pl-vacio">Ninguno</p>') + "</div></div>";
          }).join("") +
          "</section>"
        : '<section class="icc-ct-lista">' +
          (contratos.length
            ? '<div class="icc-ct-cab"><span>Titular</span><span>Compañía · tarifa</span><span>Estado</span><span>Comercial</span><span>Alta</span><span></span></div>' + contratos.map(fila).join("")
            : '<p class="icc-empty">' + (todos.length ? "Ningún contrato en este estado." : "No hay contratos con estos filtros.") + "</p>") +
          (todos.length >= 500 ? '<p class="icc-muted icc-ct-limite">Se muestran los 500 más recientes. Usa los filtros para acotar.</p>' : "") +
          "</section>");

    document.getElementById("form-filtros-contrato").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var qs = new URLSearchParams();
      fd.forEach(function (v, k) {
        if (String(v).trim()) qs.set(k, String(v).trim());
      });
      location.hash = "#/contratos" + (qs.toString() ? "?" + qs.toString() : "");
    });
    var btnNuevo = document.getElementById("btn-nuevo-contrato");
    if (btnNuevo) btnNuevo.addEventListener("click", function () { modalContrato(null); });
    function exportarContratos(formato) {
      // Se exporta exactamente lo que se ve (filtros aplicados en la URL).
      var filtrosActuales = Object.assign({ formato: formato }, filtros);
      window.open(D.urlExportarContratos(filtrosActuales), "_blank");
    }
    document.getElementById("btn-exportar-contratos-csv").addEventListener("click", function () { exportarContratos("csv"); });
    document.getElementById("btn-exportar-contratos-xlsx").addEventListener("click", function () { exportarContratos("xlsx"); });
    main()
      .querySelectorAll("[data-contrato-id]")
      .forEach(function (el) {
        el.addEventListener("click", function () {
          var c = todos.filter(function (x) { return String(x.id) === el.getAttribute("data-contrato-id"); })[0];
          if (c) modalContrato(c);
        });
      });
    main()
      .querySelectorAll("[data-estado-contrato]")
      .forEach(function (sel) {
        sel.addEventListener("change", async function () {
          sel.disabled = true;
          try {
            await D.actualizarContrato(sel.getAttribute("data-estado-contrato"), { estado: sel.value });
            U.toast("Estado actualizado: " + C.ESTADOS_CONTRATO[sel.value].label, "success");
          } catch (err) {
            U.toast(err.message || "No se pudo cambiar el estado", "error");
          }
          viewContratos();
        });
      });
  }

  function modalContrato(contrato) {
    var esNuevo = !contrato;
    contrato = contrato || {};
    U.openModal(
      "<h2>" + (esNuevo ? "Nuevo contrato" : "Editar contrato") + "</h2>" +
      '<form id="form-contrato" class="icc-form">' +
      '<div class="icc-field"><label>Sector</label><select class="icc-select" name="sector">' +
      Object.keys(C.SECTORES)
        .map(function (s) {
          return '<option value="' + s + '"' + ((contrato.sector || "energia") === s ? " selected" : "") + ">" + C.SECTORES[s] + "</option>";
        })
        .join("") +
      "</select></div>" +
      campoTexto("numero_contrato", "Numero de contrato", false, "text", contrato.numero_contrato) +
      campoTexto("titular", "Titular", true, "text", contrato.titular) +
      campoTexto("cif_titular", "CIF/NIF titular", false, "text", contrato.cif_titular) +
      campoTexto("comercializadora", "Compañia (cualquiera del sector)", false, "text", contrato.comercializadora) +
      campoTexto("tarifa", "Tarifa / producto", false, "text", contrato.tarifa) +
      campoTexto("kw", "kW contratados", false, "number", contrato.kw) +
      campoTexto("fecha_alta", "Fecha de alta", true, "date", contrato.fecha_alta) +
      campoTexto("fecha_activacion", "Fecha de activacion", false, "date", contrato.fecha_activacion) +
      '<div class="icc-field"><label>Estado</label><select class="icc-select" name="estado">' +
      C.ESTADOS_CONTRATO_ORDEN.map(function (e) {
        return '<option value="' + e + '"' + (contrato.estado === e ? " selected" : "") + ">" + C.ESTADOS_CONTRATO[e].label + "</option>";
      }).join("") +
      "</select></div>" +
      '<div class="icc-field"><label>Notas</label><textarea class="icc-textarea" name="notas">' + U.escapeHtml(contrato.notas || "") + "</textarea></div>" +
      '<div class="icc-modal-actions">' +
      (esNuevo || !window.icc.auth.puede("contratos.borrar") ? "" : '<button type="button" class="icc-btn icc-btn-ghost" id="btn-borrar-contrato" style="margin-right:auto;color:var(--red)">Borrar</button>') +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">' + (esNuevo ? "Crear contrato" : "Guardar cambios") + "</button>" +
      "</div></form>"
    );

    document.getElementById("form-contrato").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var payload = {};
      ["sector", "numero_contrato", "titular", "cif_titular", "comercializadora", "tarifa", "kw", "fecha_alta", "fecha_activacion", "estado", "notas"].forEach(function (k) {
        payload[k] = fd.get(k) || "";
      });
      try {
        if (esNuevo) {
          await D.crearContrato(payload);
          U.toast("Contrato creado", "success");
        } else {
          await D.actualizarContrato(contrato.id, payload);
          U.toast("Contrato actualizado", "success");
        }
        U.closeModal();
        viewContratos();
      } catch (err) {
        U.toast(err.message || "No se pudo guardar el contrato", "error");
      }
    });

    var btnBorrar = document.getElementById("btn-borrar-contrato");
    if (btnBorrar) {
      btnBorrar.addEventListener("click", async function () {
        if (!confirm("¿Borrar este contrato? No se puede deshacer.")) return;
        try {
          await D.borrarContrato(contrato.id);
          U.closeModal();
          U.toast("Contrato borrado", "success");
          viewContratos();
        } catch (err) {
          U.toast(err.message || "No se pudo borrar el contrato", "error");
        }
      });
    }
  }

  // ----------------------------------------------------------------- Agentes
  // Sin limite de tamano de equipo (equipos de 15-20 comerciales o mas).
  function opcionesJefesEquipo(agentes, supervisorActual) {
    // Admin/Super Admin tambien cuentan como posible jefe de equipo: si
    // alguien lideraba un equipo como Jefe de equipo y luego se promociona,
    // sigue pudiendo ser el supervisor de ese mismo equipo (si no, el
    // desplegable lo "perderia" de la lista y parece que el equipo
    // desaparecio, aunque los datos siguen intactos).
    var jefes = agentes.filter(function (a) {
      return a.rol === "jefe_de_equipo" || esRolAdmin(a.rol);
    });
    return (
      '<option value="">Sin jefe de equipo asignado</option>' +
      jefes
        .map(function (j) {
          var equipo = agentes.filter(function (a) {
            return a.rol === "comercial" && String(a.supervisor_id) === String(j.id);
          }).length;
          return (
            '<option value="' + j.id + '"' +
            (String(j.id) === String(supervisorActual) ? " selected" : "") +
            ">" + U.escapeHtml(j.nombre) + " (" + equipo + (equipo === 1 ? " comercial" : " comerciales") + ")</option>"
          );
        })
        .join("")
    );
  }

  // Responsable de un Jefe de equipo: siempre un Admin o Super Admin
  // (jerarquia Admin -> Jefe de equipo -> Comerciales).
  function opcionesResponsablesJefe(agentes, supervisorActual) {
    var admins = agentes.filter(function (a) {
      return esRolAdmin(a.rol);
    });
    return (
      '<option value="">Sin responsable asignado</option>' +
      admins
        .map(function (j) {
          var jefes = agentes.filter(function (a) {
            return a.rol === "jefe_de_equipo" && String(a.supervisor_id) === String(j.id);
          }).length;
          return (
            '<option value="' + j.id + '"' +
            (String(j.id) === String(supervisorActual) ? " selected" : "") +
            ">" + U.escapeHtml(j.nombre) + " (" + jefes + (jefes === 1 ? " jefe de equipo" : " jefes de equipo") + ")</option>"
          );
        })
        .join("")
    );
  }

  // Backoffice: que comerciales concretos atiende (agrupados por Jefe de
  // equipo). Sin ninguno marcado sigue viendo toda la empresa.
  // agendas: ids con agenda compartida (solo agenda) o null si falta la migracion.
  function modalAsignarComerciales(backoffice, agentes, asignados, alGuardar, agendas, equipos) {
    var marcados = (asignados || []).map(String);
    // Equipos completos (null si falta sql/migracion_backoffice_equipos.sql).
    var conEquipos = Array.isArray(equipos);
    var equiposMarcados = (equipos || []).map(String);
    var conAgendas = Array.isArray(agendas);
    var agendasMarcadas = (agendas || []).map(String);
    var superiores = agentes.filter(function (a) { return a.rol === "jefe_de_equipo" || esRolAdmin(a.rol); });
    var comerciales = agentes.filter(function (a) { return a.rol === "comercial"; });
    var grupos = {};
    var orden = [];
    comerciales.forEach(function (c) {
      var clave = c.supervisor_id ? String(c.supervisor_id) : "";
      if (!grupos[clave]) { grupos[clave] = []; orden.push(clave); }
      grupos[clave].push(c);
    });
    function nombreJefe(clave) {
      if (!clave) return "Sin jefe de equipo";
      var j = agentes.filter(function (a) { return String(a.id) === clave; })[0];
      return j ? "Equipo de " + j.nombre + (j.apellidos ? " " + j.apellidos : "") : "Equipo #" + clave;
    }
    orden.sort(function (a, b) { return nombreJefe(a).localeCompare(nombreJefe(b)); });

    U.openModal(
      "<h2>Comerciales asignados a " + U.escapeHtml(backoffice.nombre) + "</h2>" +
      '<p class="icc-muted">Marca los comerciales que lleva este usuario de Backoffice: solo verá sus clientes, contratos, presupuestos, ' +
      "agenda e informes, y en Agentes solo le aparecerán ellos. Si no marcas ninguno, sigue viendo toda la empresa.</p>" +
      '<form id="form-asignar-comerciales" class="icc-form">' +
      (orden.length
        ? orden
            .map(function (clave) {
              return (
                '<div class="icc-field"><label>' + U.escapeHtml(nombreJefe(clave)) +
                ' <button type="button" class="icc-link-btn" data-marcar-equipo="' + U.escapeHtml(clave) + '">Marcar todo el equipo</button></label>' +
                (conEquipos && clave
                  ? '<label class="icc-check icc-bo-equipo-completo"><input type="checkbox" name="equipo" value="' + U.escapeHtml(clave) + '"' +
                    (equiposMarcados.indexOf(clave) !== -1 ? " checked" : "") + "> <b>Todo el equipo, incluidos los comerciales nuevos</b></label>"
                  : "") +
                '<div class="icc-checks">' +
                grupos[clave]
                  .map(function (c) {
                    return (
                      '<label class="icc-check"><input type="checkbox" name="comercial" data-equipo="' + U.escapeHtml(clave) + '" value="' + c.id + '"' +
                      (marcados.indexOf(String(c.id)) !== -1 ? " checked" : "") + "> " +
                      U.escapeHtml(c.nombre + " " + (c.apellidos || "")) + (Number(c.bloqueado) ? " (bloqueado)" : "") + "</label>"
                    );
                  })
                  .join("") +
                "</div></div>"
              );
            })
            .join("")
        : '<p class="icc-muted">No hay comerciales dados de alta.</p>') +
      // Agendas de jefes y direccion: solo agenda, nada mas de lo suyo.
      '<div class="icc-field icc-bo-agendas"><label>📅 Agendas compartidas (solo agenda)</label>' +
      (conAgendas
        ? '<p class="icc-muted" style="margin:0 0 8px">Puede ver y concertar visitas en la agenda de estas personas, pero <b>no</b> verá sus clientes, contratos, presupuestos, proformas ni informes.</p>' +
          '<div class="icc-checks">' +
          (superiores.length
            ? superiores.map(function (j) {
                return '<label class="icc-check"><input type="checkbox" name="agenda" value="' + j.id + '"' + (agendasMarcadas.indexOf(String(j.id)) !== -1 ? " checked" : "") + "> " +
                  U.escapeHtml(j.nombre + " " + (j.apellidos || "")) + ' <span class="icc-muted">· ' + U.escapeHtml(C.ROLES[j.rol] || j.rol) + "</span></label>";
              }).join("")
            : '<span class="icc-muted">No hay jefes de equipo ni cargos de dirección.</span>') +
          "</div>"
        : '<p class="icc-muted" style="margin:0">Para compartir agendas importa antes <code>sql/migracion_backoffice_agendas.sql</code>.</p>') +
      "</div>" +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Guardar</button>' +
      "</div></form>"
    );

    var form = document.getElementById("form-asignar-comerciales");
    // Con "todo el equipo" marcado, sus comerciales van incluidos (y no se tocan a mano).
    var sincronizarEquipo = function (chk) {
      form.querySelectorAll('input[name="comercial"][data-equipo="' + chk.value + '"]').forEach(function (i) {
        if (chk.checked) i.checked = true;
        i.disabled = chk.checked;
      });
    };
    form.querySelectorAll('input[name="equipo"]').forEach(function (chk) {
      sincronizarEquipo(chk);
      chk.addEventListener("change", function () { sincronizarEquipo(chk); });
    });
    form.querySelectorAll("[data-marcar-equipo]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var clave = btn.getAttribute("data-marcar-equipo");
        var checks = Array.prototype.filter.call(form.querySelectorAll('input[name="comercial"]'), function (i) {
          return i.getAttribute("data-equipo") === clave;
        });
        var todos = checks.every(function (i) { return i.checked; });
        checks.forEach(function (i) { i.checked = !todos; });
      });
    });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      // Los comerciales de un equipo completo no se guardan sueltos: van por el equipo.
      var ids = Array.prototype.map.call(form.querySelectorAll('input[name="comercial"]:checked:not(:disabled)'), function (i) { return Number(i.value); });
      var equipoIds = conEquipos ? Array.prototype.map.call(form.querySelectorAll('input[name="equipo"]:checked'), function (i) { return Number(i.value); }) : null;
      var agendaIds = conAgendas ? Array.prototype.map.call(form.querySelectorAll('input[name="agenda"]:checked'), function (i) { return Number(i.value); }) : null;
      try {
        await D.guardarAsignacionesBackoffice(backoffice.id, ids, agendaIds, equipoIds);
        U.toast(ids.length || (equipoIds && equipoIds.length) ? "Comerciales asignados guardados" : "Sin comerciales asignados: verá toda la empresa", "success");
        U.closeModal();
        if (alGuardar) alGuardar();
      } catch (err) {
        U.toast(err.message || "No se pudieron guardar los comerciales asignados", "error");
      }
    });
  }

  // "Ver como": entra en la cuenta de otro usuario (Admin, o Jefe de equipo
  // sobre sus comerciales) hasta pulsar "Volver a mi cuenta".
  async function entrarComo(id, nombre) {
    if (!confirm('¿Entrar como "' + (nombre || "este usuario") + '"? Veras el CRM exactamente como lo ve el, hasta que pulses "Volver a mi cuenta".')) return;
    // Navega primero: si se cambia de usuario antes de cambiar el hash,
    // el repintado automatico (por el cambio de sesion) y el cambio de
    // hash compiten entre si y la pantalla se puede quedar a medias en
    // Agentes en vez de pasar a Inicio.
    location.hash = "#/dashboard";
    try {
      await window.icc.auth.verComo(id);
      U.toast("Viendo el CRM como " + (nombre || "otro usuario"), "success");
    } catch (err) {
      U.toast(err.message || "No se pudo entrar en esa cuenta", "error");
    }
  }

  // Tras dar de alta una cuenta: datos de acceso para entregarselos al usuario.
  function modalUsuarioCreado(id, payload) {
    var texto =
      "Acceso al CRM de Integral Connection Consulting\n" +
      "Web: " + location.origin + location.pathname + "\n" +
      "Usuario: " + payload.email + "\n" +
      "Contraseña provisional: " + payload.password + "\n" +
      "Al entrar por primera vez se te pedirá cambiarla.";
    U.openModal(
      "<h2>✅ Usuario creado</h2>" +
      '<p class="icc-muted">' + U.escapeHtml(payload.nombre + " " + (payload.apellidos || "")) + " ya puede entrar con estos datos. " +
      "La contraseña no se vuelve a mostrar: cópiala ahora.</p>" +
      '<pre class="icc-credenciales" id="credenciales-nuevo">' + U.escapeHtml(texto) + "</pre>" +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" id="btn-copiar-credenciales">📋 Copiar</button>' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cerrar</button>' +
      '<a class="icc-btn icc-btn-primary" href="#/agentes/' + id + '/informacion" id="btn-abrir-ficha-nuevo">Abrir su ficha</a>' +
      "</div>"
    );
    document.getElementById("btn-copiar-credenciales").addEventListener("click", function () {
      var ok = function () { U.toast("Datos de acceso copiados", "success"); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(texto).then(ok, function () { U.toast("No se pudo copiar", "error"); });
      } else {
        var r = document.createRange();
        r.selectNodeContents(document.getElementById("credenciales-nuevo"));
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand("copy");
        ok();
      }
    });
    document.getElementById("btn-abrir-ficha-nuevo").addEventListener("click", function () { U.closeModal(); });
  }

  function passwordProvisional() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    var buf = new Uint32Array(10);
    window.crypto.getRandomValues(buf);
    var out = "";
    for (var i = 0; i < buf.length; i++) out += abc[buf[i] % abc.length];
    return out;
  }

  function modalNuevoAgente(agentes) {
    var esAdmin = window.icc.auth.esAdminOSuperior();
    var esBackoffice = window.icc.auth.tieneRol("backoffice");
    // Backoffice: jefes de los equipos con los que trabaja (los de sus comerciales y
    // las agendas que gestiona). El servidor vuelve a comprobarlo.
    var jefesBo = [];
    if (esBackoffice) {
      var vistos = {};
      agentes.forEach(function (a) {
        if (a.rol === "comercial" && a.supervisor_id && !vistos[a.supervisor_id]) {
          vistos[a.supervisor_id] = true;
          var j = agentes.filter(function (x) { return String(x.id) === String(a.supervisor_id); })[0];
          jefesBo.push({ id: a.supervisor_id, nombre: j ? (j.nombre + " " + (j.apellidos || "")).trim() : a.supervisor_nombre || "Jefe #" + a.supervisor_id });
        }
      });
      agentes.forEach(function (a) {
        if (Number(a.solo_agenda) && (a.rol === "jefe_de_equipo" || esRolAdmin(a.rol)) && !vistos[a.id]) {
          vistos[a.id] = true;
          jefesBo.push({ id: a.id, nombre: (a.nombre + " " + (a.apellidos || "")).trim() });
        }
      });
    }
    var esSuperAdmin = window.icc.auth.esSuperAdmin();
    var rolesDisponibles = esSuperAdmin
      ? Object.keys(C.ROLES)
      : Object.keys(C.ROLES).filter(function (r) { return !esRolAdmin(r); });

    U.openModal(
      "<h2>Nuevo usuario</h2>" +
      (esBackoffice
        ? '<p class="icc-muted">Se creará como <b>Comercial / Agente</b> (es el único rol que puedes dar de alta) y quedará entre tus comerciales.</p>'
        : !esAdmin ? '<p class="icc-muted">Se creará como Comercial / Agente dentro de tu equipo y podrás gestionar su cuenta y su ficha.</p>' : "") +
      '<form id="form-nuevo-agente" class="icc-form" autocomplete="off">' +
      campoTexto("nombre", "Nombre", true, "text") +
      campoTexto("apellidos", "Apellidos", false, "text") +
      campoTexto("email", "Email", true, "email") +
      campoTexto("password", "Contraseña provisional", true, "text", passwordProvisional()) +
      campoTexto("telefono", "Teléfono", false, "text") +
      campoTexto("empresa", "Empresa", false, "text") +
      campoTexto("cif", "CIF", false, "text") +
      (esAdmin
        ? '<div class="icc-field"><label>Rol</label><select class="icc-select" name="rol" id="select-nuevo-rol">' +
          rolesDisponibles
            .map(function (r) {
              return '<option value="' + r + '"' + (r === "comercial" ? " selected" : "") + ">" + C.ROLES[r] + "</option>";
            })
            .join("") +
          "</select></div>" +
          '<div class="icc-field" id="campo-supervisor"><label>Jefe de equipo asignado</label>' +
          '<select class="icc-select" name="supervisor_id">' + opcionesJefesEquipo(agentes, "") + "</select></div>" +
          '<div class="icc-field" id="campo-responsable"><label>Admin responsable de este Jefe de equipo</label>' +
          '<select class="icc-select" name="responsable_id">' + opcionesResponsablesJefe(agentes, "") + "</select></div>"
        : '<input type="hidden" name="rol" value="comercial">' +
          (esBackoffice
            ? '<div class="icc-field"><label>Rol</label><input class="icc-input" value="Comercial / Agente" disabled></div>' +
              '<div class="icc-field"><label>Jefe de equipo</label><select class="icc-select" name="supervisor_id">' +
              jefesBo.map(function (j, i) { return '<option value="' + j.id + '"' + (i === 0 ? " selected" : "") + ">Equipo de " + U.escapeHtml(j.nombre) + "</option>"; }).join("") +
              '<option value="">Sin jefe de equipo</option></select></div>'
            : "")) +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Crear usuario</button>' +
      "</div></form>"
    );

    if (esAdmin) {
      var selectRol = document.getElementById("select-nuevo-rol");
      var campoSupervisor = document.getElementById("campo-supervisor");
      var campoResponsable = document.getElementById("campo-responsable");
      function actualizarVisibilidadSupervisor() {
        campoSupervisor.style.display = selectRol.value === "comercial" ? "" : "none";
        campoResponsable.style.display = selectRol.value === "jefe_de_equipo" ? "" : "none";
      }
      actualizarVisibilidadSupervisor();
      selectRol.addEventListener("change", actualizarVisibilidadSupervisor);
    }

    document.getElementById("form-nuevo-agente").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var payload = {};
      ["nombre", "apellidos", "email", "password", "telefono", "empresa", "cif", "rol"].forEach(function (k) {
        payload[k] = fd.get(k) || "";
      });
      if ((esAdmin || esBackoffice) && payload.rol === "comercial" && fd.get("supervisor_id")) {
        payload.supervisor_id = fd.get("supervisor_id");
      }
      if (esAdmin && payload.rol === "jefe_de_equipo" && fd.get("responsable_id")) {
        payload.supervisor_id = fd.get("responsable_id");
      }
      try {
        var res = await D.crearAgente(payload);
        U.toast("Usuario creado", "success");
        U.closeModal();
        await viewAgentes();
        if (res) modalUsuarioCreado(res, payload);
      } catch (err) {
        U.toast(err.message || "No se pudo crear el usuario", "error");
      }
    });
  }

  /**
   * Borra una o varias cuentas. Antes enseña lo que tiene cada una y lo
   * traspasa a una cuenta de dirección (clientes, contratos, presupuestos,
   * proformas, citas, informes, carpeta personal y equipo), para que la
   * empresa siga trabajando con todo.
   */
  async function modalBajaAgentes(ids, agentes) {
    var esc = U.escapeHtml;
    var porId = {};
    agentes.forEach(function (a) { porId[a.id] = a; });
    var nombre = function (a) { return a ? (a.nombre + " " + (a.apellidos || "")).trim() : "Usuario"; };
    var miId = String((window.icc.auth.state.user || {}).id);
    var destinos = agentes.filter(function (a) {
      return esRolAdmin(a.rol) && !Number(a.bloqueado) && ids.indexOf(String(a.id)) === -1;
    });
    if (!destinos.length) {
      U.toast("No hay ninguna cuenta de dirección activa a la que traspasar los datos", "error");
      return;
    }
    var resumen = {};
    try {
      resumen = await D.resumenBajaAgentes(ids);
    } catch (err) {
      U.toast(err.message || "No se pudo consultar lo que tienen esas cuentas", "error");
      return;
    }
    var etiquetas = { clientes: "clientes", contratos: "contratos", presupuestos: "presupuestos", proformas: "proformas", citas: "citas",
      informes_energia: "informes de energía", informes_telefonia: "informes de telefonía", archivos_personales: "archivos personales", equipo: "personas a su cargo" };
    var textoResumen = function (r) {
      var singular = { clientes: "cliente", contratos: "contrato", presupuestos: "presupuesto", proformas: "proforma", citas: "cita",
        informes_energia: "informe de energía", informes_telefonia: "informe de telefonía", archivos_personales: "archivo personal", equipo: "persona a su cargo" };
      var partes = Object.keys(etiquetas).filter(function (k) { return r && Number(r[k]); }).map(function (k) { return "<b>" + Number(r[k]) + "</b> " + (Number(r[k]) === 1 ? singular[k] : etiquetas[k]); });
      return partes.length ? partes.join(" · ") : "Sin datos";
    };
    var total = {};
    ids.forEach(function (id) { Object.keys(etiquetas).forEach(function (k) { total[k] = (total[k] || 0) + Number((resumen[id] || {})[k] || 0); }); });

    U.openModal(
      "<h2>🗑 Borrar " + (ids.length === 1 ? "cuenta" : ids.length + " cuentas") + "</h2>" +
      '<p class="icc-muted">Las cuentas se eliminan y <b>todo lo suyo pasa a la cuenta que elijas</b>, para que la empresa siga trabajando con ello.</p>' +
      '<ul class="icc-baja-lista">' +
      ids.map(function (id) {
        var a = porId[id];
        return '<li><strong>' + esc(nombre(a)) + '</strong> <span class="icc-muted">' + esc(a ? C.ROLES[a.rol] || a.rol : "") + "</span><small>" + textoResumen(resumen[id]) + "</small></li>";
      }).join("") +
      "</ul>" +
      (ids.length > 1 ? '<p class="icc-baja-total">En total: ' + textoResumen(total) + "</p>" : "") +
      '<form id="form-baja" class="icc-form">' +
      '<div class="icc-field"><label for="baja-destino">Todo pasa a</label><select class="icc-select" id="baja-destino" name="destino">' +
      destinos.map(function (d) {
        return '<option value="' + d.id + '"' + (String(d.id) === miId ? " selected" : "") + ">" + esc(nombre(d)) + " · " + esc(C.ROLES[d.rol] || d.rol) + "</option>";
      }).join("") + "</select>" +
      '<span class="icc-ayuda">Recibe sus clientes, contratos, presupuestos, proformas, citas, informes, su carpeta de facturación (marcada «baja») y, si era jefe, su equipo.</span></div>' +
      '<div class="icc-field"><label for="baja-confirmar">Para confirmar, escribe BORRAR</label><input class="icc-input" id="baja-confirmar" autocomplete="off" required></div>' +
      '<p class="icc-baja-progreso" id="baja-progreso" role="status"></p>' +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-ap-btn-baja" id="baja-ok" disabled>Borrar y traspasar</button></div></form>'
    );
    var form = document.getElementById("form-baja");
    var confirmar = document.getElementById("baja-confirmar");
    var ok = document.getElementById("baja-ok");
    confirmar.addEventListener("input", function () { ok.disabled = confirmar.value.trim().toUpperCase() !== "BORRAR"; });
    confirmar.focus();
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (confirmar.value.trim().toUpperCase() !== "BORRAR") return;
      var destino = document.getElementById("baja-destino").value;
      var progreso = document.getElementById("baja-progreso");
      ok.disabled = true;
      confirmar.disabled = true;
      var hechos = 0;
      var errores = [];
      for (var i = 0; i < ids.length; i++) {
        progreso.textContent = "Borrando " + (i + 1) + " de " + ids.length + ": " + nombre(porId[ids[i]]) + "…";
        try {
          await D.borrarAgente(ids[i], destino);
          hechos++;
        } catch (err) {
          errores.push(nombre(porId[ids[i]]) + ": " + (err.message || "error"));
        }
      }
      U.closeModal();
      if (hechos) U.toast(hechos + (hechos === 1 ? " cuenta borrada" : " cuentas borradas") + "; sus datos pasan a " + nombre(porId[destino]), "success");
      errores.forEach(function (m) { U.toast(m, "error"); });
      viewAgentes();
    });
  }

  async function viewAgentes() {
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var q = (params.get("q") || params.get("nombre") || "").trim();
    var rolFiltro = params.get("rol") || "";
    var estadoFiltro = params.get("estado") === "bloqueados" ? "bloqueados" : params.get("bloqueado") === "1" ? "bloqueados" : "";
    var vista = params.get("vista") === "equipos" ? "equipos" : "tarjetas";
    var esc = U.escapeHtml;

    main().innerHTML = '<div class="icc-loading">Cargando agentes…</div>';
    var agentes = await D.listarAgentes({});
    var esAdmin = window.icc.auth.esAdminOSuperior();
    // null = falta la migracion de asignaciones de Backoffice (se oculta el boton).
    var datosBo = esAdmin ? await D.obtenerAsignacionesBackoffice().catch(function () { return null; }) : null;
    var asignacionesBo = datosBo ? datosBo.asignaciones || {} : null;
    var agendasBo = datosBo && datosBo.agendas_disponible ? datosBo.agendas || {} : null;
    var equiposBo = datosBo && datosBo.equipos_disponible ? datosBo.equipos || {} : null;
    // Comerciales que lleva de verdad un Backoffice: sueltos + los de sus equipos completos.
    var comercialesDeBo = function (boId) {
      var set = {};
      (asignacionesBo && asignacionesBo[boId] || []).forEach(function (cid) { set[cid] = 1; });
      (equiposBo && equiposBo[boId] || []).forEach(function (jid) {
        agentes.forEach(function (x) { if (x.rol === "comercial" && String(x.supervisor_id) === String(jid)) set[x.id] = 1; });
      });
      return Object.keys(set);
    };
    var miUsuario = window.icc.auth.state.user || {};
    var avisoBackoffice = miUsuario.rol === "backoffice" && Number(miUsuario.comerciales_asignados) > 0;
    var esSuperAdmin = window.icc.auth.esSuperAdmin();
    var esJefeDeEquipo = window.icc.auth.tieneRol("jefe_de_equipo");
    var jefePuedeCrear = (esJefeDeEquipo || miUsuario.rol === "backoffice") && window.icc.auth.puede("usuarios.crear");
    var jefeGestiona = esJefeDeEquipo && window.icc.auth.puede("usuarios.gestionar");
    var jefeVerComo = esJefeDeEquipo && window.icc.auth.puede("usuarios.ver_como");
    var miId = miUsuario.id;
    // Comercial de mi propio equipo (lo que un Jefe de equipo puede gestionar).
    function esDeMiEquipo(a) {
      return esJefeDeEquipo && a.rol === "comercial" && String(a.supervisor_id) === String(miId);
    }
    var rolesParaAdmin = esSuperAdmin
      ? Object.keys(C.ROLES)
      : Object.keys(C.ROLES).filter(function (r) { return !esRolAdmin(r); });
    // Misma regla que api/ficha_agente.php: la ficha la abren el propio
    // agente, su Jefe de equipo y Admin/Super Admin (Admin no abre la de otro Admin).
    function puedeVerFicha(a) {
      if (String(a.id) === String(miId) || esSuperAdmin) return true;
      if (esAdmin) return !esRolAdmin(a.rol);
      return esJefeDeEquipo && String(a.supervisor_id) === String(miId);
    }

    var colorRol = { comercial: "#22D3EE", jefe_de_equipo: "#A78BFA", backoffice: "#FBBF24", coordinador: "#60A5FA", gerente: "#FB923C", admin: "#34D399", super_admin: "#F472B6" };
    var iconoRol = { comercial: "💼", jefe_de_equipo: "🧭", backoffice: "🗂️", coordinador: "🎯", gerente: "📊", admin: "🏛️", super_admin: "👑" };
    var grupoRol = function (r) { return esRolAdmin(r) ? "direccion" : r; };
    var bloqueado = function (a) { return Number(a.bloqueado) === 1; };
    var nombreDe = function (a) { return (a.nombre + " " + (a.apellidos || "")).trim(); };
    var porId = {};
    agentes.forEach(function (a) { porId[a.id] = a; });

    // ---- Filtros (en el navegador)
    var coincide = function (a) {
      if (rolFiltro && grupoRol(a.rol) !== rolFiltro) return false;
      if (estadoFiltro === "bloqueados" && !bloqueado(a)) return false;
      return true;
    };
    var visibles = agentes.filter(coincide);
    var textoBusqueda = function (a) {
      return [nombreDe(a), a.email, a.empresa, a.cif, a.telefono, C.ROLES[a.rol], a.supervisor_nombre].join(" ").toLowerCase();
    };

    // ---- Resumen
    var activos = agentes.filter(function (a) { return !bloqueado(a); });
    var cuenta = { comercial: 0, jefe_de_equipo: 0, backoffice: 0, direccion: 0 };
    agentes.forEach(function (a) { cuenta[grupoRol(a.rol)] = (cuenta[grupoRol(a.rol)] || 0) + 1; });
    var nBloqueados = agentes.length - activos.length;
    var contratosMes = agentes.reduce(function (s, a) { return s + Number(a.contratos_mes || 0); }, 0);
    var comercialesSinJefe = agentes.filter(function (a) { return a.rol === "comercial" && !a.supervisor_id && !bloqueado(a); }).length;

    var linkQs = function (cambios) {
      var x = Object.assign({ rol: rolFiltro, estado: estadoFiltro, vista: vista === "equipos" ? "equipos" : "", q: q }, cambios || {});
      var p = new URLSearchParams();
      Object.keys(x).forEach(function (k) { if (x[k]) p.set(k, x[k]); });
      return "#/agentes" + (p.toString() ? "?" + p.toString() : "");
    };

    var chip = function (clave, label, n, color, icono, esEstado) {
      var activo = esEstado ? estadoFiltro === clave : rolFiltro === clave && !estadoFiltro;
      if (!clave) activo = !rolFiltro && !estadoFiltro;
      var href = esEstado
        ? linkQs({ estado: activo ? "" : clave, rol: "" })
        : linkQs({ rol: activo ? "" : clave, estado: "" });
      return '<a class="icc-ap-chip' + (activo ? " is-activo" : "") + '" style="--c:' + color + '" href="' + href + '">' +
        '<span class="icc-ap-chip-ico">' + icono + "</span><b>" + n + "</b><span>" + label + "</span></a>";
    };

    var avatarRol = function (a, t) {
      return '<span class="icc-ap-ava" style="--c:' + (colorRol[a.rol] || "#94A3B8") + '">' + U.avatar(a, t) + "</span>";
    };

    // Control de jefe de equipo / responsable / comerciales asignados.
    var controlEquipo = function (a, puedeGestionarFila) {
      if (a.rol === "backoffice" && esAdmin && asignacionesBo) {
        var n = comercialesDeBo(a.id).length;
        return '<button type="button" class="icc-btn icc-btn-ghost icc-ap-btn-bo" data-asignar-bo-id="' + a.id + '">👥 ' +
          (n ? (n === 1 ? "1 comercial asignado" : n + " comerciales asignados") : "Ve toda la empresa") + "</button>";
      }
      if (a.rol !== "comercial" && a.rol !== "jefe_de_equipo") return "";
      if (esAdmin && puedeGestionarFila) {
        return '<select class="icc-select" data-supervisor-id="' + a.id + '" aria-label="' + (a.rol === "comercial" ? "Jefe de equipo" : "Responsable") + " de " + esc(nombreDe(a)) + '">' +
          (a.rol === "comercial" ? opcionesJefesEquipo(agentes, a.supervisor_id) : opcionesResponsablesJefe(agentes, a.supervisor_id)) + "</select>";
      }
      var sup = porId[a.supervisor_id];
      return '<span class="icc-ap-sup">' + esc(sup ? nombreDe(sup) : a.supervisor_nombre || "Sin asignar") + "</span>";
    };

    var tarjeta = function (a) {
      var esObjetivoAdminTier = esRolAdmin(a.rol);
      var esYoMismo = String(a.id) === String(miId);
      // Un Admin normal no gestiona cuentas de Admin/Super Admin (solo Super Admin).
      var puedeGestionarFila = esSuperAdmin || (esAdmin && (!esObjetivoAdminTier || esYoMismo));
      var disp = a.estado_disponibilidad && a.estado_disponibilidad !== "disponible" ? C.ESTADOS_DISPONIBILIDAD[a.estado_disponibilidad] : null;
      var color = colorRol[a.rol] || "#94A3B8";
      var equipo = agentes.filter(function (x) { return x.rol === "comercial" && String(x.supervisor_id) === String(a.id); });
      var hrefNombre = Number(a.solo_agenda) ? "#/agenda?comercial_id=" + a.id : puedeVerFicha(a) ? "#/agentes/" + a.id : esAdmin || esJefeDeEquipo ? "#/clientes?comercial_id=" + a.id : "";

      var datos = [];
      // Cada dato lleva a su listado filtrado por esta persona.
      if (a.rol === "comercial" || Number(a.n_clientes)) datos.push('<a href="#/pipeline?comercial_id=' + a.id + '" title="Ver sus clientes en el pipeline"><b>' + Number(a.n_clientes || 0) + "</b><span>clientes</span></a>");
      if (a.rol === "comercial" || Number(a.contratos_mes)) datos.push('<a href="#/contratos?comercial_id=' + a.id + '" title="Ver sus contratos"><b class="' + (Number(a.contratos_mes) ? "ok" : "") + '">' + Number(a.contratos_mes || 0) + "</b><span>contratos mes</span></a>");
      if (a.rol === "jefe_de_equipo" || equipo.length) datos.push('<a href="' + linkQs({ vista: "equipos", rol: "", estado: "" }) + '" title="Ver su equipo"><b>' + equipo.length + "</b><span>" + (equipo.length === 1 ? "comercial" : "comerciales") + "</span></a>");
      if (a.rol === "backoffice" && asignacionesBo) {
        var nBo = comercialesDeBo(a.id).length;
        datos.push('<button type="button" data-asignar-bo-id="' + a.id + '" title="Elegir sus comerciales"><b>' + (nBo || "Todos") + "</b><span>" + (nBo ? "asignados" : "comerciales") + "</span></button>");
        if (agendasBo) {
          var nAg = (agendasBo[a.id] || []).length;
          datos.push('<button type="button" data-asignar-bo-id="' + a.id + '" title="Agendas de jefes y dirección que gestiona (solo agenda)"><b>' + nAg + "</b><span>📅 " + (nAg === 1 ? "agenda" : "agendas") + "</span></button>");
        }
      }
      // Superior del que este Backoffice solo gestiona la agenda.
      if (Number(a.solo_agenda)) datos = ['<a href="#/agenda?comercial_id=' + a.id + '" title="Concertar visitas en su agenda"><b>📅</b><span>Ver su agenda</span></a>'];

      var etiquetaEquipo = a.rol === "comercial" ? "Jefe de equipo" : a.rol === "jefe_de_equipo" ? "Responsable" : a.rol === "backoffice" ? "Comerciales" : "";
      var ctrl = controlEquipo(a, puedeGestionarFila);
      var puedeRol = puedeGestionarFila && !esYoMismo;
      // Nadie se bloquea a si mismo (se quedaria fuera del CRM).
      var puedeBloquear = !esYoMismo && (puedeGestionarFila || (jefeGestiona && esDeMiEquipo(a)));
      // Backoffice: "Ver como" en los comerciales que lleva (el servidor lo vuelve a comprobar).
      var boVerComo = miUsuario.rol === "backoffice" && window.icc.auth.puede("usuarios.ver_como") && a.rol === "comercial" && !Number(a.solo_agenda);
      var puedeVerComo = (esAdmin && puedeGestionarFila && !esYoMismo) || (jefeVerComo && esDeMiEquipo(a) && !bloqueado(a)) || (boVerComo && !esYoMismo && !bloqueado(a));
      var puedeBorrar = esAdmin && puedeGestionarFila && !esYoMismo;

      return (
        '<article class="icc-ap-card' + (bloqueado(a) ? " is-bloqueado" : "") + '" style="--c:' + color + '" data-buscar="' + esc(textoBusqueda(a)) + '">' +
        (puedeBorrar ? '<label class="icc-ap-sel" title="Seleccionar para borrar"><input type="checkbox" data-sel-id="' + a.id + '" aria-label="Seleccionar a ' + esc(nombreDe(a)) + '"></label>' : "") +
        '<header class="icc-ap-cab">' + avatarRol(a, 48) +
        '<div class="icc-ap-nombre">' +
        (hrefNombre ? '<a href="' + hrefNombre + '"><strong>' + esc(nombreDe(a)) + "</strong></a>" : "<strong>" + esc(nombreDe(a)) + "</strong>") +
        '<div class="icc-ap-badges"><span class="icc-ap-rol">' + (iconoRol[a.rol] || "") + " " + esc(C.ROLES[a.rol] || a.rol) + "</span>" +
        (esYoMismo ? '<span class="icc-ap-tag is-tu">Tú</span>' : "") +
        (Number(a.solo_agenda) ? '<span class="icc-ap-tag" style="--t:#22D3EE" title="Solo puedes ver y concertar visitas en su agenda">📅 Solo agenda</span>' : "") +
        (bloqueado(a) ? '<span class="icc-ap-tag is-bloq">🔒 Bloqueado</span>' : "") +
        (disp ? '<span class="icc-ap-tag" style="--t:' + disp.color + '">' + esc(disp.label) + "</span>" : "") +
        "</div></div></header>" +
        '<ul class="icc-ap-contacto">' +
        '<li><span aria-hidden="true">✉️</span><a href="mailto:' + esc(a.email) + '">' + esc(a.email) + "</a></li>" +
        (a.telefono ? '<li><span aria-hidden="true">📞</span><a href="tel:' + esc(String(a.telefono).replace(/\s+/g, "")) + '">' + esc(a.telefono) + "</a></li>" : "") +
        (a.empresa || a.cif ? '<li><span aria-hidden="true">🏢</span><span>' + esc([a.empresa, a.cif].filter(Boolean).join(" · ")) + "</span></li>" : "") +
        "</ul>" +
        (datos.length ? '<div class="icc-ap-datos">' + datos.join("") + "</div>" : "") +
        (puedeRol || ctrl
          ? '<div class="icc-ap-gestion">' +
            (puedeRol
              ? '<label><span>Rol</span><select class="icc-select" data-rol-id="' + a.id + '" aria-label="Rol de ' + esc(nombreDe(a)) + '">' +
                rolesParaAdmin.map(function (r) { return '<option value="' + r + '"' + (a.rol === r ? " selected" : "") + ">" + C.ROLES[r] + "</option>"; }).join("") +
                "</select></label>"
              : "") +
            (ctrl ? "<label><span>" + etiquetaEquipo + "</span>" + ctrl + "</label>" : "") +
            "</div>"
          : "") +
        '<footer class="icc-ap-acc">' +
        (puedeVerFicha(a) ? '<a class="icc-btn icc-btn-secondary icc-ap-btn" href="#/agentes/' + a.id + '">Ficha →</a>' : "") +
        (esJefeDeEquipo && esDeMiEquipo(a) ? '<a class="icc-btn icc-btn-ghost icc-ap-btn" href="#/agentes/' + a.id + '/informacion">⚙️ Gestionar</a>' : "") +
        (puedeVerComo ? '<button type="button" class="icc-btn icc-btn-ghost icc-ap-btn" data-ver-como-id="' + a.id + '">👁 Ver como</button>' : "") +
        (puedeBloquear
          ? '<button type="button" class="icc-ap-icono" data-bloqueo-id="' + a.id + '" data-bloqueado="' + (bloqueado(a) ? 1 : 0) + '" title="' + (bloqueado(a) ? "Desbloquear" : "Bloquear") + '" aria-label="' + (bloqueado(a) ? "Desbloquear a " : "Bloquear a ") + esc(nombreDe(a)) + '">' + (bloqueado(a) ? "🔓" : "🔒") + "</button>"
          : "") +
        (puedeBorrar ? '<button type="button" class="icc-ap-icono is-borrar" data-borrar-agente-id="' + a.id + '" title="Borrar cuenta" aria-label="Borrar la cuenta de ' + esc(nombreDe(a)) + '">🗑</button>' : "") +
        "</footer></article>"
      );
    };

    // ---- Vista por equipos: cada jefe con sus comerciales
    var vistaEquipos = function () {
      var html = "";
      var usados = {};
      var lideres = visibles.filter(function (a) {
        return a.rol === "jefe_de_equipo" || (esRolAdmin(a.rol) && agentes.some(function (x) { return x.rol === "comercial" && String(x.supervisor_id) === String(a.id); }));
      });
      lideres.forEach(function (j) {
        var miembros = visibles.filter(function (x) { return x.rol === "comercial" && String(x.supervisor_id) === String(j.id); });
        usados[j.id] = 1;
        miembros.forEach(function (m) { usados[m.id] = 1; });
        var cm = miembros.reduce(function (s, m) { return s + Number(m.contratos_mes || 0); }, 0);
        html += '<section class="icc-ap-equipo" style="--c:' + (colorRol[j.rol] || "#A78BFA") + '">' +
          '<header class="icc-ap-equipo-cab">' + avatarRol(j, 40) + "<div><h2>Equipo de " + esc(nombreDe(j)) + "</h2>" +
          "<small>" + miembros.length + (miembros.length === 1 ? " comercial" : " comerciales") + " · " + cm + " contratos este mes" +
          (j.rol === "jefe_de_equipo" && porId[j.supervisor_id] ? " · 🎯 Coordina: <b>" + esc(nombreDe(porId[j.supervisor_id])) + "</b>" : "") + "</small></div></header>" +
          '<div class="icc-ap-grid">' + tarjeta(j) + miembros.map(tarjeta).join("") + "</div></section>";
      });
      var grupos = [
        { titulo: "Comerciales sin jefe de equipo", icono: "⚠️", lista: visibles.filter(function (a) { return !usados[a.id] && a.rol === "comercial"; }) },
        { titulo: "Backoffice", icono: "🗂️", lista: visibles.filter(function (a) { return !usados[a.id] && a.rol === "backoffice"; }) },
        { titulo: "Dirección", icono: "🏛️", lista: visibles.filter(function (a) { return !usados[a.id] && esRolAdmin(a.rol); }) },
      ];
      grupos.forEach(function (g) {
        if (!g.lista.length) return;
        html += '<section class="icc-ap-equipo is-grupo"><header class="icc-ap-equipo-cab"><span class="icc-ap-equipo-ico">' + g.icono + "</span><div><h2>" + esc(g.titulo) + "</h2><small>" +
          g.lista.length + (g.lista.length === 1 ? " persona" : " personas") + "</small></div></header>" +
          '<div class="icc-ap-grid">' + g.lista.map(tarjeta).join("") + "</div></section>";
      });
      return html;
    };

    main().innerHTML =
      '<header class="icc-ag-hero icc-ap-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">👥 Agentes</span>' +
      "<h1>" + activos.length + (activos.length === 1 ? " persona activa" : " personas activas") + " en el equipo</h1>" +
      '<p class="icc-ag-hero-res">' +
      [
        [cuenta.comercial, "comercial", "comerciales"],
        [cuenta.jefe_de_equipo, "jefe de equipo", "jefes de equipo"],
        [cuenta.backoffice, "backoffice", "backoffice"],
      ].filter(function (x) { return x[0]; }).map(function (x) { return "<b>" + x[0] + "</b> " + (x[0] === 1 ? x[1] : x[2]); }).join(" · ") +
      ' · <b class="ok">' + contratosMes + "</b> " + (contratosMes === 1 ? "contrato" : "contratos") + " este mes" +
      (nBloqueados ? ' · <b class="mal">' + nBloqueados + "</b> " + (nBloqueados === 1 ? "bloqueado" : "bloqueados") : "") + "</p></div>" +
      '<div class="icc-ag-hero-acc icc-ap-hero-acc">' +
      (esAdmin ? '<a class="icc-btn icc-btn-ghost" href="#/auditoria-ver-como">🕵️ Historial de «Ver como»</a>' : "") +
      (esAdmin || jefePuedeCrear ? '<button class="icc-btn icc-btn-primary icc-ag-btn-nueva" id="btn-nuevo-agente">+ Nuevo usuario</button>' : "") +
      "</div></header>" +

      '<nav class="icc-ap-chips" aria-label="Filtrar por rol">' +
      chip("", "Todos", agentes.length, "#E2E8F0", "👥") +
      (cuenta.comercial ? chip("comercial", "Comerciales", cuenta.comercial, colorRol.comercial, iconoRol.comercial) : "") +
      (cuenta.jefe_de_equipo ? chip("jefe_de_equipo", "Jefes de equipo", cuenta.jefe_de_equipo, colorRol.jefe_de_equipo, iconoRol.jefe_de_equipo) : "") +
      (cuenta.backoffice ? chip("backoffice", "Backoffice", cuenta.backoffice, colorRol.backoffice, iconoRol.backoffice) : "") +
      (cuenta.direccion ? chip("direccion", "Dirección", cuenta.direccion, colorRol.admin, iconoRol.admin) : "") +
      (nBloqueados ? chip("bloqueados", "Bloqueados", nBloqueados, "#F87171", "🔒", true) : "") +
      "</nav>" +
      (avisoBackoffice
        ? '<div class="icc-aviso icc-ap-aviso">Te aparecen solo los comerciales que te ha asignado un Admin; verás únicamente sus clientes, contratos, presupuestos, agenda e informes.' +
          (agentes.some(function (a) { return Number(a.solo_agenda); })
            ? " De " + agentes.filter(function (a) { return Number(a.solo_agenda); }).map(function (a) { return esc(a.nombre); }).join(" y ") + " solo ves su <b>agenda</b>, para concertarles visitas."
            : "") + "</div>"
        : "") +
      (esAdmin && comercialesSinJefe
        ? '<div class="icc-aviso icc-ap-aviso">⚠️ <b>' + comercialesSinJefe + "</b> " + (comercialesSinJefe === 1 ? "comercial activo no tiene" : "comerciales activos no tienen") +
          ' jefe de equipo. <a href="' + linkQs({ vista: "equipos", rol: "", estado: "" }) + '">Ver por equipos</a></div>'
        : "") +

      '<section class="icc-card icc-ap-barra">' +
      '<input class="icc-input" id="ap-buscar" type="search" placeholder="🔎 Buscar por nombre, email, empresa, CIF o teléfono" value="' + esc(q) + '">' +
      '<div class="icc-tabs icc-ap-vistas"><a class="icc-tab' + (vista === "tarjetas" ? " is-active" : "") + '" href="' + linkQs({ vista: "" }) + '">▦ Tarjetas</a>' +
      '<a class="icc-tab' + (vista === "equipos" ? " is-active" : "") + '" href="' + linkQs({ vista: "equipos" }) + '">🧩 Por equipos</a></div>' +
      (esAdmin ? '<button type="button" class="icc-btn icc-btn-ghost icc-ap-btn-sel" id="ap-seleccionar" aria-pressed="false">☑ Borrar varios</button>' : "") +
      "</section>" +

      (visibles.length
        ? vista === "equipos"
          ? '<div class="icc-ap-equipos">' + vistaEquipos() + "</div>"
          : '<div class="icc-ap-grid">' + visibles.map(tarjeta).join("") + "</div>"
        : '<p class="icc-empty">No hay usuarios con este filtro.</p>') +
      '<p class="icc-empty icc-ap-sin-resultados" hidden>Nadie coincide con la búsqueda.</p>' +
      '<div class="icc-ap-lote" id="ap-lote" hidden><span id="ap-lote-n">0 seleccionados</span>' +
      '<button type="button" class="icc-btn icc-btn-ghost" id="ap-lote-cancelar">Cancelar</button>' +
      '<button type="button" class="icc-btn icc-ap-btn-baja" id="ap-lote-borrar">🗑 Borrar y traspasar</button></div>';

    // ---- Busqueda al instante
    var buscar = document.getElementById("ap-buscar");
    var aplicarBusqueda = function () {
      var txt = buscar.value.trim().toLowerCase();
      var n = 0;
      main().querySelectorAll(".icc-ap-card").forEach(function (c) {
        var ok = !txt || c.getAttribute("data-buscar").indexOf(txt) !== -1;
        c.hidden = !ok;
        if (ok) n++;
      });
      main().querySelectorAll(".icc-ap-equipo").forEach(function (s) {
        s.hidden = !s.querySelector(".icc-ap-card:not([hidden])");
      });
      var hay = main().querySelectorAll(".icc-ap-card").length;
      main().querySelector(".icc-ap-sin-resultados").hidden = !(hay && !n);
    };
    buscar.addEventListener("input", aplicarBusqueda);
    if (q) aplicarBusqueda();

    main()
      .querySelectorAll("[data-rol-id]")
      .forEach(function (sel) {
        sel.addEventListener("change", async function () {
          try {
            await D.actualizarAgente(sel.getAttribute("data-rol-id"), { rol: sel.value });
            U.toast("Rol actualizado", "success");
            viewAgentes();
          } catch (err) {
            U.toast(err.message || "No se pudo actualizar el rol", "error");
            viewAgentes();
          }
        });
      });
    main()
      .querySelectorAll("[data-asignar-bo-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          var boId = btn.getAttribute("data-asignar-bo-id");
          modalAsignarComerciales(porId[boId], agentes, comercialesDeBo(boId), viewAgentes, agendasBo ? agendasBo[boId] || [] : null, equiposBo ? equiposBo[boId] || [] : null);
        });
      });
    main()
      .querySelectorAll("[data-supervisor-id]")
      .forEach(function (sel) {
        sel.addEventListener("change", async function () {
          try {
            await D.actualizarAgente(sel.getAttribute("data-supervisor-id"), { supervisor_id: sel.value || null });
            U.toast("Equipo actualizado", "success");
          } catch (err) {
            U.toast(err.message || "No se pudo actualizar", "error");
          }
          viewAgentes();
        });
      });
    main()
      .querySelectorAll("[data-bloqueo-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var bloqueadoActual = Number(btn.getAttribute("data-bloqueado"));
          var a = porId[btn.getAttribute("data-bloqueo-id")];
          if (!bloqueadoActual && !confirm("¿Bloquear a " + (a ? nombreDe(a) : "este usuario") + "? No podrá entrar en el CRM hasta que lo desbloquees.")) return;
          btn.disabled = true;
          try {
            await D.actualizarAgente(btn.getAttribute("data-bloqueo-id"), { bloqueado: bloqueadoActual ? 0 : 1 });
            U.toast(bloqueadoActual ? "Usuario desbloqueado" : "Usuario bloqueado", "success");
            viewAgentes();
          } catch (err) {
            U.toast(err.message || "No se pudo actualizar", "error");
            btn.disabled = false;
          }
        });
      });
    // ---- Borrar (una o varias cuentas) traspasando sus datos a dirección
    main().classList.remove("icc-ap-seleccionando");
    var lote = document.getElementById("ap-lote");
    var seleccionados = function () {
      return Array.prototype.map.call(main().querySelectorAll("[data-sel-id]:checked"), function (i) { return i.getAttribute("data-sel-id"); });
    };
    var pintarLote = function () {
      var n = seleccionados().length;
      document.getElementById("ap-lote-n").textContent = n + (n === 1 ? " seleccionado" : " seleccionados");
      document.getElementById("ap-lote-borrar").disabled = !n;
    };
    var modoSeleccion = function (activo) {
      main().classList.toggle("icc-ap-seleccionando", activo);
      if (lote) lote.hidden = !activo;
      var b = document.getElementById("ap-seleccionar");
      if (b) { b.setAttribute("aria-pressed", activo ? "true" : "false"); b.textContent = activo ? "✓ Seleccionando…" : "☑ Borrar varios"; }
      if (!activo) main().querySelectorAll("[data-sel-id]").forEach(function (i) { i.checked = false; });
      if (lote) pintarLote();
    };
    var btnSel = document.getElementById("ap-seleccionar");
    if (btnSel) btnSel.addEventListener("click", function () { modoSeleccion(!main().classList.contains("icc-ap-seleccionando")); });
    main().querySelectorAll("[data-sel-id]").forEach(function (i) { i.addEventListener("change", pintarLote); });
    if (lote) {
      document.getElementById("ap-lote-cancelar").addEventListener("click", function () { modoSeleccion(false); });
      document.getElementById("ap-lote-borrar").addEventListener("click", function () {
        var ids = seleccionados();
        if (ids.length) modalBajaAgentes(ids, agentes);
      });
    }
    main()
      .querySelectorAll("[data-borrar-agente-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          modalBajaAgentes([btn.getAttribute("data-borrar-agente-id")], agentes);
        });
      });
    main()
      .querySelectorAll("[data-ver-como-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-ver-como-id");
          entrarComo(id, porId[id] ? porId[id].nombre : "");
        });
      });

    var btnNuevoAgente = document.getElementById("btn-nuevo-agente");
    if (btnNuevoAgente) btnNuevoAgente.addEventListener("click", function () { modalNuevoAgente(agentes); });
  }

  // --------------------------------------------------- Auditoria "Ver como"
  // --------------------------------------------------------- Ficha de agente
  // Area privada de cada agente: la ven el propio agente, su Jefe de equipo
  // y Admin/Super Admin. Todos ven la misma ficha (datos, objetivos,
  // seguimiento y su actividad real en el CRM), siempre sincronizada.
  // Recuadro de la ficha que lleva a su listado al pulsarlo.
  function kpiFicha(href, icono, label, valor, objetivo, formato, color) {
    var v = Number(valor || 0);
    var o = Number(objetivo || 0);
    var pct = o ? Math.min(100, Math.round((v / o) * 100)) : null;
    var colBarra = pct === null ? "" : pct >= 100 ? "var(--esmeralda)" : pct >= 60 ? "var(--cian)" : "var(--oro)";
    var dentro =
      '<span class="icc-uf-kpi-ico" aria-hidden="true">' + icono + "</span>" +
      '<b class="icc-uf-kpi-val">' + formato(v) + (o ? '<small> / ' + formato(o) + "</small>" : "") + "</b>" +
      '<span class="icc-uf-kpi-lab">' + label + "</span>" +
      (pct !== null
        ? '<span class="icc-uf-kpi-barra"><i style="width:' + pct + "%;background:" + colBarra + '"></i></span><small class="icc-uf-kpi-pct">' + pct + "% del objetivo</small>"
        : "") +
      (href ? '<em class="icc-uf-kpi-ir" aria-hidden="true">Ver →</em>' : "");
    return href
      ? '<a class="icc-uf-kpi" href="' + href + '" style="--c:' + color + '">' + dentro + "</a>"
      : '<div class="icc-uf-kpi" style="--c:' + color + '">' + dentro + "</div>";
  }

  async function renderResumenFicha(id, cont) {
    cont.innerHTML = '<div class="icc-loading">Cargando resumen…</div>';
    var datos;
    try {
      datos = await D.obtenerFichaAgente(id);
    } catch (err) {
      cont.innerHTML = '<p class="icc-empty">' + U.escapeHtml(err.message || "No se pudo cargar la ficha") + "</p>";
      return;
    }

    var a = datos.agente;
    var f = datos.ficha || {};
    var r = datos.resumen;
    var esGestor = datos.permisos.editar_gestion;
    var miId = window.icc.auth.state.user && window.icc.auth.state.user.id;
    var esPropia = String(a.id) === String(miId);
    var nombreCompleto = (a.nombre + " " + (a.apellidos || "")).trim();
    var num = function (v) { return String(Math.round(Number(v || 0) * 100) / 100).replace(".", ","); };

    var clientesPorEstado = {};
    (r.clientes_por_estado || []).forEach(function (c) { clientesPorEstado[c.estado] = Number(c.total); });
    var totalClientes = Object.keys(clientesPorEstado).reduce(function (s, k) { return s + clientesPorEstado[k]; }, 0);
    var enCurso = totalClientes - (clientesPorEstado.cliente_activo || 0) - (clientesPorEstado.perdido || 0);

    var tiposSeg = C.TIPOS_SEGUIMIENTO_AGENTE;
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var filtroTipo = params.get("tipo") || "";
    var seguimiento = (datos.seguimiento || []).filter(function (s) { return !filtroTipo || s.tipo === filtroTipo; });
    var rutaFicha = esPropia && location.hash.indexOf("#/mi-ficha") === 0 ? "#/mi-ficha" : "#/agentes/" + a.id;

    var auth = window.icc.auth;
    var mesIni = hoyIso().slice(0, 8) + "01";
    var qCom = "comercial_id=" + a.id;
    cont.innerHTML =
      '<div class="icc-uf-toolbar">' +
      '<p class="icc-uf-privada">🔒 Resumen privado: solo lo ven ' + (esPropia ? "tú" : U.escapeHtml(a.nombre)) +
      ", su jefe de equipo y dirección.</p>" +
      '<div class="icc-uf-atajos">' +
      (auth.puede("clientes.ver") ? '<a class="icc-uf-atajo" href="#/clientes?' + qCom + '">👥 Clientes</a>' : "") +
      (auth.puede("clientes.ver") ? '<a class="icc-uf-atajo" href="#/pipeline?' + qCom + '">📈 Pipeline</a>' : "") +
      (auth.puede("contratos.ver") ? '<a class="icc-uf-atajo" href="#/contratos?' + qCom + '">📄 Contratos</a>' : "") +
      (auth.puede("agenda.ver") ? '<a class="icc-uf-atajo" href="#/agenda?' + qCom + '">📅 Agenda</a>' : "") +
      (datos.carpeta_personal_id ? '<a class="icc-uf-atajo" href="#/ficheros/' + datos.carpeta_personal_id + '">🗂️ Carpeta personal</a>' : "") +
      "</div></div>" +

      '<div class="icc-uf-kpis">' +
      kpiFicha(auth.puede("contratos.ver") ? "#/contratos?" + qCom + "&desde=" + mesIni : "", "📄", "Contratos este mes", r.contratos.mes, f.objetivo_contratos_mes, num, "#34D399") +
      kpiFicha(auth.puede("contratos.ver") ? "#/contratos?" + qCom + "&desde=" + mesIni : "", "⚡", "kW este mes", r.contratos.kw_mes, f.objetivo_kw_mes, num, "#22D3EE") +
      kpiFicha(auth.puede("proformas.ver") ? "#/proformas" : "", "💶", "Facturado este mes", r.proformas.facturado_mes, f.objetivo_facturacion_mes, U.formatEur, "#FBBF24") +
      kpiFicha(auth.puede("proformas.ver") ? "#/proformas?estado_pago=pendiente" : "", "⏳", "Pendiente de cobro", r.proformas.pendiente_cobro, 0, U.formatEur, "#F87171") +
      kpiFicha(auth.puede("clientes.ver") ? "#/clientes?estado=cliente_activo&" + qCom : "", "✅", "Clientes activos", clientesPorEstado.cliente_activo || 0, 0, num, "#4ADE80") +
      kpiFicha(auth.puede("clientes.ver") ? "#/pipeline?" + qCom : "", "🔄", "Clientes en curso", enCurso, 0, num, "#60A5FA") +
      kpiFicha(auth.puede("presupuestos.ver") ? "#/presupuestos?" + qCom : "", "🧾", "Presupuestos abiertos", r.presupuestos.abiertos, 0, num, "#A78BFA") +
      kpiFicha(auth.puede("agenda.ver") ? "#/agenda?" + qCom : "", "📅", "Próximas citas", r.citas.proximas, 0, num, "#F472B6") +
      "</div>" +

      '<div class="icc-grid-2">' +
      '<section class="icc-card">' +
      '<div class="icc-card-head"><h2>Datos del agente</h2>' +
      '<button class="icc-btn icc-btn-ghost" id="btn-editar-personal">Editar</button></div>' +
      filaDato("Email", a.email) +
      filaDato("Telefono", a.telefono) +
      filaDato("Empresa / CIF", [a.empresa, a.cif].filter(Boolean).join(" · ")) +
      filaDato("DNI / NIE", f.dni) +
      filaDato("Fecha de nacimiento", f.fecha_nacimiento ? U.formatFecha(f.fecha_nacimiento) : "") +
      filaDato("Direccion", [f.direccion, f.codigo_postal, f.poblacion, f.provincia].filter(Boolean).join(", ")) +
      filaDato("Email personal", f.email_personal) +
      filaDato("IBAN", f.iban) +
      filaDato("Contacto de emergencia", f.contacto_emergencia) +
      filaDato("Alta en el CRM", U.formatFecha(a.created_at)) +
      "</section>" +
      '<section class="icc-card">' +
      '<div class="icc-card-head"><h2>Gestión y objetivos</h2>' +
      (esGestor ? '<button class="icc-btn icc-btn-ghost" id="btn-editar-gestion">Editar</button>' : "") +
      "</div>" +
      filaDato("Tipo de relacion", C.TIPOS_RELACION_AGENTE[f.tipo_relacion] || "") +
      filaDato("Fecha de incorporacion", f.fecha_incorporacion ? U.formatFecha(f.fecha_incorporacion) : "") +
      filaDato("Zona", f.zona) +
      filaDato("Sectores", f.sectores) +
      filaDato("Objetivo contratos / mes", f.objetivo_contratos_mes != null ? num(f.objetivo_contratos_mes) : "") +
      filaDato("Objetivo kW / mes", f.objetivo_kw_mes != null ? num(f.objetivo_kw_mes) : "") +
      filaDato("Objetivo facturacion / mes", f.objetivo_facturacion_mes != null ? U.formatEur(f.objetivo_facturacion_mes) : "") +
      filaDato("Contratos totales", String(Number(r.contratos.total || 0)) + " · " + num(r.contratos.kw_total) + " kW") +
      (f.observaciones
        ? '<h3>Observaciones</h3><p class="icc-ficha-texto">' + U.escapeHtml(f.observaciones) + "</p>"
        : "") +
      (!esGestor ? '<p class="icc-muted">Estos datos los gestiona tu jefe de equipo o dirección.</p>' : "") +
      "</section>" +
      "</div>" +

      '<section class="icc-card">' +
      '<div class="icc-card-head"><h2>Seguimiento</h2>' +
      '<button class="icc-btn icc-btn-primary" id="btn-nuevo-seguimiento">+ Nueva entrada</button></div>' +
      '<div class="icc-tabs">' +
      '<a class="icc-tab' + (!filtroTipo ? " is-active" : "") + '" href="' + rutaFicha + '">Todo (' + datos.seguimiento.length + ")</a>" +
      Object.keys(tiposSeg)
        .map(function (t) {
          var n = datos.seguimiento.filter(function (s) { return s.tipo === t; }).length;
          return '<a class="icc-tab' + (filtroTipo === t ? " is-active" : "") + '" href="' + rutaFicha + "?tipo=" + t + '">' +
            tiposSeg[t].icono + " " + tiposSeg[t].label + " (" + n + ")</a>";
        })
        .join("") +
      "</div>" +
      (seguimiento.length
        ? '<div class="icc-timeline">' +
          seguimiento
            .map(function (s) {
              var t = tiposSeg[s.tipo] || tiposSeg.nota;
              var puedeBorrar = esGestor || String(s.autor_id) === String(miId);
              return (
                '<div class="icc-timeline-item" style="--tl-color:' + t.color + '">' +
                '<div class="icc-timeline-head">' +
                '<span class="icc-badge" style="--badge-color:' + t.color + '">' + t.icono + " " + t.label + "</span>" +
                "<strong>" + U.escapeHtml(s.titulo) + "</strong>" +
                (puedeBorrar ? '<button class="icc-link-btn" style="color:var(--red)" data-borrar-seg="' + s.id + '">Borrar</button>' : "") +
                "</div>" +
                (s.contenido ? '<p class="icc-ficha-texto">' + U.escapeHtml(s.contenido) + "</p>" : "") +
                '<span class="icc-muted" style="font-size:11px">' + U.formatFecha(s.fecha) + " · " +
                U.escapeHtml(s.autor_nombre || "Usuario eliminado") +
                (s.autor_rol ? " (" + U.escapeHtml(C.ROLES[s.autor_rol] || s.autor_rol) + ")" : "") +
                "</span></div>"
              );
            })
            .join("") +
          "</div>"
        : '<p class="icc-empty">Sin entradas' + (filtroTipo ? " de este tipo" : "") + ". Anota reuniones, objetivos, formaciones o incidencias: " +
          (esPropia ? "tus superiores" : U.escapeHtml(a.nombre)) + " lo vera al momento.</p>") +
      "</section>" +

      '<div class="icc-grid-2">' +
      '<section class="icc-card"><h2>Últimos contratos</h2>' +
      (r.ultimos_contratos && r.ultimos_contratos.length
        ? '<table class="icc-table"><thead><tr><th>Titular</th><th>Sector</th><th>kW</th><th>Estado</th><th>Alta</th></tr></thead><tbody>' +
          r.ultimos_contratos
            .map(function (c) {
              var est = C.ESTADOS_CONTRATO[c.estado] || { label: c.estado, color: "#94a3b8" };
              return (
                "<tr><td>" + (auth.puede("contratos.ver") ? '<a class="icc-link-btn" style="margin-left:0" href="#/contratos?' + qCom + "&q=" + encodeURIComponent(c.titular || "") + '">' + U.escapeHtml(c.titular) + "</a>" : U.escapeHtml(c.titular)) +
                "</td><td>" + U.escapeHtml(C.SECTORES[c.sector] || c.sector) + "</td><td>" +
                (c.kw != null ? num(c.kw) : "-") + '</td><td><span class="icc-badge" style="--badge-color:' + est.color + '">' +
                est.label + "</span></td><td>" + U.formatFecha(c.fecha_alta) + "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table>"
        : '<p class="icc-empty">Sin contratos todavia.</p>') +
      "</section>" +
      '<section class="icc-card"><h2>Próximas citas</h2>' +
      (r.proximas_citas && r.proximas_citas.length
        ? r.proximas_citas
            .map(function (c) {
              return (
                '<a class="icc-data-row icc-uf-cita" href="#/agenda?vista=dia&fecha=' + encodeURIComponent(String(c.fecha).slice(0, 10)) + "&" + qCom + '"><span>' + U.escapeHtml(c.cliente_nombre) + "</span>" +
                '<span class="icc-muted">' + U.formatFecha(c.fecha) + " · " + String(c.hora_inicio || "").slice(0, 5) + " →</span></a>"
              );
            })
            .join("")
        : '<p class="icc-empty">Sin citas programadas.</p>') +
      '<p class="icc-muted" style="margin-top:10px">Citas realizadas este mes: ' + Number(r.citas.realizadas_mes || 0) + "</p>" +
      "</section>" +
      "</div>";

    document.getElementById("btn-editar-personal").addEventListener("click", function () {
      modalFichaPersonal(a, f);
    });
    var btnGestion = document.getElementById("btn-editar-gestion");
    if (btnGestion) {
      btnGestion.addEventListener("click", function () {
        modalFichaGestion(a, f);
      });
    }
    document.getElementById("btn-nuevo-seguimiento").addEventListener("click", function () {
      modalNuevoSeguimiento(a);
    });
    cont
      .querySelectorAll("[data-borrar-seg]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (!confirm("¿Borrar esta entrada del seguimiento?")) return;
          try {
            await D.borrarSeguimientoAgente(a.id, btn.getAttribute("data-borrar-seg"));
            U.toast("Entrada borrada", "success");
            recargarFicha();
          } catch (err) {
            U.toast(err.message || "No se pudo borrar", "error");
          }
        });
      });
  }

  // ======================================================= Ficha de usuario
  // Pantalla con pestanas: Resumen (seguimiento y objetivos), Informacion,
  // Roles y permisos, Disponibilidad y agenda, Notificaciones y Seguridad.
  // Cada pestana solo aparece si el servidor dice que se puede ver
  // (api/usuario.php decide los permisos de verdad).
  var fichaActual = { id: null, seccion: "resumen" };

  function recargarFicha() {
    return viewFichaAgente(fichaActual.id, fichaActual.seccion);
  }

  var SECCIONES_FICHA = [
    { clave: "resumen", label: "Resumen y seguimiento", icono: "📊" },
    { clave: "informacion", label: "Usuario · Información", icono: "👤" },
    { clave: "permisos", label: "Roles y permisos", icono: "🛡️", requiere: "ver_permisos" },
    { clave: "disponibilidad", label: "Disponibilidad y agenda", icono: "🕒" },
    { clave: "notificaciones", label: "Notificaciones", icono: "🔔", requiere: "ver_notificaciones" },
    { clave: "seguridad", label: "Seguridad avanzada", icono: "🔐", requiere: "ver_seguridad" },
  ];

  function badgeColor(texto, color) {
    return '<span class="icc-badge" style="--badge-color:' + color + '">' + texto + "</span>";
  }

  function switchHtml(attrs, marcado, deshabilitado) {
    return (
      '<label class="icc-switch"><input type="checkbox" ' + attrs + (marcado ? " checked" : "") + (deshabilitado ? " disabled" : "") +
      '><span class="icc-switch-slider"></span></label>'
    );
  }

  function barraGuardar(id) {
    return (
      '<div class="icc-savebar" id="' + id + '">' +
      '<span class="icc-muted icc-savebar-msg">Hay cambios sin guardar</span>' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-descartar>Descartar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">💾 Guardar cambios</button>' +
      "</div>"
    );
  }

  // Marca la barra de guardar cuando el formulario cambia.
  function vigilarCambios(form) {
    var barra = form.querySelector(".icc-savebar");
    if (!barra) return;
    form.addEventListener("input", function () { barra.classList.add("is-dirty"); });
    form.addEventListener("change", function () { barra.classList.add("is-dirty"); });
    var btn = barra.querySelector("[data-descartar]");
    if (btn) btn.addEventListener("click", function () { recargarFicha(); });
  }

  function avisoMigracion(datos) {
    return datos.migracion_pendiente
      ? '<div class="icc-aviso">⚠️ Falta importar <code>sql/migracion_usuarios_avanzado.sql</code> en la base de datos: ' +
        "hasta entonces esta pestaña es solo de consulta.</div>"
      : "";
  }

  async function viewFichaAgente(id, seccion) {
    fichaActual = { id: String(id), seccion: seccion || "resumen" };
    main().innerHTML = '<div class="icc-loading">Cargando ficha…</div>';
    var datos;
    try {
      datos = await D.obtenerUsuario(id);
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + U.escapeHtml(err.message || "No se pudo cargar la ficha") + "</p>";
      return;
    }
    var u = datos.usuario;
    var puede = datos.puede;
    var base = datos.es_propia && location.hash.indexOf("#/mi-ficha") === 0 ? "#/mi-ficha" : "#/agentes/" + u.id;
    var secciones = SECCIONES_FICHA.filter(function (s) { return !s.requiere || puede[s.requiere]; });
    if (!secciones.some(function (s) { return s.clave === fichaActual.seccion; })) fichaActual.seccion = "resumen";
    var pref = datos.preferencias || {};
    var disp = C.ESTADOS_DISPONIBILIDAD[pref.estado_disponibilidad] || C.ESTADOS_DISPONIBILIDAD.disponible;
    var nombreCompleto = (u.nombre + " " + (u.apellidos || "")).trim();

    var colorRolFicha = { comercial: "#22D3EE", jefe_de_equipo: "#A78BFA", backoffice: "#FBBF24", coordinador: "#60A5FA", gerente: "#FB923C", admin: "#34D399", super_admin: "#F472B6" };
    var iconoRolFicha = { comercial: "💼", jefe_de_equipo: "🧭", backoffice: "🗂️", coordinador: "🎯", gerente: "📊", admin: "🏛️", super_admin: "👑" };
    var colorFicha = colorRolFicha[u.rol] || "#94A3B8";
    var esMiFicha = base === "#/mi-ficha";

    main().innerHTML =
      '<div class="icc-uficha icc-uf">' +
      '<header class="icc-ag-hero icc-uf-hero" style="--c:' + colorFicha + '">' +
      '<div class="icc-ag-hero-txt icc-uf-id">' +
      '<span class="icc-uf-ava">' + U.avatar(u, 76) + "</span>" +
      "<div>" +
      '<span class="icc-ag-hero-kicker">' + (esMiFicha ? "👤 Mi ficha" : "👤 Ficha de agente") + "</span>" +
      "<h1>" + U.escapeHtml(nombreCompleto) + "</h1>" +
      '<div class="icc-uf-badges">' +
      '<span class="icc-uf-rol">' + (iconoRolFicha[u.rol] || "") + " " + U.escapeHtml(C.ROLES[u.rol] || u.rol) + "</span>" +
      (Number(u.bloqueado) ? badgeColor("🔒 Bloqueado", "#f87171") : badgeColor("Activo", "#34d399")) +
      (pref.estado_disponibilidad && pref.estado_disponibilidad !== "disponible" ? badgeColor(disp.label, disp.color) : "") +
      "</div>" +
      '<p class="icc-uf-meta">' +
      '<a href="mailto:' + U.escapeHtml(u.email) + '">✉️ ' + U.escapeHtml(u.email) + "</a>" +
      (u.telefono ? ' <a href="tel:' + U.escapeHtml(String(u.telefono).replace(/\s+/g, "")) + '">📞 ' + U.escapeHtml(u.telefono) + "</a>" : "") +
      (datos.supervisor ? " <span>🧭 Depende de " + U.escapeHtml(datos.supervisor.nombre) + "</span>" : "") +
      (u.numero_relacion ? " <span>#️⃣ Relación <code>" + U.escapeHtml(u.numero_relacion) + "</code></span>" : "") +
      "</p>" +
      '<p class="icc-uf-alta">Alta ' + U.formatFecha(u.created_at) +
      (u.ultimo_acceso !== undefined ? " · último acceso " + U.haceCuanto(u.ultimo_acceso) : "") + "</p>" +
      "</div></div>" +
      '<div class="icc-ag-hero-acc icc-uf-hero-acc">' +
      (window.icc.auth.esBackofficeOAdmin() ? '<a href="#/agentes" class="icc-btn icc-btn-ghost">← Agentes</a>' : "") +
      (puede.ver_como ? '<button type="button" class="icc-btn icc-btn-secondary" id="btn-ficha-ver-como">👁️ Ver como</button>' : "") +
      "</div></header>" +
      '<nav class="icc-uf-tabs" aria-label="Secciones de la ficha">' +
      secciones
        .map(function (s) {
          var activa = s.clave === fichaActual.seccion;
          return (
            '<a class="icc-uf-tab' + (activa ? " is-active" : "") + '" href="' + base + "/" + s.clave + '"' + (activa ? ' aria-current="page"' : "") + ">" +
            '<span class="ico" aria-hidden="true">' + s.icono + "</span>" + s.label + "</a>"
          );
        })
        .join("") +
      "</nav>" +
      '<section class="icc-uficha-panel icc-uf-panel" id="ficha-panel"></section>' +
      "</div>";

    var btnVerComo = document.getElementById("btn-ficha-ver-como");
    if (btnVerComo) btnVerComo.addEventListener("click", function () { entrarComo(u.id, u.nombre); });

    var cont = document.getElementById("ficha-panel");
    var render = {
      resumen: function () { return renderResumenFicha(u.id, cont); },
      informacion: function () { renderInfoUsuario(cont, datos); },
      permisos: function () { renderPermisosUsuario(cont, datos); },
      disponibilidad: function () { renderDisponibilidadUsuario(cont, datos); },
      notificaciones: function () { renderNotificacionesUsuario(cont, datos); },
      seguridad: function () { renderSeguridadUsuario(cont, datos); },
    };
    await render[fichaActual.seccion]();
  }

  // Si el usuario editado es el que esta conectado, refresca su cabecera.
  async function trasGuardarUsuario(datos) {
    if (datos.es_propia) {
      try {
        await window.icc.auth.refrescarUsuario();
        window.icc.app && window.icc.app.repintarCabecera && window.icc.app.repintarCabecera();
      } catch (e) {
        console.error(e);
      }
    }
    recargarFicha();
  }

  // ----------------------------------------------------- Usuario · Informacion
  function campoFicha(name, label, valor, opciones) {
    opciones = opciones || {};
    return (
      '<div class="icc-field' + (opciones.clase ? " " + opciones.clase : "") + '"><label>' + label + (opciones.requerido ? " *" : "") + "</label>" +
      '<input class="icc-input" name="' + name + '" type="' + (opciones.tipo || "text") + '" value="' + U.escapeHtml(valor || "") + '"' +
      (opciones.requerido ? " required" : "") + (opciones.soloLectura ? " readonly" : "") + (opciones.deshabilitado ? " disabled" : "") +
      (opciones.placeholder ? ' placeholder="' + U.escapeHtml(opciones.placeholder) + '"' : "") +
      (opciones.autocomplete ? ' autocomplete="' + opciones.autocomplete + '"' : "") + ">" +
      (opciones.ayuda ? '<span class="icc-ayuda">' + opciones.ayuda + "</span>" : "") +
      "</div>"
    );
  }

  function renderInfoUsuario(cont, datos) {
    var u = datos.usuario;
    var p = datos.puede;
    var editable = p.editar_info;
    var sinMigracion = datos.migracion_pendiente;

    cont.innerHTML =
      avisoMigracion(datos) +
      '<form id="form-info-usuario" class="icc-form">' +
      "<h2>Datos personales</h2>" +
      '<div class="icc-foto-row">' +
      '<div class="icc-foto-wrap">' + U.avatar(u, 96) + "</div>" +
      "<div><strong>Foto del perfil</strong>" +
      '<p class="icc-muted">Tamaño propuesto 512 × 512 px, no mayor de 2,5 MB. Formatos PNG, JPG o WebP.</p>' +
      (editable && !sinMigracion
        ? '<input type="file" id="input-avatar" accept="image/png,image/jpeg,image/webp" hidden>' +
          '<button type="button" class="icc-btn icc-btn-secondary" id="btn-cambiar-avatar">Cambiar foto</button> ' +
          (u.avatar_ruta ? '<button type="button" class="icc-btn icc-btn-ghost" id="btn-quitar-avatar">Quitar</button>' : "")
        : "") +
      "</div></div>" +
      '<div class="icc-form-grid">' +
      campoFicha("nombre", "Nombre", u.nombre, { requerido: true, deshabilitado: !editable }) +
      campoFicha("apellidos", "Apellidos", u.apellidos, { deshabilitado: !editable }) +
      campoFicha("email", "Correo electrónico", u.email, {
        requerido: true, tipo: "email", clase: "icc-col-2", deshabilitado: !p.editar_email,
        ayuda: "Es su identificador de acceso al CRM." + (p.editar_email ? "" : " Solo dirección puede cambiarlo."),
      }) +
      (u.prefijo_telefono !== undefined ? campoFicha("prefijo_telefono", "Prefijo", u.prefijo_telefono || "+34", { deshabilitado: !editable }) : "") +
      campoFicha("telefono", "Teléfono", u.telefono, { tipo: "tel", deshabilitado: !editable }) +
      (u.extension !== undefined ? campoFicha("extension", "Extensión", u.extension, { deshabilitado: !editable, placeholder: "—" }) : "") +
      campoFicha("empresa", "Empresa", u.empresa, { deshabilitado: !editable }) +
      campoFicha("cif", "CIF", u.cif, { deshabilitado: !editable }) +
      '<div class="icc-field"><label>Estado de la cuenta</label>' +
      '<select class="icc-select" name="bloqueado"' + (p.editar_estado ? "" : " disabled") + ">" +
      '<option value="0"' + (Number(u.bloqueado) ? "" : " selected") + ">Activo</option>" +
      '<option value="1"' + (Number(u.bloqueado) ? " selected" : "") + ">Bloqueado</option>" +
      "</select>" +
      '<span class="icc-ayuda">Al bloquearla se cierran al momento todas sus sesiones.</span></div>' +
      (u.numero_relacion
        ? '<div class="icc-field icc-col-2"><label>Nº de relación</label>' +
          '<div class="icc-copy-row"><input class="icc-input" readonly value="' + U.escapeHtml(u.numero_relacion) + '" id="input-relacion">' +
          '<button type="button" class="icc-btn icc-btn-ghost" id="btn-copiar-relacion" title="Copiar">📋</button></div>' +
          '<span class="icc-ayuda">Identificador interno único. No se modifica.</span></div>'
        : "") +
      "</div>" +
      "<h2>Organización</h2>" +
      filaDato("Rol", C.ROLES[u.rol] || u.rol) +
      filaDato("Depende de", datos.supervisor ? (datos.supervisor.nombre + " " + (datos.supervisor.apellidos || "")).trim() : "Sin responsable asignado") +
      filaDato("Alta en el CRM", U.formatFecha(u.created_at)) +
      (u.ultimo_acceso !== undefined ? filaDato("Último acceso", u.ultimo_acceso ? U.formatFechaHora(u.ultimo_acceso) + " (" + U.haceCuanto(u.ultimo_acceso) + ")" : "Nunca") : "") +
      (editable ? barraGuardar("savebar-info") : "") +
      "</form>";

    var form = document.getElementById("form-info-usuario");
    vigilarCambios(form);
    var btnCopiar = document.getElementById("btn-copiar-relacion");
    if (btnCopiar) {
      btnCopiar.addEventListener("click", function () {
        navigator.clipboard && navigator.clipboard.writeText(u.numero_relacion);
        U.toast("Nº de relación copiado", "success");
      });
    }
    var btnAvatar = document.getElementById("btn-cambiar-avatar");
    if (btnAvatar) {
      var input = document.getElementById("input-avatar");
      btnAvatar.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", async function () {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 2.5 * 1024 * 1024) {
          U.toast("La imagen supera los 2,5 MB", "error");
          return;
        }
        try {
          await D.subirAvatarUsuario(u.id, file);
          U.toast("Foto actualizada", "success");
          trasGuardarUsuario(datos);
        } catch (err) {
          U.toast(err.message || "No se pudo subir la foto", "error");
        }
      });
    }
    var btnQuitar = document.getElementById("btn-quitar-avatar");
    if (btnQuitar) {
      btnQuitar.addEventListener("click", async function () {
        if (!confirm("¿Quitar la foto de perfil?")) return;
        try {
          await D.borrarAvatarUsuario(u.id);
          U.toast("Foto eliminada", "success");
          trasGuardarUsuario(datos);
        } catch (err) {
          U.toast(err.message || "No se pudo quitar la foto", "error");
        }
      });
    }
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var payload = {};
      ["nombre", "apellidos", "telefono", "empresa", "cif", "prefijo_telefono", "extension"].forEach(function (k) {
        if (fd.has(k)) payload[k] = fd.get(k);
      });
      if (p.editar_email) payload.email = fd.get("email");
      if (p.editar_estado) {
        payload.bloqueado = fd.get("bloqueado") === "1";
        if (payload.bloqueado && !Number(u.bloqueado) && !confirm("Se bloqueará la cuenta y se cerrarán todas sus sesiones. ¿Continuar?")) return;
      }
      try {
        await D.accionUsuario(u.id, "info", payload);
        U.toast("Información guardada", "success");
        trasGuardarUsuario(datos);
      } catch (err) {
        U.toast(err.message || "No se pudo guardar", "error");
      }
    });
  }

  // --------------------------------------------------------- Roles y permisos
  function renderPermisosUsuario(cont, datos) {
    var u = datos.usuario;
    var editable = datos.puede.editar_permisos && !datos.migracion_pendiente;
    var perm = datos.permisos;
    var efectivos = perm.efectivos || [];
    var excepciones = perm.excepciones || {};
    var editables = perm.editables || [];
    var cambiaRol = datos.puede.cambiar_rol !== undefined ? datos.puede.cambiar_rol : datos.puede.editar_permisos;
    var numExcepciones = Object.keys(excepciones).length;
    var esSuperAdmin = window.icc.auth.esSuperAdmin();
    var rolesAsignables = Object.keys(C.ROLES).filter(function (r) {
      return esSuperAdmin || !esRolAdmin(r);
    });

    cont.innerHTML =
      avisoMigracion(datos) +
      '<form id="form-permisos-usuario" class="icc-form">' +
      "<h2>Rol y permisos granulares</h2>" +
      '<div class="icc-rol-row">' +
      '<div class="icc-field" style="flex:1"><label>Rol asignado</label>' +
      (cambiaRol
        ? '<select class="icc-select" id="select-rol-usuario">' +
          rolesAsignables
            .map(function (r) { return '<option value="' + r + '"' + (u.rol === r ? " selected" : "") + ">" + C.ROLES[r] + "</option>"; })
            .join("") +
          "</select>"
        : '<input class="icc-input" disabled value="' + U.escapeHtml(C.ROLES[u.rol] || u.rol) + '">') +
      '<span class="icc-ayuda">' + U.escapeHtml(C.ROLES_DESC[u.rol] || "") + "</span></div>" +
      '<div class="icc-rol-excepciones">' +
      "<span class=\"icc-muted\">Permisos fuera del rol</span> " +
      badgeColor(numExcepciones + (numExcepciones === 1 ? " excepción" : " excepciones"), numExcepciones ? "#fbbf24" : "#94a3b8") +
      (editable && numExcepciones ? ' <button type="button" class="icc-btn icc-btn-ghost" id="btn-restablecer-permisos">↺ Restablecer al rol</button>' : "") +
      "</div></div>" +
      (cambiaRol
        ? '<div class="icc-aviso icc-aviso-oro">⚠️ Cambiar el rol reescribe los permisos con los de fábrica del nuevo rol. Ajusta después las excepciones que necesites.</div>'
        : datos.puede.editar_permisos
        ? '<p class="icc-muted">Como Jefe de equipo puedes conceder o retirar a tus comerciales los permisos que tú mismo tienes. El rol y el equipo los cambia dirección.</p>'
        : '<p class="icc-muted">' + (datos.es_propia ? "Estos son tus permisos en el CRM. Los gestiona dirección." : "") + "</p>") +
      perm.catalogo
        .filter(function (grupo) {
          // Los permisos de gestion de equipo solo tienen efecto en un Jefe de equipo.
          return u.rol === "jefe_de_equipo" || !grupo.permisos.every(function (pm) { return pm.clave.indexOf("usuarios.") === 0; });
        })
        .map(function (grupo) {
          return (
            '<div class="icc-perm-grupo"><div class="icc-perm-grupo-head">' + U.escapeHtml(grupo.modulo) + "</div>" +
            grupo.permisos
              .map(function (pm) {
                var deFabrica = pm.roles.indexOf(u.rol) !== -1;
                var activo = efectivos.indexOf(pm.clave) !== -1;
                return (
                  '<div class="icc-perm-row" data-perm-row="' + pm.clave + '" data-fabrica="' + (deFabrica ? 1 : 0) + '">' +
                  switchHtml('data-perm="' + pm.clave + '"', activo, !editable || editables.indexOf(pm.clave) === -1) +
                  '<div class="icc-perm-text"><strong>' + U.escapeHtml(pm.label) + "</strong>" +
                  ' <span class="icc-perm-excepcion"' + (activo === deFabrica ? " hidden" : "") + ">excepción</span>" +
                  '<span class="icc-muted">' + U.escapeHtml(pm.desc) + "</span></div>" +
                  '<code class="icc-perm-clave">' + pm.clave + "</code></div>"
                );
              })
              .join("") +
            "</div>"
          );
        })
        .join("") +
      '<p class="icc-muted" style="margin-top:6px">Siempre ligados al rol (no se delegan): qué datos ve cada uno según su equipo, ' +
      'la gestión de cuentas de Admin y las copias de seguridad. Los permisos de "Equipo" solo tienen efecto en un Jefe de equipo, ' +
      'y siempre sobre los comerciales de su propio equipo.</p>' +
      (editable ? barraGuardar("savebar-permisos") : "") +
      "</form>";

    var form = document.getElementById("form-permisos-usuario");
    vigilarCambios(form);
    form.querySelectorAll("[data-perm]").forEach(function (chk) {
      chk.addEventListener("change", function () {
        var fila = form.querySelector('[data-perm-row="' + chk.getAttribute("data-perm") + '"]');
        var deFabrica = fila.getAttribute("data-fabrica") === "1";
        fila.querySelector(".icc-perm-excepcion").hidden = chk.checked === deFabrica;
      });
    });
    var selectRol = document.getElementById("select-rol-usuario");
    if (selectRol) {
      selectRol.addEventListener("change", async function () {
        if (!confirm("Cambiar el rol a " + C.ROLES[selectRol.value] + " reescribirá sus permisos con los de fábrica. ¿Continuar?")) {
          selectRol.value = u.rol;
          return;
        }
        try {
          await D.actualizarAgente(u.id, { rol: selectRol.value });
          U.toast("Rol actualizado", "success");
          recargarFicha();
        } catch (err) {
          U.toast(err.message || "No se pudo cambiar el rol", "error");
          selectRol.value = u.rol;
        }
      });
    }
    var btnRest = document.getElementById("btn-restablecer-permisos");
    if (btnRest) {
      btnRest.addEventListener("click", async function () {
        if (!confirm("¿Quitar todas las excepciones y dejar solo los permisos de su rol?")) return;
        try {
          await D.accionUsuario(u.id, "restablecer_permisos");
          U.toast("Permisos restablecidos al rol", "success");
          recargarFicha();
        } catch (err) {
          U.toast(err.message || "No se pudo restablecer", "error");
        }
      });
    }
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var permisos = {};
      form.querySelectorAll("[data-perm]").forEach(function (chk) {
        if (!chk.disabled) permisos[chk.getAttribute("data-perm")] = chk.checked;
      });
      try {
        await D.accionUsuario(u.id, "permisos", { permisos: permisos });
        U.toast("Permisos guardados", "success");
        recargarFicha();
      } catch (err) {
        U.toast(err.message || "No se pudieron guardar los permisos", "error");
      }
    });
  }

  // -------------------------------------------------- Disponibilidad y agenda
  function horarioPorDefecto() {
    var h = {};
    C.DIAS_SEMANA.forEach(function (d, i) {
      h[d[0]] = { activo: i < 5, desde: "09:00", hasta: "18:00" };
    });
    return h;
  }

  function renderDisponibilidadUsuario(cont, datos) {
    var u = datos.usuario;
    var pref = datos.preferencias || {};
    var editable = datos.puede.editar_disponibilidad && !datos.migracion_pendiente;
    var horario = pref.horario || horarioPorDefecto();
    var citas = datos.proximas_citas || [];

    var citasPorDia = {};
    citas.forEach(function (c) { (citasPorDia[c.fecha] = citasPorDia[c.fecha] || []).push(c); });

    cont.innerHTML =
      avisoMigracion(datos) +
      '<form id="form-disponibilidad" class="icc-form">' +
      "<h2>Estado actual</h2>" +
      '<div class="icc-form-grid">' +
      '<div class="icc-field"><label>Disponibilidad</label><select class="icc-select" name="estado_disponibilidad"' + (editable ? "" : " disabled") + ">" +
      Object.keys(C.ESTADOS_DISPONIBILIDAD)
        .map(function (k) {
          return '<option value="' + k + '"' + ((pref.estado_disponibilidad || "disponible") === k ? " selected" : "") + ">" + C.ESTADOS_DISPONIBILIDAD[k].label + "</option>";
        })
        .join("") +
      "</select></div>" +
      campoFicha("ausencia_desde", "Ausencia desde", pref.ausencia_desde, { tipo: "date", deshabilitado: !editable }) +
      campoFicha("ausencia_hasta", "Ausencia hasta", pref.ausencia_hasta, { tipo: "date", deshabilitado: !editable }) +
      campoFicha("nota_disponibilidad", "Nota", pref.nota_disponibilidad, {
        clase: "icc-col-3", deshabilitado: !editable, placeholder: "Ej.: de vacaciones, su equipo lo atiende María",
      }) +
      "</div>" +
      '<div class="icc-card-head"><h2>Horario laboral</h2>' +
      (editable ? '<button type="button" class="icc-btn icc-btn-ghost" id="btn-copiar-lunes">Copiar lunes a laborables</button>' : "") +
      "</div>" +
      '<div class="icc-horario">' +
      C.DIAS_SEMANA.map(function (d) {
        var h = horario[d[0]] || { activo: false, desde: "09:00", hasta: "18:00" };
        return (
          '<div class="icc-horario-row" data-dia="' + d[0] + '">' +
          switchHtml('data-dia-activo="' + d[0] + '"', h.activo, !editable) +
          '<span class="icc-horario-dia">' + d[1] + "</span>" +
          '<input class="icc-input" type="time" data-dia-desde="' + d[0] + '" value="' + U.escapeHtml(h.desde || "09:00") + '"' + (editable ? "" : " disabled") + ">" +
          '<span class="icc-muted">a</span>' +
          '<input class="icc-input" type="time" data-dia-hasta="' + d[0] + '" value="' + U.escapeHtml(h.hasta || "18:00") + '"' + (editable ? "" : " disabled") + ">" +
          "</div>"
        );
      }).join("") +
      "</div>" +
      (editable ? barraGuardar("savebar-disp") : "") +
      "</form>" +
      '<div class="icc-card-head" style="margin-top:22px"><h2>Agenda · próximos 14 días</h2>' +
      '<a class="icc-btn icc-btn-ghost" href="#/agenda?comercial_id=' + u.id + '">Abrir agenda</a></div>' +
      (citas.length
        ? Object.keys(citasPorDia)
            .map(function (fecha) {
              return (
                '<div class="icc-cal-dia"><div class="icc-cal-fecha">' + U.formatFecha(fecha) + "</div>" +
                citasPorDia[fecha]
                  .map(function (c) {
                    var est = C.ESTADOS_CITA[c.estado] || { label: c.estado, color: "#94a3b8" };
                    return (
                      '<div class="icc-cal-cita"><span class="icc-cal-hora">' + String(c.hora_inicio || "").slice(0, 5) + "–" +
                      String(c.hora_fin || "").slice(0, 5) + "</span><span>" + U.escapeHtml(c.cliente_nombre) + "</span>" +
                      badgeColor(est.label, est.color) + "</div>"
                    );
                  })
                  .join("") +
                "</div>"
              );
            })
            .join("")
        : '<p class="icc-empty">Sin citas en los próximos 14 días.</p>');

    var form = document.getElementById("form-disponibilidad");
    vigilarCambios(form);
    var btnCopiar = document.getElementById("btn-copiar-lunes");
    if (btnCopiar) {
      btnCopiar.addEventListener("click", function () {
        var desde = form.querySelector('[data-dia-desde="lun"]').value;
        var hasta = form.querySelector('[data-dia-hasta="lun"]').value;
        ["mar", "mie", "jue", "vie"].forEach(function (d) {
          form.querySelector('[data-dia-activo="' + d + '"]').checked = true;
          form.querySelector('[data-dia-desde="' + d + '"]').value = desde;
          form.querySelector('[data-dia-hasta="' + d + '"]').value = hasta;
        });
        form.querySelector(".icc-savebar").classList.add("is-dirty");
      });
    }
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var nuevoHorario = {};
      C.DIAS_SEMANA.forEach(function (d) {
        nuevoHorario[d[0]] = {
          activo: form.querySelector('[data-dia-activo="' + d[0] + '"]').checked,
          desde: form.querySelector('[data-dia-desde="' + d[0] + '"]').value,
          hasta: form.querySelector('[data-dia-hasta="' + d[0] + '"]').value,
        };
      });
      try {
        await D.accionUsuario(u.id, "disponibilidad", {
          horario: nuevoHorario,
          estado_disponibilidad: fd.get("estado_disponibilidad"),
          ausencia_desde: fd.get("ausencia_desde") || "",
          ausencia_hasta: fd.get("ausencia_hasta") || "",
          nota_disponibilidad: fd.get("nota_disponibilidad") || "",
        });
        U.toast("Disponibilidad guardada", "success");
        recargarFicha();
      } catch (err) {
        U.toast(err.message || "No se pudo guardar", "error");
      }
    });
  }

  // ------------------------------------------------------------ Notificaciones
  function renderNotificacionesUsuario(cont, datos) {
    var u = datos.usuario;
    var prefs = (datos.preferencias && datos.preferencias.notificaciones) || {};
    var editable = !datos.migracion_pendiente;
    cont.innerHTML =
      avisoMigracion(datos) +
      '<form id="form-notificaciones" class="icc-form">' +
      "<h2>Avisos en la campana</h2>" +
      '<p class="icc-muted">Elige qué avisos llegan a la campana 🔔 de ' + (datos.es_propia ? "tu cuenta" : U.escapeHtml(u.nombre)) + ".</p>" +
      '<div class="icc-perm-grupo">' +
      C.AVISOS_USUARIO.map(function (a) {
        var activo = prefs[a[0]] === undefined ? true : !!prefs[a[0]];
        return (
          '<div class="icc-perm-row">' + switchHtml('name="' + a[0] + '"', activo, !editable) +
          '<div class="icc-perm-text"><strong>' + a[1] + '</strong><span class="icc-muted">' + a[2] + "</span></div></div>"
        );
      }).join("") +
      "</div>" +
      (editable ? barraGuardar("savebar-notif") : "") +
      "</form>";
    var form = document.getElementById("form-notificaciones");
    vigilarCambios(form);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var payload = {};
      C.AVISOS_USUARIO.forEach(function (a) { payload[a[0]] = form.querySelector('[name="' + a[0] + '"]').checked; });
      try {
        await D.accionUsuario(u.id, "notificaciones", payload);
        U.toast("Preferencias guardadas", "success");
        recargarFicha();
      } catch (err) {
        U.toast(err.message || "No se pudo guardar", "error");
      }
    });
  }

  // --------------------------------------------------------- Seguridad avanzada
  function describirDispositivo(ua) {
    ua = ua || "";
    var nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
    var so = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
    var icono = /Android|iPhone|iPad|Mobile/.test(ua) ? "📱" : "💻";
    return icono + " " + nav + (so ? " · " + so : "");
  }

  function renderSeguridadUsuario(cont, datos) {
    var u = datos.usuario;
    var p = datos.puede;
    var seg = datos.seguridad || { sesiones: [], historial: [] };
    var sinMigracion = datos.migracion_pendiente;

    cont.innerHTML =
      avisoMigracion(datos) +
      "<h2>Credenciales</h2>" +
      (!sinMigracion && (p.reset_password || p.cerrar_sesiones)
        ? '<div class="icc-doc-actions">' +
          (p.reset_password ? '<button type="button" class="icc-btn icc-btn-secondary" id="btn-reset-password">↻ Restablecer contraseña</button>' : "") +
          (p.cerrar_sesiones
            ? '<button type="button" class="icc-btn icc-btn-ghost" id="btn-cerrar-sesiones">⇥ ' + (datos.es_propia ? "Cerrar mis otras sesiones" : "Cerrar todas las sesiones") + "</button>"
            : "") +
          "</div>" +
          (p.reset_password
            ? '<p class="icc-muted">Al restablecerla se genera una contraseña que cumple la política corporativa, se cierran sus sesiones y se le exige cambiarla al entrar. Se muestra una sola vez.</p>'
            : "")
        : "") +
      '<div class="icc-seg-opcion">' +
      '<div><strong>Exigir cambio de contraseña en el próximo acceso</strong><span class="icc-muted">Recomendado tras entregar credenciales en mano.</span></div>' +
      switchHtml('id="chk-exigir-cambio"', Number(u.debe_cambiar_password) === 1, !p.exigir_cambio || sinMigracion) +
      "</div>" +
      '<div class="icc-seg-opcion">' +
      "<div><strong>Protección contra accesos indebidos</strong>" +
      '<span class="icc-muted">Tras 5 intentos fallidos en 15 minutos la cuenta se bloquea temporalmente. Contraseñas de 8+ caracteres con letras y números.</span></div>' +
      badgeColor(sinMigracion ? "Pendiente" : "Activa", sinMigracion ? "#94a3b8" : "#34d399") +
      "</div>" +
      (u.password_actualizada_en !== undefined
        ? '<p class="icc-muted">Última actualización de la contraseña: ' + (u.password_actualizada_en ? U.formatFechaHora(u.password_actualizada_en) : "sin registrar") + "</p>"
        : "") +
      (p.cambiar_mi_password
        ? '<form id="form-cambiar-password" class="icc-form icc-card" style="margin-top:12px" method="post" action="#">' +
          "<h3>Cambiar mi contraseña</h3>" +
          // Usuario oculto: asi el navegador actualiza la contraseña que tenga guardada.
          '<input type="email" name="username" autocomplete="username" value="' + U.escapeHtml(u.email || "") + '" hidden readonly>' +
          '<div class="icc-form-grid">' +
          campoFicha("actual", "Contraseña actual", "", { tipo: "password", requerido: true, autocomplete: "current-password" }) +
          campoFicha("nueva", "Nueva contraseña", "", { tipo: "password", requerido: true, autocomplete: "new-password", ayuda: "Mínimo 8 caracteres, con letras y números." }) +
          campoFicha("repetir", "Repite la nueva", "", { tipo: "password", requerido: true, autocomplete: "new-password" }) +
          "</div>" +
          '<div><button type="submit" class="icc-btn icc-btn-primary">Cambiar contraseña</button></div>' +
          "</form>"
        : "") +
      "<h2 style=\"margin-top:22px\">Sesiones activas</h2>" +
      (seg.sesiones.length
        ? seg.sesiones
            .map(function (s) {
              return (
                '<div class="icc-sesion-row"><div><strong>' + describirDispositivo(s.user_agent) + "</strong>" +
                (s.es_actual ? " " + badgeColor("Esta sesión", "#22d3ee") : "") +
                '<span class="icc-muted">IP ' + U.escapeHtml(s.ip || "-") + " · iniciada " + U.formatFechaHora(s.creada_en) +
                " · activa " + U.haceCuanto(s.ultima_actividad) + "</span></div>" +
                (p.cerrar_sesiones && !s.es_actual ? '<button type="button" class="icc-btn icc-btn-ghost" data-cerrar-sesion="' + s.id + '">Cerrar</button>' : "") +
                "</div>"
              );
            })
            .join("")
        : '<p class="icc-empty">No hay sesiones abiertas.</p>') +
      "<h2 style=\"margin-top:22px\">Historial de esta cuenta</h2>" +
      (seg.historial.length
        ? '<div class="icc-hist">' +
          seg.historial
            .map(function (h) {
              var alerta = ["login_fallido", "cuenta_bloqueada", "password_restablecida"].indexOf(h.accion) !== -1;
              return (
                '<div class="icc-hist-item' + (alerta ? " is-alerta" : "") + '"><strong>' + U.escapeHtml(C.ACCIONES_HISTORIAL[h.accion] || h.accion) + "</strong>" +
                (h.detalle && h.detalle.toLowerCase() !== String(C.ACCIONES_HISTORIAL[h.accion] || "").toLowerCase()
                  ? "<span>" + U.escapeHtml(h.detalle) + "</span>"
                  : "") +
                '<span class="icc-muted">' + U.escapeHtml(h.autor_nombre || "Sistema") + " · " + U.formatFechaHora(h.created_at) +
                (h.ip ? " · IP " + U.escapeHtml(h.ip) : "") + "</span></div>"
              );
            })
            .join("") +
          "</div>"
        : '<p class="icc-empty">Sin movimientos registrados todavía.</p>');

    var btnReset = document.getElementById("btn-reset-password");
    if (btnReset) {
      btnReset.addEventListener("click", async function () {
        if (!confirm("Se generará una contraseña nueva para " + u.nombre + ", se cerrarán sus sesiones y tendrá que cambiarla al entrar. ¿Continuar?")) return;
        try {
          var r = await D.accionUsuario(u.id, "reset_password");
          U.openModal(
            "<h2>Contraseña provisional</h2>" +
            '<p class="icc-muted">Entrégasela a ' + U.escapeHtml(u.nombre) + " por un canal seguro. No se volverá a mostrar.</p>" +
            '<div class="icc-copy-row"><input class="icc-input icc-pass-mostrar" readonly value="' + U.escapeHtml(r.password) + '" id="input-pass-temporal">' +
            '<button type="button" class="icc-btn icc-btn-ghost" id="btn-copiar-pass">📋 Copiar</button></div>' +
            '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-primary" data-close-btn>Hecho</button></div>'
          );
          document.getElementById("btn-copiar-pass").addEventListener("click", function () {
            navigator.clipboard && navigator.clipboard.writeText(r.password);
            U.toast("Contraseña copiada", "success");
          });
          recargarFicha();
        } catch (err) {
          U.toast(err.message || "No se pudo restablecer", "error");
        }
      });
    }
    var btnCerrar = document.getElementById("btn-cerrar-sesiones");
    if (btnCerrar) {
      btnCerrar.addEventListener("click", async function () {
        if (!confirm(datos.es_propia ? "¿Cerrar tus sesiones abiertas en otros dispositivos?" : "¿Cerrar todas las sesiones de " + u.nombre + "?")) return;
        try {
          var r = await D.accionUsuario(u.id, "cerrar_sesiones");
          U.toast(r.cerradas ? r.cerradas + " sesiones cerradas" : "No había otras sesiones abiertas", "success");
          recargarFicha();
        } catch (err) {
          U.toast(err.message || "No se pudieron cerrar", "error");
        }
      });
    }
    cont.querySelectorAll("[data-cerrar-sesion]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        try {
          await D.accionUsuario(u.id, "cerrar_sesion", { sesion_id: btn.getAttribute("data-cerrar-sesion") });
          U.toast("Sesión cerrada", "success");
          recargarFicha();
        } catch (err) {
          U.toast(err.message || "No se pudo cerrar", "error");
        }
      });
    });
    var chkExigir = document.getElementById("chk-exigir-cambio");
    if (chkExigir && p.exigir_cambio) {
      chkExigir.addEventListener("change", async function () {
        try {
          await D.accionUsuario(u.id, "exigir_cambio", { valor: chkExigir.checked });
          U.toast(chkExigir.checked ? "Deberá cambiar la contraseña al entrar" : "Ya no se le exige cambiarla", "success");
          recargarFicha();
        } catch (err) {
          chkExigir.checked = !chkExigir.checked;
          U.toast(err.message || "No se pudo actualizar", "error");
        }
      });
    }
    var formPass = document.getElementById("form-cambiar-password");
    if (formPass) {
      formPass.addEventListener("submit", async function (e) {
        e.preventDefault();
        var fd = new FormData(formPass);
        if (fd.get("nueva") !== fd.get("repetir")) {
          U.toast("Las contraseñas nuevas no coinciden", "error");
          return;
        }
        try {
          await window.icc.auth.cambiarPassword(fd.get("actual"), fd.get("nueva"));
          U.toast("Contraseña cambiada. Se han cerrado tus otras sesiones.", "success");
        } catch (err) {
          U.toast(err.message || "No se pudo cambiar", "error");
        }
      });
    }
  }

  function campoFecha(name, label, valor) {
    return campoTexto(name, label, false, "date", valor ? String(valor).slice(0, 10) : "");
  }

  function modalFichaPersonal(a, f) {
    U.openModal(
      "<h2>Datos del agente</h2>" +
      '<form id="form-ficha-personal" class="icc-form">' +
      campoTexto("dni", "DNI / NIE", false, "text", f.dni) +
      campoFecha("fecha_nacimiento", "Fecha de nacimiento", f.fecha_nacimiento) +
      campoTexto("direccion", "Direccion", false, "text", f.direccion) +
      campoTexto("codigo_postal", "Codigo postal", false, "text", f.codigo_postal) +
      campoTexto("poblacion", "Poblacion", false, "text", f.poblacion) +
      campoTexto("provincia", "Provincia", false, "text", f.provincia) +
      campoTexto("email_personal", "Email personal", false, "email", f.email_personal) +
      campoTexto("iban", "IBAN (para liquidaciones)", false, "text", f.iban) +
      campoTexto("contacto_emergencia", "Contacto de emergencia", false, "text", f.contacto_emergencia) +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Guardar</button>' +
      "</div></form>"
    );
    document.getElementById("form-ficha-personal").addEventListener("submit", async function (e) {
      e.preventDefault();
      var payload = Object.fromEntries(new FormData(e.target).entries());
      try {
        await D.guardarFichaAgente(a.id, payload);
        U.toast("Ficha actualizada", "success");
        U.closeModal();
        recargarFicha();
      } catch (err) {
        U.toast(err.message || "No se pudo guardar", "error");
      }
    });
  }

  function modalFichaGestion(a, f) {
    U.openModal(
      "<h2>Gestión y objetivos · " + U.escapeHtml(a.nombre) + "</h2>" +
      '<form id="form-ficha-gestion" class="icc-form">' +
      '<div class="icc-field"><label>Tipo de relacion</label><select class="icc-select" name="tipo_relacion">' +
      '<option value="">Sin especificar</option>' +
      Object.keys(C.TIPOS_RELACION_AGENTE)
        .map(function (t) {
          return '<option value="' + t + '"' + (f.tipo_relacion === t ? " selected" : "") + ">" + C.TIPOS_RELACION_AGENTE[t] + "</option>";
        })
        .join("") +
      "</select></div>" +
      campoFecha("fecha_incorporacion", "Fecha de incorporacion", f.fecha_incorporacion) +
      campoTexto("zona", "Zona asignada", false, "text", f.zona) +
      campoTexto("sectores", "Sectores que trabaja", false, "text", f.sectores) +
      campoTexto("objetivo_contratos_mes", "Objetivo contratos / mes", false, "number", f.objetivo_contratos_mes) +
      campoTexto("objetivo_kw_mes", "Objetivo kW / mes", false, "number", f.objetivo_kw_mes) +
      campoTexto("objetivo_facturacion_mes", "Objetivo facturacion / mes (€)", false, "number", f.objetivo_facturacion_mes) +
      '<div class="icc-field"><label>Observaciones (las ve tambien el agente)</label>' +
      '<textarea class="icc-textarea" name="observaciones">' + U.escapeHtml(f.observaciones || "") + "</textarea></div>" +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Guardar</button>' +
      "</div></form>"
    );
    document.getElementById("form-ficha-gestion").addEventListener("submit", async function (e) {
      e.preventDefault();
      var payload = Object.fromEntries(new FormData(e.target).entries());
      try {
        await D.guardarFichaAgente(a.id, payload);
        U.toast("Gestión actualizada", "success");
        U.closeModal();
        recargarFicha();
      } catch (err) {
        U.toast(err.message || "No se pudo guardar", "error");
      }
    });
  }

  function modalNuevoSeguimiento(a) {
    var hoy = new Date();
    var hoyIsoTxt = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" + String(hoy.getDate()).padStart(2, "0");
    U.openModal(
      "<h2>Nueva entrada de seguimiento</h2>" +
      '<form id="form-nuevo-seguimiento" class="icc-form">' +
      '<div class="icc-field"><label>Tipo</label><select class="icc-select" name="tipo">' +
      Object.keys(C.TIPOS_SEGUIMIENTO_AGENTE)
        .map(function (t) {
          return '<option value="' + t + '">' + C.TIPOS_SEGUIMIENTO_AGENTE[t].icono + " " + C.TIPOS_SEGUIMIENTO_AGENTE[t].label + "</option>";
        })
        .join("") +
      "</select></div>" +
      campoTexto("titulo", "Titulo", true, "text") +
      campoFecha("fecha", "Fecha", hoyIsoTxt) +
      '<div class="icc-field"><label>Detalle</label><textarea class="icc-textarea" name="contenido"></textarea></div>' +
      '<p class="icc-muted">La entrada la ven ' + U.escapeHtml(a.nombre) + ", su jefe de equipo y dirección, y les llega un aviso.</p>" +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Guardar entrada</button>' +
      "</div></form>"
    );
    document.getElementById("form-nuevo-seguimiento").addEventListener("submit", async function (e) {
      e.preventDefault();
      var payload = Object.fromEntries(new FormData(e.target).entries());
      try {
        await D.crearSeguimientoAgente(a.id, payload);
        U.toast("Entrada guardada", "success");
        U.closeModal();
        recargarFicha();
      } catch (err) {
        U.toast(err.message || "No se pudo guardar", "error");
      }
    });
  }

  async function viewAuditoriaVerComo() {
    main().innerHTML = '<div class="icc-loading">Cargando historial…</div>';
    var historial;
    try {
      historial = await D.historialImpersonacion();
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + U.escapeHtml(err.message || "No se pudo cargar el historial") + "</p>";
      return;
    }

    main().innerHTML =
      '<div class="icc-page-head"><h1>Historial de "Ver como"</h1>' +
      '<a class="icc-btn icc-btn-secondary" href="#/agentes">← Volver a Agentes</a></div>' +
      '<div class="icc-card icc-table-wrap"><table class="icc-table"><thead><tr>' +
      "<th>Admin</th><th>Entro como</th><th>Rol</th><th>Inicio</th><th>Fin</th><th>IP</th>" +
      "</tr></thead><tbody>" +
      (historial.length
        ? historial
            .map(function (h) {
              return (
                "<tr><td>" + U.escapeHtml(h.admin_nombre) + "</td>" +
                "<td>" + U.escapeHtml(h.objetivo_nombre) + "</td>" +
                "<td>" + U.escapeHtml(C.ROLES[h.objetivo_rol] || h.objetivo_rol) + "</td>" +
                "<td>" + U.formatFechaHora(h.iniciado_en) + "</td>" +
                "<td>" + (h.finalizado_en ? U.formatFechaHora(h.finalizado_en) : '<span class="icc-muted">En curso</span>') + "</td>" +
                "<td>" + U.escapeHtml(h.ip || "-") + "</td></tr>"
              );
            })
            .join("")
        : '<tr><td colspan="6" class="icc-empty">Todavia no se ha usado "Ver como" ninguna vez.</td></tr>') +
      "</tbody></table></div>";
  }

  // ---------------------------------------------------------------- Ficheros
  async function viewFicheros(carpetaId) {
    main().innerHTML = '<div class="icc-loading">Cargando ficheros…</div>';
    var esAdmin = window.icc.auth.esAdminOSuperior();
    var esc = U.escapeHtml;
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var vistaGuardada = "";
    try { vistaGuardada = localStorage.getItem("icc_ficheros_vista") || ""; } catch (e) { /* sin almacenamiento */ }
    var vista = vistaGuardada === "lista" ? "lista" : "cuadricula";

    var arbol, ficheros;
    try {
      arbol = await D.listarCarpetasFicheros(carpetaId || null);
      ficheros = carpetaId ? await D.listarFicheros(carpetaId) : [];
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + esc(err.message || "No se pudo abrir esta carpeta") + "</p>";
      return;
    }

    var actual = arbol.actual; // null en la raiz
    var ruta = arbol.ruta || [];
    var carpetas = arbol.carpetas || [];
    // Solo Administracion edita: lo decide el servidor (puede_gestionar).
    var gestiona = !!arbol.puede_gestionar;
    var puedeBorrar = gestiona;
    var puedeSubirAqui = !!(actual && gestiona);
    var puedeCrearCarpeta = gestiona && (!actual || !actual.es_personal);
    var secciones = arbol.secciones || [];
    var ordenDisponible = arbol.orden_disponible !== false;
    var CARPETA_SISTEMA = "Facturacion de Comerciales";

    // Color estable por carpeta (segun su nombre) para distinguirlas de un vistazo.
    var paleta = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#FB923C", "#4ADE80", "#E879F9", "#2DD4BF", "#F87171", "#93C5FD"];
    var colorCarpeta = function (nombre) {
      var h = 0;
      String(nombre).split("").forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) >>> 0; });
      return paleta[h % paleta.length];
    };
    var tipos = {
      pdf: { ico: "📕", c: "#F87171", g: "pdf" },
      doc: { ico: "📘", c: "#60A5FA", g: "doc" }, docx: { ico: "📘", c: "#60A5FA", g: "doc" },
      xls: { ico: "📗", c: "#34D399", g: "hoja" }, xlsx: { ico: "📗", c: "#34D399", g: "hoja" },
      ppt: { ico: "📙", c: "#FB923C", g: "presentacion" }, pptx: { ico: "📙", c: "#FB923C", g: "presentacion" },
      png: { ico: "🖼️", c: "#E879F9", g: "imagen" }, jpg: { ico: "🖼️", c: "#E879F9", g: "imagen" }, jpeg: { ico: "🖼️", c: "#E879F9", g: "imagen" },
      zip: { ico: "🗜️", c: "#FBBF24", g: "zip" },
    };
    var extension = function (n) { var m = String(n).toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ""; };
    var tipoDe = function (f) { return tipos[extension(f.nombre_archivo)] || { ico: "📄", c: "#94A3B8", g: "otro" }; };
    var tamano = function (b) {
      if (b === null || b === undefined) return "";
      if (b < 1024) return b + " B";
      if (b < 1048576) return Math.round(b / 1024) + " KB";
      return (b / 1048576).toFixed(1).replace(".", ",") + " MB";
    };
    var hoy = hoyIso();
    var haceDias = function (fecha) {
      if (!fecha) return "";
      var d = Math.floor((new Date(hoy + "T12:00:00") - new Date(String(fecha).slice(0, 10) + "T12:00:00")) / 86400000);
      return d <= 0 ? "hoy" : d === 1 ? "ayer" : "hace " + d + " d";
    };
    var plural = function (n, s, p) { return n + " " + (n === 1 ? s : p); };

    var totalArchivosEnCarpetas = carpetas.reduce(function (a, c) { return a + Number(c.n_archivos || 0); }, 0);
    var pesoTotal = ficheros.reduce(function (a, f) { return a + Number(f.tamano || 0); }, 0);
    var faltan = ficheros.filter(function (f) { return f.existe === false; }).length;
    var recientes = ficheros.filter(function (f) { var d = haceDias(f.created_at); return d === "hoy" || d === "ayer"; }).length;

    var migas =
      '<a href="#/ficheros"' + (!carpetaId ? ' class="is-actual"' : "") + ">🏠 Inicio</a>" +
      ruta.map(function (r, i) {
        return '<span class="icc-fi-sep">›</span><a href="#/ficheros/' + r.id + '"' + (i === ruta.length - 1 ? ' class="is-actual"' : "") + ">" + esc(r.nombre) + "</a>";
      }).join("");
    var padreHref = ruta.length > 1 ? "#/ficheros/" + ruta[ruta.length - 2].id : "#/ficheros";

    var resumen = !carpetaId
      ? "<b>" + carpetas.length + "</b> " + (carpetas.length === 1 ? "carpeta" : "carpetas") + " · <b>" + totalArchivosEnCarpetas + "</b> " + (totalArchivosEnCarpetas === 1 ? "archivo dentro" : "archivos dentro")
      : "<b>" + carpetas.length + "</b> " + (carpetas.length === 1 ? "subcarpeta" : "subcarpetas") + " · <b>" + ficheros.length + "</b> " + (ficheros.length === 1 ? "archivo" : "archivos") +
        (pesoTotal ? " · <b>" + tamano(pesoTotal) + "</b>" : "") +
        (recientes ? ' · <b class="ok">' + recientes + "</b> " + (recientes === 1 ? "nuevo" : "nuevos") : "") +
        (faltan ? ' · <b class="mal">' + faltan + "</b> " + (faltan === 1 ? "no encontrado" : "no encontrados") : "");

    var tarjetaCarpeta = function (c) {
      var n = Number(c.n_archivos || 0), s = Number(c.n_carpetas || 0);
      var detalle = [s ? plural(s, "carpeta", "carpetas") : "", plural(n, "archivo", "archivos")].filter(Boolean).join(" · ");
      return (
        '<div class="icc-fi-carpeta' + (gestiona ? " con-herr" : "") + '" data-id="' + c.id + '" data-nombre="' + esc(String(c.nombre).toLowerCase()) + '" style="--c:' + colorCarpeta(c.nombre) + '">' +
        '<a class="icc-fi-carpeta-link" href="#/ficheros/' + c.id + '">' +
        '<span class="icc-fi-carpeta-ico" aria-hidden="true"><i></i></span>' +
        '<span class="icc-fi-carpeta-txt"><strong>' + esc(c.nombre) + (c.es_personal ? " 🔒" : "") + "</strong>" +
        "<small>" + detalle + (c.ultimo_archivo ? " · " + haceDias(c.ultimo_archivo) : "") + "</small>" +
        (c.es_personal && c.propietario_nombre ? '<small class="icc-fi-dueno">Personal de ' + esc(c.propietario_nombre) + "</small>" : "") +
        "</span></a>" +
        (gestiona
          ? '<div class="icc-fi-herr">' +
            '<button type="button" class="icc-fi-accion icc-fi-mover" data-mover="-1" title="Mover antes" aria-label="Mover ' + esc(c.nombre) + ' antes">◀</button>' +
            '<button type="button" class="icc-fi-accion icc-fi-mover" data-mover="1" title="Mover después" aria-label="Mover ' + esc(c.nombre) + ' después">▶</button>' +
            (!c.es_personal
              ? '<button type="button" class="icc-fi-accion" title="Editar nombre y sección" aria-label="Editar carpeta ' + esc(c.nombre) + '" data-editar-carpeta-id="' + c.id + '">✏️</button>'
              : "") +
            (!c.es_personal && !(c.nombre === CARPETA_SISTEMA && !c.parent_id)
              ? '<button type="button" class="icc-fi-accion icc-fi-borrar" title="Borrar carpeta (debe estar vacía)" aria-label="Borrar carpeta ' + esc(c.nombre) + '" data-borrar-carpeta-id="' + c.id + '"' + (n || s ? ' data-llena="1"' : "") + ">🗑</button>"
              : "") +
            "</div>"
          : "") +
        "</div>"
      );
    };

    var filaFichero = function (f) {
      var t = tipoDe(f);
      var falta = f.existe === false;
      return (
        '<div class="icc-fi-archivo' + (falta ? " is-falta" : "") + '" data-nombre="' + esc(String(f.nombre_archivo).toLowerCase()) + '" data-tipo="' + t.g + '" style="--c:' + t.c + '">' +
        '<span class="icc-fi-archivo-ico">' + (falta ? "⚠️" : t.ico) + '<em>' + esc(extension(f.nombre_archivo).toUpperCase() || "—") + "</em></span>" +
        '<div class="icc-fi-archivo-txt">' +
        (falta
          ? "<strong>" + esc(f.nombre_archivo) + "</strong>"
          : '<a href="' + D.urlDescarga("ficheros", f.ruta_archivo) + '" target="_blank" rel="noopener"><strong>' + esc(f.nombre_archivo) + "</strong></a>") +
        "<small>" + (falta ? '<span class="icc-fi-falta">No encontrado en el servidor</span>' :
          esc([tamano(f.tamano), U.formatFecha(f.created_at) + " (" + haceDias(f.created_at) + ")", f.subido_por_nombre ? "por " + f.subido_por_nombre : ""].filter(Boolean).join(" · "))) +
        "</small></div>" +
        '<div class="icc-fi-archivo-acc">' +
        (falta ? "" :
          '<a class="icc-btn icc-btn-ghost icc-fi-btn" target="_blank" rel="noopener" href="' + D.urlDescarga("ficheros", f.ruta_archivo) + '">👁 Ver</a>' +
          '<a class="icc-btn icc-btn-secondary icc-fi-btn" href="' + D.urlDescarga("ficheros", f.ruta_archivo, true) + '">⬇ Descargar</a>') +
        (puedeBorrar
          ? '<button type="button" class="icc-fi-accion" title="Renombrar" aria-label="Renombrar ' + esc(f.nombre_archivo) + '" data-renombrar-fichero-id="' + f.id + '" data-nombre-actual="' + esc(f.nombre_archivo) + '">✏️</button>' +
            '<button type="button" class="icc-fi-accion icc-fi-borrar" title="' + (falta ? "Borrar registro" : "Borrar archivo") + '" aria-label="Borrar ' + esc(f.nombre_archivo) + '" data-borrar-fichero-id="' + f.id + '" data-huerfano="' + (falta ? "1" : "0") + '">🗑</button>'
          : "") +
        "</div></div>"
      );
    };

    var gruposPresentes = {};
    ficheros.forEach(function (f) { gruposPresentes[tipoDe(f).g] = (gruposPresentes[tipoDe(f).g] || 0) + 1; });
    var nombresGrupo = { pdf: "📕 PDF", doc: "📘 Word", hoja: "📗 Excel", presentacion: "📙 PowerPoint", imagen: "🖼️ Imágenes", zip: "🗜️ ZIP", otro: "📄 Otros" };

    main().innerHTML =
      '<div class="icc-fi" id="fi-raiz">' +
      '<header class="icc-ag-hero icc-fi-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">🗂️ Ficheros</span>' +
      "<h1>" + esc(actual ? actual.nombre : "Biblioteca de documentos") + "</h1>" +
      '<p class="icc-ag-hero-res">' + resumen + "</p></div>" +
      '<div class="icc-ag-hero-acc icc-fi-hero-acc">' +
      (carpetaId ? '<a class="icc-btn icc-btn-secondary" href="' + padreHref + '">← Atrás</a>' : "") +
      (!carpetaId && esAdmin
        ? '<a class="icc-btn icc-btn-ghost" href="#/diagnostico-storage">🔍 Archivos que faltan</a>' +
          '<a class="icc-btn icc-btn-ghost" href="#/copias-seguridad">🗄️ Copias de seguridad</a>'
        : "") +
      (puedeSubirAqui ? '<button type="button" class="icc-btn icc-btn-primary icc-ag-btn-nueva" id="btn-fi-subir">⬆ Subir archivos</button>' : "") +
      (!gestiona ? '<span class="icc-fi-lectura" title="Solo Administración puede subir, editar o borrar">👁 Solo consulta</span>' : "") +
      "</div></header>" +

      '<nav class="icc-fi-migas" aria-label="Ruta de carpetas">' + migas + "</nav>" +
      (actual && actual.es_personal
        ? '<div class="icc-aviso icc-fi-aviso">🔒 Carpeta personal de facturación: solo la ven ' + esc(actual.propietario_nombre || "su titular") + " y Administración.</div>"
        : "") +

      '<section class="icc-card icc-fi-barra">' +
      '<input class="icc-input" id="fi-buscar" type="search" placeholder="🔎 Buscar en esta carpeta" value="' + esc(params.get("q") || "") + '">' +
      (puedeCrearCarpeta
        ? '<form id="form-nueva-carpeta" class="icc-fi-nueva"><input class="icc-input" name="nombre" placeholder="Nombre de la nueva carpeta" maxlength="150" required>' +
          (!carpetaId && ordenDisponible
            ? '<select class="icc-select" name="seccion" title="Sección donde aparecerá"><option value="">Sección automática</option>' +
              secciones.map(function (x) { return '<option value="' + esc(x.clave) + '">' + esc(x.icono + " " + x.label) + "</option>"; }).join("") + "</select>"
            : "") +
          '<button class="icc-btn icc-btn-secondary" type="submit">📁 Crear carpeta</button></form>'
        : "") +
      (gestiona && carpetas.length > 1
        ? '<button type="button" class="icc-btn icc-btn-ghost icc-fi-btn-ordenar" id="fi-organizar" aria-pressed="false">↕ Ordenar carpetas</button>'
        : "") +
      '<div class="icc-tabs icc-fi-vistas"><button type="button" class="icc-tab' + (vista === "cuadricula" ? " is-active" : "") + '" data-fi-vista="cuadricula">▦ Cuadrícula</button>' +
      '<button type="button" class="icc-tab' + (vista === "lista" ? " is-active" : "") + '" data-fi-vista="lista">☰ Lista</button></div>' +
      "</section>" +

      '<div class="icc-aviso icc-fi-aviso icc-fi-ayuda-orden" hidden>↕ Usa ◀ ▶ en cada carpeta para colocarla; el orden se guarda al momento y lo ve todo el equipo. Para cambiarla de sección, pulsa ✏️.' +
      (ordenDisponible ? "" : ' <b>Antes importa sql/migracion_ficheros_orden.sql en la base de datos.</b>') + "</div>" +
      (!carpetas.length
        ? ""
        : carpetaId
        ? '<section class="icc-fi-seccion"><h2>Carpetas <span>' + carpetas.length + "</span></h2>" +
          '<div class="icc-fi-carpetas is-' + vista + '">' + carpetas.map(tarjetaCarpeta).join("") + "</div></section>"
        : secciones.map(function (sec, i) {
            var claves = secciones.map(function (x) { return x.clave; });
            var lista = carpetas.filter(function (c) {
              return c.seccion === sec.clave || (i === secciones.length - 1 && claves.indexOf(c.seccion) === -1);
            });
            if (!lista.length) return "";
            return '<section class="icc-fi-seccion icc-fi-grupo" data-seccion="' + esc(sec.clave) + '"><h2><span class="icc-fi-grupo-ico">' + esc(sec.icono) + "</span>" + esc(sec.label) + " <span>" + lista.length + "</span></h2>" +
              '<div class="icc-fi-carpetas is-' + vista + '">' + lista.map(tarjetaCarpeta).join("") + "</div></section>";
          }).join("")) +

      (!carpetaId
        ? (carpetas.length ? "" : '<p class="icc-empty">Todavía no hay carpetas. Crea la primera arriba.</p>')
        : '<section class="icc-fi-seccion"><h2>Archivos <span>' + ficheros.length + "</span>" +
          (Object.keys(gruposPresentes).length > 1
            ? '<div class="icc-fi-tipos">' + '<button type="button" class="icc-fi-tipo is-activo" data-fi-tipo="">Todos</button>' +
              Object.keys(nombresGrupo).filter(function (g) { return gruposPresentes[g]; }).map(function (g) {
                return '<button type="button" class="icc-fi-tipo" data-fi-tipo="' + g + '">' + nombresGrupo[g] + " <b>" + gruposPresentes[g] + "</b></button>";
              }).join("") + "</div>"
            : "") +
          "</h2>" +
          (puedeSubirAqui
            ? '<form id="form-subir-fichero" class="icc-fi-drop" tabindex="0">' +
              '<input type="file" name="archivo" id="fi-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg" hidden>' +
              '<span class="icc-fi-drop-ico">⬆</span><div><strong>Arrastra aquí los archivos</strong> o <button type="button" class="icc-link-btn" id="fi-elegir">elígelos de tu equipo</button>' +
              "<small>PDF, Word, Excel, PowerPoint, imágenes o ZIP · máximo 30 MB cada uno</small></div>" +
              '<div class="icc-fi-progreso" hidden><i></i><span></span></div></form>'
            : "") +
          (ficheros.length
            ? '<div class="icc-fi-archivos">' + ficheros.map(filaFichero).join("") + "</div>"
            : '<p class="icc-empty">Sin archivos en esta carpeta.</p>') +
          "</section>") +
      '<p class="icc-empty icc-fi-sin-resultados" hidden>Nada coincide con la búsqueda.</p></div>';

    // ---- Busqueda y filtro por tipo (en el navegador, al instante)
    var tipoActivo = "";
    var buscar = document.getElementById("fi-buscar");
    var aplicarFiltro = function () {
      var txt = buscar.value.trim().toLowerCase();
      var visibles = 0;
      main().querySelectorAll(".icc-fi-carpeta,.icc-fi-archivo").forEach(function (el) {
        var ok = (!txt || el.getAttribute("data-nombre").indexOf(txt) !== -1) &&
          (!tipoActivo || !el.classList.contains("icc-fi-archivo") || el.getAttribute("data-tipo") === tipoActivo) &&
          (!tipoActivo || !el.classList.contains("icc-fi-carpeta"));
        el.hidden = !ok;
        if (ok) visibles++;
      });
      var hay = main().querySelectorAll(".icc-fi-carpeta,.icc-fi-archivo").length;
      main().querySelector(".icc-fi-sin-resultados").hidden = !(hay && !visibles);
    };
    buscar.addEventListener("input", aplicarFiltro);
    main().querySelectorAll("[data-fi-tipo]").forEach(function (b) {
      b.addEventListener("click", function () {
        tipoActivo = b.getAttribute("data-fi-tipo");
        main().querySelectorAll("[data-fi-tipo]").forEach(function (x) { x.classList.toggle("is-activo", x === b); });
        aplicarFiltro();
      });
    });
    if (buscar.value) aplicarFiltro();

    main().querySelectorAll("[data-fi-vista]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-fi-vista");
        try { localStorage.setItem("icc_ficheros_vista", v); } catch (e) { /* sin almacenamiento */ }
        main().querySelectorAll("[data-fi-vista]").forEach(function (x) { x.classList.toggle("is-active", x === b); });
        main().querySelectorAll(".icc-fi-carpetas").forEach(function (g) { g.classList.toggle("is-lista", v === "lista"); g.classList.toggle("is-cuadricula", v !== "lista"); });
      });
    });

    // ---- Ordenar carpetas (solo Administracion)
    var raiz = document.getElementById("fi-raiz");
    var btnOrganizar = document.getElementById("fi-organizar");
    if (btnOrganizar) {
      btnOrganizar.addEventListener("click", function () {
        var activo = !raiz.classList.contains("is-organizando");
        raiz.classList.toggle("is-organizando", activo);
        btnOrganizar.setAttribute("aria-pressed", activo ? "true" : "false");
        btnOrganizar.textContent = activo ? "✓ Terminar de ordenar" : "↕ Ordenar carpetas";
        raiz.querySelector(".icc-fi-ayuda-orden").hidden = !activo;
      });
    }
    var guardandoOrden = Promise.resolve();
    main().querySelectorAll("[data-mover]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!ordenDisponible) {
          U.toast("Para ordenar, importa antes sql/migracion_ficheros_orden.sql en la base de datos", "error");
          return;
        }
        var tarjeta = btn.closest(".icc-fi-carpeta");
        var dir = Number(btn.getAttribute("data-mover"));
        var vecina = dir < 0 ? tarjeta.previousElementSibling : tarjeta.nextElementSibling;
        if (!vecina) {
          U.toast(dir < 0 ? "Ya es la primera de su sección" : "Ya es la última de su sección", "info");
          return;
        }
        if (dir < 0) tarjeta.parentNode.insertBefore(tarjeta, vecina);
        else tarjeta.parentNode.insertBefore(vecina, tarjeta);
        tarjeta.classList.remove("is-movida");
        void tarjeta.offsetWidth;
        tarjeta.classList.add("is-movida");
        btn.focus();
        var ids = Array.prototype.map.call(main().querySelectorAll(".icc-fi-carpeta[data-id]"), function (el) { return Number(el.getAttribute("data-id")); });
        // Las peticiones se encadenan para que siempre gane el ultimo orden.
        guardandoOrden = guardandoOrden.then(function () {
          return D.ordenarCarpetasFicheros(ids).catch(function (err) {
            U.toast(err.message || "No se pudo guardar el orden", "error");
          });
        });
      });
    });

    var secOpciones = function (elegida) {
      return '<option value="">Automática (según el nombre)</option>' +
        secciones.map(function (x) {
          return '<option value="' + esc(x.clave) + '"' + (elegida === x.clave ? " selected" : "") + ">" + esc(x.icono + " " + x.label) + "</option>";
        }).join("");
    };
    main().querySelectorAll("[data-editar-carpeta-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idC = Number(btn.getAttribute("data-editar-carpeta-id"));
        var c = carpetas.filter(function (x) { return Number(x.id) === idC; })[0];
        if (!c) return;
        var esSistema = c.nombre === CARPETA_SISTEMA && !c.parent_id;
        var conSeccion = !c.parent_id && ordenDisponible;
        U.openModal(
          "<h2>Editar carpeta</h2>" +
          '<form id="form-editar-carpeta" class="icc-form">' +
          '<div class="icc-field"><label>Nombre</label><input class="icc-input" name="nombre" maxlength="150" required value="' + esc(c.nombre) + '"' + (esSistema ? " disabled" : "") + ">" +
          (esSistema ? '<small class="icc-muted">El CRM usa esta carpeta para las carpetas personales de facturación; no se puede renombrar.</small>' : "") + "</div>" +
          (conSeccion
            ? '<div class="icc-field"><label>Sección</label><select class="icc-select" name="seccion">' + secOpciones(c.seccion_elegida || "") + "</select>" +
              '<small class="icc-muted">Ahora aparece en: ' + esc((secciones.filter(function (x) { return x.clave === c.seccion; })[0] || {}).label || "General") + "</small></div>"
            : !c.parent_id
            ? '<p class="icc-muted">Para elegir la sección a mano, importa antes sql/migracion_ficheros_orden.sql.</p>'
            : "") +
          '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
          '<button type="submit" class="icc-btn icc-btn-primary">Guardar</button></div></form>'
        );
        document.getElementById("form-editar-carpeta").addEventListener("submit", async function (e) {
          e.preventDefault();
          var cambios = {};
          if (!esSistema) {
            var nuevo = e.target.nombre.value.trim();
            if (!nuevo) return;
            if (nuevo !== c.nombre) cambios.nombre = nuevo;
          }
          if (conSeccion && e.target.seccion.value !== (c.seccion_elegida || "")) cambios.seccion = e.target.seccion.value;
          if (!Object.keys(cambios).length) { U.closeModal(); return; }
          try {
            await D.editarCarpetaFichero(idC, cambios);
            U.closeModal();
            U.toast("Carpeta actualizada", "success");
            viewFicheros(carpetaId);
          } catch (err) {
            U.toast(err.message || "No se pudo guardar", "error");
          }
        });
      });
    });

    main().querySelectorAll("[data-renombrar-fichero-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idF = btn.getAttribute("data-renombrar-fichero-id");
        var nombreActual = btn.getAttribute("data-nombre-actual");
        var ext = extension(nombreActual);
        var base = ext ? nombreActual.slice(0, -(ext.length + 1)) : nombreActual;
        U.openModal(
          "<h2>Renombrar archivo</h2>" +
          '<form id="form-renombrar-fichero" class="icc-form">' +
          '<div class="icc-field"><label>Nombre</label><div class="icc-fi-renombrar"><input class="icc-input" name="nombre" maxlength="240" required value="' + esc(base) + '">' +
          (ext ? "<span>." + esc(ext) + "</span>" : "") + "</div></div>" +
          '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
          '<button type="submit" class="icc-btn icc-btn-primary">Guardar</button></div></form>'
        );
        var f = document.getElementById("form-renombrar-fichero");
        f.nombre.select();
        f.addEventListener("submit", async function (e) {
          e.preventDefault();
          var nuevo = f.nombre.value.trim();
          if (!nuevo) return;
          try {
            await D.renombrarFichero(idF, ext ? nuevo + "." + ext : nuevo);
            U.closeModal();
            U.toast("Archivo renombrado", "success");
            viewFicheros(carpetaId);
          } catch (err) {
            U.toast(err.message || "No se pudo renombrar", "error");
          }
        });
      });
    });

    var formCarpeta = document.getElementById("form-nueva-carpeta");
    if (formCarpeta) {
      formCarpeta.addEventListener("submit", async function (e) {
        e.preventDefault();
        var nombre = e.target.nombre.value.trim();
        if (!nombre) return;
        try {
          await D.crearCarpetaFichero(nombre, carpetaId || null, e.target.seccion ? e.target.seccion.value : "");
          U.toast("Carpeta creada", "success");
          viewFicheros(carpetaId);
        } catch (err) {
          U.toast(err.message || "No se pudo crear la carpeta", "error");
        }
      });
    }

    main()
      .querySelectorAll("[data-borrar-carpeta-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (btn.getAttribute("data-llena") === "1") {
            U.toast("La carpeta tiene contenido: vacíala antes de borrarla", "error");
            return;
          }
          if (!confirm("¿Borrar esta carpeta vacía?")) return;
          try {
            await D.borrarCarpetaFichero(btn.getAttribute("data-borrar-carpeta-id"));
            U.toast("Carpeta borrada", "success");
            viewFicheros(carpetaId);
          } catch (err) {
            U.toast(err.message || "No se pudo borrar la carpeta", "error");
          }
        });
      });

    // ---- Subida: boton, selector y arrastrar y soltar
    var form = document.getElementById("form-subir-fichero");
    if (form) {
      var input = document.getElementById("fi-input");
      var progreso = form.querySelector(".icc-fi-progreso");
      var subiendo = false;
      var subir = async function (files) {
        files = Array.prototype.slice.call(files || []);
        if (!files.length || subiendo) return;
        subiendo = true;
        form.classList.add("is-subiendo");
        progreso.hidden = false;
        var subidos = 0;
        var errores = [];
        for (var i = 0; i < files.length; i++) {
          progreso.querySelector("span").textContent = "Subiendo " + (i + 1) + " de " + files.length + ": " + files[i].name;
          progreso.querySelector("i").style.width = Math.round((i / files.length) * 100) + "%";
          try {
            await D.subirFichero(carpetaId, files[i]);
            subidos++;
          } catch (err) {
            errores.push(files[i].name + ": " + (err.message || "error"));
          }
        }
        progreso.querySelector("i").style.width = "100%";
        if (subidos) U.toast(subidos + " archivo" + (subidos > 1 ? "s" : "") + " subido" + (subidos > 1 ? "s" : ""), "success");
        errores.forEach(function (m) { U.toast(m, "error"); });
        viewFicheros(carpetaId);
      };
      document.getElementById("fi-elegir").addEventListener("click", function () { input.click(); });
      var btnSubir = document.getElementById("btn-fi-subir");
      if (btnSubir) btnSubir.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", function () { subir(input.files); });
      form.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === form) { e.preventDefault(); input.click(); } });
      ["dragenter", "dragover"].forEach(function (ev) {
        form.addEventListener(ev, function (e) { e.preventDefault(); form.classList.add("is-encima"); });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        form.addEventListener(ev, function (e) { e.preventDefault(); form.classList.remove("is-encima"); });
      });
      form.addEventListener("drop", function (e) { subir(e.dataTransfer && e.dataTransfer.files); });
      form.addEventListener("submit", function (e) { e.preventDefault(); });
    }

    main()
      .querySelectorAll("[data-borrar-fichero-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var esHuerfano = btn.getAttribute("data-huerfano") === "1";
          // Un archivo ya "no encontrado en el servidor" no tiene nada fisico
          // que perder: se borra el registro directo, sin dialogo de confirmacion.
          if (!esHuerfano && !confirm("¿Borrar este archivo? No se puede deshacer.")) return;
          btn.disabled = true;
          try {
            await D.borrarFichero(btn.getAttribute("data-borrar-fichero-id"));
            U.toast("Archivo borrado", "success");
            viewFicheros(carpetaId);
          } catch (err) {
            U.toast(err.message || "No se pudo borrar el archivo", "error");
            btn.disabled = false;
          }
        });
      });
  }

  // ------------------------------------------------- Diagnostico de storage
  async function viewDiagnosticoStorage() {
    main().innerHTML = '<div class="icc-loading">Comprobando archivos…</div>';
    var resultado;
    try {
      resultado = await D.diagnosticoStorage();
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + U.escapeHtml(err.message || "No se pudo comprobar el almacenamiento") + "</p>";
      return;
    }

    var totalFaltan = resultado.reduce(function (acc, t) { return acc + t.faltan.length; }, 0);

    main().innerHTML =
      '<div class="icc-page-head"><h1>Diagnóstico de almacenamiento</h1>' +
      '<a class="icc-btn icc-btn-secondary" href="#/ficheros">← Volver a Ficheros</a></div>' +
      '<div class="icc-card">' +
      (totalFaltan === 0
        ? '<p class="icc-empty">✅ Todos los archivos registrados en la base de datos están presentes en el servidor.</p>'
        : '<p style="color:var(--red)">⚠️ Hay ' + totalFaltan + ' archivo(s) registrados en la base de datos que ya no están físicamente en el servidor (probablemente por un borrado o una extracción de ZIP que sobrescribió "storage/"). Esto no se puede arreglar desde el propio CRM: hay que volver a subir esos documentos, o pedir a Hostalia que restaure una copia de seguridad de esas fechas si la tienen.</p>' +
          '<button class="icc-btn icc-btn-secondary" id="btn-limpiar-storage" style="margin-top:8px">🗑️ Borrar registros de archivos que ya no existen</button>' +
          '<p class="icc-muted" style="margin-top:6px">En Ficheros/Documentos/Firmas borra el registro entero (el archivo era todo su contenido). En Proformas solo desvincula el archivo perdido — la factura en sí no se borra, para no perder esos datos.</p>') +
      resultado
        .map(function (t) {
          return (
            "<h3 style=\"margin-top:18px\">" + U.escapeHtml(t.tabla) + " — " + t.total + " archivo(s) registrados, " +
            t.faltan.length + " no encontrado(s)</h3>" +
            (t.faltan.length
              ? '<ul class="icc-doc-list">' +
                t.faltan
                  .map(function (f) {
                    return (
                      "<li><span>#" + f.id + " — " + U.escapeHtml(f.nombre_archivo || "(sin nombre)") + "</span>" +
                      '<span class="icc-muted">' + U.escapeHtml(f.ruta_archivo) + "</span></li>"
                    );
                  })
                  .join("") +
                "</ul>"
              : "")
          );
        })
        .join("") +
      "</div>";

    var btnLimpiar = document.getElementById("btn-limpiar-storage");
    if (btnLimpiar) {
      btnLimpiar.addEventListener("click", async function () {
        if (!confirm("¿Borrar los " + totalFaltan + " registro(s) de archivos que ya no existen en el servidor? No se puede deshacer.")) return;
        btnLimpiar.disabled = true;
        try {
          var limpiados = await D.limpiarStorage();
          var total = limpiados.reduce(function (acc, t) { return acc + t.limpiados; }, 0);
          U.toast(total + " registro(s) limpiados", "success");
          viewDiagnosticoStorage();
        } catch (err) {
          U.toast(err.message || "No se pudo limpiar", "error");
          btnLimpiar.disabled = false;
        }
      });
    }
  }

  // ------------------------------------------------------ Copias de seguridad
  async function viewCopiasSeguridad() {
    main().innerHTML = '<div class="icc-loading">Cargando copias de seguridad…</div>';
    var backups;
    try {
      backups = await D.listarCopiasSeguridad();
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + U.escapeHtml(err.message || "No se pudo cargar") + "</p>";
      return;
    }

    main().innerHTML =
      '<div class="icc-page-head"><h1>Copias de seguridad</h1>' +
      '<a class="icc-btn icc-btn-secondary" href="#/ficheros">← Volver a Ficheros</a></div>' +
      '<div class="icc-card">' +
      '<p class="icc-muted">Cada copia es un ZIP con todo lo que hay en storage/ (facturas, estudios, firmas, ficheros, proformas…) en ese momento. Se conservan las últimas ' +
      '14. Descarga alguna de vez en cuando a tu propio ordenador para tener también una copia fuera del hosting.</p>' +
      '<button class="icc-btn icc-btn-primary" id="btn-crear-copia" style="margin-top:10px">+ Crear copia ahora</button>' +
      (backups.length
        ? '<ul class="icc-doc-list" style="margin-top:14px">' +
          backups
            .map(function (b) {
              return (
                "<li><span>🗄️ " + U.escapeHtml(b.nombre) + "</span><span class=\"icc-muted\">" +
                b.fecha + " · " + Math.round(b.tamano / 1024) + " KB</span>" +
                '<a class="icc-link-btn" href="' + D.urlDescargaCopia(b.nombre) + '">Descargar</a></li>'
              );
            })
            .join("") +
          "</ul>"
        : '<p class="icc-empty" style="margin-top:14px">Todavía no hay ninguna copia creada.</p>') +
      "</div>";

    var btnCrear = document.getElementById("btn-crear-copia");
    if (btnCrear) {
      btnCrear.addEventListener("click", async function () {
        btnCrear.disabled = true;
        btnCrear.textContent = "Creando copia…";
        try {
          await D.crearCopiaSeguridad();
          U.toast("Copia de seguridad creada", "success");
          viewCopiasSeguridad();
        } catch (err) {
          U.toast(err.message || "No se pudo crear la copia", "error");
          btnCrear.disabled = false;
          btnCrear.textContent = "+ Crear copia ahora";
        }
      });
    }
  }

  // --------------------------------------------------------------- Proformas
  async function viewProformas() {
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var esc = U.escapeHtml;
    // Compatibilidad con enlaces antiguos (?numero=, ?email=).
    var q = (params.get("q") || params.get("numero") || params.get("email") || "").trim();
    var estado = params.get("estado_pago") || params.get("estado") || "";
    if (estado !== "pagada" && estado !== "pendiente") estado = "";
    var empresa = params.get("facturado_por") || "";
    if (!C.FACTURADO_POR[empresa]) empresa = "";
    var antiguas = params.get("antiguas") === "1";
    var desde = params.get("desde") || "";
    var hasta = params.get("hasta") || "";

    main().innerHTML = '<div class="icc-loading">Cargando proformas…</div>';
    // Las fechas se filtran en el servidor; estado, empresa y texto en el navegador
    // para poder enseñar los contadores de cada filtro.
    var filtrosServidor = {};
    if (desde) filtrosServidor.desde = desde;
    if (hasta) filtrosServidor.hasta = hasta;
    var todas = await D.listarProformas(filtrosServidor);
    // Marcar pagada / pendiente usa el mismo permiso que crear (api/proformas.php).
    var puedeCrear = window.icc.auth.puede("proformas.crear");
    var puedeBorrar = window.icc.auth.puede("proformas.borrar");

    var hoy = hoyIso();
    var mes = hoy.slice(0, 7);
    var dias = function (f) { return Math.floor((new Date(hoy + "T12:00:00") - new Date(String(f).slice(0, 10) + "T12:00:00")) / 86400000); };
    var esAntigua = function (p) { return p.estado_pago === "pendiente" && dias(p.fecha) > 30; };
    var suma = function (l) { return l.reduce(function (s, p) { return s + Number(p.importe || 0); }, 0); };
    var plural = function (n, s, pl) { return n + " " + (n === 1 ? s : pl); };

    var lista = todas.filter(function (p) {
      if (empresa && p.facturado_por !== empresa) return false;
      if (estado && p.estado_pago !== estado) return false;
      if (antiguas && !esAntigua(p)) return false;
      return true;
    });

    var pagadas = todas.filter(function (p) { return p.estado_pago === "pagada"; });
    var pendientes = todas.filter(function (p) { return p.estado_pago === "pendiente"; });
    var viejas = todas.filter(esAntigua);
    var delMes = todas.filter(function (p) { return String(p.fecha).slice(0, 7) === mes; });

    // Colores de comercial (mismo criterio que el resto del CRM).
    var paleta = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#FB923C", "#4ADE80", "#E879F9", "#2DD4BF", "#F87171", "#93C5FD", "#FDE047", "#C084FC"];
    var colorCom = {};
    Array.from(new Set(todas.map(function (p) { return Number(p.comercial_id); }).filter(Boolean)))
      .sort(function (a, b) { return a - b; })
      .forEach(function (id, i) { colorCom[id] = paleta[i % paleta.length]; });
    var colorEmpresa = { ICC: "#E8C15A", ELITE_ENERGY: "#22D3EE", EVOLVIX_GLOBAL: "#A78BFA" };

    var linkQs = function (cambios) {
      var x = Object.assign({ estado_pago: estado, facturado_por: empresa, antiguas: antiguas ? "1" : "", desde: desde, hasta: hasta, q: q }, cambios || {});
      var p = new URLSearchParams();
      Object.keys(x).forEach(function (k) { if (x[k]) p.set(k, x[k]); });
      return "#/proformas" + (p.toString() ? "?" + p.toString() : "");
    };
    var inicioMes = mes + "-01";
    var d = new Date(hoy + "T12:00:00");
    var periodos = [
      { label: "Todo", desde: "", hasta: "" },
      { label: "Este mes", desde: inicioMes, hasta: "" },
      { label: "Mes pasado", desde: isoDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)), hasta: isoDate(new Date(d.getFullYear(), d.getMonth(), 0)) },
      { label: "Este año", desde: hoy.slice(0, 4) + "-01-01", hasta: "" },
    ];
    var periodoActivo = periodos.filter(function (x) { return x.desde === desde && x.hasta === hasta; })[0];

    var kpi = function (href, icono, label, valor, detalle, color, activo) {
      return '<a class="icc-pf-kpi' + (activo ? " is-activo" : "") + '" href="' + href + '" style="--c:' + color + '">' +
        '<span class="icc-pf-kpi-ico" aria-hidden="true">' + icono + "</span>" +
        "<b>" + valor + "</b><span>" + label + "</span><small>" + detalle + "</small></a>";
    };

    var avatar = function (p) {
      var n = p.comercial_nombre || "Sin comercial";
      var ini = n.split(/\s+/).filter(Boolean).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join("") || "?";
      return '<span class="icc-ag-ava" style="--c:' + (p.comercial_id ? colorCom[Number(p.comercial_id)] || "#64748B" : "#64748B") + ';--t:26px" title="' + esc(n) + '">' + esc(ini) + "</span>";
    };

    var fila = function (p) {
      var pagada = p.estado_pago === "pagada";
      var vieja = esAntigua(p);
      var color = pagada ? "#34D399" : vieja ? "#F87171" : "#FBBF24";
      var buscar = [p.numero, p.cliente_email, p.comercial_nombre, C.FACTURADO_POR[p.facturado_por], p.notas].join(" ").toLowerCase();
      return (
        '<article class="icc-pf-fila' + (vieja ? " is-vieja" : "") + '" style="--e:' + color + '" data-buscar="' + esc(buscar) + '">' +
        '<div class="icc-pf-doc"><span class="icc-pf-doc-ico" aria-hidden="true">' + (pagada ? "✅" : vieja ? "⏰" : "🧾") + "</span>" +
        "<div><strong>Nº " + esc(p.numero) + "</strong>" +
        '<a class="icc-pf-empresa" style="--c:' + (colorEmpresa[p.facturado_por] || "#94A3B8") + '" href="' + linkQs({ facturado_por: p.facturado_por }) + '" title="Ver solo las de esta empresa">' +
        esc(C.FACTURADO_POR[p.facturado_por] || p.facturado_por) + "</a>" +
        (p.notas ? '<small class="icc-pf-notas">' + esc(p.notas) + "</small>" : "") + "</div></div>" +
        '<div class="icc-pf-cliente">' +
        (p.cliente_email ? '<a href="mailto:' + esc(p.cliente_email) + '" title="Escribir al cliente">✉️ ' + esc(p.cliente_email) + "</a>" : '<span class="icc-muted">Sin email de cliente</span>') +
        '<span class="icc-pf-com">' + avatar(p) + "<span>" + esc(p.comercial_nombre || "Sin comercial") + "</span></span></div>" +
        '<div class="icc-pf-fecha"><b>' + esc(U.formatFecha(p.fecha)) + "</b><small>" + (dias(p.fecha) <= 0 ? "hoy" : "hace " + dias(p.fecha) + " d") + "</small></div>" +
        '<div class="icc-pf-importe"><b>' + U.formatEur(p.importe) + '</b><span class="icc-pf-estado" style="--c:' + color + '">' +
        (pagada ? "Pagada" : vieja ? "Pendiente · +30 d" : "Pendiente") + "</span></div>" +
        '<div class="icc-pf-acc">' +
        (p.ruta_archivo ? '<a class="icc-btn icc-btn-ghost icc-pf-btn" target="_blank" rel="noopener" href="' + D.urlDescarga("proformas", p.ruta_archivo) + '">📄 Ver</a>' : "") +
        (!pagada && puedeCrear ? '<button type="button" class="icc-btn icc-btn-secondary icc-pf-btn" data-pagar-id="' + p.id + '">✓ Marcar pagada</button>' : "") +
        (pagada && puedeCrear ? '<button type="button" class="icc-pf-icono" data-pendiente-id="' + p.id + '" title="Volver a pendiente" aria-label="Volver a pendiente la proforma ' + esc(p.numero) + '">↩</button>' : "") +
        (puedeBorrar ? '<button type="button" class="icc-pf-icono is-borrar" data-borrar-proforma-id="' + p.id + '" title="Borrar" aria-label="Borrar la proforma ' + esc(p.numero) + '">🗑</button>' : "") +
        "</div></article>"
      );
    };

    main().innerHTML =
      '<header class="icc-ag-hero icc-pf-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">🧾 Proformas y facturas</span>' +
      "<h1>" + U.formatEur(suma(todas)) + " facturados</h1>" +
      '<p class="icc-ag-hero-res"><b class="ok">' + U.formatEur(suma(pagadas)) + "</b> cobrados · <b" + (pendientes.length ? ' class="mal"' : "") + ">" + U.formatEur(suma(pendientes)) + "</b> pendientes · " +
      "<b>" + todas.length + "</b> " + (todas.length === 1 ? "proforma" : "proformas") +
      (periodoActivo && periodoActivo.label !== "Todo" ? " · " + esc(periodoActivo.label.toLowerCase()) : desde || hasta ? " · periodo elegido" : "") + "</p></div>" +
      '<div class="icc-ag-hero-acc icc-pf-hero-acc">' +
      '<button type="button" class="icc-btn icc-btn-ghost" id="btn-exportar-proformas">⬇ Exportar CSV</button>' +
      '<button class="icc-btn icc-btn-primary icc-ag-btn-nueva" id="btn-nueva-proforma">+ Nueva proforma</button>' +
      "</div></header>" +

      '<section class="icc-pf-kpis">' +
      kpi(linkQs({ desde: inicioMes, hasta: "", estado_pago: "", antiguas: "" }), "📅", "Facturado este mes", U.formatEur(suma(delMes)), plural(delMes.length, "proforma", "proformas"), "#60A5FA", desde === inicioMes && !hasta && !estado && !antiguas) +
      kpi(linkQs({ estado_pago: "pagada", antiguas: "" }), "✅", "Cobrado", U.formatEur(suma(pagadas)), plural(pagadas.length, "proforma", "proformas"), "#34D399", estado === "pagada") +
      kpi(linkQs({ estado_pago: "pendiente", antiguas: "" }), "⏳", "Pendiente de cobro", U.formatEur(suma(pendientes)), plural(pendientes.length, "proforma", "proformas"), "#FBBF24", estado === "pendiente" && !antiguas) +
      kpi(linkQs({ estado_pago: "pendiente", antiguas: "1" }), "⏰", "Pendientes +30 días", U.formatEur(suma(viejas)), plural(viejas.length, "proforma", "proformas"), "#F87171", antiguas) +
      "</section>" +

      (viejas.length && !antiguas
        ? '<div class="icc-aviso icc-pf-aviso">⏰ <b>' + plural(viejas.length, "proforma lleva", "proformas llevan") + "</b> más de 30 días sin cobrar (" + U.formatEur(suma(viejas)) + "). " +
          '<a href="' + linkQs({ estado_pago: "pendiente", antiguas: "1" }) + '">Ver cuáles</a></div>'
        : "") +

      '<nav class="icc-pf-chips" aria-label="Filtrar por empresa que factura">' +
      '<a class="icc-pf-chip' + (!empresa ? " is-activo" : "") + '" style="--c:#E2E8F0" href="' + linkQs({ facturado_por: "" }) + '"><span>Todas las empresas</span><b>' + todas.length + "</b><small>" + U.formatEur(suma(todas)) + "</small></a>" +
      Object.keys(C.FACTURADO_POR).map(function (k) {
        var deEmpresa = todas.filter(function (p) { return p.facturado_por === k; });
        return '<a class="icc-pf-chip' + (empresa === k ? " is-activo" : "") + '" style="--c:' + (colorEmpresa[k] || "#94A3B8") + '" href="' + linkQs({ facturado_por: empresa === k ? "" : k }) + '">' +
          "<span>" + esc(C.FACTURADO_POR[k]) + "</span><b>" + deEmpresa.length + "</b><small>" + U.formatEur(suma(deEmpresa)) + "</small></a>";
      }).join("") +
      "</nav>" +

      '<section class="icc-card icc-pf-barra">' +
      '<div class="icc-pf-fila-barra">' +
      '<input class="icc-input" id="pf-buscar" type="search" placeholder="🔎 Buscar por número, email del cliente o comercial" value="' + esc(q) + '">' +
      '<div class="icc-tabs icc-pf-estados">' +
      [["", "Todas"], ["pendiente", "⏳ Pendientes"], ["pagada", "✅ Pagadas"]].map(function (x) {
        return '<a class="icc-tab' + (estado === x[0] && !antiguas ? " is-active" : "") + '" href="' + linkQs({ estado_pago: x[0], antiguas: "" }) + '">' + x[1] + "</a>";
      }).join("") + "</div></div>" +
      '<div class="icc-pf-periodo"><div class="icc-pf-periodos" role="group" aria-label="Periodo">' +
      periodos.map(function (x) {
        return '<a class="icc-pf-per' + (periodoActivo === x ? " is-activo" : "") + '" href="' + linkQs({ desde: x.desde, hasta: x.hasta }) + '">' + x.label + "</a>";
      }).join("") + "</div>" +
      '<form id="form-filtros-proforma" class="icc-pf-fechas">' +
      '<label><span>Desde</span><input class="icc-input" type="date" name="desde" value="' + esc(desde) + '"></label>' +
      '<label><span>Hasta</span><input class="icc-input" type="date" name="hasta" value="' + esc(hasta) + '"></label>' +
      '<button class="icc-btn icc-btn-secondary" type="submit">Aplicar</button></form></div>' +
      "</section>" +

      (lista.length
        ? '<section class="icc-pf-lista">' + lista.map(fila).join("") + "</section>" + '<p class="icc-pf-total" id="pf-total"></p>'
        : '<p class="icc-empty">' + (todas.length ? "No hay proformas con estos filtros." : "Todavía no hay proformas. Crea la primera con «+ Nueva proforma».") + "</p>") +
      '<p class="icc-empty icc-pf-sin-resultados" hidden>Ninguna proforma coincide con la búsqueda.</p>';

    // ---- Busqueda al instante + total de lo que se ve
    var buscar = document.getElementById("pf-buscar");
    var visibles = lista.slice();
    var porId = {};
    lista.forEach(function (p) { porId[p.id] = p; });
    var aplicarBusqueda = function () {
      var txt = buscar.value.trim().toLowerCase();
      visibles = [];
      main().querySelectorAll(".icc-pf-fila").forEach(function (el, i) {
        var ok = !txt || el.getAttribute("data-buscar").indexOf(txt) !== -1;
        el.hidden = !ok;
        if (ok) visibles.push(lista[i]);
      });
      var total = document.getElementById("pf-total");
      if (total) total.innerHTML = plural(visibles.length, "proforma", "proformas") + " · <b>" + U.formatEur(suma(visibles)) + "</b>";
      main().querySelector(".icc-pf-sin-resultados").hidden = !(lista.length && !visibles.length);
    };
    buscar.addEventListener("input", aplicarBusqueda);
    aplicarBusqueda();

    document.getElementById("form-filtros-proforma").addEventListener("submit", function (e) {
      e.preventDefault();
      location.hash = linkQs({ desde: e.target.desde.value, hasta: e.target.hasta.value, q: buscar.value.trim() });
    });
    document.getElementById("btn-nueva-proforma").addEventListener("click", modalProforma);

    document.getElementById("btn-exportar-proformas").addEventListener("click", function () {
      if (!visibles.length) { U.toast("No hay proformas que exportar", "error"); return; }
      var celda = function (v) { v = v == null ? "" : String(v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var filas = [["Número", "Facturado por", "Cliente (email)", "Comercial", "Importe (€)", "Estado", "Fecha", "Notas"]];
      visibles.forEach(function (p) {
        filas.push([p.numero, C.FACTURADO_POR[p.facturado_por] || p.facturado_por, p.cliente_email, p.comercial_nombre || "",
          Number(p.importe || 0).toFixed(2).replace(".", ","), C.ESTADO_PAGO[p.estado_pago] || p.estado_pago, String(p.fecha).slice(0, 10), p.notas || ""]);
      });
      var csv = "﻿" + filas.map(function (r) { return r.map(celda).join(";"); }).join("\r\n");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = "proformas-" + hoy + ".csv";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      U.toast(plural(visibles.length, "proforma exportada", "proformas exportadas"), "success");
    });

    var cambiarEstado = function (atributo, nuevo, mensaje) {
      main().querySelectorAll("[" + atributo + "]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          btn.disabled = true;
          try {
            await D.actualizarProforma(btn.getAttribute(atributo), { estado_pago: nuevo });
            U.toast(mensaje, "success");
            viewProformas();
          } catch (err) {
            U.toast(err.message || "No se pudo actualizar", "error");
            btn.disabled = false;
          }
        });
      });
    };
    cambiarEstado("data-pagar-id", "pagada", "Marcada como pagada");
    cambiarEstado("data-pendiente-id", "pendiente", "Vuelve a estar pendiente");

    main()
      .querySelectorAll("[data-borrar-proforma-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var p = porId[btn.getAttribute("data-borrar-proforma-id")];
          if (!confirm("¿Borrar la proforma" + (p ? " Nº " + p.numero : "") + "? No se puede deshacer.")) return;
          try {
            await D.borrarProforma(btn.getAttribute("data-borrar-proforma-id"));
            U.toast("Proforma borrada", "success");
            viewProformas();
          } catch (err) {
            U.toast(err.message || "No se pudo borrar la proforma", "error");
          }
        });
      });
  }

  function modalProforma() {
    U.openModal(
      "<h2>🧾 Nueva proforma</h2>" +
      '<form id="form-proforma" class="icc-form">' +
      '<div class="icc-pf-modal-grid">' +
      campoTexto("numero", "Número", true) +
      campoTexto("fecha", "Fecha", true, "date", hoyIso()) +
      "</div>" +
      '<div class="icc-field"><label>Facturado por *</label><div class="icc-pf-elige">' +
      Object.keys(C.FACTURADO_POR).map(function (k, i) {
        return '<label class="icc-pf-opcion"><input type="radio" name="facturado_por" value="' + k + '"' + (i === 0 ? " checked" : "") + " required><span>" + U.escapeHtml(C.FACTURADO_POR[k]) + "</span></label>";
      }).join("") + "</div></div>" +
      '<div class="icc-pf-modal-grid">' +
      campoTexto("cliente_email", "Email del cliente", false, "email") +
      '<div class="icc-field"><label>Importe (€)</label><input class="icc-input" name="importe" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0,00"></div>' +
      "</div>" +
      '<div class="icc-field"><label>Notas (opcional)</label><input class="icc-input" name="notas" maxlength="500" placeholder="Concepto, periodo, observaciones…"></div>' +
      '<div class="icc-field"><label>Adjuntar documento (opcional)</label><input class="icc-input" type="file" name="archivo" accept="application/pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg">' +
      '<span class="icc-ayuda">PDF, Word, Excel o imagen · máximo 15 MB</span></div>' +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Crear proforma</button>' +
      "</div></form>"
    );

    document.getElementById("form-proforma").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await D.crearProforma(fd);
        U.closeModal();
        U.toast("Proforma creada", "success");
        viewProformas();
      } catch (err) {
        U.toast(err.message || "No se pudo crear la proforma", "error");
        btn.disabled = false;
      }
    });
  }

  // ------------------------------------------------------------ Presupuestos
  async function viewPresupuestos() {
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var filtros = {};
    ["estado", "sector", "tipo_cliente"].forEach(function (k) {
      if (params.get(k)) filtros[k] = params.get(k);
    });
    var q = (params.get("q") || "").trim();
    var comercialFiltro = params.get("comercial_id") || "";
    var vista = params.get("vista") === "tablero" ? "tablero" : "lista";
    var esc = U.escapeHtml;

    main().innerHTML = '<div class="icc-loading">Cargando presupuestos…</div>';
    var esAdmin = window.icc.auth.esAdminOSuperior();
    var gestor = window.icc.auth.esBackofficeOAdmin();
    // Los contadores de fase se calculan sin el filtro de estado (para poder saltar entre fases).
    var filtrosSinEstado = Object.assign({}, filtros);
    delete filtrosSinEstado.estado;
    var [todos, clientes, agentes] = await Promise.all([
      D.listarPresupuestos(filtrosSinEstado),
      D.listarClientes(),
      gestor ? D.listarAgentes({}).catch(function () { return []; }) : Promise.resolve([]),
    ]);

    // Filtros que se aplican en el navegador: texto y comercial.
    var base = todos.filter(function (p) {
      if (comercialFiltro && String(p.comercial_id) !== comercialFiltro) return false;
      if (q && [p.razon_social, p.cif, p.cups, p.comercializadora_actual, p.comercial_nombre].join(" ").toLowerCase().indexOf(q.toLowerCase()) === -1) return false;
      return true;
    });
    var presupuestos = filtros.estado ? base.filter(function (p) { return p.estado === filtros.estado; }) : base;

    var hoy = hoyIso();
    var dias = function (fecha) { return Math.floor((new Date(hoy + "T12:00:00") - new Date(String(fecha).slice(0, 10) + "T12:00:00")) / 86400000); };
    var diasHasta = function (fecha) { return -dias(fecha); };
    // Parado: sin avanzar desde hace mas de 7 dias y sin cerrar.
    var parado = function (p) { return p.estado !== "cerrado" && dias(p.updated_at || p.created_at) > 7; };
    // Permanencia que vence en los proximos 60 dias (momento de volver a llamar).
    var renovar = function (p) { return p.fecha_permanencia && diasHasta(p.fecha_permanencia) >= 0 && diasHasta(p.fecha_permanencia) <= 60; };

    var cuenta = {};
    C.ESTADOS_PRESUPUESTO_ORDEN.forEach(function (e) { cuenta[e] = 0; });
    base.forEach(function (p) { cuenta[p.estado] = (cuenta[p.estado] || 0) + 1; });
    var abiertos = base.filter(function (p) { return p.estado !== "cerrado"; });
    var mes = hoy.slice(0, 7);
    var cerradosMes = base.filter(function (p) { return p.estado === "cerrado" && String(p.updated_at || "").slice(0, 7) === mes; }).length;
    var conversion = base.length ? Math.round((cuenta.cerrado / base.length) * 100) : 0;
    var nParados = abiertos.filter(parado).length;
    var nRenovar = base.filter(renovar).length;

    var iconoSector = { energia: "⚡", telecomunicaciones: "📶", alarmas: "🚨", seguros: "🛡️", financiero: "💳" };
    var colorSector = { energia: "#60a5fa", telecomunicaciones: "#34d399", alarmas: "#f87171", seguros: "#a78bfa", financiero: "#fbbf24" };
    var paleta = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#FB923C", "#4ADE80", "#E879F9", "#2DD4BF", "#F87171", "#93C5FD", "#FDE047", "#C084FC"];
    var ids = {};
    agentes.forEach(function (a) { ids[a.id] = 1; });
    base.forEach(function (p) { if (p.comercial_id) ids[p.comercial_id] = 1; });
    var colorCom = {};
    Object.keys(ids).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id, i) { colorCom[id] = paleta[i % paleta.length]; });
    var avatarP = function (p, t) {
      var n = p.comercial_nombre || "Sin asignar";
      var ini = n.split(/\s+/).filter(Boolean).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join("");
      return '<span class="icc-ag-ava" style="--c:' + (p.comercial_id ? colorCom[p.comercial_id] || "#64748B" : "#64748B") + ";--t:" + (t || 26) + 'px" title="' + esc(n) + '">' + esc(ini || "?") + "</span>";
    };
    var linkQs = function (cambios) {
      var x = Object.assign({ estado: filtros.estado || "", sector: filtros.sector || "", tipo_cliente: filtros.tipo_cliente || "", q: q, comercial_id: comercialFiltro, vista: vista === "tablero" ? "tablero" : "" }, cambios || {});
      var p = new URLSearchParams();
      Object.keys(x).forEach(function (k) { if (x[k]) p.set(k, x[k]); });
      return "#/presupuestos" + (p.toString() ? "?" + p.toString() : "");
    };
    var pasos = function (p) {
      var idx = C.ESTADOS_PRESUPUESTO_ORDEN.indexOf(p.estado);
      return '<span class="icc-pr-pasos" title="' + esc((C.ESTADOS_PRESUPUESTO[p.estado] || {}).label || p.estado) + '">' +
        C.ESTADOS_PRESUPUESTO_ORDEN.map(function (e, i) {
          return '<i class="' + (i < idx ? "is-hecho" : i === idx ? "is-actual" : "") + '" style="--c:' + C.ESTADOS_PRESUPUESTO[e].color + '"></i>';
        }).join("") + "</span>";
    };
    var urlComparador = function (p) {
      var tipo = p.sector === "energia" ? "energia" : p.sector === "telecomunicaciones" ? "telefonia" : null;
      return tipo && window.icc.comparador && window.icc.auth.puede("comparador.usar") ? window.icc.comparador.urlHerramienta(tipo, { cliente: p.cliente_id }) : null;
    };
    var alertas = function (p) {
      return (renovar(p) ? '<span class="icc-pr-alerta is-renovar" title="Fin de permanencia: ' + esc(U.formatFecha(p.fecha_permanencia)) + '">🔔 Permanencia en ' + diasHasta(p.fecha_permanencia) + " d</span>" : "") +
        (parado(p) ? '<span class="icc-pr-alerta is-parado" title="Sin avanzar desde ' + esc(U.formatFecha(p.updated_at || p.created_at)) + '">🧊 ' + dias(p.updated_at || p.created_at) + " d parado</span>" : "");
    };

    var filaLista = function (p) {
      var meta = C.ESTADOS_PRESUPUESTO[p.estado] || { label: p.estado, color: "#94a3b8" };
      var cmp = urlComparador(p);
      var actual = [p.comercializadora_actual, p.tarifa_actual].filter(Boolean).join(" · ");
      return (
        '<article class="icc-pr-fila' + (parado(p) ? " is-parado" : "") + '" style="--e:' + meta.color + ";--s:" + (colorSector[p.sector] || "#94a3b8") + '">' +
        '<div class="icc-pr-cliente"><span class="icc-pr-sector" title="' + esc(C.SECTORES[p.sector] || p.sector) + '">' + (iconoSector[p.sector] || "📄") + "</span>" +
        '<div><a href="#/presupuestos/' + p.id + '"><strong>' + esc(p.razon_social) + "</strong></a>" +
        "<small>" + esc([p.cif, C.TIPO_CLIENTE[p.tipo_cliente] || p.tipo_cliente, actual || (p.cups ? "CUPS " + p.cups : "")].filter(Boolean).join(" · ")) + "</small>" +
        '<div class="icc-pr-alertas">' + alertas(p) + "</div></div></div>" +
        '<div class="icc-pr-estado"><span class="icc-badge" style="--badge-color:' + meta.color + '">' + esc(meta.label) + "</span>" + pasos(p) + "</div>" +
        '<div class="icc-pr-comercial">' +
        (esAdmin
          ? avatarP(p, 26) + '<select class="icc-select" data-asignar-comercial="' + p.id + '"><option value="">Sin asignar</option>' +
            agentes.map(function (a) { return '<option value="' + a.id + '"' + (String(p.comercial_id) === String(a.id) ? " selected" : "") + ">" + esc(a.nombre + " " + (a.apellidos || "")) + "</option>"; }).join("") +
            "</select>"
          : avatarP(p, 26) + "<span>" + esc(p.comercial_nombre || "Sin asignar") + "</span>") +
        "</div>" +
        '<div class="icc-pr-fecha"><b>' + esc(U.formatFecha(p.created_at)) + "</b><small>hace " + dias(p.created_at) + " d</small></div>" +
        '<div class="icc-pr-acciones">' +
        (cmp ? '<a class="icc-btn icc-btn-ghost icc-pr-btn" href="' + cmp + '" title="Abrir el comparador con este cliente">' + (p.sector === "energia" ? "⚡" : "📶") + " Comparar</a>" : "") +
        '<a class="icc-btn icc-btn-secondary icc-pr-btn" href="#/presupuestos/' + p.id + '">Abrir →</a></div>' +
        "</article>"
      );
    };

    var tarjetaTablero = function (p) {
      var actual = [p.comercializadora_actual, p.tarifa_actual].filter(Boolean).join(" · ");
      return (
        '<a class="icc-pr-card' + (parado(p) ? " is-parado" : "") + '" href="#/presupuestos/' + p.id + '" style="--c:' + (p.comercial_id ? colorCom[p.comercial_id] || "#64748B" : "#64748B") + ";--s:" + (colorSector[p.sector] || "#94a3b8") + '">' +
        "<header><strong>" + esc(p.razon_social) + '</strong><span class="icc-pr-card-sector">' + (iconoSector[p.sector] || "📄") + "</span></header>" +
        "<small>" + esc([C.SECTORES[p.sector] || p.sector, C.TIPO_CLIENTE[p.tipo_cliente] || p.tipo_cliente].join(" · ")) + "</small>" +
        (actual ? '<small class="icc-pr-card-actual">Hoy: ' + esc(actual) + "</small>" : "") +
        '<div class="icc-pr-alertas">' + alertas(p) + "</div>" +
        "<footer>" + avatarP(p, 22) + "<span>" + esc(p.comercial_nombre || "Sin asignar") + "</span><em>" + dias(p.created_at) + " d</em></footer></a>"
      );
    };

    main().innerHTML =
      '<header class="icc-ag-hero icc-pr-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">📄 Presupuestos</span>' +
      "<h1>" + abiertos.length + (abiertos.length === 1 ? " presupuesto en curso" : " presupuestos en curso") + "</h1>" +
      '<p class="icc-ag-hero-res"><b class="ok">' + cerradosMes + "</b> cerrados este mes · <b>" + conversion + "%</b> llegan a cierre" +
      (nParados ? ' · <b class="mal">' + nParados + "</b> parados" : "") + "</p></div>" +
      '<div class="icc-ag-hero-acc"><button class="icc-btn icc-btn-primary icc-ag-btn-nueva" id="btn-nuevo-presupuesto-general">+ Nuevo presupuesto</button></div></header>' +

      // Fases (sirven de filtro)
      '<div class="icc-pr-fases">' +
      '<a class="icc-pr-fase' + (!filtros.estado ? " is-activa" : "") + '" style="--c:#e2e8f0" href="' + linkQs({ estado: "" }) + '"><b>' + base.length + "</b><span>Todos</span></a>" +
      C.ESTADOS_PRESUPUESTO_ORDEN.map(function (e, i) {
        return (
          '<a class="icc-pr-fase' + (filtros.estado === e ? " is-activa" : "") + '" style="--c:' + C.ESTADOS_PRESUPUESTO[e].color + '" href="' + linkQs({ estado: filtros.estado === e ? "" : e }) + '">' +
          '<em>' + (i + 1) + "</em><b>" + (cuenta[e] || 0) + "</b><span>" + esc(C.ESTADOS_PRESUPUESTO[e].label) + "</span></a>"
        );
      }).join("") +
      "</div>" +
      (nRenovar ? '<div class="icc-aviso icc-pr-aviso">🔔 <b>' + nRenovar + "</b> " + (nRenovar === 1 ? "cliente termina" : "clientes terminan") + " la permanencia en los próximos 60 días: buen momento para volver a llamar.</div>" : "") +

      '<section class="icc-card icc-ag-barra">' +
      '<form id="form-filtros-presupuesto" class="icc-filtros-row">' +
      '<input class="icc-input" name="q" placeholder="🔎 Buscar cliente, CIF, CUPS o compañía" value="' + esc(q) + '">' +
      (gestor
        ? '<select class="icc-select" name="comercial_id"><option value="">Todo el equipo</option>' +
          agentes.map(function (a) { return '<option value="' + a.id + '"' + (comercialFiltro === String(a.id) ? " selected" : "") + ">" + esc(a.nombre + " " + (a.apellidos || "")) + "</option>"; }).join("") + "</select>"
        : "") +
      '<select class="icc-select" name="sector"><option value="">Todos los sectores</option>' +
      Object.keys(C.SECTORES).map(function (s) { return '<option value="' + s + '"' + (filtros.sector === s ? " selected" : "") + ">" + (iconoSector[s] || "") + " " + C.SECTORES[s] + "</option>"; }).join("") + "</select>" +
      '<select class="icc-select" name="tipo_cliente"><option value="">Todo tipo de cliente</option>' +
      Object.keys(C.TIPO_CLIENTE).map(function (t) { return '<option value="' + t + '"' + (filtros.tipo_cliente === t ? " selected" : "") + ">" + C.TIPO_CLIENTE[t] + "</option>"; }).join("") + "</select>" +
      (filtros.estado ? '<input type="hidden" name="estado" value="' + esc(filtros.estado) + '">' : "") +
      (vista === "tablero" ? '<input type="hidden" name="vista" value="tablero">' : "") +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      '<div class="icc-tabs icc-pr-vistas"><a class="icc-tab' + (vista === "lista" ? " is-active" : "") + '" href="' + linkQs({ vista: "" }) + '">☰ Lista</a>' +
      '<a class="icc-tab' + (vista === "tablero" ? " is-active" : "") + '" href="' + linkQs({ vista: "tablero" }) + '">▦ Tablero</a></div>' +
      "</form></section>" +

      (vista === "tablero"
        ? '<section class="icc-pr-tablero">' +
          C.ESTADOS_PRESUPUESTO_ORDEN.filter(function (e) { return !filtros.estado || filtros.estado === e; }).map(function (e) {
            var lista = presupuestos.filter(function (p) { return p.estado === e; });
            return (
              '<div class="icc-pr-col" style="--f:' + C.ESTADOS_PRESUPUESTO[e].color + '"><div class="icc-pl-col-head"><div class="icc-pl-col-tit"><strong>' + esc(C.ESTADOS_PRESUPUESTO[e].label) + "</strong><b>" + lista.length + "</b></div></div>" +
              '<div class="icc-pl-col-body">' + (lista.length ? lista.map(tarjetaTablero).join("") : '<p class="icc-pl-vacio">Ninguno</p>') + "</div></div>"
            );
          }).join("") +
          "</section>"
        : '<section class="icc-pr-lista">' +
          (presupuestos.length
            ? '<div class="icc-pr-cab"><span>Cliente</span><span>Estado</span><span>Comercial</span><span>Fecha</span><span></span></div>' + presupuestos.map(filaLista).join("")
            : '<p class="icc-empty">' + (todos.length ? "Ningún presupuesto coincide con el filtro." : "Sin presupuestos todavía.") + "</p>") +
          "</section>");

    document.getElementById("form-filtros-presupuesto").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var qs = new URLSearchParams();
      fd.forEach(function (v, k) { if (String(v).trim()) qs.set(k, String(v).trim()); });
      location.hash = "#/presupuestos" + (qs.toString() ? "?" + qs.toString() : "");
    });

    document.getElementById("btn-nuevo-presupuesto-general").addEventListener("click", function () {
      modalNuevoPresupuestoGeneral(clientes);
    });

    main()
      .querySelectorAll("[data-asignar-comercial]")
      .forEach(function (select) {
        select.addEventListener("change", async function () {
          var idPresupuesto = select.getAttribute("data-asignar-comercial");
          select.disabled = true;
          try {
            await D.actualizarPresupuesto(idPresupuesto, { comercial_id: select.value || "" });
            U.toast("Comercial asignado", "success");
            viewPresupuestos();
          } catch (err) {
            U.toast(err.message || "No se pudo asignar", "error");
            select.disabled = false;
          }
        });
      });
  }

  function modalNuevoPresupuestoGeneral(clientes) {
    U.openModal(
      "<h2>Nuevo presupuesto</h2>" +
      '<form id="form-nuevo-presupuesto" class="icc-form">' +
      '<div class="icc-field" id="campo-cliente-existente"><label>Cliente</label><select class="icc-select" name="cliente_id">' +
      '<option value="">Selecciona un cliente…</option>' +
      clientes
        .map(function (c) {
          return '<option value="' + c.id + '">' + U.escapeHtml(c.razon_social) + " (" + U.escapeHtml(c.cif) + ")</option>";
        })
        .join("") +
      "</select></div>" +
      '<button type="button" class="icc-link-btn" id="btn-toggle-nuevo-cliente" style="margin:-4px 0 8px">+ Crear nuevo cliente</button>' +
      '<div id="bloque-nuevo-cliente" style="display:none">' +
      campoTexto("nuevo_razon_social", "Razon social / Nombre", false, "text") +
      campoTexto("nuevo_cif", "NIF / CIF", false, "text") +
      campoTexto("nuevo_telefono", "Telefono", false, "text") +
      campoTexto("nuevo_email", "Email", false, "email") +
      campoTexto("nuevo_direccion_suministro", "Direccion de suministro", false, "text") +
      "</div>" +
      '<div class="icc-field"><label>Sector</label><select class="icc-select" name="sector" required>' +
      Object.keys(C.SECTORES)
        .map(function (s) {
          return '<option value="' + s + '">' + C.SECTORES[s] + "</option>";
        })
        .join("") +
      "</select></div>" +
      camposSectorPresupuesto(Object.keys(C.SECTORES)[0]) +
      '<div class="icc-field"><label>Factura del cliente (opcional, PDF o imagen)</label>' +
      '<input class="icc-input" type="file" name="archivo_factura" accept="application/pdf,image/*"></div>' +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Crear</button>' +
      "</div></form>"
    );

    var form = document.getElementById("form-nuevo-presupuesto");
    wirearCamposSectorPresupuesto(form);

    var campoClienteExistente = document.getElementById("campo-cliente-existente");
    var bloqueNuevoCliente = document.getElementById("bloque-nuevo-cliente");
    var btnToggle = document.getElementById("btn-toggle-nuevo-cliente");
    var modoNuevoCliente = false;
    btnToggle.addEventListener("click", function () {
      modoNuevoCliente = !modoNuevoCliente;
      campoClienteExistente.style.display = modoNuevoCliente ? "none" : "";
      bloqueNuevoCliente.style.display = modoNuevoCliente ? "" : "none";
      btnToggle.textContent = modoNuevoCliente ? "← Elegir cliente existente" : "+ Crear nuevo cliente";
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      try {
        var clienteId = fd.get("cliente_id");
        if (modoNuevoCliente) {
          var razonSocial = (fd.get("nuevo_razon_social") || "").trim();
          var cif = (fd.get("nuevo_cif") || "").trim();
          if (!razonSocial || !cif) {
            U.toast("Rellena razon social y CIF del nuevo cliente", "error");
            return;
          }
          clienteId = await D.crearCliente({
            razon_social: razonSocial,
            cif: cif,
            telefono: fd.get("nuevo_telefono") || "",
            email: fd.get("nuevo_email") || "",
            direccion_suministro: fd.get("nuevo_direccion_suministro") || "",
          }, []);
        }
        if (!clienteId) {
          U.toast("Elige un cliente o crea uno nuevo", "error");
          return;
        }
        var payload = Object.assign({ cliente_id: clienteId, sector: fd.get("sector") }, leerCamposSectorPresupuesto(fd));
        var id = await D.crearPresupuesto(payload);
        await subirFacturaSiHay(clienteId, id, form);
        U.closeModal();
        location.hash = "#/presupuestos/" + id;
      } catch (err) {
        U.toast(err.message || "No se pudo crear el presupuesto", "error");
      }
    });
  }

  async function viewPresupuestoDetalle(id) {
    main().innerHTML = '<div class="icc-loading">Cargando presupuesto…</div>';
    var presupuesto = await D.obtenerPresupuesto(id).catch(function () { return null; });
    if (!presupuesto) {
      main().innerHTML = '<p class="icc-empty">Presupuesto no encontrado o sin acceso.</p>';
      return;
    }
    var documentos = await D.listarDocumentos(presupuesto.cliente_id, presupuesto.id);
    var esAdmin = window.icc.auth.esBackofficeOAdmin();
    var esAdminEstricto = window.icc.auth.esAdminOSuperior();

    var zonas = [
      { tipo: "factura", titulo: "Factura del cliente", icono: "🧾" },
      { tipo: "estudio", titulo: "Estudio / Propuesta economica", icono: "📊" },
      { tipo: "contrato_firmado", titulo: "Documentacion de contrato (DNI, firma, SEPA…)", icono: "📁" },
    ];

    main().innerHTML =
      '<div class="icc-page-head"><div><a href="#/clientes/' + presupuesto.cliente_id + '" class="icc-back">← Volver a ' + U.escapeHtml(presupuesto.razon_social) + '</a>' +
      "<h1>Presupuesto · " + U.escapeHtml(C.SECTORES[presupuesto.sector] || presupuesto.sector) + "</h1>" +
      '<p class="icc-muted">' + U.escapeHtml(presupuesto.razon_social) + " · " + U.escapeHtml(presupuesto.cif) + " · " + U.escapeHtml(C.TIPO_CLIENTE[presupuesto.tipo_cliente] || presupuesto.tipo_cliente) + "</p>" +
      "</div></div>" +
      '<section class="icc-card">' +
      '<div class="icc-funnel">' +
      C.ESTADOS_PRESUPUESTO_ORDEN.map(function (e) {
        var activo = e === presupuesto.estado;
        return (
          '<span class="icc-funnel-step" style="' + (activo ? "border-color:" + C.ESTADOS_PRESUPUESTO[e].color + ";font-weight:700" : "opacity:.5") + '">' +
          C.ESTADOS_PRESUPUESTO[e].label +
          "</span>"
        );
      }).join("") +
      "</div>" +
      (presupuesto.contrato_id
        ? '<p class="icc-muted" style="margin-top:10px">✅ Contrato generado (ver en Contratos).</p>'
        : '<div class="icc-modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap;gap:10px">' +
          (esAdminEstricto
            ? '<div class="icc-field" style="margin:0"><label>Cambiar estado manualmente</label><select class="icc-select" id="select-estado-presupuesto">' +
              C.ESTADOS_PRESUPUESTO_ORDEN.filter(function (e) { return e !== "cerrado"; })
                .map(function (e) { return '<option value="' + e + '"' + (e === presupuesto.estado ? " selected" : "") + ">" + C.ESTADOS_PRESUPUESTO[e].label + "</option>"; })
                .join("") +
              "</select></div>"
            : "") +
          '<button type="button" class="icc-btn icc-btn-primary" id="btn-cerrar-presupuesto">Cerrar presupuesto y generar contrato</button>' +
          "</div>") +
      "</section>" +
      '<section class="icc-card" style="margin-top:14px">' +
      "<h2>Datos del suministro / servicio actual</h2>" +
      '<form id="form-datos-sector" class="icc-form">' +
      (presupuesto.sector === "energia"
        ? '<div class="icc-field"><label>Tipo de suministro</label><select class="icc-select" name="tipo_suministro">' +
          '<option value="">Selecciona…</option>' +
          Object.keys(C.TIPO_SUMINISTRO)
            .map(function (t) {
              return '<option value="' + t + '"' + (presupuesto.tipo_suministro === t ? " selected" : "") + ">" + C.TIPO_SUMINISTRO[t] + "</option>";
            })
            .join("") +
          "</select></div>" +
          campoTexto("cups", "CUPS", false, "text", presupuesto.cups) +
          '<p class="icc-muted" id="aviso-cups-detalle" style="display:none;color:var(--red);margin:-8px 0 8px">El CUPS no tiene el formato habitual (ES + 16 digitos + 2 letras). Puedes guardarlo igual si estas seguro.</p>' +
          campoTexto("comercializadora_actual", "Comercializadora actual", false, "text", presupuesto.comercializadora_actual) +
          campoTexto("tarifa_actual", "Tarifa actual", false, "text", presupuesto.tarifa_actual) +
          campoTexto("potencias_contratadas", "Potencias contratadas (P1, P2, P3…)", false, "text", presupuesto.potencias_contratadas) +
          campoTexto("consumo_anual_kwh", "Consumo anual estimado (kWh)", false, "number", presupuesto.consumo_anual_kwh)
        : campoTexto("comercializadora_actual", "Operador / Compañia / Instaladora actual", false, "text", presupuesto.comercializadora_actual) +
          '<div class="icc-field"><label>Servicio / lineas / equipamiento actual</label>' +
          '<textarea class="icc-textarea" name="datos_actuales_otros">' + U.escapeHtml(presupuesto.datos_actuales_otros || "") + "</textarea></div>") +
      campoTexto("fecha_permanencia", "Fecha fin de contrato / permanencia", false, "date", presupuesto.fecha_permanencia) +
      '<div class="icc-modal-actions" style="justify-content:flex-start">' +
      '<button type="submit" class="icc-btn icc-btn-secondary">Guardar datos</button>' +
      "</div></form></section>" +
      zonas
        .map(function (z) {
          var docsZona = documentos.filter(function (d) { return d.tipo === z.tipo; });
          var accionExtra = "";
          if (z.tipo === "estudio") {
            var sectorComparador = presupuesto.sector === "telecomunicaciones" ? "telefonia" : presupuesto.sector;
            if ((sectorComparador === "energia" || sectorComparador === "telefonia") && window.icc.auth.puede("comparador.usar")) {
              accionExtra = '<a class="icc-btn icc-btn-ghost" href="' + window.icc.comparador.urlHerramienta(sectorComparador, { cliente: presupuesto.cliente_id }) + '">Ejecutar Comparador</a>';
            }
          } else if (z.tipo === "contrato_firmado") {
            accionExtra = '<a class="icc-btn icc-btn-ghost" href="firmar.html?cliente=' + presupuesto.cliente_id + '">Iniciar firma digital</a>';
          }
          return (
            '<section class="icc-card" style="margin-top:14px">' +
            "<h2>" + z.icono + " " + z.titulo + "</h2>" +
            '<div class="icc-doc-actions">' +
            '<input class="icc-input" type="file" data-zona-input="' + z.tipo + '">' +
            '<button type="button" class="icc-btn icc-btn-secondary" data-zona-subir="' + z.tipo + '">Subir</button>' +
            accionExtra +
            "</div>" +
            (docsZona.length
              ? '<ul class="icc-doc-list" style="margin-top:10px">' +
                docsZona
                  .map(function (d) {
                    return (
                      "<li><span>📄 " + U.escapeHtml(d.nombre_archivo) + "</span><span class=\"icc-muted\">" + U.formatFecha(d.created_at) + '</span><a class="icc-link-btn" target="_blank" href="' +
                      D.urlDescarga(z.tipo === "estudio" ? "estudios" : "facturas", d.ruta_archivo) +
                      '">Ver</a></li>'
                    );
                  })
                  .join("") +
                "</ul>"
              : '<p class="icc-empty">Sin archivos todavia.</p>') +
            "</section>"
          );
        })
        .join("") +
      (window.icc.auth.puede("presupuestos.borrar")
        ? '<div class="icc-modal-actions" style="justify-content:flex-start;margin-top:14px">' +
          '<button type="button" class="icc-btn icc-btn-ghost" style="color:var(--red)" id="btn-borrar-presupuesto">Borrar presupuesto</button>' +
          "</div>"
        : "");

    zonas.forEach(function (z) {
      var btn = main().querySelector('[data-zona-subir="' + z.tipo + '"]');
      btn.addEventListener("click", async function () {
        var input = main().querySelector('[data-zona-input="' + z.tipo + '"]');
        var file = input.files[0];
        if (!file) {
          U.toast("Elige un archivo primero", "error");
          return;
        }
        try {
          await D.subirDocumento(presupuesto.cliente_id, z.tipo, file, "", presupuesto.id);
          U.toast("Archivo subido", "success");
          viewPresupuestoDetalle(id);
        } catch (err) {
          U.toast(err.message || "No se pudo subir el archivo", "error");
        }
      });
    });

    var inputCupsDetalle = document.querySelector('#form-datos-sector [name="cups"]');
    var avisoCupsDetalle = document.getElementById("aviso-cups-detalle");
    if (inputCupsDetalle && avisoCupsDetalle) {
      inputCupsDetalle.addEventListener("blur", function () {
        var valor = inputCupsDetalle.value.trim();
        avisoCupsDetalle.style.display = valor && !REGEX_CUPS.test(valor) ? "" : "none";
      });
    }

    document.getElementById("form-datos-sector").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var payload = Object.assign(
        presupuesto.sector === "energia"
          ? {
              tipo_suministro: fd.get("tipo_suministro") || "",
              cups: fd.get("cups") || "",
              comercializadora_actual: fd.get("comercializadora_actual") || "",
              tarifa_actual: fd.get("tarifa_actual") || "",
              potencias_contratadas: fd.get("potencias_contratadas") || "",
              consumo_anual_kwh: fd.get("consumo_anual_kwh") || "",
            }
          : {
              comercializadora_actual: fd.get("comercializadora_actual") || "",
              datos_actuales_otros: fd.get("datos_actuales_otros") || "",
            },
        { fecha_permanencia: fd.get("fecha_permanencia") || "" }
      );
      try {
        await D.actualizarPresupuesto(id, payload);
        U.toast("Datos guardados", "success");
      } catch (err) {
        U.toast(err.message || "No se pudo guardar", "error");
      }
    });

    var selectEstadoPresupuesto = document.getElementById("select-estado-presupuesto");
    if (selectEstadoPresupuesto) {
      selectEstadoPresupuesto.addEventListener("change", async function () {
        try {
          await D.actualizarPresupuesto(id, { estado: selectEstadoPresupuesto.value });
          U.toast("Estado actualizado", "success");
          viewPresupuestoDetalle(id);
        } catch (err) {
          U.toast(err.message || "No se pudo cambiar el estado", "error");
        }
      });
    }

    var btnCerrar = document.getElementById("btn-cerrar-presupuesto");
    if (btnCerrar) {
      btnCerrar.addEventListener("click", async function () {
        if (!confirm("¿Cerrar este presupuesto y generar el contrato? No se puede deshacer.")) return;
        try {
          await D.cerrarPresupuesto(id);
          U.toast("Presupuesto cerrado y contrato generado", "success");
          viewPresupuestoDetalle(id);
        } catch (err) {
          U.toast(err.message || "No se pudo cerrar el presupuesto", "error");
        }
      });
    }

    var btnBorrar = document.getElementById("btn-borrar-presupuesto");
    if (btnBorrar) {
      btnBorrar.addEventListener("click", async function () {
        if (!confirm("¿Borrar este presupuesto? No se puede deshacer.")) return;
        try {
          await D.borrarPresupuesto(id);
          U.toast("Presupuesto borrado", "success");
          location.hash = "#/clientes/" + presupuesto.cliente_id;
        } catch (err) {
          U.toast(err.message || "No se pudo borrar", "error");
        }
      });
    }
  }

  // ---------------------------------------------------------------- Informes
  async function viewInformes() {
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var VISTAS = ["cartera", "kw", "sector", "tarifa", "compania"];
    var ver = VISTAS.indexOf(params.get("ver")) !== -1 ? params.get("ver") : "";
    var esc = U.escapeHtml;

    main().innerHTML = '<div class="icc-loading">Cargando informes…</div>';
    var [cartera, kw, porTarifa, porComercializadora, porSector] = await Promise.all([
      D.informe("clientes_cartera"),
      D.informe("kw_cartera"),
      D.informe("por_tarifa"),
      D.informe("por_comercializadora"),
      D.informe("por_sector"),
    ]);

    var num = function (v, dec) {
      var n = Number(v || 0);
      return n.toLocaleString("es-ES", { maximumFractionDigits: dec === undefined ? 2 : dec });
    };
    var totalKw = Number(kw.total.total_kw || 0);
    var totalContratos = Number(kw.total.total_contratos || 0);
    var clientes = cartera.clientes || [];
    var nCompanias = (porComercializadora.datos || []).filter(function (f) { return f.comercializadora; }).length;
    var kwMedio = totalContratos ? totalKw / totalContratos : 0;
    var hrefInf = function (v) { return "#/informes" + (v ? "?ver=" + v : ""); };
    var hrefContratos = function (k, v) { return v ? "#/contratos?" + k + "=" + encodeURIComponent(v) : "#/contratos"; };

    // Lista de barras horizontales: cada fila lleva a los contratos filtrados.
    var barras = function (filas, campo, valor, opciones) {
      opciones = opciones || {};
      if (!filas || !filas.length) return '<p class="icc-empty">Sin datos todavía.</p>';
      // Los contratos sin dato van al final (no compiten con las categorias reales).
      filas = filas.filter(function (f) { return f[campo]; }).concat(filas.filter(function (f) { return !f[campo]; }));
      var total = filas.reduce(function (s, f) { return s + Number(f[valor] || 0); }, 0) || 1;
      var max = Math.max.apply(null, filas.map(function (f) { return Number(f[valor] || 0); })) || 1;
      var lista = opciones.limite ? filas.slice(0, opciones.limite) : filas;
      return (
        '<ol class="icc-inf-barras">' +
        lista.map(function (f, i) {
          var raw = f[campo];
          var etiqueta = opciones.etiqueta ? opciones.etiqueta(raw) : raw || "Sin indicar";
          var v = Number(f[valor] || 0);
          var pct = Math.round((v / total) * 100);
          var href = raw ? hrefContratos(opciones.filtro, raw) : "#/contratos";
          return (
            '<li' + (raw ? "" : ' class="is-sin-dato"') + '><a href="' + href + '" title="' + (raw ? "Ver los contratos de " + esc(etiqueta) : "Ver todos los contratos") + '">' +
            '<span class="icc-inf-pos">' + (i + 1) + "</span>" +
            '<span class="icc-inf-nombre">' + esc(etiqueta) + "</span>" +
            '<span class="icc-inf-valor">' + num(v) + (opciones.sufijo || "") + "<small>" + pct + "%</small></span>" +
            '<span class="icc-inf-pista"><i style="width:' + Math.max(2, Math.round((v / max) * 100)) + '%"></i></span>' +
            "</a></li>"
          );
        }).join("") +
        "</ol>" +
        (opciones.limite && filas.length > opciones.limite
          ? '<a class="icc-inf-mas" href="' + hrefInf(opciones.vista) + '">Ver las ' + filas.length + " →</a>"
          : "")
      );
    };

    var seccion = function (clave, icono, titulo, subtitulo, cuerpo) {
      return (
        '<section class="icc-card icc-inf-seccion' + (ver === clave ? " is-abierta" : "") + '" id="inf-' + clave + '">' +
        '<header class="icc-inf-sec-cab"><div><h2>' + icono + " " + titulo + "</h2><small>" + subtitulo + "</small></div>" +
        (ver !== clave ? '<a class="icc-btn icc-btn-ghost icc-inf-abrir" href="' + hrefInf(clave) + '">Abrir →</a>' : "") +
        "</header>" + cuerpo + "</section>"
      );
    };

    var limite = ver ? 0 : 6;
    var secSector = seccion("sector", "🧩", "Contratos por sector", num(totalContratos, 0) + " contratos",
      barras(porSector.datos, "sector", "total", { filtro: "sector", vista: "sector", limite: limite, etiqueta: function (s) { return C.SECTORES[s] || s || "Sin indicar"; } }));
    var secTarifa = seccion("tarifa", "🏷️", "Contratos por tarifa", (porTarifa.datos || []).length + " tarifas distintas",
      barras(porTarifa.datos, "tarifa", "total", { filtro: "tarifa", vista: "tarifa", limite: limite }));
    var secCompania = seccion("compania", "🏢", "Contratos por compañía", nCompanias + (nCompanias === 1 ? " compañía" : " compañías"),
      barras(porComercializadora.datos, "comercializadora", "total", { filtro: "comercializadora", vista: "compania", limite: limite }));
    var secKw = seccion("kw", "⚡", "kW por compañía", num(totalKw) + " kW en total",
      barras(kw.por_comercializadora, "comercializadora", "total_kw", { filtro: "comercializadora", vista: "kw", limite: limite, sufijo: " kW" }));

    var listaCartera = function (filas) {
      if (!filas.length) return '<p class="icc-empty">Sin clientes activos todavía.</p>';
      return (
        '<div class="icc-inf-cartera">' +
        filas.map(function (c) {
          return (
            '<a class="icc-inf-cliente" href="#/clientes/' + c.id + '" data-buscar="' + esc([c.razon_social, c.cif, C.SECTORES[c.sector] || c.sector].join(" ").toLowerCase()) + '">' +
            '<span class="icc-inf-cliente-ini">' + esc(String(c.razon_social || "?").trim().charAt(0).toUpperCase()) + "</span>" +
            '<span class="icc-inf-cliente-txt"><strong>' + esc(c.razon_social) + "</strong><small>" + esc([c.cif, C.SECTORES[c.sector] || c.sector].filter(Boolean).join(" · ")) + "</small></span>" +
            '<span class="icc-inf-cliente-fecha">' + (c.created_at ? esc(U.formatFecha(c.created_at)) : "") + "</span></a>"
          );
        }).join("") +
        "</div>"
      );
    };
    var secCartera = seccion("cartera", "👥", "Clientes en cartera", clientes.length + (clientes.length === 1 ? " cliente activo" : " clientes activos"),
      (ver === "cartera"
        ? '<div class="icc-inf-herr"><input class="icc-input" id="inf-buscar" type="search" placeholder="🔎 Buscar por empresa, CIF o sector">' +
          (clientes.length ? '<button type="button" class="icc-btn icc-btn-secondary" id="inf-csv">⬇ Exportar CSV</button>' : "") + "</div>" +
          listaCartera(clientes) + '<p class="icc-empty" id="inf-sin" hidden>Ningún cliente coincide.</p>'
        : listaCartera(clientes.slice(0, 6)) +
          (clientes.length > 6 ? '<a class="icc-inf-mas" href="' + hrefInf("cartera") + '">Ver los ' + clientes.length + " →</a>" : "")));

    var kpi = function (href, icono, valor, etiqueta, color, detalle) {
      return (
        '<a class="icc-stat-card icc-ag-kpi icc-inf-kpi" href="' + href + '" style="--stat-color:' + color + '">' +
        '<span class="icc-ag-kpi-ico">' + icono + '</span><span class="icc-stat-value">' + valor + "</span>" +
        '<span class="icc-stat-label">' + etiqueta + "</span>" + (detalle ? '<small class="icc-inf-kpi-det">' + detalle + "</small>" : "") + "</a>"
      );
    };

    var pestanas = [["", "📊 Resumen"], ["cartera", "👥 Cartera"], ["kw", "⚡ kW"], ["sector", "🧩 Sector"], ["tarifa", "🏷️ Tarifa"], ["compania", "🏢 Compañía"]];
    var cuerpo = { cartera: secCartera, kw: secKw, sector: secSector, tarifa: secTarifa, compania: secCompania };

    main().innerHTML =
      '<header class="icc-ag-hero icc-inf-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">📈 Informes y reportes</span>' +
      "<h1>" + num(totalKw) + " kW en cartera</h1>" +
      '<p class="icc-ag-hero-res"><b class="ok">' + clientes.length + "</b> " + (clientes.length === 1 ? "cliente activo" : "clientes activos") +
      " · <b>" + num(totalContratos, 0) + "</b> " + (totalContratos === 1 ? "contrato" : "contratos") + " · <b>" + nCompanias + "</b> " + (nCompanias === 1 ? "compañía" : "compañías") + "</p></div>" +
      '<div class="icc-ag-hero-acc"><a class="icc-btn icc-btn-ghost" href="#/contratos">📄 Ver contratos</a></div></header>' +

      '<div class="icc-stat-grid icc-inf-kpis">' +
      kpi("#/clientes?estado=cliente_activo", "👥", clientes.length, "Clientes en cartera", "#34d399", "Ver clientes activos") +
      kpi(hrefInf("kw"), "⚡", num(totalKw), "Total kW en cartera", "#22d3ee", "Reparto por compañía") +
      kpi("#/contratos", "📄", num(totalContratos, 0), "Total contratos", "#d4a62a", "Ver listado") +
      kpi(hrefInf("compania"), "🏢", nCompanias, "Compañías", "#a78bfa", num(kwMedio) + " kW de media por contrato") +
      "</div>" +

      '<nav class="icc-tabs icc-inf-tabs" aria-label="Informes">' +
      pestanas.map(function (p) {
        return '<a class="icc-tab' + (ver === p[0] ? " is-active" : "") + '" href="' + hrefInf(p[0]) + '">' + p[1] + "</a>";
      }).join("") + "</nav>" +

      (ver
        ? cuerpo[ver]
        : '<div class="icc-inf-grid">' + secSector + secTarifa + secCompania + secKw + "</div>" + secCartera);

    if (ver) {
      var abierta = document.getElementById("inf-" + ver);
      if (abierta && abierta.scrollIntoView) abierta.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    var buscar = document.getElementById("inf-buscar");
    if (buscar) {
      buscar.addEventListener("input", function () {
        var t = buscar.value.trim().toLowerCase();
        var n = 0;
        main().querySelectorAll(".icc-inf-cliente").forEach(function (el) {
          var ok = !t || el.getAttribute("data-buscar").indexOf(t) !== -1;
          el.hidden = !ok;
          if (ok) n++;
        });
        document.getElementById("inf-sin").hidden = n > 0;
      });
    }
    var btnCsv = document.getElementById("inf-csv");
    if (btnCsv) {
      btnCsv.addEventListener("click", function () {
        var celda = function (v) { v = v == null ? "" : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var filas = [["Empresa", "CIF", "Sector", "Alta"]].concat(clientes.map(function (c) {
          return [c.razon_social, c.cif, C.SECTORES[c.sector] || c.sector || "", c.created_at ? String(c.created_at).slice(0, 10) : ""];
        }));
        var csv = "﻿" + filas.map(function (r) { return r.map(celda).join(";"); }).join("\r\n");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        a.download = "clientes-en-cartera-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      });
    }
  }

  function tablaSimple(filas, campoNombre, campoValor) {
    if (!filas || !filas.length) return '<p class="icc-empty">Sin datos.</p>';
    return (
      '<table class="icc-table"><tbody>' +
      filas
        .map(function (f) {
          return "<tr><td>" + U.escapeHtml(f[campoNombre] || "Sin especificar") + "</td><td>" + f[campoValor] + "</td></tr>";
        })
        .join("") +
      "</tbody></table>"
    );
  }

  return {
    viewDashboard: viewDashboard,
    viewAgenda: viewAgenda,
    abrirModalCitaRapida: abrirModalCitaRapida,
    viewClientes: viewClientes,
    modalNuevoCliente: modalNuevoCliente,
    viewClienteDetalle: viewClienteDetalle,
    viewContratos: viewContratos,
    viewAgentes: viewAgentes,
    viewFichaAgente: viewFichaAgente,
    viewAuditoriaVerComo: viewAuditoriaVerComo,
    viewFicheros: viewFicheros,
    viewDiagnosticoStorage: viewDiagnosticoStorage,
    viewCopiasSeguridad: viewCopiasSeguridad,
    viewProformas: viewProformas,
    viewPresupuestos: viewPresupuestos,
    viewPresupuestoDetalle: viewPresupuestoDetalle,
    viewInformes: viewInformes,
  };
})();
