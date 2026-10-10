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
      return c.fecha === hoyIso() && (c.estado === "programada" || c.estado === "reprogramada");
    });
    var proximaCita = citasProximas
      .filter(function (c) { return c.estado === 'programada' || c.estado === 'reprogramada'; })
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

  function metaSectorCita(sector) {
    return C.SECTORES_CITA[sector] || { label: sector, color: "#94a3b8" };
  }

  function metaEstadoCita(estado) {
    return C.ESTADOS_CITA[estado] || { label: estado, color: "#94a3b8" };
  }

  function tarjetaCita(c, esGestor) {
    var sectorMeta = metaSectorCita(c.sector);
    var estadoMeta = metaEstadoCita(c.estado);
    var telHref = c.telefono ? "tel:" + c.telefono.replace(/\s+/g, "") : "";
    var mapsHref = c.direccion ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(c.direccion) : "";
    return (
      '<div class="icc-cita-card" style="--cita-color:' + sectorMeta.color + '">' +
      '<div class="icc-cita-head"><strong>' + horaCorta(c.hora_inicio) + "–" + horaCorta(c.hora_fin) + "</strong>" +
      '<span class="icc-badge" style="--badge-color:' + estadoMeta.color + '">' + U.escapeHtml(estadoMeta.label) + "</span></div>" +
      '<p class="icc-cita-cliente">' + U.escapeHtml(c.cliente_nombre) + "</p>" +
      (c.contacto_nombre || c.telefono
        ? '<p class="icc-muted">' + U.escapeHtml(c.contacto_nombre || "") + (c.telefono ? (c.contacto_nombre ? " · " : "") + U.escapeHtml(c.telefono) : "") + "</p>"
        : "") +
      (esGestor && c.comercial_nombre ? '<p class="icc-muted">👤 ' + U.escapeHtml(c.comercial_nombre) + "</p>" : "") +
      '<span class="icc-chip">' + U.escapeHtml(sectorMeta.label) + "</span>" +
      (c.notas ? '<p class="icc-muted" style="margin-top:4px">' + U.escapeHtml(c.notas) + "</p>" : "") +
      '<div class="icc-cita-acciones">' +
      (telHref ? '<a class="icc-link-btn" href="' + telHref + '">📞 Llamar</a>' : "") +
      (mapsHref ? '<a class="icc-link-btn" target="_blank" href="' + mapsHref + '">📍 Mapa</a>' : "") +
      '<button type="button" class="icc-link-btn" data-cita-editar="' + c.id + '">Editar</button>' +
      (c.estado !== "realizada"
        ? '<button type="button" class="icc-link-btn" style="color:var(--esmeralda)" data-cita-estado="' + c.id + '" data-nuevo-estado="realizada">✓ Realizada</button>'
        : "") +
      (c.estado !== "ko"
        ? '<button type="button" class="icc-link-btn" style="color:var(--red)" data-cita-estado="' + c.id + '" data-nuevo-estado="ko">✕ KO</button>'
        : "") +
      '<button type="button" class="icc-link-btn" style="color:var(--red)" data-cita-borrar="' + c.id + '">Borrar</button>' +
      "</div></div>"
    );
  }

  function tarjetaCitaCompacta(c, esGestor) {
    var sectorMeta = metaSectorCita(c.sector);
    return (
      '<button type="button" class="icc-cita-chip-compacta" style="--cita-color:' + sectorMeta.color + '" data-cita-editar="' + c.id + '">' +
      '<span class="icc-cita-hora-mini">' + horaCorta(c.hora_inicio) + "</span> " +
      U.escapeHtml(c.cliente_nombre) +
      (esGestor && c.comercial_nombre ? " · " + U.escapeHtml(c.comercial_nombre) : "") +
      "</button>"
    );
  }

  async function viewAgenda() {
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var vista = params.get("vista") === "semana" ? "semana" : "dia";
    var fechaBase = /^\d{4}-\d{2}-\d{2}$/.test(params.get("fecha") || "") ? params.get("fecha") : hoyIso();
    var filtroComercial = params.get("comercial_id") || "";
    var filtroEstado = params.get("estado") || "";
    var filtroSector = params.get("sector") || "";
    var esGestor = window.icc.auth.esBackofficeOAdmin();

    main().innerHTML = '<div class="icc-loading">Cargando agenda…</div>';

    var inicioSemana = lunesDe(fechaBase);
    var rangoDesde = vista === "semana" ? isoDate(inicioSemana) : fechaBase;
    var rangoHasta = vista === "semana" ? isoDate(sumarDias(inicioSemana, 6)) : fechaBase;

    var filtros = { desde: rangoDesde, hasta: rangoHasta };
    if (filtroComercial) filtros.comercial_id = filtroComercial;
    if (filtroEstado) filtros.estado = filtroEstado;
    if (filtroSector) filtros.sector = filtroSector;

    var citas, agentes;
    try {
      var resultado = await Promise.all([D.listarCitas(filtros), esGestor ? D.listarAgentes({}) : Promise.resolve([])]);
      citas = resultado[0];
      agentes = resultado[1];
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + U.escapeHtml(err.message || "No se pudo cargar la agenda") + "</p>";
      return;
    }

    function hrefAgenda(cambios) {
      var p = new URLSearchParams();
      p.set("vista", vista);
      p.set("fecha", fechaBase);
      if (filtroComercial) p.set("comercial_id", filtroComercial);
      if (filtroEstado) p.set("estado", filtroEstado);
      if (filtroSector) p.set("sector", filtroSector);
      Object.keys(cambios).forEach(function (k) {
        if (cambios[k] === null || cambios[k] === "") p.delete(k);
        else p.set(k, cambios[k]);
      });
      return "#/agenda?" + p.toString();
    }

    var tituloFecha =
      vista === "semana"
        ? "Semana del " +
          inicioSemana.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) +
          " al " +
          sumarDias(inicioSemana, 6).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
        : fechaLocal(fechaBase).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

    var fechaAnterior = vista === "semana" ? isoDate(sumarDias(inicioSemana, -7)) : isoDate(sumarDias(fechaLocal(fechaBase), -1));
    var fechaSiguiente = vista === "semana" ? isoDate(sumarDias(inicioSemana, 7)) : isoDate(sumarDias(fechaLocal(fechaBase), 1));

    var contenidoVista;
    if (vista === "semana") {
      var nombresDia = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
      var porDia = {};
      for (var i = 0; i < 7; i++) porDia[isoDate(sumarDias(inicioSemana, i))] = [];
      citas.forEach(function (c) {
        if (porDia[c.fecha]) porDia[c.fecha].push(c);
      });
      contenidoVista =
        '<div class="icc-agenda-semana">' +
        nombresDia
          .map(function (nombre, i) {
            var dia = sumarDias(inicioSemana, i);
            var iso = isoDate(dia);
            var citasDia = porDia[iso].sort(function (a, b) {
              return a.hora_inicio.localeCompare(b.hora_inicio);
            });
            return (
              '<div class="icc-agenda-dia-col' + (iso === hoyIso() ? " is-hoy" : "") + '">' +
              '<div class="icc-agenda-dia-head"><strong>' + nombre + "</strong><span class=\"icc-muted\">" +
              String(dia.getDate()).padStart(2, "0") + "/" + String(dia.getMonth() + 1).padStart(2, "0") + "</span></div>" +
              (citasDia.length
                ? citasDia.map(function (c) { return tarjetaCitaCompacta(c, esGestor); }).join("")
                : '<p class="icc-empty" style="font-size:12px">Sin citas</p>') +
              "</div>"
            );
          })
          .join("") +
        "</div>";
    } else {
      var HORA_INICIO = 8, HORA_FIN = 20;
      var porHora = {};
      for (var h = HORA_INICIO; h <= HORA_FIN; h++) porHora[h] = [];
      var fueraDeRango = [];
      citas.forEach(function (c) {
        var hora = parseInt(horaCorta(c.hora_inicio).split(":")[0], 10);
        if (porHora[hora]) porHora[hora].push(c);
        else fueraDeRango.push(c);
      });
      var filas = [];
      for (var hh = HORA_INICIO; hh <= HORA_FIN; hh++) {
        var citasHora = porHora[hh].sort(function (a, b) {
          return a.hora_inicio.localeCompare(b.hora_inicio);
        });
        filas.push(
          '<div class="icc-agenda-hora-row"><div class="icc-agenda-hora-label">' + String(hh).padStart(2, "0") + ":00</div>" +
          '<div class="icc-agenda-hora-citas">' +
          (citasHora.length ? citasHora.map(function (c) { return tarjetaCita(c, esGestor); }).join("") : "") +
          "</div></div>"
        );
      }
      contenidoVista =
        '<div class="icc-agenda-timeline">' + filas.join("") + "</div>" +
        (fueraDeRango.length
          ? '<div class="icc-card" style="margin-top:14px"><h3>Fuera de horario habitual (antes de 08:00 o despues de 20:00)</h3>' +
            fueraDeRango.map(function (c) { return tarjetaCita(c, esGestor); }).join("") +
            "</div>"
          : "");
    }

    main().innerHTML =
      '<div class="icc-page-head"><h1>Agenda</h1>' +
      '<button class="icc-btn icc-btn-primary" id="btn-nueva-cita">+ Agendar cita</button></div>' +
      '<div class="icc-card">' +
      '<div class="icc-agenda-toolbar">' +
      '<div class="icc-tabs">' +
      '<a class="icc-tab' + (vista === "dia" ? " is-active" : "") + '" href="' + hrefAgenda({ vista: "dia" }) + '">Dia</a>' +
      '<a class="icc-tab' + (vista === "semana" ? " is-active" : "") + '" href="' + hrefAgenda({ vista: "semana" }) + '">Semana</a>' +
      "</div>" +
      '<div class="icc-agenda-nav">' +
      '<a class="icc-btn icc-btn-secondary" href="' + hrefAgenda({ fecha: fechaAnterior }) + '">←</a>' +
      '<a class="icc-btn icc-btn-secondary" href="' + hrefAgenda({ fecha: hoyIso() }) + '">Hoy</a>' +
      '<a class="icc-btn icc-btn-secondary" href="' + hrefAgenda({ fecha: fechaSiguiente }) + '">→</a>' +
      "</div></div>" +
      '<p class="icc-muted" style="margin-top:6px;text-transform:capitalize">' + tituloFecha + "</p>" +
      '<form id="form-filtros-agenda" class="icc-filtros-row" style="margin-top:10px">' +
      (esGestor
        ? '<select class="icc-select" name="comercial_id"><option value="">Todo el equipo</option>' +
          agentes
            .map(function (a) {
              return '<option value="' + a.id + '"' + (String(a.id) === filtroComercial ? " selected" : "") + ">" + U.escapeHtml(a.nombre) + "</option>";
            })
            .join("") +
          "</select>"
        : "") +
      '<select class="icc-select" name="estado"><option value="">Estado: todos</option>' +
      C.ESTADOS_CITA_ORDEN.map(function (e) {
        return '<option value="' + e + '"' + (e === filtroEstado ? " selected" : "") + ">" + C.ESTADOS_CITA[e].label + "</option>";
      }).join("") +
      "</select>" +
      '<select class="icc-select" name="sector"><option value="">Sector: todos</option>' +
      Object.keys(C.SECTORES_CITA)
        .map(function (s) {
          return '<option value="' + s + '"' + (s === filtroSector ? " selected" : "") + ">" + C.SECTORES_CITA[s].label + "</option>";
        })
        .join("") +
      "</select>" +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      "</form></div>" +
      contenidoVista;

    function recargar() {
      viewAgenda();
    }

    document.getElementById("btn-nueva-cita").addEventListener("click", function () {
      modalCita(null, { fecha: fechaBase, agentes: agentes, onGuardado: recargar });
    });

    document.getElementById("form-filtros-agenda").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      location.hash = hrefAgenda({
        comercial_id: fd.get("comercial_id") || "",
        estado: fd.get("estado") || "",
        sector: fd.get("sector") || "",
      });
    });

    main()
      .querySelectorAll("[data-cita-editar]")
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          var cita = citas.filter(function (c) { return String(c.id) === btn.getAttribute("data-cita-editar"); })[0];
          if (cita) modalCita(cita, { agentes: agentes, onGuardado: recargar });
        });
      });
    main()
      .querySelectorAll("[data-cita-estado]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          try {
            await D.actualizarCita(btn.getAttribute("data-cita-estado"), { estado: btn.getAttribute("data-nuevo-estado") });
            U.toast("Cita actualizada", "success");
            recargar();
          } catch (err) {
            U.toast(err.message || "No se pudo actualizar la cita", "error");
          }
        });
      });
    main()
      .querySelectorAll("[data-cita-borrar]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (!confirm("¿Borrar esta cita? No se puede deshacer.")) return;
          try {
            await D.borrarCita(btn.getAttribute("data-cita-borrar"));
            U.toast("Cita borrada", "success");
            recargar();
          } catch (err) {
            U.toast(err.message || "No se pudo borrar la cita", "error");
          }
        });
      });
  }

  function modalCita(cita, opts) {
    opts = opts || {};
    var esNueva = !cita;
    var esGestor = window.icc.auth.esBackofficeOAdmin();
    cita = cita || {
      fecha: opts.fecha || hoyIso(),
      sector: "energia",
      comercial_id: esGestor ? String(window.icc.auth.state.user.id) : "",
    };
    var agentes = opts.agentes || [];

    U.openModal(
      "<h2>" + (esNueva ? "Agendar cita" : "Editar cita") + "</h2>" +
      '<form id="form-cita" class="icc-form icc-form-grid2">' +
      campoTexto("cliente_nombre", "Negocio / Cliente", true, "text", cita.cliente_nombre) +
      (esGestor
        ? campoSelect(
            "comercial_id",
            "Comercial",
            agentes.map(function (a) { return { value: a.id, label: U.escapeHtml(a.nombre) }; }),
            String(cita.comercial_id || "")
          )
        : "") +
      campoTexto("contacto_nombre", "Persona de contacto", false, "text", cita.contacto_nombre) +
      campoTexto("telefono", "Telefono", false, "tel", cita.telefono) +
      '<div class="icc-field" style="grid-column:1/-1"><label>Dirección</label><textarea class="icc-textarea" name="direccion" rows="2">' +
      U.escapeHtml(cita.direccion || "") +
      "</textarea></div>" +
      campoSelect(
        "sector",
        "Sector",
        Object.keys(C.SECTORES_CITA).map(function (s) { return { value: s, label: C.SECTORES_CITA[s].label }; }),
        cita.sector
      ) +
      campoTexto("fecha", "Fecha", true, "date", cita.fecha) +
      '<div class="icc-field"><label>Hora inicio *</label><input class="icc-input" type="time" step="900" name="hora_inicio" value="' +
      horaCorta(cita.hora_inicio) + '" required></div>' +
      '<div class="icc-field"><label>Hora fin *</label><input class="icc-input" type="time" step="900" name="hora_fin" value="' +
      horaCorta(cita.hora_fin) + '" required></div>' +
      (!esNueva
        ? campoSelect(
            "estado",
            "Estado",
            C.ESTADOS_CITA_ORDEN.map(function (e) { return { value: e, label: C.ESTADOS_CITA[e].label }; }),
            cita.estado
          )
        : "") +
      '<div class="icc-field" style="grid-column:1/-1"><label>Notas</label><textarea class="icc-textarea" name="notas" rows="3">' +
      U.escapeHtml(cita.notas || "") +
      "</textarea></div>" +
      '<div class="icc-modal-actions" style="grid-column:1/-1">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">' + (esNueva ? "Guardar cita" : "Guardar cambios") + "</button>" +
      "</div></form>"
    );

    document.getElementById("form-cita").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var payload = {};
      ["cliente_nombre", "contacto_nombre", "telefono", "direccion", "sector", "fecha", "hora_inicio", "hora_fin", "notas"].forEach(function (k) {
        payload[k] = fd.get(k) || "";
      });
      if (esGestor && fd.get("comercial_id")) payload.comercial_id = fd.get("comercial_id");
      if (!esNueva) payload.estado = fd.get("estado");

      var btnSubmit = e.target.querySelector('button[type="submit"]');
      btnSubmit.disabled = true;
      try {
        var res = esNueva ? await D.crearCita(payload) : await D.actualizarCita(cita.id, payload);
        U.closeModal();
        U.toast(esNueva ? "Cita agendada" : "Cita actualizada", "success");
        if (res && res.aviso) U.toast(res.aviso, "info");
        if (opts.onGuardado) opts.onGuardado();
      } catch (err) {
        U.toast(err.message || "No se pudo guardar la cita", "error");
        btnSubmit.disabled = false;
      }
    });
  }

  async function abrirModalCitaRapida() {
    var esGestor = window.icc.auth.esBackofficeOAdmin();
    var agentes = esGestor ? await D.listarAgentes({}).catch(function () { return []; }) : [];
    modalCita(null, {
      agentes: agentes,
      onGuardado: function () {
        if (location.hash.indexOf("#/agenda") === 0) viewAgenda();
      },
    });
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
    var [cliente, documentos, estudios, firmas, auditoriasComparador, presupuestos] = await Promise.all([
      D.obtenerCliente(id),
      D.listarDocumentos(id),
      D.listarEstudios(id),
      D.listarFirmas(id),
      D.listarAuditoriasComparador(id).catch(function () { return []; }),
      D.listarPresupuestos({ cliente_id: id }).catch(function () { return []; }),
    ]);
    if (!cliente) {
      main().innerHTML = '<p class="icc-empty">Cliente no encontrado o sin acceso.</p>';
      return;
    }

    var puedeEstudio = window.icc.auth.esBackofficeOAdmin();
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
      "<h2>Comparador de ahorro</h2>" +
      '<div class="icc-doc-actions">' +
      '<button class="icc-btn icc-btn-secondary" id="btn-nueva-comparativa">+ Nueva comparativa</button>' +
      "</div>" +
      renderAuditoriasComparador(auditoriasComparador) +
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
      modalNuevaComparativa(cliente);
    });

    main()
      .querySelectorAll("[data-ver-comparativa-id]")
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-ver-comparativa-id");
          var auditoria = auditoriasComparador.filter(function (a) { return String(a.id) === id; })[0];
          if (auditoria) generarPdfComparativa(cliente, auditoria.sector, auditoria.datos_entrada, auditoria.resultado);
        });
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

  function renderAuditoriasComparador(auditorias) {
    if (!auditorias || !auditorias.length) {
      return '<p class="icc-empty">Aun no se ha generado ninguna comparativa para este cliente.</p>';
    }
    return (
      '<ul class="icc-doc-list">' +
      auditorias
        .map(function (a) {
          var ahorro = a.ahorro_anual != null ? U.formatEur(a.ahorro_anual) + "/año" : "";
          var pct = a.ahorro_porcentaje != null ? " (" + Number(a.ahorro_porcentaje).toFixed(1) + "%)" : "";
          return (
            "<li><span>💡 " +
            U.escapeHtml(C.COMPARADOR_SECTORES[a.sector] || a.sector) +
            (ahorro ? " · Ahorro estimado " + ahorro + pct : "") +
            "</span><span class=\"icc-muted\">" +
            U.formatFechaHora(a.created_at) +
            '</span><button type="button" class="icc-link-btn" data-ver-comparativa-id="' +
            a.id +
            '">Ver PDF</button></li>'
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function modalNuevaComparativa(cliente) {
    U.openModal(
      "<h2>Nueva comparativa</h2>" +
      '<p class="icc-muted">Elige el sector que quieres auditar para ' + U.escapeHtml(cliente.razon_social) + ".</p>" +
      '<div class="icc-form">' +
      Object.keys(C.COMPARADOR_SECTORES)
        .map(function (s) {
          return (
            '<button type="button" class="icc-btn icc-btn-secondary" style="width:100%;margin-bottom:8px" data-elegir-sector-comparador="' +
            s +
            '">' +
            C.COMPARADOR_SECTORES[s] +
            "</button>"
          );
        })
        .join("") +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      "</div></div>"
    );
    document.querySelectorAll("[data-elegir-sector-comparador]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sector = btn.getAttribute("data-elegir-sector-comparador");
        U.closeModal();
        location.hash = "#/comparador/nueva/" + cliente.id + "/" + sector;
      });
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

  function modalNuevoAgente(agentes) {
    var esAdmin = window.icc.auth.esAdminOSuperior();
    var esSuperAdmin = window.icc.auth.esSuperAdmin();
    var rolesDisponibles = esSuperAdmin
      ? Object.keys(C.ROLES)
      : Object.keys(C.ROLES).filter(function (r) { return r !== "admin" && r !== "super_admin"; });

    U.openModal(
      "<h2>Nuevo usuario</h2>" +
      (!esAdmin ? '<p class="icc-muted">Se creara como Comercial / Agente en tu propio equipo.</p>' : "") +
      '<form id="form-nuevo-agente" class="icc-form">' +
      campoTexto("nombre", "Nombre", true, "text") +
      campoTexto("apellidos", "Apellidos", false, "text") +
      campoTexto("email", "Email", true, "email") +
      campoTexto("password", "Contrasena provisional", true, "text") +
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
        await D.crearAgente(payload);
        U.toast("Usuario creado", "success");
        U.closeModal();
        viewAgentes();
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
    var esSuperAdmin = window.icc.auth.esSuperAdmin();
    var esJefeDeEquipo = window.icc.auth.tieneRol("jefe_de_equipo");
    var miId = window.icc.auth.state.user && window.icc.auth.state.user.id;
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
      (esAdmin || esJefeDeEquipo ? '<button class="icc-btn icc-btn-primary" id="btn-nuevo-agente">Nuevo usuario</button>' : "") +
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
      '<div class="icc-card icc-table-wrap"><table class="icc-table"><thead><tr>' +
      "<th>Nombre</th><th>Email</th><th>Empresa / CIF</th><th>Telefono</th><th>Rol</th><th>Jefe de equipo / Responsable</th><th>Estado</th>" +
      (esAdmin ? "<th></th>" : "") +
      "</tr></thead><tbody>" +
      agentes
        .map(function (a) {
          var nombreCompleto = U.escapeHtml(a.nombre + " " + (a.apellidos || ""));
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
            (a.rol !== "comercial" && a.rol !== "jefe_de_equipo"
              ? '<span class="icc-muted">-</span>'
              : esAdmin
                ? '<select class="icc-select" data-supervisor-id="' + a.id + '">' +
                  (a.rol === "comercial" ? opcionesJefesEquipo(agentes, a.supervisor_id) : opcionesResponsablesJefe(agentes, a.supervisor_id)) +
                  "</select>"
                : U.escapeHtml((agentes.filter(function (j) { return String(j.id) === String(a.supervisor_id); })[0] || {}).nombre || "Sin asignar")) +
            "</td>" +
            "<td>" +
            (puedeGestionarFila || (esJefeDeEquipo && a.rol === "comercial" && !esYoMismo)
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
        btn.addEventListener("click", async function () {
          var id = btn.getAttribute("data-ver-como-id");
          var agente = agentes.filter(function (a) { return String(a.id) === id; })[0];
          if (!confirm('¿Entrar como "' + (agente ? agente.nombre : "este usuario") + '"? Veras el CRM exactamente como lo ve el, hasta que pulses "Volver a mi cuenta".')) return;
          // Navega primero: si se cambia de usuario antes de cambiar el hash,
          // el repintado automatico (por el cambio de sesion) y el cambio de
          // hash compiten entre si y la pantalla se puede quedar a medias en
          // Agentes en vez de pasar a Inicio.
          location.hash = "#/dashboard";
          try {
            await window.icc.auth.verComo(id);
            U.toast("Viendo el CRM como " + (agente ? agente.nombre : "otro usuario"), "success");
          } catch (err) {
            U.toast(err.message || "No se pudo entrar en esa cuenta", "error");
          }
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

  async function viewFichaAgente(id) {
    main().innerHTML = '<div class="icc-loading">Cargando ficha del agente…</div>';
    var datos;
    try {
      datos = await D.obtenerFichaAgente(id);
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + U.escapeHtml(err.message || "No se pudo cargar la ficha") + "</p>";
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

    main().innerHTML =
      '<div class="icc-page-head">' +
      "<div>" +
      (window.icc.auth.esBackofficeOAdmin() ? '<a href="#/agentes" class="icc-back">← Volver a Agentes</a>' : "") +
      "<h1>" + U.escapeHtml(nombreCompleto) + "</h1>" +
      '<p class="icc-muted">' + U.escapeHtml(C.ROLES[a.rol] || a.rol) +
      (datos.supervisor ? " · Depende de " + U.escapeHtml(datos.supervisor.nombre) : "") +
      (Number(a.bloqueado) ? ' · <span style="color:var(--red)">Cuenta bloqueada</span>' : "") +
      "</p>" +
      '<p class="icc-ficha-privada">🔒 Ficha privada: solo la ven ' + (esPropia ? "tú" : U.escapeHtml(a.nombre)) +
      ", su jefe de equipo y dirección.</p>" +
      "</div>" +
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
    main()
      .querySelectorAll("[data-borrar-seg]")
      .forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (!confirm("¿Borrar esta entrada del seguimiento?")) return;
          try {
            await D.borrarSeguimientoAgente(a.id, btn.getAttribute("data-borrar-seg"));
            U.toast("Entrada borrada", "success");
            viewFichaAgente(a.id);
          } catch (err) {
            U.toast(err.message || "No se pudo borrar", "error");
          }
        });
      });
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
        viewFichaAgente(a.id);
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
        viewFichaAgente(a.id);
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
        viewFichaAgente(a.id);
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
    var puedeCrearCarpeta = window.icc.auth.esBackofficeOAdmin() && (!actual || !actual.es_personal);

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
                (esAdmin && !c.es_personal
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
                    (esAdmin
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
                (esAdmin
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

  // -------------------------------------------------------------- Comparador
  var COMPARADOR_CATALOGOS = ["energia", "telefonia", "alarmas"];

  function campoNum(name, label, valor, opts) {
    opts = opts || {};
    return (
      '<div class="icc-field"><label>' + label + "</label>" +
      '<input class="icc-input" name="' + name + '" type="number" step="' + (opts.step || "0.01") + '"' +
      (opts.min != null ? ' min="' + opts.min + '"' : "") +
      ' value="' + (valor != null && valor !== "" ? valor : (opts.def != null ? opts.def : "")) + '"></div>'
    );
  }

  function campoCheck(name, label, checked) {
    return (
      '<label class="icc-check"><input type="checkbox" name="' + name + '"' + (checked ? " checked" : "") + "> " + label + "</label>"
    );
  }

  function campoSelect(name, label, opciones, valorActual) {
    return (
      '<div class="icc-field"><label>' + label + '</label><select class="icc-select" name="' + name + '">' +
      opciones
        .map(function (o) {
          return '<option value="' + o.value + '"' + (o.value === valorActual ? " selected" : "") + ">" + o.label + "</option>";
        })
        .join("") +
      "</select></div>"
    );
  }

  async function viewTarifas(catalogoActivo) {
    if (!window.icc.auth.esBackofficeOAdmin()) {
      main().innerHTML = '<p class="icc-empty">No tienes acceso a esta seccion.</p>';
      return;
    }
    catalogoActivo = COMPARADOR_CATALOGOS.indexOf(catalogoActivo) >= 0 ? catalogoActivo : "energia";
    main().innerHTML = '<div class="icc-loading">Cargando tarifas…</div>';
    var tarifas = await D.listarTarifas(catalogoActivo, false);

    var columnas = {
      energia: [
        { k: "nombre_tarifa", l: "Tarifa" },
        { k: "tipo", l: "Tipo" },
        { k: "segmento", l: "Segmento" },
        { k: "termino_fijo_mensual", l: "Termino fijo €/mes" },
        { k: "permanencia_meses", l: "Permanencia" },
      ],
      telefonia: [
        { k: "nombre_tarifa", l: "Tarifa" },
        { k: "tipo", l: "Tipo" },
        { k: "precio_mensual", l: "€/mes" },
        { k: "permanencia_meses", l: "Permanencia" },
      ],
      alarmas: [
        { k: "nombre_kit", l: "Kit" },
        { k: "tipo_kit", l: "Tipo" },
        { k: "cuota_mensual", l: "€/mes" },
        { k: "coste_instalacion", l: "Instalacion" },
        { k: "permanencia_meses", l: "Permanencia" },
      ],
    };
    var cols = columnas[catalogoActivo];

    main().innerHTML =
      '<div class="icc-page-head"><h1>Comparador · Tarifas propias</h1>' +
      '<button class="icc-btn icc-btn-primary" id="btn-nueva-tarifa">+ Nueva tarifa</button>' +
      "</div>" +
      '<div class="icc-tabs">' +
      COMPARADOR_CATALOGOS.map(function (c) {
        return '<a class="icc-tab' + (c === catalogoActivo ? " is-active" : "") + '" href="#/comparador/tarifas/' + c + '">' + C.COMPARADOR_SECTORES[c] + "</a>";
      }).join("") +
      "</div>" +
      '<div class="icc-card" style="margin-top:14px">' +
      (tarifas.length
        ? '<table class="icc-table"><thead><tr>' +
          cols.map(function (c) { return "<th>" + c.l + "</th>"; }).join("") +
          "<th>Activa</th><th>Destacada</th><th></th></tr></thead><tbody>" +
          tarifas
            .map(function (t) {
              return (
                "<tr>" +
                cols.map(function (c) { return "<td>" + U.escapeHtml(String(t[c.k] != null ? t[c.k] : "-")) + "</td>"; }).join("") +
                '<td><input type="checkbox" data-toggle-activo="' + t.id + '"' + (t.activo ? " checked" : "") + "></td>" +
                '<td><input type="checkbox" data-toggle-destacada="' + t.id + '"' + (t.destacada ? " checked" : "") + "></td>" +
                '<td><button type="button" class="icc-link-btn" data-editar-tarifa-id="' + t.id + '">Editar</button> ' +
                '<button type="button" class="icc-link-btn" style="color:var(--red)" data-borrar-tarifa-id="' + t.id + '">Borrar</button></td>' +
                "</tr>"
              );
            })
            .join("") +
          "</tbody></table>"
        : '<p class="icc-empty">Sin tarifas en ' + C.COMPARADOR_SECTORES[catalogoActivo] + " todavia.</p>") +
      "</div>";

    document.getElementById("btn-nueva-tarifa").addEventListener("click", function () {
      modalTarifa(catalogoActivo, null);
    });
    main().querySelectorAll("[data-editar-tarifa-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var t = tarifas.filter(function (x) { return String(x.id) === btn.getAttribute("data-editar-tarifa-id"); })[0];
        if (t) modalTarifa(catalogoActivo, t);
      });
    });
    main().querySelectorAll("[data-borrar-tarifa-id]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("¿Borrar esta tarifa? No se puede deshacer.")) return;
        try {
          await D.borrarTarifa(catalogoActivo, btn.getAttribute("data-borrar-tarifa-id"));
          U.toast("Tarifa borrada", "success");
          viewTarifas(catalogoActivo);
        } catch (err) {
          U.toast(err.message || "No se pudo borrar", "error");
        }
      });
    });
    main().querySelectorAll("[data-toggle-activo], [data-toggle-destacada]").forEach(function (chk) {
      chk.addEventListener("change", async function () {
        var id = chk.getAttribute("data-toggle-activo") || chk.getAttribute("data-toggle-destacada");
        var campo = chk.hasAttribute("data-toggle-activo") ? "activo" : "destacada";
        var payload = {};
        payload[campo] = chk.checked;
        try {
          await D.actualizarTarifa(catalogoActivo, id, payload);
          U.toast("Tarifa actualizada", "success");
        } catch (err) {
          U.toast(err.message || "No se pudo actualizar", "error");
          chk.checked = !chk.checked;
        }
      });
    });
  }

  function modalTarifa(catalogo, tarifa) {
    var esNueva = !tarifa;
    tarifa = tarifa || {};
    var camposEspecificos = "";

    if (catalogo === "energia") {
      camposEspecificos =
        campoSelect("tipo", "Tipo", [{ value: "luz", label: "Luz" }, { value: "gas", label: "Gas" }], tarifa.tipo || "luz") +
        campoTexto("segmento", "Segmento (2.0TD, 3.0TD, RL.1, RL.2…)", true, "text", tarifa.segmento) +
        campoNum("precio_potencia_p1", "Precio potencia P1 (€/kW/dia)", tarifa.precio_potencia_p1, { step: "0.000001" }) +
        campoNum("precio_potencia_p2", "Precio potencia P2 (€/kW/dia)", tarifa.precio_potencia_p2, { step: "0.000001" }) +
        campoNum("precio_potencia_p3", "Precio potencia P3 (€/kW/dia)", tarifa.precio_potencia_p3, { step: "0.000001" }) +
        campoNum("precio_energia_p1", "Precio energia P1 (€/kWh)", tarifa.precio_energia_p1, { step: "0.000001" }) +
        campoNum("precio_energia_p2", "Precio energia P2 (€/kWh)", tarifa.precio_energia_p2, { step: "0.000001" }) +
        campoNum("precio_energia_p3", "Precio energia P3 (€/kWh)", tarifa.precio_energia_p3, { step: "0.000001" }) +
        campoNum("termino_fijo_mensual", "Termino fijo (€/mes)", tarifa.termino_fijo_mensual) +
        campoNum("alquiler_equipo_dia", "Alquiler equipo (€/dia)", tarifa.alquiler_equipo_dia, { step: "0.000001" }) +
        campoNum("comision_captacion", "Comision captacion (€)", tarifa.comision_captacion) +
        campoNum("permanencia_meses", "Permanencia (meses)", tarifa.permanencia_meses, { step: "1", def: 0 });
    } else if (catalogo === "telefonia") {
      camposEspecificos =
        campoSelect("tipo", "Tipo", [
          { value: "movil", label: "Movil" },
          { value: "fibra", label: "Fibra" },
          { value: "fijo", label: "Fijo" },
          { value: "convergente", label: "Convergente" },
          { value: "centralita", label: "Centralita" },
        ], tarifa.tipo || "movil") +
        campoNum("gb_datos", "GB de datos (vacio si no aplica)", tarifa.gb_datos, { step: "1" }) +
        campoCheck("datos_ilimitados", "Datos ilimitados", tarifa.datos_ilimitados) +
        campoCheck("llamadas_ilimitadas", "Llamadas ilimitadas", tarifa.llamadas_ilimitadas !== false) +
        campoNum("velocidad_fibra_mb", "Velocidad fibra (Mb)", tarifa.velocidad_fibra_mb, { step: "1" }) +
        campoNum("lineas_moviles_incluidas", "Lineas moviles incluidas", tarifa.lineas_moviles_incluidas, { step: "1", def: 0 }) +
        campoNum("lineas_fijas_incluidas", "Lineas fijas incluidas", tarifa.lineas_fijas_incluidas, { step: "1", def: 0 }) +
        campoTexto("extras", "Extras (separados por coma)", false, "text", (tarifa.extras || []).join(", ")) +
        campoNum("precio_mensual", "Precio mensual (€)", tarifa.precio_mensual) +
        campoNum("comision_captacion", "Comision captacion (€)", tarifa.comision_captacion) +
        campoNum("permanencia_meses", "Permanencia (meses)", tarifa.permanencia_meses, { step: "1", def: 0 });
    } else {
      camposEspecificos =
        campoSelect("tipo_kit", "Tipo de kit", [
          { value: "basica", label: "Basica" },
          { value: "camaras", label: "Con camaras" },
          { value: "gama_alta", label: "Gama alta" },
          { value: "comercial", label: "Comercial" },
        ], tarifa.tipo_kit || "basica") +
        campoTexto("equipamiento", "Equipamiento (separado por coma)", false, "text", (tarifa.equipamiento || []).join(", ")) +
        campoNum("num_camaras", "Numero de camaras", tarifa.num_camaras, { step: "1", def: 0 }) +
        campoNum("num_sensores", "Numero de sensores", tarifa.num_sensores, { step: "1", def: 0 }) +
        campoNum("num_mandos", "Numero de mandos", tarifa.num_mandos, { step: "1", def: 0 }) +
        campoCheck("conexion_movil", "Conexion movil", tarifa.conexion_movil !== false) +
        campoCheck("central_receptora", "Central receptora 24h", tarifa.central_receptora !== false) +
        campoNum("cuota_mensual", "Cuota mensual (€)", tarifa.cuota_mensual) +
        campoNum("coste_instalacion", "Coste instalacion (€)", tarifa.coste_instalacion, { def: 0 }) +
        campoNum("comision_captacion", "Comision captacion (€)", tarifa.comision_captacion) +
        campoNum("permanencia_meses", "Permanencia (meses)", tarifa.permanencia_meses, { step: "1", def: 0 });
    }

    U.openModal(
      "<h2>" + (esNueva ? "Nueva tarifa" : "Editar tarifa") + " · " + C.COMPARADOR_SECTORES[catalogo] + "</h2>" +
      '<form id="form-tarifa" class="icc-form">' +
      campoTexto(catalogo === "alarmas" ? "nombre_kit" : "nombre_tarifa", catalogo === "alarmas" ? "Nombre del kit" : "Nombre de la tarifa", true, "text", catalogo === "alarmas" ? tarifa.nombre_kit : tarifa.nombre_tarifa) +
      '<div class="icc-field"><label>Descripcion</label><textarea class="icc-textarea" name="descripcion">' + U.escapeHtml(tarifa.descripcion || "") + "</textarea></div>" +
      camposEspecificos +
      campoCheck("activo", "Tarifa activa (visible en el comparador)", tarifa.activo !== false) +
      campoCheck("destacada", "Destacada", tarifa.destacada) +
      '<div class="icc-modal-actions">' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">' + (esNueva ? "Añadir" : "Guardar cambios") + "</button>" +
      "</div></form>"
    );

    document.getElementById("form-tarifa").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var payload = {};
      fd.forEach(function (valor, key) {
        payload[key] = valor;
      });
      ["activo", "destacada", "datos_ilimitados", "llamadas_ilimitadas", "conexion_movil", "central_receptora"].forEach(function (k) {
        if (e.target.querySelector('[name="' + k + '"]')) payload[k] = !!e.target.querySelector('[name="' + k + '"]').checked;
      });
      if (payload.extras != null) payload.extras = payload.extras ? payload.extras.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [];
      if (payload.equipamiento != null) payload.equipamiento = payload.equipamiento ? payload.equipamiento.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [];

      try {
        if (esNueva) {
          await D.crearTarifa(catalogo, payload);
          U.toast("Tarifa añadida", "success");
        } else {
          await D.actualizarTarifa(catalogo, tarifa.id, payload);
          U.toast("Tarifa actualizada", "success");
        }
        U.closeModal();
        viewTarifas(catalogo);
      } catch (err) {
        U.toast(err.message || "No se pudo guardar la tarifa", "error");
      }
    });
  }

  // ---------------------------------------------------------- Comparador · wizard
  async function viewComparadorWizard(clienteId, sector) {
    if (COMPARADOR_CATALOGOS.indexOf(sector) < 0) {
      location.hash = "#/clientes/" + clienteId;
      return;
    }
    main().innerHTML = '<div class="icc-loading">Cargando comparador…</div>';
    var catalogoKey = sector === "telefonia" ? "telefonia" : sector;
    var [cliente, tarifas] = await Promise.all([D.obtenerCliente(clienteId), D.listarTarifas(catalogoKey, true)]);
    if (!cliente) {
      main().innerHTML = '<p class="icc-empty">Cliente no encontrado o sin acceso.</p>';
      return;
    }

    main().innerHTML =
      '<div class="icc-page-head"><div><a href="#/clientes/' + cliente.id + '" class="icc-back">← Volver a ' + U.escapeHtml(cliente.razon_social) + '</a>' +
      "<h1>Comparador · " + C.COMPARADOR_SECTORES[sector] + "</h1></div></div>" +
      '<section class="icc-card"><form id="form-comparador" class="icc-form">' +
      '<div class="icc-field"><label>Factura del cliente (PDF o imagen, opcional)</label>' +
      '<input class="icc-input" type="file" name="archivo_factura" accept="application/pdf,image/*">' +
      '<p class="icc-muted" style="margin:2px 0 0">Se guarda en la documentacion del cliente para que quede disponible para descargar.</p></div>' +
      formularioSector(sector) +
      '<div class="icc-modal-actions" style="justify-content:flex-start">' +
      '<button type="submit" class="icc-btn icc-btn-primary">Calcular ahorro</button>' +
      "</div></form></section>" +
      '<section id="resultado-comparador"></section>';

    wirearFormularioSector(sector);

    document.getElementById("form-comparador").addEventListener("submit", async function (e) {
      e.preventDefault();
      try {
        var datosEntrada = leerFormularioSector(sector);
        var resultado = calcularSector(sector, datosEntrada, tarifas);

        var archivoFactura = document.querySelector('[name="archivo_factura"]').files[0];
        if (archivoFactura) {
          try {
            await D.subirDocumento(cliente.id, "factura", archivoFactura, "Subida desde el Comparador (" + C.COMPARADOR_SECTORES[sector] + ")");
            U.toast("Factura guardada en el expediente del cliente", "success");
          } catch (err) {
            U.toast("No se pudo guardar la factura: " + (err.message || ""), "error");
          }
        }

        pintarResultadoComparador(cliente, sector, datosEntrada, resultado);
      } catch (err) {
        console.error(err);
        U.toast("Revisa los datos introducidos: " + (err.message || ""), "error");
      }
    });
  }

  function formularioSector(sector) {
    if (sector === "energia") {
      return (
        '<div class="icc-field">' + campoCheck("incluye_luz", "Incluir suministro de Luz", true) + "</div>" +
        '<div id="bloque-luz">' +
        campoSelect("luz_segmento", "Peaje contratado", [{ value: "2.0TD", label: "2.0TD (hogar/pequeño negocio)" }, { value: "3.0TD", label: "3.0TD (negocio, >15kW)" }], "2.0TD") +
        campoTexto("luz_proveedor", "Compañia actual", false, "text", "") +
        campoNum("luz_dias_factura", "Dias que cubre la factura", 30) +
        '<h4>Potencia contratada</h4>' +
        campoNum("luz_potencia_p1", "Potencia P1 (kW)", 4.6, { step: "0.01" }) +
        campoNum("luz_potencia_p2", "Potencia P2 (kW)", 4.6, { step: "0.01" }) +
        campoNum("luz_potencia_p3", "Potencia P3 (kW, solo 3.0TD)", "", { step: "0.01" }) +
        '<h4>Consumo del periodo (kWh)</h4>' +
        campoNum("luz_consumo_p1", "Consumo P1 (punta)", 120) +
        campoNum("luz_consumo_p2", "Consumo P2 (llana)", 90) +
        campoNum("luz_consumo_p3", "Consumo P3 (valle)", 60) +
        '<h4>Precio actual (tal y como aparece en la factura)</h4>' +
        campoNum("luz_precio_potencia_p1", "Precio potencia P1 (€/kW/dia)", 0.09, { step: "0.000001" }) +
        campoNum("luz_precio_potencia_p2", "Precio potencia P2 (€/kW/dia)", 0.09, { step: "0.000001" }) +
        campoNum("luz_precio_potencia_p3", "Precio potencia P3 (€/kW/dia)", "", { step: "0.000001" }) +
        campoNum("luz_precio_energia_p1", "Precio energia P1 (€/kWh)", 0.16, { step: "0.000001" }) +
        campoNum("luz_precio_energia_p2", "Precio energia P2 (€/kWh)", 0.16, { step: "0.000001" }) +
        campoNum("luz_precio_energia_p3", "Precio energia P3 (€/kWh)", 0.16, { step: "0.000001" }) +
        campoNum("luz_termino_fijo", "Termino fijo actual (€/mes)", 0) +
        campoNum("luz_alquiler_contador", "Alquiler contador (€/dia)", 0.026, { step: "0.000001" }) +
        "</div>" +
        '<div class="icc-field">' + campoCheck("incluye_gas", "Incluir suministro de Gas", false) + "</div>" +
        '<div id="bloque-gas" style="display:none">' +
        campoSelect("gas_segmento", "Segmento de consumo", [{ value: "RL.1", label: "RL.1 · <5.000 kWh/año" }, { value: "RL.2", label: "RL.2 · 5.000-50.000 kWh/año" }], "RL.1") +
        campoTexto("gas_proveedor", "Compañia actual", false, "text", "") +
        campoNum("gas_dias_factura", "Dias que cubre la factura", 30) +
        campoNum("gas_consumo", "Consumo del periodo (kWh)", 350) +
        campoNum("gas_precio_energia", "Precio energia actual (€/kWh)", 0.07, { step: "0.000001" }) +
        campoNum("gas_termino_fijo", "Termino fijo actual (€/mes)", 8) +
        "</div>"
      );
    }
    if (sector === "telefonia") {
      var fibraRows = "";
      for (var i = 1; i <= 3; i++) {
        fibraRows +=
          '<div class="icc-comparador-row icc-fibra-' + i + '"' + (i > 1 ? ' style="display:none"' : "") + ">" +
          campoTexto("fibra" + i + "_etiqueta", "Fibra " + i + " — referencia", false, "text", i === 1 ? "Fibra principal" : "") +
          campoNum("fibra" + i + "_velocidad", "Velocidad deseada (Mb)", i === 1 ? 300 : "") +
          "</div>";
      }
      var lineaRows = "";
      for (var j = 1; j <= 6; j++) {
        lineaRows +=
          '<div class="icc-comparador-row icc-linea-' + j + '"' + (j > 1 ? ' style="display:none"' : "") + ">" +
          campoTexto("linea" + j + "_numero", "Linea " + j + " — telefono (opcional)", false, "text", "") +
          campoNum("linea" + j + "_gb", "GB deseados", j === 1 ? 30 : "") +
          campoCheck("linea" + j + "_ilimitado", "Datos ilimitados", false) +
          "</div>";
      }
      return (
        campoTexto("tel_operador", "Operador actual", false, "text", "") +
        campoSelect("tel_num_fibras", "Numero de fibras a comparar", [{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }], "1") +
        fibraRows +
        campoSelect("tel_num_lineas", "Numero de lineas moviles", [{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" }], "1") +
        lineaRows +
        '<h4>Factura actual (IVA incluido)</h4>' +
        campoNum("tel_cuota_actual", "Cuotas mensuales (€/mes)", 55) +
        campoNum("tel_consumos_actual", "Consumos fuera de bono (€)", 0) +
        campoNum("tel_otros_actual", "Otros conceptos: roaming, servicios… (€)", 0)
      );
    }
    // alarmas
    return (
      campoTexto("alarma_proveedor", "Compañia actual", false, "text", "") +
      campoSelect("alarma_tipo_kit", "Tipo de kit actual", [
        { value: "basica", label: "Basica (sin camaras)" },
        { value: "camaras", label: "Con camaras" },
        { value: "gama_alta", label: "Gama alta" },
        { value: "comercial", label: "Comercial / negocio" },
      ], "basica") +
      campoNum("alarma_num_camaras", "Numero de camaras", 0, { step: "1" }) +
      campoNum("alarma_num_sensores", "Numero de sensores/detectores", 2, { step: "1" }) +
      campoNum("alarma_cuota_actual", "Cuota mensual actual (€/mes)", 39.9) +
      campoNum("alarma_permanencia_restante", "Permanencia restante (meses)", 0, { step: "1" })
    );
  }

  function wirearFormularioSector(sector) {
    var form = document.getElementById("form-comparador");
    if (sector === "energia") {
      var chkLuz = form.querySelector('[name="incluye_luz"]');
      var chkGas = form.querySelector('[name="incluye_gas"]');
      var bloqueLuz = document.getElementById("bloque-luz");
      var bloqueGas = document.getElementById("bloque-gas");
      chkLuz.addEventListener("change", function () { bloqueLuz.style.display = chkLuz.checked ? "" : "none"; });
      chkGas.addEventListener("change", function () { bloqueGas.style.display = chkGas.checked ? "" : "none"; });
    } else if (sector === "telefonia") {
      form.querySelector('[name="tel_num_fibras"]').addEventListener("change", function (e) {
        var n = Number(e.target.value);
        for (var i = 1; i <= 3; i++) {
          form.querySelector(".icc-fibra-" + i).style.display = i <= n ? "" : "none";
        }
      });
      form.querySelector('[name="tel_num_lineas"]').addEventListener("change", function (e) {
        var n = Number(e.target.value);
        for (var j = 1; j <= 6; j++) {
          form.querySelector(".icc-linea-" + j).style.display = j <= n ? "" : "none";
        }
      });
    }
  }

  function leerFormularioSector(sector) {
    var form = document.getElementById("form-comparador");
    var val = function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value : "";
    };
    var checked = function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.checked : false;
    };

    if (sector === "energia") {
      return {
        incluyeLuz: checked("incluye_luz"),
        incluyeGas: checked("incluye_gas"),
        luz: {
          segmento: val("luz_segmento"),
          proveedorActual: val("luz_proveedor"),
          diasFactura: val("luz_dias_factura"),
          potencias: { p1: val("luz_potencia_p1"), p2: val("luz_potencia_p2"), p3: val("luz_potencia_p3") },
          consumos: { p1: val("luz_consumo_p1"), p2: val("luz_consumo_p2"), p3: val("luz_consumo_p3") },
          precioPotenciaActual: { p1: val("luz_precio_potencia_p1"), p2: val("luz_precio_potencia_p2"), p3: val("luz_precio_potencia_p3") },
          precioEnergiaActual: { p1: val("luz_precio_energia_p1"), p2: val("luz_precio_energia_p2"), p3: val("luz_precio_energia_p3") },
          terminoFijoActualMensual: val("luz_termino_fijo"),
          alquilerContadorDiaActual: val("luz_alquiler_contador"),
        },
        gas: {
          segmento: val("gas_segmento"),
          proveedorActual: val("gas_proveedor"),
          diasFactura: val("gas_dias_factura"),
          consumoKwh: val("gas_consumo"),
          precioEnergiaActual: val("gas_precio_energia"),
          terminoFijoActualMensual: val("gas_termino_fijo"),
        },
      };
    }
    if (sector === "telefonia") {
      var numFibras = Number(val("tel_num_fibras")) || 1;
      var numLineas = Number(val("tel_num_lineas")) || 1;
      var fibras = [];
      for (var i = 1; i <= numFibras; i++) {
        fibras.push({ etiqueta: val("fibra" + i + "_etiqueta") || "Fibra " + i, velocidadDeseada: val("fibra" + i + "_velocidad") });
      }
      var lineasMoviles = [];
      for (var j = 1; j <= numLineas; j++) {
        lineasMoviles.push({ numero: val("linea" + j + "_numero"), gbDeseados: val("linea" + j + "_gb"), ilimitado: checked("linea" + j + "_ilimitado") });
      }
      return {
        operadorActual: val("tel_operador"),
        fibras: fibras,
        lineasMoviles: lineasMoviles,
        cuotaMensualActual: val("tel_cuota_actual"),
        consumosActual: val("tel_consumos_actual"),
        otrosConceptosActual: val("tel_otros_actual"),
      };
    }
    return {
      proveedorActual: val("alarma_proveedor"),
      tipoKitActual: val("alarma_tipo_kit"),
      numCamarasActual: val("alarma_num_camaras"),
      numSensoresActual: val("alarma_num_sensores"),
      cuotaMensualActual: val("alarma_cuota_actual"),
      permanenciaRestanteMeses: val("alarma_permanencia_restante"),
    };
  }

  function calcularSector(sector, datos, tarifas) {
    var calc = window.icc.comparadorCalc;
    if (sector === "energia") {
      var resultado = { luz: null, gas: null };
      if (datos.incluyeLuz) resultado.luz = calc.compararLuz(datos.luz, tarifas);
      if (datos.incluyeGas) resultado.gas = calc.compararGas(datos.gas, tarifas);
      var costeActualAnual = (resultado.luz ? resultado.luz.costeActual.totalAnual : 0) + (resultado.gas ? resultado.gas.costeActual.totalAnual : 0);
      var costePropuestaAnual =
        (resultado.luz ? (resultado.luz.mejorPropuesta ? resultado.luz.mejorPropuesta.coste.totalAnual : resultado.luz.costeActual.totalAnual) : 0) +
        (resultado.gas ? (resultado.gas.mejorPropuesta ? resultado.gas.mejorPropuesta.coste.totalAnual : resultado.gas.costeActual.totalAnual) : 0);
      resultado.totales = {
        costeActualAnual: costeActualAnual,
        costePropuestaAnual: costePropuestaAnual,
        ahorroAnual: costeActualAnual - costePropuestaAnual,
        ahorroPorcentaje: costeActualAnual > 0 ? ((costeActualAnual - costePropuestaAnual) / costeActualAnual) * 100 : 0,
      };
      return resultado;
    }
    if (sector === "telefonia") {
      var r = calc.compararTelefonia(datos, tarifas);
      r.totales = { costeActualAnual: r.costeActualAnual, costePropuestaAnual: r.costePropuestaAnual, ahorroAnual: r.ahorroAnual, ahorroPorcentaje: r.ahorroPorcentaje };
      return r;
    }
    var ra = calc.compararAlarmas(datos, tarifas);
    ra.totales = { costeActualAnual: ra.costeActualAnual, costePropuestaAnual: ra.costePropuestaAnual, ahorroAnual: ra.ahorroAnual, ahorroPorcentaje: ra.ahorroPorcentaje };
    return ra;
  }

  function pintarResultadoComparador(cliente, sector, datosEntrada, resultado) {
    var t = resultado.totales;
    var host = document.getElementById("resultado-comparador");
    host.innerHTML =
      '<section class="icc-card" style="margin-top:14px">' +
      "<h2>Resultado</h2>" +
      '<div class="icc-stat-grid">' +
      statCard("Coste actual anual", U.formatEur(t.costeActualAnual), "#f87171") +
      statCard("Propuesta IC anual", U.formatEur(t.costePropuestaAnual), "#22d3ee") +
      statCard("Ahorro anual", U.formatEur(t.ahorroAnual), "#34d399") +
      statCard("Ahorro %", t.ahorroPorcentaje.toFixed(1) + "%", "#d4a62a") +
      "</div>" +
      '<div class="icc-modal-actions" style="justify-content:flex-start">' +
      '<button type="button" class="icc-btn icc-btn-secondary" id="btn-descargar-pdf-comparador">Descargar PDF</button>' +
      '<button type="button" class="icc-btn icc-btn-primary" id="btn-guardar-comparador">Guardar en el expediente</button>' +
      "</div></section>";

    document.getElementById("btn-descargar-pdf-comparador").addEventListener("click", function () {
      generarPdfComparativa(cliente, sector, datosEntrada, resultado);
    });
    document.getElementById("btn-guardar-comparador").addEventListener("click", async function () {
      try {
        await D.guardarAuditoriaComparador({
          cliente_id: cliente.id,
          sector: sector,
          datos_entrada: datosEntrada,
          resultado: resultado,
          coste_actual_anual: t.costeActualAnual,
          coste_propuesto_anual: t.costePropuestaAnual,
          ahorro_anual: t.ahorroAnual,
          ahorro_porcentaje: t.ahorroPorcentaje,
        });
        U.toast("Comparativa guardada en el expediente", "success");
        location.hash = "#/clientes/" + cliente.id;
      } catch (err) {
        U.toast(err.message || "No se pudo guardar la comparativa", "error");
      }
    });
  }

  // -------------------------------------------------- PDF de auditoria/comparativa
  var PDF_COLOR = {
    navy: [11, 15, 25],
    linea: [224, 227, 233],
    fondoSuave: [247, 248, 250],
    texto: [30, 34, 44],
    mudo: [110, 118, 132],
    mudoClaro: [168, 173, 186],
    oro: [212, 166, 42],
    doradoBg: [252, 243, 214],
    verde: [6, 140, 97],
    verdeBg: [226, 246, 237],
    ambar: [180, 95, 6],
    ambarBg: [253, 240, 214],
    rojo: [185, 28, 28],
    rojoBg: [253, 236, 236],
  };

  function pdfNum(v) {
    return Number(v) || 0;
  }

  function pdfNumeroInforme(cliente) {
    var d = new Date();
    return (
      "IC-" +
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0") +
      "-" +
      String(cliente.id).padStart(4, "0")
    );
  }

  function pdfTruncar(doc, texto, anchoMax) {
    texto = String(texto == null ? "" : texto);
    if (doc.getTextWidth(texto) <= anchoMax) return texto;
    var t = texto;
    while (t.length > 1 && doc.getTextWidth(t + "…") > anchoMax) {
      t = t.slice(0, -1);
    }
    return t + "…";
  }

  function pdfEncabezadoSuperior(doc, numeroInforme) {
    var w = doc.internal.pageSize.getWidth();
    var logo = window.icc.pdfAssets && window.icc.pdfAssets.logoBase64;
    if (logo) {
      try {
        doc.addImage(logo, "PNG", 14, 7, 13, 13);
      } catch (e) {
        /* sin logo si el navegador no puede decodificarlo */
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    doc.text("INTEGRAL CONNECTION", 31, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor.apply(doc, PDF_COLOR.mudo);
    doc.text("C O N S U L T I N G", 31, 18);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.3);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    doc.text("Presupuesto " + numeroInforme, w - 14, 11, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor.apply(doc, PDF_COLOR.mudo);
    doc.text("Emitido el " + new Date().toLocaleDateString("es-ES") + " · Valido 30 dias", w - 14, 16.5, { align: "right" });

    doc.setDrawColor.apply(doc, PDF_COLOR.linea);
    doc.setLineWidth(0.3);
    doc.line(14, 25, w - 14, 25);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return 25;
  }

  var PDF_SECTOR_PORTADA = {
    energia: {
      titulo: ["Informe de Auditoria y Optimizacion", "de Energia"],
      subtitulo: "Comparamos tu factura de luz y gas con el mercado para reducir el coste sin cambiar de instalacion.",
    },
    telefonia: {
      titulo: ["Informe de Auditoria y Optimizacion", "de Telecomunicaciones"],
      subtitulo: "Comparamos tu fibra y lineas moviles con el mercado para reducir el coste sin perder prestaciones.",
    },
    alarmas: {
      titulo: ["Informe de Auditoria y Optimizacion", "de Alarmas y Seguridad"],
      subtitulo: "Comparamos tu sistema de seguridad con el mercado para optimizar el coste sin perder cobertura.",
    },
  };

  function pdfMetaCampos(sector, cliente, datosEntrada) {
    var hoy = new Date().toLocaleDateString("es-ES");
    var proveedorActual = "-";
    if (sector === "energia") {
      proveedorActual = (datosEntrada.luz && datosEntrada.luz.proveedorActual) || (datosEntrada.gas && datosEntrada.gas.proveedorActual) || "-";
    } else if (sector === "telefonia") {
      proveedorActual = datosEntrada.operadorActual || "-";
    } else {
      proveedorActual = datosEntrada.proveedorActual || "-";
    }
    return [
      { label: "Cliente", value: cliente.razon_social || "-" },
      { label: "CIF", value: cliente.cif || "-" },
      { label: "Proveedor actual", value: proveedorActual || "-" },
      { label: "Fecha del estudio", value: hoy },
    ];
  }

  function pdfHeroBand(doc, sector, cliente, datosEntrada, yStart) {
    var w = doc.internal.pageSize.getWidth();
    var alto = 58;
    doc.setFillColor.apply(doc, PDF_COLOR.navy);
    doc.rect(0, yStart, w, alto, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor.apply(doc, PDF_COLOR.oro);
    doc.text("INFORME DE AUDITORIA Y OPTIMIZACION  ·  COMPARATIVA INDEPENDIENTE DE MERCADO", 14, yStart + 11);

    var portada = PDF_SECTOR_PORTADA[sector] || PDF_SECTOR_PORTADA.alarmas;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18.5);
    doc.setTextColor(255, 255, 255);
    doc.text(portada.titulo[0], 14, yStart + 22);
    doc.text(portada.titulo[1], 14, yStart + 30.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, [205, 209, 219]);
    var subLineas = doc.splitTextToSize(portada.subtitulo, w - 28);
    doc.text(subLineas, 14, yStart + 38);

    var meta = pdfMetaCampos(sector, cliente, datosEntrada);
    var margen = 14;
    var anchoCol = (w - margen * 2) / meta.length;
    var yMeta = yStart + alto - 9;
    meta.forEach(function (m, idx) {
      var x = margen + idx * anchoCol;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.6);
      doc.setTextColor.apply(doc, [150, 156, 170]);
      doc.text(m.label.toUpperCase(), x, yMeta - 4.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(pdfTruncar(doc, m.value, anchoCol - 4), x, yMeta + 1.5);
    });

    doc.setFillColor.apply(doc, PDF_COLOR.oro);
    doc.rect(0, yStart + alto, w, 1.4, "F");
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return yStart + alto + 1.4 + 10;
  }

  function pdfStatCardsHero(doc, y, items) {
    var w = doc.internal.pageSize.getWidth();
    var margen = 14;
    var gap = 5;
    var anchoCard = (w - margen * 2 - gap * (items.length - 1)) / items.length;
    var alto = 27;
    items.forEach(function (it, idx) {
      var x = margen + idx * (anchoCard + gap);
      if (it.variant === "oscuro") {
        doc.setFillColor.apply(doc, PDF_COLOR.navy);
        doc.roundedRect(x, y, anchoCard, alto, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.4);
        doc.setTextColor.apply(doc, PDF_COLOR.oro);
        doc.text(pdfTruncar(doc, it.label.toUpperCase(), anchoCard - 10), x + 6, y + 8);
        doc.setFontSize(16.5);
        doc.setTextColor(255, 255, 255);
        doc.text(pdfTruncar(doc, it.value, anchoCard - 10), x + 6, y + 18);
        if (it.sub) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor.apply(doc, PDF_COLOR.mudoClaro);
          doc.text(pdfTruncar(doc, it.sub, anchoCard - 10), x + 6, y + 23.5);
        }
      } else {
        var bg = it.variant === "rojo" ? PDF_COLOR.rojoBg : PDF_COLOR.fondoSuave;
        doc.setDrawColor.apply(doc, PDF_COLOR.linea);
        doc.setFillColor.apply(doc, bg);
        doc.roundedRect(x, y, anchoCard, alto, 2, 2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.4);
        doc.setTextColor.apply(doc, it.variant === "rojo" ? PDF_COLOR.rojo : PDF_COLOR.mudo);
        doc.text(pdfTruncar(doc, it.label.toUpperCase(), anchoCard - 10), x + 6, y + 8);
        doc.setFontSize(16.5);
        doc.setTextColor.apply(doc, it.variant === "rojo" ? PDF_COLOR.rojo : PDF_COLOR.texto);
        doc.text(pdfTruncar(doc, it.value, anchoCard - 10), x + 6, y + 18);
        if (it.sub) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor.apply(doc, PDF_COLOR.mudo);
          doc.text(pdfTruncar(doc, it.sub, anchoCard - 10), x + 6, y + 23.5);
        }
      }
    });
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return y + alto + 11;
  }

  function pdfTituloNumerado(doc, y, numero, texto) {
    var w = doc.internal.pageSize.getWidth();
    var cx = 17.6;
    var cy = y - 2.6;
    doc.setFillColor.apply(doc, PDF_COLOR.oro);
    doc.circle(cx, cy, 3.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, PDF_COLOR.navy);
    doc.text(String(numero), cx, cy + 1.3, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor.apply(doc, PDF_COLOR.navy);
    doc.text(pdfTruncar(doc, texto, w - 40), 25, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return y + 8;
  }

  function pdfDiagTag(ahorroPorcentaje) {
    if (ahorroPorcentaje <= 1) return "Correcto";
    if (ahorroPorcentaje <= 12) return "Revisable";
    return "Caro";
  }

  function pdfTagColor(tag) {
    var t = String(tag || "").toLowerCase();
    if (t === "recomendado" || t === "correcto") return { bg: PDF_COLOR.verdeBg, fg: PDF_COLOR.verde };
    if (t === "revisable") return { bg: PDF_COLOR.ambarBg, fg: PDF_COLOR.ambar };
    return { bg: PDF_COLOR.rojoBg, fg: PDF_COLOR.rojo };
  }

  function pdfFilasDiagnosticoEnergia(resultado) {
    var filas = [];
    if (resultado.luz) {
      var l = resultado.luz;
      var factorAnual = 365 / (l.costeActual.diasFactura || 30);
      filas.push(["Luz · Termino de energia (anualizado)", U.formatEur(l.costeActual.terminoEnergia * factorAnual), pdfDiagTag(l.ahorroPorcentaje)]);
      filas.push(["Luz · Termino de potencia (anualizado)", U.formatEur(l.costeActual.terminoPotencia * factorAnual), pdfDiagTag(l.ahorroPorcentaje)]);
      filas.push(["Luz · Coste total anual actual", U.formatEur(l.costeActual.totalAnual), pdfDiagTag(l.ahorroPorcentaje)]);
      if (l.mejorPropuesta) {
        filas.push(["Luz · Propuesta IC (" + l.mejorPropuesta.tarifa.proveedor + ")", U.formatEur(l.mejorPropuesta.coste.totalAnual) + " / año", "Recomendado"]);
      }
    }
    if (resultado.gas) {
      var g = resultado.gas;
      filas.push(["Gas · Coste total anual actual", U.formatEur(g.costeActual.totalAnual), pdfDiagTag(g.ahorroPorcentaje)]);
      if (g.mejorPropuesta) {
        filas.push(["Gas · Propuesta IC (" + g.mejorPropuesta.tarifa.proveedor + ")", U.formatEur(g.mejorPropuesta.coste.totalAnual) + " / año", "Recomendado"]);
      }
    }
    if (filas.length === 0) filas.push(["Sin datos de luz ni gas en este estudio", "-", "-"]);
    return filas;
  }

  function pdfFilasDiagnosticoTelefonia(resultado) {
    var d = resultado.desgloseActual;
    return [
      ["Cuotas mensuales actuales", U.formatEur(d.cuotas), pdfDiagTag(resultado.ahorroPorcentaje)],
      ["Consumos / excesos actuales", U.formatEur(d.consumos), d.consumos > 0 ? "Revisable" : "Correcto"],
      ["Otros conceptos actuales", U.formatEur(d.otros), d.otros > 0 ? "Revisable" : "Correcto"],
      ["Total factura mensual actual (IVA incl.)", U.formatEur(d.total), pdfDiagTag(resultado.ahorroPorcentaje)],
      ["Total factura anual actual", U.formatEur(resultado.costeActualAnual), pdfDiagTag(resultado.ahorroPorcentaje)],
    ];
  }

  function pdfFilasDiagnosticoAlarmas(resultado) {
    return [
      ["Cuota mensual actual", U.formatEur(resultado.costeActualMensual), pdfDiagTag(resultado.ahorroPorcentaje)],
      ["Coste anual actual", U.formatEur(resultado.costeActualAnual), pdfDiagTag(resultado.ahorroPorcentaje)],
      ["Cubre el equipamiento necesario", resultado.cubreEquipamiento ? "Si" : "No revisado", resultado.cubreEquipamiento ? "Correcto" : "Revisable"],
    ];
  }

  function pdfFraseDiagnostico(sector, resultado, t) {
    var pagaMes = t.costeActualAnual / 12;
    var diffMes = (t.costeActualAnual - t.costePropuestaAnual) / 12;
    if (diffMes <= 0) {
      return "Paga " + U.formatEur(pagaMes) + " al mes. Tu tarifa actual ya esta en linea con el mercado.";
    }
    return (
      "Paga " +
      U.formatEur(pagaMes) +
      " al mes. " +
      U.formatEur(diffMes) +
      " al mes (" +
      t.ahorroPorcentaje.toFixed(0) +
      "%) podrian estar mejor optimizados con otra tarifa."
    );
  }

  function pdfDiagnosticoTabla(doc, y, filas) {
    doc.autoTable({
      startY: y,
      margin: { left: 14, right: 14 },
      head: [["Concepto", "Importe", "Diagnostico"]],
      body: filas,
      styles: { fontSize: 8.5, cellPadding: 3, textColor: PDF_COLOR.texto },
      headStyles: { fillColor: PDF_COLOR.navy, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: PDF_COLOR.fondoSuave },
      didParseCell: function (data) {
        if (data.section === "body" && data.column.index === 2) data.cell.text = [];
      },
      didDrawCell: function (data) {
        if (data.section !== "body" || data.column.index !== 2) return;
        var tag = String(data.cell.raw);
        if (tag === "-") return;
        var c = pdfTagColor(tag);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.3);
        var boxW = doc.getTextWidth(tag) + 6;
        var boxH = 5.6;
        var bx = data.cell.x + 2;
        var by = data.cell.y + (data.cell.height - boxH) / 2;
        doc.setFillColor.apply(doc, c.bg);
        doc.roundedRect(bx, by, boxW, boxH, 1.4, 1.4, "F");
        doc.setTextColor.apply(doc, c.fg);
        doc.text(tag, bx + 3, by + boxH / 2 + 1.1);
        doc.setTextColor.apply(doc, PDF_COLOR.texto);
        doc.setFont("helvetica", "normal");
      },
    });
    return doc.lastAutoTable.finalY + 8;
  }

  function pdfCallouts(doc, y, items) {
    var w = doc.internal.pageSize.getWidth();
    var margen = 14;
    var gap = 5;
    var ancho = (w - margen * 2 - gap * (items.length - 1)) / items.length;
    var alto = 25;
    items.forEach(function (it, idx) {
      var x = margen + idx * (ancho + gap);
      doc.setFillColor.apply(doc, PDF_COLOR.fondoSuave);
      doc.rect(x, y, ancho, alto, "F");
      doc.setFillColor.apply(doc, it.color || PDF_COLOR.rojo);
      doc.rect(x, y, 1.3, alto, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.2);
      doc.setTextColor.apply(doc, PDF_COLOR.texto);
      var tituloLineas = doc.splitTextToSize(it.titulo, ancho - 10);
      doc.text(tituloLineas, x + 6, y + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor.apply(doc, PDF_COLOR.mudo);
      var descLineas = doc.splitTextToSize(it.desc, ancho - 10);
      doc.text(descLineas, x + 6, y + 7 + tituloLineas.length * 4.1 + 3);
    });
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return y + alto + 8;
  }

  function pdfCalloutsSector(sector, resultado, t) {
    var mejorCorto = pdfMejorNombreCorto(sector, resultado);
    var items = [
      {
        color: PDF_COLOR.rojo,
        titulo: t.ahorroPorcentaje > 35 ? "Muy por encima del mercado" : t.ahorroPorcentaje > 12 ? "Por encima del mercado" : "Margen de mejora",
        desc: "Pagas " + U.formatEur(t.costeActualAnual / 12) + "/mes; el mercado ofrece lo mismo desde " + U.formatEur(t.costePropuestaAnual / 12) + "/mes.",
      },
      {
        color: PDF_COLOR.verde,
        titulo: U.formatEur(t.ahorroAnual) + " al año de ahorro",
        desc: "Cambiando a " + mejorCorto + " ahorras " + U.formatEur(t.ahorroAnual) + " al año, IVA incluido.",
      },
      {
        color: PDF_COLOR.oro,
        titulo: "Revisalo cada mes",
        desc: "Los precios del mercado cambian. Actualizamos esta comparativa cada mes para mantener el ahorro.",
      },
    ];
    return items;
  }

  function pdfItemsComparativa(sector, resultado) {
    var items = [];
    if (sector === "energia") {
      if (resultado.luz && resultado.luz.todasLasPropuestas) {
        resultado.luz.todasLasPropuestas.forEach(function (c) {
          items.push({
            proveedor: c.tarifa.proveedor,
            nombre: c.tarifa.nombre_tarifa,
            descripcion: c.tarifa.descripcion,
            value: c.coste.totalMensualMedio,
            destacado: Boolean(resultado.luz.mejorPropuesta) && c.tarifa.id === resultado.luz.mejorPropuesta.tarifa.id,
          });
        });
      }
      if (resultado.gas && resultado.gas.todasLasPropuestas) {
        resultado.gas.todasLasPropuestas.forEach(function (c) {
          items.push({
            proveedor: c.tarifa.proveedor,
            nombre: c.tarifa.nombre_tarifa,
            descripcion: c.tarifa.descripcion,
            value: c.coste.totalMensualMedio,
            destacado: Boolean(resultado.gas.mejorPropuesta) && c.tarifa.id === resultado.gas.mejorPropuesta.tarifa.id,
          });
        });
      }
    } else if (sector === "telefonia") {
      var elegidoId = resultado.propuesta.componentes[0] ? resultado.propuesta.componentes[0].tarifa.id : null;
      if (resultado.propuesta.todasLasPropuestas) {
        resultado.propuesta.todasLasPropuestas.forEach(function (p) {
          items.push({
            proveedor: p.tarifa.proveedor,
            nombre: p.tarifa.nombre_tarifa,
            descripcion: p.tarifa.descripcion,
            value: p.precioMensual,
            destacado: p.tarifa.id === elegidoId,
          });
        });
      } else {
        resultado.propuesta.componentes.forEach(function (c) {
          items.push({
            proveedor: c.tarifa.proveedor,
            nombre: c.tarifa.nombre_tarifa,
            descripcion: c.tarifa.descripcion,
            value: pdfNum(c.tarifa.precio_mensual) * c.cantidad,
            destacado: true,
          });
        });
      }
    } else {
      if (resultado.kitPropuesto) {
        items.push({
          proveedor: resultado.kitPropuesto.proveedor,
          nombre: resultado.kitPropuesto.nombre_tarifa || resultado.kitPropuesto.nombre_kit,
          descripcion: resultado.kitPropuesto.descripcion,
          value: pdfNum(resultado.kitPropuesto.cuota_mensual),
          destacado: true,
        });
      }
    }
    items.sort(function (a, b) { return a.value - b.value; });
    return items;
  }

  function pdfMejorNombreCorto(sector, resultado) {
    if (sector === "energia") {
      var l = resultado.luz && resultado.luz.mejorPropuesta;
      if (l) return l.tarifa.proveedor;
      var g = resultado.gas && resultado.gas.mejorPropuesta;
      if (g) return g.tarifa.proveedor;
      return "tu propuesta IC";
    }
    if (sector === "telefonia") {
      var c = resultado.propuesta.componentes[0];
      return c ? c.tarifa.proveedor : "tu propuesta IC";
    }
    return resultado.kitPropuesto ? resultado.kitPropuesto.proveedor : "tu propuesta IC";
  }

  function pdfNombreTarifaSinDuplicar(proveedor, nombre) {
    proveedor = proveedor || "";
    nombre = nombre || "";
    if (nombre.toLowerCase().indexOf(proveedor.toLowerCase()) === 0) return nombre;
    return (proveedor + " " + nombre).trim();
  }

  function pdfMejorNombre(sector, resultado) {
    if (sector === "energia") {
      var l = resultado.luz && resultado.luz.mejorPropuesta;
      var g = resultado.gas && resultado.gas.mejorPropuesta;
      if (l && g) return l.tarifa.proveedor + " + " + g.tarifa.proveedor;
      if (l) return pdfNombreTarifaSinDuplicar(l.tarifa.proveedor, l.tarifa.nombre_tarifa);
      if (g) return pdfNombreTarifaSinDuplicar(g.tarifa.proveedor, g.tarifa.nombre_tarifa);
      return "tu propuesta IC";
    }
    if (sector === "telefonia") {
      var c = resultado.propuesta.componentes[0];
      return c ? pdfNombreTarifaSinDuplicar(c.tarifa.proveedor, c.tarifa.nombre_tarifa) : "tu propuesta IC";
    }
    return resultado.kitPropuesto ? pdfNombreTarifaSinDuplicar(resultado.kitPropuesto.proveedor, resultado.kitPropuesto.nombre_tarifa || "") : "tu propuesta IC";
  }

  function pdfBarrasConLineaHoy(doc, y, items, actualAnnual) {
    var w = doc.internal.pageSize.getWidth();
    var margen = 14;
    var anchoEtiqueta = 46;
    var anchoDisponible = w - margen * 2 - anchoEtiqueta - 24;
    var maxOperador = Math.max.apply(null, items.map(function (i) { return i.value * 12; })) || 1;
    var maxValor = Math.max(actualAnnual, maxOperador) * 1.06;
    var alturaBarra = 6.2;
    var espacio = 3.2;

    items.forEach(function (it, idx) {
      var yy = y + idx * (alturaBarra + espacio);
      var anual = it.value * 12;
      doc.setFont("helvetica", it.destacado ? "bold" : "normal");
      doc.setFontSize(7.8);
      doc.setTextColor.apply(doc, it.destacado ? PDF_COLOR.navy : PDF_COLOR.texto);
      doc.text(pdfTruncar(doc, it.proveedor + " — " + it.nombre, anchoEtiqueta), margen, yy + alturaBarra - 1.6);
      var anchoBarra = Math.max(2, (anual / maxValor) * anchoDisponible);
      var color = it.destacado ? PDF_COLOR.oro : [196, 201, 210];
      doc.setFillColor.apply(doc, color);
      doc.rect(margen + anchoEtiqueta, yy, anchoBarra, alturaBarra, "F");
      doc.setFont("helvetica", it.destacado ? "bold" : "normal");
      doc.setFontSize(7.4);
      doc.setTextColor.apply(doc, PDF_COLOR.mudo);
      doc.text(U.formatEur(anual) + "/año", margen + anchoEtiqueta + anchoBarra + 2, yy + alturaBarra - 1.6);
    });

    var finalY = y + items.length * (alturaBarra + espacio);
    var lineaX = margen + anchoEtiqueta + Math.min(1, actualAnnual / maxValor) * anchoDisponible;
    doc.setDrawColor.apply(doc, PDF_COLOR.rojo);
    doc.setLineDashPattern([1.3, 1.1], 0);
    doc.setLineWidth(0.6);
    doc.line(lineaX, y - 3, lineaX, finalY + 2);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor.apply(doc, PDF_COLOR.rojo);
    var etiquetaHoy = "Hoy: " + U.formatEur(actualAnnual) + "/año";
    var anchoEtq = doc.getTextWidth(etiquetaHoy);
    var xEtq = Math.min(Math.max(lineaX - anchoEtq / 2, margen + anchoEtiqueta), w - 14 - anchoEtq);
    doc.text(etiquetaHoy, xEtq, y - 6);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return finalY + 10;
  }

  function pdfTablaComparativa(doc, y, items, actualMensual, numeroInforme) {
    var filas = items.map(function (it) {
      var anual = it.value * 12;
      return [
        it.proveedor,
        it.nombre,
        it.descripcion ? pdfTruncar(doc, it.descripcion, 95) : "-",
        U.formatEur(it.value),
        U.formatEur(anual),
        U.formatEur(actualMensual * 12 - anual),
      ];
    });
    filas.push(["Tu situacion actual", "-", "-", U.formatEur(actualMensual), U.formatEur(actualMensual * 12), "-"]);

    doc.autoTable({
      startY: y,
      margin: { top: 30, left: 14, right: 14 },
      head: [["Operador", "Tarifa", "Descripcion", "Precio/mes", "Precio/año", "Ahorro/año"]],
      body: filas,
      styles: { fontSize: 7.4, cellPadding: 2.2, textColor: PDF_COLOR.texto },
      headStyles: { fillColor: PDF_COLOR.navy, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: { 2: { cellWidth: 58 } },
      didParseCell: function (data) {
        if (data.section !== "body") return;
        var esActual = data.row.index === filas.length - 1;
        if (esActual) {
          data.cell.styles.fillColor = PDF_COLOR.rojoBg;
          data.cell.styles.textColor = PDF_COLOR.rojo;
          data.cell.styles.fontStyle = "italic";
        } else if (items[data.row.index] && items[data.row.index].destacado) {
          data.cell.styles.fillColor = PDF_COLOR.doradoBg;
          if (data.column.index === 0) data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawPage: function () {
        pdfEncabezadoSuperior(doc, numeroInforme);
      },
    });
    return doc.lastAutoTable.finalY + 6;
  }

  function pdfPaginaComparativa(doc, numeroInforme, sector, resultado, t) {
    doc.addPage();
    pdfEncabezadoSuperior(doc, numeroInforme);
    var items = pdfItemsComparativa(sector, resultado);
    var y = pdfTituloNumerado(doc, 44, 2, "Comparativa de mercado: " + items.length + " tarifas");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    var mejorCorto = pdfMejorNombreCorto(sector, resultado);
    var w = doc.internal.pageSize.getWidth();
    var fraseLineas = doc.splitTextToSize(
      "Todas las alternativas por debajo de tu coste actual te ahorran dinero. " + mejorCorto + " es la que mejor combina ahorro y prestaciones.",
      w - 28
    );
    doc.text(fraseLineas, 14, y);
    y += fraseLineas.length * 4.6 + 6;

    if (items.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, PDF_COLOR.mudo);
      doc.text("Todavia no hay tarifas suficientes cargadas en el Comparador para esta comparativa.", 14, y);
      return;
    }
    var actualMensual = t.costeActualAnual / 12;
    y = pdfBarrasConLineaHoy(doc, y, items.slice(0, 10), t.costeActualAnual) + 2;
    y = pdfTablaComparativa(doc, y, items, actualMensual, numeroInforme);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor.apply(doc, PDF_COLOR.mudo);
    var nota = doc.splitTextToSize(
      "Importes con IVA incluido. Tarifas y precios cargados en el Comparador de ICC, revisados mensualmente. Estudio orientativo sujeto a confirmacion de condiciones con la comercializadora.",
      w - 28
    );
    doc.text(nota, 14, y);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
  }

  function pdfTituloSeccionSimple(doc, y, texto) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor.apply(doc, PDF_COLOR.navy);
    doc.text(texto, 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return y + 7;
  }

  function pdfDibujarCheck(doc, x, yBase, color) {
    doc.setDrawColor.apply(doc, color);
    doc.setLineWidth(0.8);
    doc.line(x, yBase - 1.1, x + 1.1, yBase + 0.4);
    doc.line(x + 1.1, yBase + 0.4, x + 2.9, yBase - 2.3);
  }

  function pdfChecklist2col(doc, y, items) {
    var w = doc.internal.pageSize.getWidth();
    var colW = (w - 28 - 8) / 2;
    var colX = [14, 14 + colW + 8];
    var colY = [y, y];
    items.forEach(function (texto, idx) {
      var col = idx % 2;
      var x = colX[col];
      var yy = colY[col];
      pdfDibujarCheck(doc, x, yy, PDF_COLOR.verde);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      doc.setTextColor.apply(doc, PDF_COLOR.texto);
      var lineas = doc.splitTextToSize(texto, colW - 8);
      doc.text(lineas, x + 5, yy);
      colY[col] = yy + lineas.length * 4.3 + 4.5;
    });
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return Math.max(colY[0], colY[1]) + 4;
  }

  var PDF_VENTAJAS_ICC = [
    "Trabajamos con todas las compañias: comparativa 100% independiente del mercado.",
    "Gestion integral del cambio: portabilidad, alta y baja sin que tengas que llamar a nadie.",
    "Revisamos tu factura cada mes para detectar subidas de precio o cargos nuevos.",
    "Un gestor de Integral Connection Consulting lleva tu caso de principio a fin.",
  ];

  function pdfVentajasPropuesta(sector, resultado) {
    var lista = [];
    if (sector === "telefonia") {
      var c = resultado.propuesta.componentes[0];
      var tarifa = c ? c.tarifa : null;
      if (tarifa) {
        if (tarifa.datos_ilimitados) lista.push("Datos moviles ilimitados para todas las lineas incluidas.");
        if (pdfNum(tarifa.velocidad_fibra_mb) > 0) lista.push("Fibra de " + tarifa.velocidad_fibra_mb + " Mb simetricos.");
        if (pdfNum(tarifa.permanencia_meses) === 0) lista.push("Sin permanencia: puedes cambiar cuando quieras.");
        else lista.push("Permanencia de " + tarifa.permanencia_meses + " meses con precio garantizado.");
        if (tarifa.descripcion) lista.push(tarifa.descripcion);
      }
    } else if (sector === "energia") {
      if (resultado.luz && resultado.luz.mejorPropuesta) {
        lista.push("Luz con " + resultado.luz.mejorPropuesta.tarifa.proveedor + ": " + (resultado.luz.mejorPropuesta.tarifa.descripcion || "precio competitivo verificado."));
      }
      if (resultado.gas && resultado.gas.mejorPropuesta) {
        lista.push("Gas con " + resultado.gas.mejorPropuesta.tarifa.proveedor + ": " + (resultado.gas.mejorPropuesta.tarifa.descripcion || "precio competitivo verificado."));
      }
      lista.push("Mismo punto de suministro: solo cambia la facturacion, no la instalacion.");
      lista.push("Sin coste de alta ni corte de suministro durante el cambio.");
    } else {
      lista.push("Cobertura equivalente o superior a tu sistema actual.");
      if (resultado.kitPropuesto && resultado.kitPropuesto.descripcion) lista.push(resultado.kitPropuesto.descripcion);
      lista.push("Instalacion y puesta en marcha gestionadas por Integral Connection Consulting.");
    }
    if (lista.length === 0) lista.push("Mejor combinacion de precio y prestaciones para tu perfil de consumo.");
    return lista;
  }

  function pdfCTAFinal(doc, y, t, agente) {
    var w = doc.internal.pageSize.getWidth();
    var pasos = [
      ["1 · Firme", "Este presupuesto"],
      ["2 · Gestionamos", "Portabilidad / alta"],
      ["3 · Ahorra", "Desde el primer mes"],
    ];
    var pasoW = 36;
    var gapPasos = 5;
    var pasoX0 = w - 14 - pasoW * 3 - gapPasos * 2;
    var anchoTexto = pasoX0 - 14 - 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    var tituloLineas = doc.splitTextToSize(
      "Cada mes sin cambiar le cuesta " + U.formatEur((t.costeActualAnual - t.costePropuestaAnual) / 12) + ".",
      anchoTexto
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    var subLineas = doc.splitTextToSize("Firme hoy y nos encargamos de todo: gestion del cambio sin que tenga que llamar a nadie.", anchoTexto);

    var bandH = Math.max(34, 8 + tituloLineas.length * 5.2 + 3 + subLineas.length * 3.8 + 6);

    doc.setFillColor.apply(doc, PDF_COLOR.navy);
    doc.rect(0, y, w, bandH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(tituloLineas, 14, y + 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor.apply(doc, [195, 200, 210]);
    doc.text(subLineas, 14, y + 11 + tituloLineas.length * 5.2 + 3);

    pasos.forEach(function (p, idx) {
      var x = pasoX0 + idx * (pasoW + gapPasos);
      doc.setDrawColor(60, 66, 82);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y + 5, pasoW, bandH - 10, 1.5, 1.5, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.4);
      doc.setTextColor.apply(doc, PDF_COLOR.oro);
      doc.text(p[0], x + 3, y + 5 + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(210, 213, 222);
      doc.text(p[1], x + 3, y + 5 + 14, { maxWidth: pasoW - 6 });
    });
    y += bandH;

    doc.setFillColor.apply(doc, PDF_COLOR.oro);
    doc.rect(0, y, w, 12, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, PDF_COLOR.navy);
    var texto =
      agente && agente.email
        ? "Escriba a " + (agente.nombre || "su gestor") + ": " + agente.email
        : "Contacte con su gestor comercial de Integral Connection Consulting";
    doc.text(texto, 14, y + 8);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return y + 12 + 10;
  }

  function pdfAceptacionFirma(doc, y, mejorNombre, ahorroAnual, agente) {
    var w = doc.internal.pageSize.getWidth();
    var colW = (w - 28 - 8) / 2;
    var alto = 44;

    doc.setDrawColor.apply(doc, PDF_COLOR.linea);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, colW, alto, 2, 2, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor.apply(doc, PDF_COLOR.oro);
    doc.text("ACEPTACION DE LA PROPUESTA", 18, y + 7.5);
    doc.setDrawColor.apply(doc, PDF_COLOR.texto);
    doc.rect(18, y + 12.5, 3.2, 3.2, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    var opcionLineas = doc.splitTextToSize(mejorNombre + " (recomendada) · ahorro " + U.formatEur(ahorroAnual) + "/año", colW - 30).slice(0, 2);
    doc.text(opcionLineas, 24, y + 15);
    var yOtra = y + 16 + opcionLineas.length * 3.6;
    doc.rect(18, yOtra, 3.2, 3.2, "S");
    doc.text("Otra opcion: ______________________", 24, yOtra + 2.5);
    doc.setDrawColor.apply(doc, PDF_COLOR.linea);
    doc.line(18, y + 30, 18 + colW - 8, y + 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor.apply(doc, PDF_COLOR.mudo);
    doc.text("Nombre y apellidos / DNI-CIF", 18, y + 33.5);
    doc.line(18, y + 39.5, 18 + colW - 8, y + 39.5);
    doc.text("Fecha y firma del cliente", 18, y + 43);

    var x2 = 14 + colW + 8;
    var logo = window.icc.pdfAssets && window.icc.pdfAssets.logoBase64;
    if (logo) {
      try {
        doc.addImage(logo, "PNG", x2, y, 13, 13);
      } catch (e) {
        /* sin logo */
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    doc.text(pdfTruncar(doc, (agente && agente.nombre) || "Integral Connection Consulting", colW - 20), x2 + 16, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor.apply(doc, PDF_COLOR.mudo);
    doc.text("Asesor/a comercial · Integral Connection Consulting", x2 + 16, y + 11);
    if (agente && agente.email) doc.text(pdfTruncar(doc, agente.email, colW - 20), x2 + 16, y + 15.5);
    doc.setDrawColor.apply(doc, PDF_COLOR.linea);
    doc.line(x2, y + 32, x2 + colW, y + 32);
    doc.setFontSize(7.2);
    doc.text("Firma del asesor/a", x2, y + 36);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    return y + alto;
  }

  function pdfPaginaPropuesta(doc, numeroInforme, sector, cliente, resultado, t, agente) {
    doc.addPage();
    pdfEncabezadoSuperior(doc, numeroInforme);
    var mejorNombre = pdfMejorNombre(sector, resultado);
    var w = doc.internal.pageSize.getWidth();
    var y = pdfTituloNumerado(doc, 44, 3, pdfTruncar(doc, "Nuestra propuesta: " + mejorNombre, w - 40));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);
    var intro = doc.splitTextToSize(
      "Con " + mejorNombre + " tu coste baja de " + U.formatEur(t.costeActualAnual / 12) + " a " + U.formatEur(t.costePropuestaAnual / 12) + " al mes.",
      w - 28
    );
    doc.text(intro, 14, y);
    y += intro.length * 5 + 6;

    var colW = (w - 28 - 8) / 2;
    var filasResumen = [
      ["Paga hoy", U.formatEur(t.costeActualAnual / 12) + " / mes"],
      ["Pagara con " + pdfMejorNombreCorto(sector, resultado), U.formatEur(t.costePropuestaAnual / 12) + " / mes"],
      ["Diferencia mensual", U.formatEur((t.costeActualAnual - t.costePropuestaAnual) / 12) + " / mes"],
      ["Ahorro anual (IVA incl.)", U.formatEur(t.ahorroAnual)],
    ];
    doc.autoTable({
      startY: y,
      margin: { left: 14 },
      tableWidth: colW,
      body: filasResumen,
      theme: "plain",
      styles: { fontSize: 8.6, cellPadding: 2.8, textColor: PDF_COLOR.texto },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    });
    var leftEndY = doc.lastAutoTable.finalY;

    var cardX = 14 + colW + 8;
    var cardY = y - 4;
    var cardH = Math.max(leftEndY - cardY, 38);
    doc.setFillColor.apply(doc, PDF_COLOR.navy);
    doc.roundedRect(cardX, cardY, colW, cardH, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor.apply(doc, PDF_COLOR.oro);
    doc.text("AHORRO ANUAL GARANTIZADO", cardX + 7, cardY + 10);
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(U.formatEur(t.ahorroAnual), cardX + 7, cardY + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor.apply(doc, PDF_COLOR.mudoClaro);
    doc.text("IVA incluido · " + U.formatEur(t.ahorroAnual * 3) + " en 3 años", cardX + 7, cardY + 29);
    doc.setTextColor.apply(doc, PDF_COLOR.texto);

    y = Math.max(leftEndY, cardY + cardH) + 10;

    y = pdfTituloSeccionSimple(doc, y, "Por que elegir esta propuesta");
    y = pdfChecklist2col(doc, y, pdfVentajasPropuesta(sector, resultado));

    y = pdfTituloSeccionSimple(doc, y, "Por que con Integral Connection Consulting");
    y = pdfChecklist2col(doc, y, PDF_VENTAJAS_ICC);

    var h = doc.internal.pageSize.getHeight();
    if (y > h - 95) y = h - 95;
    y = pdfCTAFinal(doc, y + 2, t, agente);
    pdfAceptacionFirma(doc, y, mejorNombre, t.ahorroAnual, agente);
  }

  function pdfPiePagina(doc) {
    var pageCount = doc.internal.getNumberOfPages();
    var w = doc.internal.pageSize.getWidth();
    var h = doc.internal.pageSize.getHeight();
    for (var i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, PDF_COLOR.oro);
      doc.setLineWidth(0.5);
      doc.line(14, h - 12, w - 14, h - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor.apply(doc, PDF_COLOR.mudo);
      doc.text("Integral Connection Consulting · Estudio orientativo sujeto a confirmacion de condiciones con la comercializadora", 14, h - 7.5);
      doc.text(String(i) + " / " + pageCount, w - 14, h - 7.5, { align: "right" });
    }
  }

  function generarPdfComparativa(cliente, sector, datosEntrada, resultado) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      U.toast("No se pudo cargar el generador de PDF (revisa la conexion o recarga la pagina)", "error");
      return;
    }
    try {
      var t = resultado.totales;
      var doc = new window.jspdf.jsPDF();
      var numeroInforme = pdfNumeroInforme(cliente);
      var agente = (window.icc.auth && window.icc.auth.state && window.icc.auth.state.user) || null;

      var y = pdfEncabezadoSuperior(doc, numeroInforme);
      y = pdfHeroBand(doc, sector, cliente, datosEntrada, y);
      y = pdfStatCardsHero(doc, y, [
        { label: "Lo que paga hoy", value: U.formatEur(t.costeActualAnual / 12), sub: U.formatEur(t.costeActualAnual) + " al año", variant: "rojo" },
        { label: "Con nuestra propuesta", value: U.formatEur(t.costePropuestaAnual / 12), sub: pdfMejorNombreCorto(sector, resultado), variant: "neutro" },
        {
          label: "Ahorro anual · IVA incluido",
          value: U.formatEur(t.ahorroAnual),
          sub: U.formatEur(t.ahorroAnual / 12) + " al mes × 12 meses",
          variant: "oscuro",
        },
      ]);

      y = pdfTituloNumerado(doc, y, 1, "Diagnostico: lo que esta pagando");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, PDF_COLOR.texto);
      var w = doc.internal.pageSize.getWidth();
      var fraseLineas = doc.splitTextToSize(pdfFraseDiagnostico(sector, resultado, t), w - 28);
      doc.text(fraseLineas, 14, y);
      y += fraseLineas.length * 4.6 + 6;

      var filasDiagnostico =
        sector === "energia" ? pdfFilasDiagnosticoEnergia(resultado) : sector === "telefonia" ? pdfFilasDiagnosticoTelefonia(resultado) : pdfFilasDiagnosticoAlarmas(resultado);
      y = pdfDiagnosticoTabla(doc, y, filasDiagnostico);
      pdfCallouts(doc, y, pdfCalloutsSector(sector, resultado, t));

      pdfPaginaComparativa(doc, numeroInforme, sector, resultado, t);
      pdfPaginaPropuesta(doc, numeroInforme, sector, cliente, resultado, t, agente);
      pdfPiePagina(doc);

      var prefijo = sector === "energia" ? "auditoria-energia-" : sector === "telefonia" ? "auditoria-telecomunicaciones-" : "auditoria-alarmas-";
      doc.save(prefijo + U.slugFile(cliente.razon_social || "cliente") + ".pdf");
      U.toast("PDF generado: revisa la carpeta de Descargas de tu navegador", "success");
    } catch (err) {
      console.error("generarPdfComparativa", err);
      U.toast("No se pudo generar el PDF de esta comparativa. Prueba a recargar la pagina (Ctrl+F5) y repetir.", "error");
    }
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
            if (["energia", "telefonia", "alarmas"].indexOf(sectorComparador) !== -1) {
              accionExtra = '<a class="icc-btn icc-btn-ghost" href="#/comparador/nueva/' + presupuesto.cliente_id + "/" + sectorComparador + '">Ejecutar Comparador</a>';
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
      (esAdmin
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
    viewTarifas: viewTarifas,
    viewComparadorWizard: viewComparadorWizard,
    viewPresupuestos: viewPresupuestos,
    viewPresupuestoDetalle: viewPresupuestoDetalle,
    viewInformes: viewInformes,
  };
})();
