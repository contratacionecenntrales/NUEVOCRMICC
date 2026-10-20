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
    main().innerHTML = '<div class="icc-loading">Cargando panel…</div>';
    var [clientes, contratos, citasProximas] = await Promise.all([
      D.listarClientes(),
      D.listarContratos({}).catch(function () { return []; }),
      D.listarCitas({ comercial_id: st.user.id, desde: hoyIso() }).catch(function () { return []; }),
    ]);

    var citasHoy = citasProximas.filter(function (c) {
      return c.fecha === hoyIso() && (c.estado === "programada" || c.estado === "confirmada" || c.estado === "reprogramada");
    });
    var proximaCita = citasProximas
      .filter(function (c) { return c.estado === 'programada' || c.estado === 'confirmada' || c.estado === 'reprogramada'; })
      .filter(function (c) { return citaEsFutura(c); })
      .sort(function (a, b) { return (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio); })[0];

    var conteos = {};
    C.ESTADOS_ORDEN.forEach(function (e) {
      conteos[e] = 0;
    });
    clientes.forEach(function (c) {
      conteos[c.estado] = (conteos[c.estado] || 0) + 1;
    });

    var conteosContrato = {};
    C.ESTADOS_CONTRATO_ORDEN.forEach(function (e) {
      conteosContrato[e] = 0;
    });
    contratos.forEach(function (c) {
      conteosContrato[c.estado] = (conteosContrato[c.estado] || 0) + 1;
    });
    var contratosOk = conteosContrato.ok || 0;
    var objetivoMensual = 20;
    var puntos = contratosOk * 10 + (conteosContrato.verificado || 0) * 5;

    var propios = clientes.filter(function (c) {
      return c.comercial_id === st.user.id;
    });
    var enCurso = clientes.filter(function (c) {
      return c.estado !== "cliente_activo" && c.estado !== "perdido";
    }).length;

    var accesos = [{ href: "#/clientes", label: "Ver leads y clientes", icon: "👥" }];
    if (window.icc.auth.esBackofficeOAdmin()) {
      accesos.push({ href: "#/clientes?estado=estudio_backoffice", label: "Cola de backoffice", icon: "🧮" });
      accesos.push({ href: "#/agentes", label: "Gestion de agentes", icon: "🛡️" });
    }
    accesos.push({ href: "#/contratos", label: "Ver contratos", icon: "📄" });
    accesos.push({ href: "firmar.html", label: "Firma digital de contratos", icon: "✍️" });

    main().innerHTML =
      '<div class="icc-page-head">' +
      '<h1>Hola, ' +
      U.escapeHtml((st.user.nombre || "").split(" ")[0] || "equipo") +
      "</h1>" +
      '<p class="icc-muted">' +
      C.ROLES[st.rolPrincipal] +
      " · Integral Connection Consulting</p>" +
      "</div>" +
      '<div class="icc-stat-grid">' +
      statCard("Puntos obtenidos", puntos, "#d4a62a") +
      statCard("Objetivo mensual (contratos OK)", contratosOk + " / " + objetivoMensual, "#34d399") +
      statCard("Expedientes en curso", enCurso, "#22d3ee") +
      statCard(st.rolPrincipal === "comercial" ? "Mis leads" : "Total clientes", st.rolPrincipal === "comercial" ? propios.length : clientes.length, "#818cf8") +
      "</div>" +
      '<div class="icc-grid-2">' +
      '<section class="icc-card">' +
      "<h2>Embudo comercial</h2>" +
      '<div class="icc-funnel">' +
      C.ESTADOS_ORDEN.filter(function (e) {
        return e !== "perdido";
      })
        .map(function (e) {
          return (
            '<a class="icc-funnel-step" href="#/clientes?estado=' +
            e +
            '"><span class="icc-funnel-count">' +
            (conteos[e] || 0) +
            "</span><span>" +
            C.ESTADOS[e].label +
            "</span></a>"
          );
        })
        .join("") +
      "</div>" +
      "<h3>Estadisticas de logros</h3>" +
      '<div class="icc-funnel">' +
      C.ESTADOS_CONTRATO_ORDEN.map(function (e) {
        return (
          '<a class="icc-funnel-step" href="#/contratos?estado=' +
          e +
          '"><span class="icc-funnel-count">' +
          (conteosContrato[e] || 0) +
          "</span><span>" +
          C.ESTADOS_CONTRATO[e].label +
          "</span></a>"
        );
      }).join("") +
      "</div>" +
      "</section>" +
      '<section class="icc-card">' +
      "<h2>Accesos rapidos</h2>" +
      '<div class="icc-quick-links">' +
      accesos
        .map(function (a) {
          return (
            '<a class="icc-quick-link" href="' + a.href + '"><span>' + a.icon + "</span>" + a.label + "</a>"
          );
        })
        .join("") +
      "</div>" +
      "</section>" +
      "</div>" +
      '<div class="icc-grid-2" style="margin-top:16px">' +
      '<section class="icc-card">' +
      "<h2>📅 Mi Agenda de Hoy</h2>" +
      '<p class="icc-stat-value" style="font-size:30px;display:block">' + citasHoy.length + "</p>" +
      '<p class="icc-muted">cita' + (citasHoy.length === 1 ? "" : "s") + " programada" + (citasHoy.length === 1 ? "" : "s") + " para hoy</p>" +
      '<div class="icc-doc-actions" style="margin-top:10px">' +
      '<a class="icc-btn icc-btn-secondary" href="#/agenda">Ver agenda</a>' +
      '<button type="button" class="icc-btn icc-btn-primary" id="btn-dashboard-nueva-cita">+ Nueva cita</button>' +
      "</div></section>" +
      '<section class="icc-card">' +
      "<h2>⏰ Próxima cita</h2>" +
      (proximaCita
        ? '<p class="icc-cita-cliente" style="font-size:16px;margin:6px 0">' + U.escapeHtml(proximaCita.cliente_nombre) + "</p>" +
          '<p class="icc-muted">' + formatearCuentaAtras(proximaCita) + "</p>" +
          '<a class="icc-link-btn" href="#/agenda?fecha=' + proximaCita.fecha + '">Ver en la agenda</a>'
        : '<p class="icc-empty">No tienes ninguna cita proxima.</p>') +
      "</section>" +
      "</div>";

    var btnDashboardNuevaCita = document.getElementById("btn-dashboard-nueva-cita");
    if (btnDashboardNuevaCita) btnDashboardNuevaCita.addEventListener("click", abrirModalCitaRapida);
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
      modalNuevoCliente();
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

  function modalNuevoCliente() {
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
        location.hash = "#/clientes/" + id;
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

    var puedeFiltrarComercial = window.icc.auth.esBackofficeOAdmin();

    main().innerHTML = '<div class="icc-loading">Cargando contratos…</div>';
    var contratos = await D.listarContratos(filtros);
    var agentes = puedeFiltrarComercial ? await D.listarAgentes({}) : [];

    main().innerHTML =
      '<div class="icc-page-head"><h1>Contratos</h1>' +
      '<div><button class="icc-btn icc-btn-ghost" id="btn-exportar-contratos-csv">⬇ Exportar CSV</button> ' +
      '<button class="icc-btn icc-btn-ghost" id="btn-exportar-contratos-xlsx">⬇ Exportar Excel</button> ' +
      '<button class="icc-btn icc-btn-primary" id="btn-nuevo-contrato">+ Nuevo contrato</button></div></div>' +
      '<div class="icc-card">' +
      '<form id="form-filtros-contrato" class="icc-filtros-row">' +
      '<input class="icc-input" name="q" placeholder="Buscar por numero, titular o CIF" value="' + U.escapeHtml(filtros.q || "") + '">' +
      '<select class="icc-select" name="sector"><option value="">Todos los sectores</option>' +
      Object.keys(C.SECTORES)
        .map(function (s) {
          return '<option value="' + s + '"' + (filtros.sector === s ? " selected" : "") + ">" + C.SECTORES[s] + "</option>";
        })
        .join("") +
      "</select>" +
      '<select class="icc-select" name="estado"><option value="">Todos los estados</option>' +
      C.ESTADOS_CONTRATO_ORDEN.map(function (e) {
        return '<option value="' + e + '"' + (filtros.estado === e ? " selected" : "") + ">" + C.ESTADOS_CONTRATO[e].label + "</option>";
      }).join("") +
      "</select>" +
      (puedeFiltrarComercial
        ? '<select class="icc-select" name="comercial_id"><option value="">Todos los comerciales</option>' +
          agentes
            .map(function (a) { return '<option value="' + a.id + '"' + (filtros.comercial_id === String(a.id) ? " selected" : "") + ">" + U.escapeHtml(a.nombre) + "</option>"; })
            .join("") +
          "</select>"
        : "") +
      '<input class="icc-input" name="comercializadora" placeholder="Compañia" value="' + U.escapeHtml(filtros.comercializadora || "") + '">' +
      '<input class="icc-input" name="tarifa" placeholder="Tarifa" value="' + U.escapeHtml(filtros.tarifa || "") + '">' +
      '<input class="icc-input" type="date" name="desde" value="' + U.escapeHtml(filtros.desde || "") + '">' +
      '<input class="icc-input" type="date" name="hasta" value="' + U.escapeHtml(filtros.hasta || "") + '">' +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      "</form></div>" +
      '<div class="icc-card icc-table-wrap">' +
      (contratos.length ? tablaContratos(contratos) : '<p class="icc-empty">No hay contratos con estos filtros.</p>') +
      "</div>";

    document.getElementById("form-filtros-contrato").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var qs = new URLSearchParams();
      fd.forEach(function (v, k) {
        if (v) qs.set(k, v);
      });
      location.hash = "#/contratos" + (qs.toString() ? "?" + qs.toString() : "");
    });
    document.getElementById("btn-nuevo-contrato").addEventListener("click", function () {
      modalContrato(null);
    });
    function exportarContratos(formato) {
      var fd = new FormData(document.getElementById("form-filtros-contrato"));
      var filtrosActuales = { formato: formato };
      fd.forEach(function (v, k) {
        if (v) filtrosActuales[k] = v;
      });
      window.open(D.urlExportarContratos(filtrosActuales), "_blank");
    }
    document.getElementById("btn-exportar-contratos-csv").addEventListener("click", function () {
      exportarContratos("csv");
    });
    document.getElementById("btn-exportar-contratos-xlsx").addEventListener("click", function () {
      exportarContratos("xlsx");
    });
    main()
      .querySelectorAll("[data-contrato-id]")
      .forEach(function (row) {
        row.addEventListener("click", function () {
          var c = contratos.filter(function (x) {
            return String(x.id) === row.getAttribute("data-contrato-id");
          })[0];
          if (c) modalContrato(c);
        });
      });
  }

  function tablaContratos(contratos) {
    return (
      '<table class="icc-table"><thead><tr>' +
      "<th>Numero</th><th>Titular</th><th>Sector</th><th>Compañia</th><th>Tarifa</th><th>kW</th><th>Estado</th><th>Alta</th>" +
      "</tr></thead><tbody>" +
      contratos
        .map(function (c) {
          var meta = C.ESTADOS_CONTRATO[c.estado] || { label: c.estado, color: "#94a3b8" };
          return (
            '<tr data-contrato-id="' + c.id + '">' +
            "<td>" + U.escapeHtml(c.numero_contrato || "-") + "</td>" +
            "<td><strong>" + U.escapeHtml(c.titular) + "</strong><br><span class=\"icc-muted\">" + U.escapeHtml(c.cif_titular || "") + "</span></td>" +
            "<td>" + U.escapeHtml(C.SECTORES[c.sector] || c.sector || "-") + "</td>" +
            "<td>" + U.escapeHtml(c.comercializadora || "-") + "</td>" +
            "<td>" + U.escapeHtml(c.tarifa || "-") + "</td>" +
            "<td>" + (c.kw || "-") + "</td>" +
            '<td><span class="icc-badge" style="--badge-color:' + meta.color + '">' + U.escapeHtml(meta.label) + "</span></td>" +
            "<td>" + U.formatFecha(c.fecha_alta) + "</td>" +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table>"
    );
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
      (esNuevo ? "" : '<button type="button" class="icc-btn icc-btn-ghost" id="btn-borrar-contrato" style="margin-right:auto;color:var(--red)">Borrar</button>') +
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
      return a.rol === "jefe_de_equipo" || a.rol === "admin" || a.rol === "super_admin";
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
      return a.rol === "admin" || a.rol === "super_admin";
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
  function modalAsignarComerciales(backoffice, agentes, asignados, alGuardar) {
    var marcados = (asignados || []).map(String);
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
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Guardar</button>' +
      "</div></form>"
    );

    var form = document.getElementById("form-asignar-comerciales");
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
      var ids = Array.prototype.map.call(form.querySelectorAll('input[name="comercial"]:checked'), function (i) { return Number(i.value); });
      try {
        await D.guardarAsignacionesBackoffice(backoffice.id, ids);
        U.toast(ids.length ? "Comerciales asignados guardados" : "Sin comerciales asignados: verá toda la empresa", "success");
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
    var esSuperAdmin = window.icc.auth.esSuperAdmin();
    var rolesDisponibles = esSuperAdmin
      ? Object.keys(C.ROLES)
      : Object.keys(C.ROLES).filter(function (r) { return r !== "admin" && r !== "super_admin"; });

    U.openModal(
      "<h2>Nuevo usuario</h2>" +
      (!esAdmin ? '<p class="icc-muted">Se creará como Comercial / Agente dentro de tu equipo y podrás gestionar su cuenta y su ficha.</p>' : "") +
      '<form id="form-nuevo-agente" class="icc-form">' +
      campoTexto("nombre", "Nombre", true, "text") +
      campoTexto("apellidos", "Apellidos", false, "text") +
      campoTexto("email", "Email", true, "email") +
      campoTexto("password", "Contrasena provisional", true, "text", passwordProvisional()) +
      campoTexto("telefono", "Telefono", false, "text") +
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
        : '<input type="hidden" name="rol" value="comercial">') +
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
      if (esAdmin && payload.rol === "comercial" && fd.get("supervisor_id")) {
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

  async function viewAgentes() {
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var filtros = {};
    ["bloqueado", "nombre", "apellidos", "tipo", "empresa", "cif", "telefono"].forEach(function (k) {
      if (params.get(k) !== null && params.get(k) !== "") filtros[k] = params.get(k);
    });

    main().innerHTML = '<div class="icc-loading">Cargando agentes…</div>';
    var agentes = await D.listarAgentes(filtros);
    var esAdmin = window.icc.auth.esAdminOSuperior();
    // null = falta la migracion de asignaciones de Backoffice (se oculta el boton).
    var asignacionesBo = esAdmin ? await D.listarAsignacionesBackoffice().catch(function () { return null; }) : null;
    // Para el desplegable de asignacion hace falta la lista completa de
    // comerciales, aunque Agentes este filtrado.
    var todosAgentes = esAdmin && Object.keys(filtros).length ? await D.listarAgentes({}).catch(function () { return agentes; }) : agentes;
    var miUsuario = window.icc.auth.state.user || {};
    var avisoBackoffice = miUsuario.rol === "backoffice" && Number(miUsuario.comerciales_asignados) > 0;
    var esSuperAdmin = window.icc.auth.esSuperAdmin();
    var esJefeDeEquipo = window.icc.auth.tieneRol("jefe_de_equipo");
    var jefePuedeCrear = esJefeDeEquipo && window.icc.auth.puede("usuarios.crear");
    var jefeGestiona = esJefeDeEquipo && window.icc.auth.puede("usuarios.gestionar");
    var jefeVerComo = esJefeDeEquipo && window.icc.auth.puede("usuarios.ver_como");
    var miId = window.icc.auth.state.user && window.icc.auth.state.user.id;
    // Comercial de mi propio equipo (lo que un Jefe de equipo puede gestionar).
    function esDeMiEquipo(a) {
      return esJefeDeEquipo && a.rol === "comercial" && String(a.supervisor_id) === String(miId);
    }
    var rolesParaAdmin = esSuperAdmin
      ? Object.keys(C.ROLES)
      : Object.keys(C.ROLES).filter(function (r) { return r !== "admin" && r !== "super_admin"; });
    // Misma regla que api/ficha_agente.php: la ficha la abren el propio
    // agente, su Jefe de equipo y Admin/Super Admin (Admin no abre la de otro Admin).
    function puedeVerFicha(a) {
      if (String(a.id) === String(miId) || esSuperAdmin) return true;
      if (esAdmin) return a.rol !== "admin" && a.rol !== "super_admin";
      return esJefeDeEquipo && String(a.supervisor_id) === String(miId);
    }

    main().innerHTML =
      '<div class="icc-page-head"><h1>Agentes</h1><div>' +
      (esAdmin ? '<a class="icc-link-btn" href="#/auditoria-ver-como" style="margin-right:14px">🕵️ Historial de "Ver como"</a>' : "") +
      (esAdmin || jefePuedeCrear ? '<button class="icc-btn icc-btn-primary" id="btn-nuevo-agente">Nuevo usuario</button>' : "") +
      "</div></div>" +
      '<div class="icc-card">' +
      '<form id="form-filtros-agente" class="icc-filtros-row">' +
      '<input class="icc-input" name="nombre" placeholder="Nombre" value="' + U.escapeHtml(filtros.nombre || "") + '">' +
      '<input class="icc-input" name="apellidos" placeholder="Apellidos" value="' + U.escapeHtml(filtros.apellidos || "") + '">' +
      '<input class="icc-input" name="empresa" placeholder="Empresa" value="' + U.escapeHtml(filtros.empresa || "") + '">' +
      '<input class="icc-input" name="cif" placeholder="CIF" value="' + U.escapeHtml(filtros.cif || "") + '">' +
      '<input class="icc-input" name="telefono" placeholder="Telefono" value="' + U.escapeHtml(filtros.telefono || "") + '">' +
      '<select class="icc-select" name="bloqueado"><option value="">Bloqueado: todos</option>' +
      '<option value="0"' + (filtros.bloqueado === "0" ? " selected" : "") + ">Activos</option>" +
      '<option value="1"' + (filtros.bloqueado === "1" ? " selected" : "") + ">Bloqueados</option>" +
      "</select>" +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      "</form></div>" +
      (avisoBackoffice
        ? '<div class="icc-card"><p class="icc-muted" style="margin:0">Te aparecen solo los comerciales que te ha asignado un Admin; ' +
          "verás únicamente sus clientes, contratos, presupuestos, agenda e informes.</p></div>"
        : "") +
      '<div class="icc-card icc-table-wrap"><table class="icc-table"><thead><tr>' +
      "<th>Nombre</th><th>Email</th><th>Empresa / CIF</th><th>Telefono</th><th>Rol</th><th>Jefe de equipo / Responsable / Comerciales</th><th>Estado</th>" +
      (esAdmin || esJefeDeEquipo ? "<th></th>" : "") +
      "</tr></thead><tbody>" +
      agentes
        .map(function (a) {
          var dispAgente = a.estado_disponibilidad && a.estado_disponibilidad !== "disponible" ? C.ESTADOS_DISPONIBILIDAD[a.estado_disponibilidad] : null;
          var nombreCompleto =
            '<span class="icc-agente-nombre">' + U.avatar(a, 30) + "<span>" + U.escapeHtml(a.nombre + " " + (a.apellidos || "")) +
            (dispAgente ? '<br><span class="icc-badge" style="--badge-color:' + dispAgente.color + '">' + dispAgente.label + "</span>" : "") +
            "</span></span>";
          var esObjetivoAdminTier = a.rol === "admin" || a.rol === "super_admin";
          var esYoMismo = String(a.id) === String(miId);
          // Un Admin normal no puede gestionar (rol/bloqueo/ver como/borrar)
          // ninguna cuenta de Admin o Super Admin, ni siquiera la suya propia
          // (eso lo decide abajo cada boton por separado); eso es exclusivo
          // de Super Admin.
          var puedeGestionarFila = esSuperAdmin || (esAdmin && (!esObjetivoAdminTier || esYoMismo));
          return (
            "<tr><td>" +
            (puedeVerFicha(a)
              ? '<a class="icc-link-btn" href="#/agentes/' + a.id + '" title="Abrir la ficha de este agente">' + nombreCompleto + "</a>"
              : esAdmin || esJefeDeEquipo
                ? '<a class="icc-link-btn" href="#/clientes?comercial_id=' + a.id + '" title="Ver las cuentas de este agente">' + nombreCompleto + "</a>"
                : nombreCompleto) +
            "</td>" +
            "<td>" + U.escapeHtml(a.email) + "</td>" +
            "<td>" + U.escapeHtml(a.empresa || "-") + "<br><span class=\"icc-muted\">" + U.escapeHtml(a.cif || "") + "</span></td>" +
            "<td>" + U.escapeHtml(a.telefono || "-") + "</td>" +
            "<td>" +
            (puedeGestionarFila && !esYoMismo
              ? '<select class="icc-select" data-rol-id="' + a.id + '">' +
                rolesParaAdmin
                  .map(function (r) {
                    return '<option value="' + r + '"' + (a.rol === r ? " selected" : "") + ">" + C.ROLES[r] + "</option>";
                  })
                  .join("") +
                "</select>"
              : U.escapeHtml(C.ROLES[a.rol] || a.rol)) +
            "</td>" +
            "<td>" +
            (a.rol === "backoffice" && esAdmin && asignacionesBo
              ? '<button type="button" class="icc-btn icc-btn-ghost" data-asignar-bo-id="' + a.id + '">👥 ' +
                ((asignacionesBo[a.id] || []).length
                  ? (asignacionesBo[a.id].length === 1 ? "1 comercial asignado" : asignacionesBo[a.id].length + " comerciales asignados")
                  : "Toda la empresa") +
                "</button>"
              : a.rol !== "comercial" && a.rol !== "jefe_de_equipo"
              ? '<span class="icc-muted">-</span>'
              : esAdmin
                ? '<select class="icc-select" data-supervisor-id="' + a.id + '">' +
                  (a.rol === "comercial" ? opcionesJefesEquipo(agentes, a.supervisor_id) : opcionesResponsablesJefe(agentes, a.supervisor_id)) +
                  "</select>"
                : U.escapeHtml((agentes.filter(function (j) { return String(j.id) === String(a.supervisor_id); })[0] || {}).nombre || a.supervisor_nombre || "Sin asignar")) +
            "</td>" +
            "<td>" +
            (puedeGestionarFila || (jefeGestiona && esDeMiEquipo(a))
              ? '<button class="icc-btn icc-btn-ghost" data-bloqueo-id="' + a.id + '" data-bloqueado="' + a.bloqueado + '">' +
                (Number(a.bloqueado) ? "Desbloquear" : "Bloquear") +
                "</button>"
              : Number(a.bloqueado)
                ? '<span class="icc-muted">Bloqueado</span>'
                : '<span class="icc-muted">Activo</span>') +
            "</td>" +
            (esAdmin
              ? "<td>" +
                (puedeGestionarFila && !esYoMismo
                  ? '<button type="button" class="icc-link-btn" data-ver-como-id="' + a.id + '">👁️ Ver como</button> '
                  : "") +
                (puedeGestionarFila && !esYoMismo
                  ? '<button type="button" class="icc-link-btn" style="color:var(--red)" data-borrar-agente-id="' + a.id + '">Borrar</button>'
                  : "") +
                "</td>"
              : esJefeDeEquipo
                ? "<td>" +
                  (esDeMiEquipo(a)
                    ? '<a class="icc-link-btn" href="#/agentes/' + a.id + '/informacion">⚙️ Gestionar</a> ' +
                      (jefeVerComo && !Number(a.bloqueado) ? '<button type="button" class="icc-link-btn" data-ver-como-id="' + a.id + '">👁️ Ver como</button>' : "")
                    : "") +
                  "</td>"
                : "") +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";

    document.getElementById("form-filtros-agente").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var qs = new URLSearchParams();
      fd.forEach(function (v, k) {
        if (v) qs.set(k, v);
      });
      location.hash = "#/agentes" + (qs.toString() ? "?" + qs.toString() : "");
    });

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
          }
        });
      });
    main()
      .querySelectorAll("[data-asignar-bo-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          var boId = btn.getAttribute("data-asignar-bo-id");
          var bo = agentes.filter(function (a) { return String(a.id) === boId; })[0];
          modalAsignarComerciales(bo, todosAgentes, asignacionesBo[boId] || [], viewAgentes);
        });
      });
    main()
      .querySelectorAll("[data-supervisor-id]")
      .forEach(function (sel) {
        sel.addEventListener("change", async function () {
          try {
            await D.actualizarAgente(sel.getAttribute("data-supervisor-id"), { supervisor_id: sel.value || null });
            U.toast("Jefe de equipo actualizado", "success");
            viewAgentes();
          } catch (err) {
            U.toast(err.message || "No se pudo actualizar", "error");
            viewAgentes();
          }
        });
      });
    main()
      .querySelectorAll("[data-bloqueo-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var bloqueadoActual = Number(btn.getAttribute("data-bloqueado"));
          try {
            await D.actualizarAgente(btn.getAttribute("data-bloqueo-id"), { bloqueado: bloqueadoActual ? 0 : 1 });
            U.toast(bloqueadoActual ? "Agente desbloqueado" : "Agente bloqueado", "success");
            viewAgentes();
          } catch (err) {
            U.toast(err.message || "No se pudo actualizar", "error");
          }
        });
      });

    main()
      .querySelectorAll("[data-borrar-agente-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (!confirm("¿Eliminar esta cuenta? Solo se puede si no tiene clientes, contratos, proformas ni equipo asociados. No se puede deshacer.")) return;
          try {
            await D.borrarAgente(btn.getAttribute("data-borrar-agente-id"));
            U.toast("Cuenta eliminada", "success");
            viewAgentes();
          } catch (err) {
            U.toast(err.message || "No se pudo eliminar", "error");
          }
        });
      });

    main()
      .querySelectorAll("[data-ver-como-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-ver-como-id");
          var agente = agentes.filter(function (a) { return String(a.id) === id; })[0];
          entrarComo(id, agente ? agente.nombre : "");
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
  function barraObjetivo(valor, objetivo, formato) {
    var v = Number(valor || 0);
    var o = Number(objetivo || 0);
    var texto = formato(v) + (o ? " / " + formato(o) : "");
    if (!o) return '<span class="icc-stat-value">' + texto + "</span>";
    var pct = Math.min(100, Math.round((v / o) * 100));
    var color = pct >= 100 ? "var(--esmeralda)" : pct >= 60 ? "var(--cian)" : "var(--oro)";
    return (
      '<span class="icc-stat-value">' + texto + "</span>" +
      '<div class="icc-progress"><div class="icc-progress-fill" style="width:' + pct + "%;background:" + color + '"></div></div>' +
      '<span class="icc-muted" style="font-size:11px">' + pct + "% del objetivo</span>"
    );
  }

  function tarjetaFicha(label, contenidoHtml, color) {
    return (
      '<div class="icc-stat-card" style="--stat-color:' + (color || "var(--esmeralda)") + '">' +
      contenidoHtml +
      '<span class="icc-stat-label">' + label + "</span></div>"
    );
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

    cont.innerHTML =
      '<div class="icc-ficha-toolbar">' +
      '<p class="icc-ficha-privada">🔒 Resumen privado: solo lo ven ' + (esPropia ? "tú" : U.escapeHtml(a.nombre)) +
      ", su jefe de equipo y dirección.</p>" +
      '<div class="icc-head-actions icc-ficha-acciones">' +
      '<a class="icc-btn icc-btn-ghost" href="#/clientes?comercial_id=' + a.id + '">Clientes</a>' +
      '<a class="icc-btn icc-btn-ghost" href="#/contratos?comercial_id=' + a.id + '">Contratos</a>' +
      '<a class="icc-btn icc-btn-ghost" href="#/agenda?comercial_id=' + a.id + '">Agenda</a>' +
      (datos.carpeta_personal_id ? '<a class="icc-btn icc-btn-ghost" href="#/ficheros/' + datos.carpeta_personal_id + '">Carpeta personal</a>' : "") +
      "</div></div>" +

      '<div class="icc-stat-grid">' +
      tarjetaFicha("Contratos este mes", barraObjetivo(r.contratos.mes, f.objetivo_contratos_mes, num), "var(--esmeralda)") +
      tarjetaFicha("kW este mes", barraObjetivo(r.contratos.kw_mes, f.objetivo_kw_mes, num), "var(--cian)") +
      tarjetaFicha("Facturado este mes", barraObjetivo(r.proformas.facturado_mes, f.objetivo_facturacion_mes, U.formatEur), "var(--oro)") +
      tarjetaFicha("Pendiente de cobro", '<span class="icc-stat-value">' + U.formatEur(r.proformas.pendiente_cobro) + "</span>", "#f87171") +
      tarjetaFicha("Clientes activos", '<span class="icc-stat-value">' + (clientesPorEstado.cliente_activo || 0) + "</span>", "#34d399") +
      tarjetaFicha("Clientes en curso", '<span class="icc-stat-value">' + enCurso + "</span>", "#60a5fa") +
      tarjetaFicha("Presupuestos abiertos", '<span class="icc-stat-value">' + Number(r.presupuestos.abiertos || 0) + "</span>", "#a78bfa") +
      tarjetaFicha("Próximas citas", '<span class="icc-stat-value">' + Number(r.citas.proximas || 0) + "</span>", "#fbbf24") +
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
                "<tr><td>" + U.escapeHtml(c.titular) + "</td><td>" + U.escapeHtml(C.SECTORES[c.sector] || c.sector) + "</td><td>" +
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
                '<div class="icc-data-row"><span>' + U.escapeHtml(c.cliente_nombre) + "</span>" +
                '<span class="icc-muted">' + U.formatFecha(c.fecha) + " · " + String(c.hora_inicio || "").slice(0, 5) + "</span></div>"
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

    main().innerHTML =
      (window.icc.auth.esBackofficeOAdmin() ? '<a href="#/agentes" class="icc-back">← Volver a Agentes</a>' : "") +
      '<div class="icc-uficha">' +
      '<header class="icc-uficha-head">' +
      U.avatar(u, 64) +
      '<div class="icc-uficha-titulo">' +
      "<h1>" + U.escapeHtml(nombreCompleto) + " " +
      (Number(u.bloqueado) ? badgeColor("Bloqueado", "#f87171") : badgeColor("Activo", "#34d399")) +
      (pref.estado_disponibilidad && pref.estado_disponibilidad !== "disponible" ? " " + badgeColor(disp.label, disp.color) : "") +
      "</h1>" +
      '<p class="icc-muted">' + U.escapeHtml(u.email) + " · " + U.escapeHtml(C.ROLES[u.rol] || u.rol) +
      (u.numero_relacion ? ' · relación <code>' + U.escapeHtml(u.numero_relacion) + "</code>" : "") +
      (datos.supervisor ? " · Depende de " + U.escapeHtml(datos.supervisor.nombre) : "") +
      "</p></div>" +
      (puede.ver_como ? '<button type="button" class="icc-btn icc-btn-ghost icc-uficha-vercomo" id="btn-ficha-ver-como">👁️ Ver como</button>' : "") +
      "</header>" +
      '<div class="icc-uficha-body">' +
      '<nav class="icc-uficha-menu">' +
      secciones
        .map(function (s) {
          return (
            '<a class="icc-uficha-menu-item' + (s.clave === fichaActual.seccion ? " is-active" : "") + '" href="' + base + "/" + s.clave + '">' +
            '<span class="ico">' + s.icono + "</span>" + s.label + "</a>"
          );
        })
        .join("") +
      '<p class="icc-uficha-pie">Alta ' + U.formatFecha(u.created_at) +
      (u.ultimo_acceso !== undefined ? " · último acceso " + U.haceCuanto(u.ultimo_acceso) : "") + "</p>" +
      "</nav>" +
      '<section class="icc-uficha-panel" id="ficha-panel"></section>' +
      "</div></div>";

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
      (opciones.placeholder ? ' placeholder="' + U.escapeHtml(opciones.placeholder) + '"' : "") + ">" +
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
      return esSuperAdmin || (r !== "admin" && r !== "super_admin");
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
        ? '<form id="form-cambiar-password" class="icc-form icc-card" style="margin-top:12px">' +
          "<h3>Cambiar mi contraseña</h3>" +
          '<div class="icc-form-grid">' +
          campoFicha("actual", "Contraseña actual", "", { tipo: "password", requerido: true }) +
          campoFicha("nueva", "Nueva contraseña", "", { tipo: "password", requerido: true, ayuda: "Mínimo 8 caracteres, con letras y números." }) +
          campoFicha("repetir", "Repite la nueva", "", { tipo: "password", requerido: true }) +
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

    var arbol, ficheros;
    try {
      arbol = await D.listarCarpetasFicheros(carpetaId || null);
      ficheros = carpetaId ? await D.listarFicheros(carpetaId) : [];
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + U.escapeHtml(err.message || "No se pudo abrir esta carpeta") + "</p>";
      return;
    }

    var actual = arbol.actual; // null en la raiz
    var ruta = arbol.ruta || [];
    var carpetas = arbol.carpetas || [];
    var puedeSubirAqui = actual ? actual.puede_subir : false;
    var puedeCrearCarpeta = window.icc.auth.puede("ficheros.subir") && (!actual || !actual.es_personal);

    var migas =
      '<a class="icc-tab' + (!carpetaId ? " is-active" : "") + '" href="#/ficheros">🏠 Raiz</a>' +
      ruta
        .map(function (r, i) {
          return (
            '<a class="icc-tab' + (i === ruta.length - 1 ? " is-active" : "") + '" href="#/ficheros/' + r.id + '">' +
            U.escapeHtml(r.nombre) +
            "</a>"
          );
        })
        .join("");

    var padreHref = ruta.length > 1 ? "#/ficheros/" + ruta[ruta.length - 2].id : "#/ficheros";

    main().innerHTML =
      '<div class="icc-page-head"><h1>Ficheros' + (actual ? " · " + U.escapeHtml(actual.nombre) : "") + "</h1>" +
      (carpetaId
        ? '<div><a class="icc-btn icc-btn-secondary" href="' + padreHref + '">← Volver atrás</a> ' +
          '<a class="icc-btn icc-btn-secondary" href="#/ficheros">Fichero Raíz</a></div>'
        : esAdmin
        ? '<a class="icc-link-btn" href="#/diagnostico-storage">🔍 Comprobar archivos que faltan</a> ' +
          '<a class="icc-link-btn" href="#/copias-seguridad">🗄️ Copias de seguridad</a>'
        : "") +
      "</div>" +
      '<div class="icc-tabs">' + migas + "</div>" +
      (actual && actual.es_personal
        ? '<p class="icc-muted" style="margin:8px 0">🔒 Carpeta personal de facturación — solo visible para ' +
          U.escapeHtml(actual.propietario_nombre || "su titular") + " y Administración."
        : "") +
      '<div class="icc-card">' +
      (puedeCrearCarpeta
        ? '<form id="form-nueva-carpeta" class="icc-doc-actions"><input class="icc-input" name="nombre" placeholder="Nombre de la nueva carpeta" required><button class="icc-btn icc-btn-secondary" type="submit">+ Nueva carpeta</button></form>'
        : "") +
      (carpetas.length
        ? '<ul class="icc-doc-list" style="margin-top:14px">' +
          carpetas
            .map(function (c) {
              return (
                '<li><a class="icc-link-btn" style="margin-left:0" href="#/ficheros/' + c.id + '">📁 ' + U.escapeHtml(c.nombre) +
                (c.es_personal ? " 🔒" : "") + "</a>" +
                (window.icc.auth.puede("ficheros.borrar") && !c.es_personal
                  ? '<button type="button" class="icc-link-btn" style="color:var(--red)" data-borrar-carpeta-id="' + c.id + '">Borrar</button>'
                  : "") +
                "</li>"
              );
            })
            .join("") +
          "</ul>"
        : "") +
      (!carpetaId
        ? '<p class="icc-empty" style="margin-top:14px">Entra en una carpeta para ver y subir archivos.</p>'
        : "" +
          (puedeSubirAqui
            ? '<form id="form-subir-fichero" class="icc-doc-actions" style="margin-top:14px"><input class="icc-input" type="file" name="archivo" multiple required><button class="icc-btn icc-btn-secondary" type="submit">Subir archivo(s)</button></form>'
            : "") +
          (ficheros.length
            ? '<ul class="icc-doc-list" style="margin-top:14px">' +
              ficheros
                .map(function (f) {
                  return (
                    '<li class="icc-fichero-fila"><div class="icc-fichero-info"><span>' +
                    (f.existe === false ? "⚠️ " : "📄 ") + U.escapeHtml(f.nombre_archivo) +
                    (f.existe === false ? ' <span style="color:var(--red)">(no encontrado en el servidor)</span>' : "") +
                    "</span><span class=\"icc-muted\">" +
                    U.formatFecha(f.created_at) + "</span></div>" +
                    '<div class="icc-fichero-acciones">' +
                    (f.existe === false
                      ? ""
                      : '<a class="icc-link-btn" target="_blank" href="' + D.urlDescarga("ficheros", f.ruta_archivo) + '">Ver</a>' +
                        '<a class="icc-link-btn" href="' + D.urlDescarga("ficheros", f.ruta_archivo, true) + '">Descargar</a>') +
                    (window.icc.auth.puede("ficheros.borrar")
                      ? '<button type="button" class="icc-link-btn" style="color:var(--red)" data-borrar-fichero-id="' + f.id + '" data-huerfano="' + (f.existe === false ? "1" : "0") + '">' +
                        (f.existe === false ? "Borrar registro" : "Borrar") + "</button>"
                      : "") +
                    "</div></li>"
                  );
                })
                .join("") +
              "</ul>"
            : '<p class="icc-empty" style="margin-top:14px">Sin archivos en esta carpeta.</p>'));

    var formCarpeta = document.getElementById("form-nueva-carpeta");
    if (formCarpeta) {
      formCarpeta.addEventListener("submit", async function (e) {
        e.preventDefault();
        var nombre = e.target.nombre.value.trim();
        if (!nombre) return;
        try {
          await D.crearCarpetaFichero(nombre, carpetaId || null);
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
          if (!confirm("¿Borrar esta carpeta? Debe estar vacía.")) return;
          try {
            await D.borrarCarpetaFichero(btn.getAttribute("data-borrar-carpeta-id"));
            U.toast("Carpeta borrada", "success");
            viewFicheros(carpetaId);
          } catch (err) {
            U.toast(err.message || "No se pudo borrar la carpeta", "error");
          }
        });
      });

    var form = document.getElementById("form-subir-fichero");
    if (form) {
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var files = Array.prototype.slice.call(e.target.archivo.files);
        if (!files.length) return;
        var btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        var subidos = 0;
        var errores = [];
        for (var i = 0; i < files.length; i++) {
          btn.textContent = "Subiendo " + (i + 1) + "/" + files.length + "…";
          try {
            await D.subirFichero(carpetaId, files[i]);
            subidos++;
          } catch (err) {
            errores.push(files[i].name + ": " + (err.message || "error"));
          }
        }
        if (subidos) U.toast(subidos + " archivo" + (subidos > 1 ? "s" : "") + " subido" + (subidos > 1 ? "s" : ""), "success");
        errores.forEach(function (m) { U.toast(m, "error"); });
        viewFicheros(carpetaId);
      });
    }

    main()
      .querySelectorAll("[data-borrar-fichero-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var esHuerfano = btn.getAttribute("data-huerfano") === "1";
          // Un archivo ya "no encontrado en el servidor" no tiene nada fisico
          // que perder: se borra el registro directo, sin dialogo de
          // confirmacion (que en algunos navegadores/paneles no llega a
          // aparecer y da sensacion de boton bloqueado).
          if (!esHuerfano && !confirm("¿Borrar este archivo? No se puede deshacer.")) return;
          var textoOriginal = btn.textContent;
          btn.disabled = true;
          btn.textContent = "Borrando…";
          try {
            await D.borrarFichero(btn.getAttribute("data-borrar-fichero-id"));
            U.toast("Archivo borrado", "success");
            viewFicheros(carpetaId);
          } catch (err) {
            U.toast(err.message || "No se pudo borrar el archivo", "error");
            btn.disabled = false;
            btn.textContent = textoOriginal;
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
    var filtros = {};
    ["facturado_por", "estado_pago", "desde", "hasta", "numero", "email"].forEach(function (k) {
      if (params.get(k)) filtros[k] = params.get(k);
    });

    main().innerHTML = '<div class="icc-loading">Cargando proformas…</div>';
    var proformas = await D.listarProformas(filtros);
    var esAdmin = window.icc.auth.esAdminOSuperior();

    main().innerHTML =
      '<div class="icc-page-head"><h1>Proformas / Facturas</h1>' +
      '<button class="icc-btn icc-btn-primary" id="btn-nueva-proforma">+ Nueva proforma</button></div>' +
      '<div class="icc-card">' +
      '<form id="form-filtros-proforma" class="icc-filtros-row">' +
      '<input class="icc-input" name="numero" placeholder="Numero" value="' + U.escapeHtml(filtros.numero || "") + '">' +
      '<input class="icc-input" name="email" placeholder="Email cliente" value="' + U.escapeHtml(filtros.email || "") + '">' +
      '<select class="icc-select" name="facturado_por"><option value="">Facturado por: todos</option>' +
      Object.keys(C.FACTURADO_POR)
        .map(function (k) { return '<option value="' + k + '"' + (filtros.facturado_por === k ? " selected" : "") + ">" + C.FACTURADO_POR[k] + "</option>"; })
        .join("") +
      "</select>" +
      '<select class="icc-select" name="estado_pago"><option value="">Estado de pago: todos</option>' +
      Object.keys(C.ESTADO_PAGO)
        .map(function (k) { return '<option value="' + k + '"' + (filtros.estado_pago === k ? " selected" : "") + ">" + C.ESTADO_PAGO[k] + "</option>"; })
        .join("") +
      "</select>" +
      '<input class="icc-input" type="date" name="desde" value="' + U.escapeHtml(filtros.desde || "") + '">' +
      '<input class="icc-input" type="date" name="hasta" value="' + U.escapeHtml(filtros.hasta || "") + '">' +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      "</form></div>" +
      '<div class="icc-card icc-table-wrap">' +
      (proformas.length
        ? '<table class="icc-table"><thead><tr><th>Numero</th><th>Facturado por</th><th>Cliente</th><th>Importe</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>' +
          proformas
            .map(function (p) {
              return (
                "<tr><td>" + U.escapeHtml(p.numero) + "</td><td>" + U.escapeHtml(C.FACTURADO_POR[p.facturado_por] || p.facturado_por) + "</td>" +
                "<td>" + U.escapeHtml(p.cliente_email || "-") + "</td><td>" + U.formatEur(p.importe) + "</td>" +
                '<td><span class="icc-badge" style="--badge-color:' + (p.estado_pago === "pagada" ? "#34d399" : "#fbbf24") + '">' +
                C.ESTADO_PAGO[p.estado_pago] + "</span></td><td>" + U.formatFecha(p.fecha) + "</td>" +
                "<td>" +
                (p.estado_pago === "pendiente"
                  ? '<button class="icc-link-btn" data-pagar-id="' + p.id + '">Marcar pagada</button>'
                  : "") +
                (p.ruta_archivo
                  ? ' <a class="icc-link-btn" target="_blank" href="' + D.urlDescarga("proformas", p.ruta_archivo) + '">Ver</a>'
                  : "") +
                (window.icc.auth.puede("proformas.borrar")
                  ? ' <button type="button" class="icc-link-btn" style="color:var(--red)" data-borrar-proforma-id="' + p.id + '">Borrar</button>'
                  : "") +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table>"
        : '<p class="icc-empty">No hay proformas con estos filtros.</p>') +
      "</div>";

    document.getElementById("form-filtros-proforma").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var qs = new URLSearchParams();
      fd.forEach(function (v, k) {
        if (v) qs.set(k, v);
      });
      location.hash = "#/proformas" + (qs.toString() ? "?" + qs.toString() : "");
    });
    document.getElementById("btn-nueva-proforma").addEventListener("click", modalProforma);
    main()
      .querySelectorAll("[data-pagar-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          try {
            await D.actualizarProforma(btn.getAttribute("data-pagar-id"), { estado_pago: "pagada" });
            U.toast("Marcada como pagada", "success");
            viewProformas();
          } catch (err) {
            U.toast(err.message || "No se pudo actualizar", "error");
          }
        });
      });
    main()
      .querySelectorAll("[data-borrar-proforma-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (!confirm("¿Borrar esta proforma? No se puede deshacer.")) return;
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
      "<h2>Nueva proforma</h2>" +
      '<form id="form-proforma" class="icc-form">' +
      campoTexto("numero", "Numero", true) +
      '<div class="icc-field"><label>Facturado por</label><select class="icc-select" name="facturado_por" required>' +
      Object.keys(C.FACTURADO_POR).map(function (k) { return '<option value="' + k + '">' + C.FACTURADO_POR[k] + "</option>"; }).join("") +
      "</select></div>" +
      campoTexto("cliente_email", "Email del cliente", false, "email") +
      campoTexto("importe", "Importe (€)", false, "number") +
      campoTexto("fecha", "Fecha", true, "date") +
      '<div class="icc-field"><label>Adjuntar PDF (opcional)</label><input class="icc-input" type="file" name="archivo" accept="application/pdf"></div>' +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Crear</button>' +
      "</div></form>"
    );

    document.getElementById("form-proforma").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      try {
        await D.crearProforma(fd);
        U.closeModal();
        U.toast("Proforma creada", "success");
        viewProformas();
      } catch (err) {
        U.toast(err.message || "No se pudo crear la proforma", "error");
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

    main().innerHTML = '<div class="icc-loading">Cargando presupuestos…</div>';
    var esAdmin = window.icc.auth.esAdminOSuperior();
    var [presupuestos, clientes, agentes] = await Promise.all([
      D.listarPresupuestos(filtros),
      D.listarClientes(),
      esAdmin ? D.listarAgentes({}) : Promise.resolve([]),
    ]);

    main().innerHTML =
      '<div class="icc-page-head"><h1>Presupuestos</h1>' +
      '<button class="icc-btn icc-btn-primary" id="btn-nuevo-presupuesto-general">+ Nuevo presupuesto</button>' +
      "</div>" +
      '<div class="icc-card">' +
      '<form id="form-filtros-presupuesto" class="icc-filtros-row">' +
      '<select class="icc-select" name="estado"><option value="">Estado: todos</option>' +
      C.ESTADOS_PRESUPUESTO_ORDEN.map(function (e) {
        return '<option value="' + e + '"' + (filtros.estado === e ? " selected" : "") + ">" + C.ESTADOS_PRESUPUESTO[e].label + "</option>";
      }).join("") +
      "</select>" +
      '<select class="icc-select" name="sector"><option value="">Sector: todos</option>' +
      Object.keys(C.SECTORES).map(function (s) {
        return '<option value="' + s + '"' + (filtros.sector === s ? " selected" : "") + ">" + C.SECTORES[s] + "</option>";
      }).join("") +
      "</select>" +
      '<select class="icc-select" name="tipo_cliente"><option value="">Tipo de cliente: todos</option>' +
      Object.keys(C.TIPO_CLIENTE).map(function (t) {
        return '<option value="' + t + '"' + (filtros.tipo_cliente === t ? " selected" : "") + ">" + C.TIPO_CLIENTE[t] + "</option>";
      }).join("") +
      "</select>" +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      "</form></div>" +
      '<div class="icc-card icc-table-wrap"><table class="icc-table"><thead><tr>' +
      "<th>Cliente</th><th>Sector</th><th>Tipo</th><th>Comercial</th><th>Estado</th><th>Fecha</th><th></th>" +
      "</tr></thead><tbody>" +
      (presupuestos.length
        ? presupuestos
            .map(function (p) {
              var meta = C.ESTADOS_PRESUPUESTO[p.estado] || { label: p.estado, color: "#94a3b8" };
              return (
                "<tr><td>" + U.escapeHtml(p.razon_social) + '<br><span class="icc-muted">' + U.escapeHtml(p.cif) + "</span></td>" +
                "<td>" + U.escapeHtml(C.SECTORES[p.sector] || p.sector) + "</td>" +
                "<td>" + U.escapeHtml(C.TIPO_CLIENTE[p.tipo_cliente] || p.tipo_cliente) + "</td>" +
                "<td>" +
                (esAdmin
                  ? '<select class="icc-select" data-asignar-comercial="' + p.id + '"><option value="">Sin asignar</option>' +
                    agentes
                      .map(function (a) { return '<option value="' + a.id + '"' + (p.comercial_id === a.id ? " selected" : "") + ">" + U.escapeHtml(a.nombre) + "</option>"; })
                      .join("") +
                    "</select>"
                  : U.escapeHtml(p.comercial_nombre || "-")) +
                "</td>" +
                '<td><span class="icc-badge" style="--badge-color:' + meta.color + '">' + U.escapeHtml(meta.label) + "</span></td>" +
                "<td>" + U.formatFecha(p.created_at) + "</td>" +
                '<td><a class="icc-link-btn" href="#/presupuestos/' + p.id + '">Ver</a></td>' +
                "</tr>"
              );
            })
            .join("")
        : '<tr><td colspan="7"><p class="icc-empty">Sin presupuestos todavia.</p></td></tr>') +
      "</tbody></table></div>";

    document.getElementById("form-filtros-presupuesto").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var qs = new URLSearchParams();
      fd.forEach(function (v, k) {
        if (v) qs.set(k, v);
      });
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
          } catch (err) {
            U.toast(err.message || "No se pudo asignar", "error");
          } finally {
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
    main().innerHTML = '<div class="icc-loading">Cargando informes…</div>';
    var [cartera, kw, porTarifa, porComercializadora, porSector] = await Promise.all([
      D.informe("clientes_cartera"),
      D.informe("kw_cartera"),
      D.informe("por_tarifa"),
      D.informe("por_comercializadora"),
      D.informe("por_sector"),
    ]);
    porSector.datos.forEach(function (f) {
      f.sector = C.SECTORES[f.sector] || f.sector;
    });

    main().innerHTML =
      '<div class="icc-page-head"><h1>Informes / Reportes</h1></div>' +
      '<div class="icc-stat-grid">' +
      statCard("Clientes en cartera", cartera.clientes.length, "#34d399") +
      statCard("Total kW en cartera", (kw.total.total_kw || 0), "#22d3ee") +
      statCard("Total contratos", (kw.total.total_contratos || 0), "#d4a62a") +
      "</div>" +
      '<div class="icc-grid-2">' +
      '<section class="icc-card"><h2>Contratos por sector</h2>' +
      tablaSimple(porSector.datos, "sector", "total") +
      "</section>" +
      '<section class="icc-card"><h2>Contratos por tarifa</h2>' +
      tablaSimple(porTarifa.datos, "tarifa", "total") +
      "</section>" +
      '<section class="icc-card"><h2>Contratos por compañia</h2>' +
      tablaSimple(porComercializadora.datos, "comercializadora", "total") +
      "</section>" +
      "</div>" +
      '<section class="icc-card"><h2>kW por compañia</h2>' +
      tablaSimple(kw.por_comercializadora, "comercializadora", "total_kw") +
      "</section>" +
      '<section class="icc-card"><h2>Listado de clientes en cartera</h2>' +
      (cartera.clientes.length
        ? '<table class="icc-table"><thead><tr><th>Empresa</th><th>CIF</th><th>Sector</th></tr></thead><tbody>' +
          cartera.clientes
            .map(function (c) {
              return "<tr><td>" + U.escapeHtml(c.razon_social) + "</td><td>" + U.escapeHtml(c.cif) + "</td><td>" + U.escapeHtml(c.sector || "-") + "</td></tr>";
            })
            .join("") +
          "</tbody></table>"
        : '<p class="icc-empty">Sin clientes activos todavia.</p>') +
      "</section>";
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
