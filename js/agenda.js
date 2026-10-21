/* =============================================================================
   ICC CRM · Agenda comercial avanzada
   Vistas Dia / Semana / Mes / Año / Lista, citas a cualquier minuto,
   arrastrar para mover, citas vinculadas a clientes del CRM y ficha de cita
   con resumen de la reunion, proximos pasos, historial del cliente,
   pasar a presupuesto, programar seguimiento y auditoria del comparador.
   ============================================================================= */
window.icc = window.icc || {};

window.icc.agenda = (function () {
  var U = window.icc.util;
  var C = window.ICC_CONST;
  var D = window.icc.data;

  var HORA_MIN_DEFECTO = 7;
  var HORA_MAX_DEFECTO = 21;
  var PX_MIN = 1.1; // alto en px de cada minuto en las vistas Dia/Semana
  var DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  var DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
  var MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  var VISTAS = [["dia", "Día"], ["semana", "Semana"], ["equipo", "Equipo"], ["mes", "Mes"], ["anio", "Año"], ["lista", "Lista"]];
  // "Equipo" (una fila por comercial) solo tiene sentido para quien ve a varios.
  function vistasDisponibles() {
    return VISTAS.filter(function (v) { return v[0] !== "equipo" || esGestor(); });
  }
  var ESTADOS_ABIERTOS = ["programada", "confirmada", "reprogramada"];
  var agendaV2 = true;
  var agendaV3 = false; // visitas asignadas a equipos (sql/migracion_citas_equipos.sql)
  var equiposCache = null;

  function main() {
    return document.getElementById("icc-main");
  }

  function esc(v) {
    return U.escapeHtml(v == null ? "" : String(v));
  }

  // ------------------------------------------------------------- Fechas
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function hoy() {
    return iso(new Date());
  }
  function aFecha(s) {
    var p = String(s).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function mas(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }
  function lunes(d) {
    var x = new Date(d.getTime());
    var dow = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dow);
    return x;
  }
  function hm(t) {
    return String(t || "").slice(0, 5);
  }
  function aMin(t) {
    var p = hm(t).split(":");
    return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
  }
  function deMin(m) {
    m = Math.max(0, Math.min(24 * 60 - 1, Math.round(m)));
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }
  function redondear5(m) {
    return Math.round(m / 5) * 5;
  }
  function mayuscula(t) {
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }
  function fechaLarga(s) {
    return aFecha(s).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  // ------------------------------------------------------------- Metadatos
  function meta(mapa, k, def) {
    return (C[mapa] && C[mapa][k]) || def || { label: k, color: "#94a3b8", icono: "📌" };
  }
  function sectores() {
    return Object.keys(C.SECTORES_CITA).filter(function (s) {
      return agendaV2 || ["seguros", "financiero"].indexOf(s) === -1;
    });
  }
  function estados() {
    return C.ESTADOS_CITA_ORDEN.filter(function (e) {
      return agendaV2 || e !== "confirmada";
    });
  }
  function esGestor() {
    return window.icc.auth.esBackofficeOAdmin();
  }
  function puedeGestionar() {
    return window.icc.auth.puede("agenda.gestionar");
  }

  // ------------------------------------------------- Visitas por equipo
  // Equipos (Jefe de equipo + comerciales) donde quien entra puede dejar visitas.
  async function cargarEquipos(forzar) {
    if (!esGestor()) return [];
    if (equiposCache && !forzar) return equiposCache;
    try {
      var r = await D.equiposAgenda();
      agendaV3 = !!r.agenda_v3;
      equiposCache = r.equipos || [];
    } catch (err) {
      equiposCache = [];
    }
    return equiposCache;
  }
  function sinAsignar(c) {
    return agendaV3 && (c.comercial_id === null || c.comercial_id === undefined || c.comercial_id === "");
  }
  function nombreCompleto(x) {
    return (x.nombre + " " + (x.apellidos || "")).trim();
  }
  function textoAsignado(c) {
    return sinAsignar(c) ? "📥 Por asignar" + (c.equipo_nombre ? " · equipo de " + c.equipo_nombre : "") : c.comercial_nombre ? "👤 " + c.comercial_nombre : "";
  }
  function textoConcertada(c) {
    return c.creado_por_nombre && String(c.creado_por) !== String(c.comercial_id) ? "📞 Concertada por " + c.creado_por_nombre : "";
  }
  function equipoDe(equipos, id) {
    return equipos.filter(function (e) { return String(e.id) === String(id); })[0] || null;
  }

  /**
   * <option> de "Asignar a": yo, y por cada equipo la bandeja "por asignar"
   * (la reparte el Jefe de equipo) y sus comerciales. Valores "c:<id>" (comercial)
   * o "eq:<id>" (bandeja del equipo).
   */
  function opcionesAsignacion(equipos, agentes, base) {
    var miId = String(window.icc.auth.state.user.id);
    var actual = base && base.comercial_id ? "c:" + base.comercial_id : base && base.equipo_id ? "eq:" + base.equipo_id : "c:" + miId;
    var vistos = {};
    var opts = [];
    var grupo = function (label, items) { if (items.length) opts.push({ grupo: label, items: items }); };
    vistos[miId] = true;
    grupo("", [{ v: "c:" + miId, t: "Yo (mi agenda)" }]);
    equipos.forEach(function (eq) {
      var items = [];
      if (String(eq.id) !== miId) items.push({ v: "eq:" + eq.id, t: "📥 Por asignar — que la reparta " + eq.nombre });
      eq.comerciales.forEach(function (x) {
        vistos[x.id] = true;
        items.push({ v: "c:" + x.id, t: nombreCompleto(x) });
      });
      grupo("Equipo de " + nombreCompleto(eq), items);
    });
    grupo("Otros", (agentes || []).filter(function (a) {
      return !vistos[a.id] && (a.rol === "comercial" || a.rol === "jefe_de_equipo") && !Number(a.bloqueado);
    }).map(function (a) { vistos[a.id] = true; return { v: "c:" + a.id, t: nombreCompleto(a) }; }));
    var hay = opts.some(function (g) { return g.items.some(function (i) { return i.v === actual; }); });
    if (!hay && base && (base.comercial_id || base.equipo_id)) {
      grupo("Asignación actual", [{ v: actual, t: base.comercial_nombre || (base.equipo_nombre ? "📥 Por asignar · equipo de " + base.equipo_nombre : "Asignación actual") }]);
    }
    return opts.map(function (g) {
      var html = g.items.map(function (i) {
        return '<option value="' + esc(i.v) + '"' + (i.v === actual ? " selected" : "") + ">" + esc(i.t) + "</option>";
      }).join("");
      return g.grupo ? '<optgroup label="' + esc(g.grupo) + '">' + html + "</optgroup>" : html;
    }).join("");
  }

  function payloadAsignacion(valor) {
    if (!valor) return {};
    var p = valor.split(":");
    return p[0] === "eq" ? { comercial_id: null, equipo_id: p[1] } : { comercial_id: p[1] };
  }

  // Bandeja del Jefe de equipo / Backoffice con las visitas sin comercial.
  function bandejaHtml(pendientes, equipos) {
    if (!pendientes.length) return "";
    return (
      '<section class="icc-card icc-ag-bandeja"><h3>📥 Visitas por asignar <span class="icc-muted">(' + pendientes.length + ")</span></h3>" +
      '<p class="icc-muted">Visitas concertadas que todavía no tienen comercial. Elige quién va y pulsa Asignar: le llegará un aviso.</p>' +
      pendientes.map(function (c) {
        var eq = equipoDe(equipos, c.equipo_id);
        var atrasada = c.fecha < hoy();
        return (
          '<div class="icc-ag-bandeja-fila' + (atrasada ? " is-atrasada" : "") + '">' +
          '<div class="icc-ag-bandeja-info" data-abrir-cita="' + c.id + '">' +
          "<strong>" + esc(mayuscula(aFecha(c.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }))) + " · " + hm(c.hora_inicio) + "–" + hm(c.hora_fin) + "</strong> " +
          iconoTipo(c) + esc(c.cliente_nombre) +
          '<span class="icc-muted">' + esc([c.direccion, c.equipo_nombre ? "Equipo de " + c.equipo_nombre : "", textoConcertada(c)].filter(Boolean).join(" · ")) + "</span>" +
          (atrasada ? '<span class="icc-ag-bandeja-alerta">⚠️ La fecha ya ha pasado</span>' : "") +
          "</div>" +
          (eq && eq.comerciales.length && puedeGestionar()
            ? '<div class="icc-ag-bandeja-accion"><select class="icc-select" data-bandeja-sel="' + c.id + '"><option value="">Elegir comercial…</option>' +
              eq.comerciales.map(function (x) { return '<option value="' + x.id + '">' + esc(nombreCompleto(x)) + "</option>"; }).join("") +
              '</select><button type="button" class="icc-btn icc-btn-primary" data-bandeja-ok="' + c.id + '">Asignar</button></div>'
            : '<span class="icc-muted">Pendiente de que la asigne ' + esc(c.equipo_nombre || "el jefe de equipo") + "</span>") +
          "</div>"
        );
      }).join("") +
      "</section>"
    );
  }

  function enlazarBandeja(cont, ctx) {
    cont.querySelectorAll("[data-bandeja-ok]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var id = b.getAttribute("data-bandeja-ok");
        var sel = cont.querySelector('[data-bandeja-sel="' + id + '"]');
        if (!sel.value) {
          U.toast("Elige el comercial que irá a la visita", "error");
          sel.focus();
          return;
        }
        b.disabled = true;
        try {
          var res = await D.actualizarCita(id, { comercial_id: sel.value });
          U.toast("Visita asignada a " + sel.options[sel.selectedIndex].text, "success");
          if (res && res.aviso) U.toast(res.aviso, "info");
          ctx.recargar();
        } catch (err) {
          U.toast(err.message || "No se pudo asignar la visita", "error");
          b.disabled = false;
        }
      });
    });
  }

  // ------------------------------------------------------------- Estado / URL
  function leerParams() {
    var p = new URLSearchParams(location.hash.split("?")[1] || "");
    var vista = p.get("vista");
    return {
      vista: vistasDisponibles().some(function (v) { return v[0] === vista; }) ? vista : "semana",
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(p.get("fecha") || "") ? p.get("fecha") : hoy(),
      comercial_id: p.get("comercial_id") || "",
      estado: p.get("estado") || "",
      sector: p.get("sector") || "",
      tipo: p.get("tipo") || "",
      q: p.get("q") || "",
      sin_asignar: p.get("sin_asignar") ? "1" : "",
      cita: p.get("cita") || "",
    };
  }

  function href(st, cambios) {
    var x = Object.assign({}, st, cambios || {});
    var p = new URLSearchParams();
    ["vista", "fecha", "comercial_id", "sin_asignar", "estado", "sector", "tipo", "q"].forEach(function (k) {
      if (x[k]) p.set(k, x[k]);
    });
    return "#/agenda?" + p.toString();
  }

  function rango(st) {
    var f = aFecha(st.fecha);
    if (st.vista === "dia" || st.vista === "equipo") return [st.fecha, st.fecha];
    if (st.vista === "semana") return [iso(lunes(f)), iso(mas(lunes(f), 6))];
    if (st.vista === "anio") return [f.getFullYear() + "-01-01", f.getFullYear() + "-12-31"];
    var ini = new Date(f.getFullYear(), f.getMonth(), 1);
    var fin = new Date(f.getFullYear(), f.getMonth() + 1, 0);
    if (st.vista === "mes") return [iso(lunes(ini)), iso(mas(lunes(fin), 6))];
    return [iso(ini), iso(fin)]; // lista = mes completo
  }

  function navegar(st, paso) {
    var f = aFecha(st.fecha);
    if (st.vista === "dia" || st.vista === "equipo") return iso(mas(f, paso));
    if (st.vista === "semana") return iso(mas(f, 7 * paso));
    if (st.vista === "anio") return iso(new Date(f.getFullYear() + paso, f.getMonth(), 1));
    return iso(new Date(f.getFullYear(), f.getMonth() + paso, 1));
  }

  function titulo(st) {
    var f = aFecha(st.fecha);
    if (st.vista === "dia" || st.vista === "equipo") return fechaLarga(st.fecha);
    if (st.vista === "semana") {
      var l = lunes(f);
      var d = mas(l, 6);
      return "Semana del " + l.getDate() + " " + MESES[l.getMonth()].toLowerCase() + " al " + d.getDate() + " " + MESES[d.getMonth()].toLowerCase() + " " + d.getFullYear();
    }
    if (st.vista === "anio") return String(f.getFullYear());
    return MESES[f.getMonth()] + " " + f.getFullYear();
  }

  function filtrosApi(st) {
    var f = {};
    ["comercial_id", "sin_asignar", "estado", "sector", "tipo", "q"].forEach(function (k) {
      if (st[k]) f[k] = st[k];
    });
    return f;
  }

  // ===================================================================== VISTA
  async function view() {
    var st = leerParams();
    main().innerHTML = '<div class="icc-loading">Cargando agenda…</div>';
    var r = rango(st);
    var filtros = Object.assign({ desde: r[0], hasta: r[1] }, filtrosApi(st));
    var datos, kpis, agentes, resumenAnio, equipos, pendientes;
    try {
      equipos = await cargarEquipos(true);
      var res = await Promise.all([
        st.vista === "anio" ? Promise.resolve({ citas: [] }) : D.listarCitasRango(filtros),
        D.kpisAgenda(hoy(), st.comercial_id ? { comercial_id: st.comercial_id } : {}).catch(function () { return null; }),
        esGestor() ? D.listarAgentes({}).catch(function () { return []; }) : Promise.resolve([]),
        st.vista === "anio" ? D.resumenAnualCitas(aFecha(st.fecha).getFullYear(), filtrosApi(st)) : Promise.resolve(null),
        agendaV3 && esGestor()
          ? D.listarCitasRango({ sin_asignar: 1, desde: iso(mas(new Date(), -30)) }).catch(function () { return { citas: [] }; })
          : Promise.resolve({ citas: [] }),
      ]);
      datos = res[0];
      kpis = res[1];
      agentes = res[2];
      resumenAnio = res[3];
      pendientes = (res[4].citas || []).filter(function (c) { return c.estado !== "ko" && c.estado !== "realizada"; });
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + esc(err.message || "No se pudo cargar la agenda") + "</p>";
      return;
    }
    if (datos.agenda_v2 === false || (kpis && kpis.agenda_v2 === false)) agendaV2 = false;
    if (datos.agenda_v3) agendaV3 = true;
    var citas = datos.citas || [];
    var anioActual = aFecha(st.fecha).getFullYear();
    prepararColores(agentes, citas);
    var nHechas = citas.filter(function (c) { return c.estado === "realizada"; }).length;
    var nPersonas = Object.keys(citas.reduce(function (o, c) { o[sinAsignar(c) ? "sin" : c.comercial_id] = 1; return o; }, {})).length;

    main().innerHTML =
      '<header class="icc-ag-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">📅 Agenda comercial</span>' +
      "<h1>" + esc(mayuscula(titulo(st))) + "</h1>" +
      (st.vista !== "anio"
        ? '<p class="icc-ag-hero-res"><b>' + citas.length + "</b> " + (citas.length === 1 ? "cita" : "citas") +
          (nHechas ? ' · <b class="ok">' + nHechas + "</b> realizadas" : "") +
          (esGestor() && nPersonas ? " · <b>" + nPersonas + "</b> " + (nPersonas === 1 ? "persona" : "personas") : "") + "</p>"
        : "") +
      "</div>" +
      '<div class="icc-ag-hero-acc">' +
      (puedeGestionar() ? '<button class="icc-btn icc-btn-primary icc-ag-btn-nueva" id="btn-nueva-cita">+ Nueva cita</button>' : "") +
      "</div></header>" +
      (!agendaV2
        ? '<div class="icc-aviso icc-aviso-oro">⚠️ Importa <code>sql/migracion_agenda_avanzada.sql</code> para vincular citas a clientes, tipos de cita, resúmenes y pasar a presupuesto.</div>'
        : "") +
      (kpis ? kpisHtml(kpis.kpis) : "") +
      '<div id="ag-bandeja">' + bandejaHtml(pendientes, equipos) + "</div>" +
      '<section class="icc-card icc-ag-barra">' +
      '<div class="icc-ag-fila">' +
      '<div class="icc-tabs icc-ag-vistas">' +
      vistasDisponibles().map(function (v) {
        return '<a class="icc-tab' + (st.vista === v[0] ? " is-active" : "") + '" href="' + href(st, { vista: v[0] }) + '">' + v[1] + "</a>";
      }).join("") +
      "</div>" +
      '<div class="icc-ag-nav">' +
      '<a class="icc-btn icc-btn-ghost" href="' + href(st, { fecha: navegar(st, -1) }) + '" title="Anterior">←</a>' +
      '<a class="icc-btn icc-btn-secondary" href="' + href(st, { fecha: hoy() }) + '">Hoy</a>' +
      '<a class="icc-btn icc-btn-ghost" href="' + href(st, { fecha: navegar(st, 1) }) + '" title="Siguiente">→</a>' +
      '<select class="icc-select icc-ag-sel-anio" id="ag-anio" title="Año">' +
      [anioActual - 3, anioActual - 2, anioActual - 1, anioActual, anioActual + 1, anioActual + 2].map(function (a) {
        return '<option value="' + a + '"' + (a === anioActual ? " selected" : "") + ">" + a + "</option>";
      }).join("") +
      "</select>" +
      '<input class="icc-input icc-ag-ir" type="date" id="ag-ir" value="' + st.fecha + '" title="Ir a fecha">' +
      "</div></div>" +
      '<form id="ag-filtros" class="icc-filtros-row">' +
      '<input class="icc-input" name="q" placeholder="🔎 Buscar cliente, contacto, teléfono o resumen" value="' + esc(st.q) + '">' +
      (esGestor()
        ? '<select class="icc-select" name="comercial_id"><option value="">Todo el equipo</option>' +
          (agendaV3 ? '<option value="__sin"' + (st.sin_asignar ? " selected" : "") + ">📥 Por asignar</option>" : "") +
          agentes.map(function (a) {
            return '<option value="' + a.id + '"' + (String(a.id) === st.comercial_id ? " selected" : "") + ">" + esc(a.nombre + " " + (a.apellidos || "")) + "</option>";
          }).join("") + "</select>"
        : "") +
      (agendaV2
        ? '<select class="icc-select" name="tipo"><option value="">Tipo: todos</option>' +
          Object.keys(C.TIPOS_CITA).map(function (t) {
            return '<option value="' + t + '"' + (t === st.tipo ? " selected" : "") + ">" + C.TIPOS_CITA[t].icono + " " + C.TIPOS_CITA[t].label + "</option>";
          }).join("") + "</select>"
        : "") +
      '<select class="icc-select" name="estado"><option value="">Estado: todos</option>' +
      estados().map(function (e) {
        return '<option value="' + e + '"' + (e === st.estado ? " selected" : "") + ">" + C.ESTADOS_CITA[e].label + "</option>";
      }).join("") + "</select>" +
      '<select class="icc-select" name="sector"><option value="">Sector: todos</option>' +
      sectores().map(function (s) {
        return '<option value="' + s + '"' + (s === st.sector ? " selected" : "") + ">" + C.SECTORES_CITA[s].label + "</option>";
      }).join("") + "</select>" +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      "</form></section>" +
      (st.vista !== "anio" ? leyendaHtml(st, citas) : "") +
      '<div id="ag-cuerpo"></div>';

    var cuerpo = document.getElementById("ag-cuerpo");
    var ctx = { st: st, citas: citas, agentes: agentes, recargar: view };
    var bandeja = document.getElementById("ag-bandeja");
    enlazarBandeja(bandeja, ctx);
    enlazarCitas(bandeja, ctx);
    if (st.vista === "dia") pintarRejilla(cuerpo, ctx, [aFecha(st.fecha)]);
    else if (st.vista === "semana") pintarTablero(cuerpo, ctx);
    else if (st.vista === "equipo") pintarEquipo(cuerpo, ctx);
    else if (st.vista === "mes") pintarMes(cuerpo, ctx);
    else if (st.vista === "anio") pintarAnio(cuerpo, ctx, resumenAnio);
    else pintarLista(cuerpo, ctx);

    var btnNueva = document.getElementById("btn-nueva-cita");
    if (btnNueva) {
      btnNueva.addEventListener("click", function () {
        modalCita(null, { fecha: st.vista === "dia" || st.vista === "equipo" ? st.fecha : hoy(), agentes: agentes, onGuardado: view });
      });
    }
    document.getElementById("ag-filtros").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var com = fd.get("comercial_id") || "";
      location.hash = href(st, {
        q: (fd.get("q") || "").trim(),
        comercial_id: com === "__sin" ? "" : com,
        sin_asignar: com === "__sin" ? "1" : "",
        tipo: fd.get("tipo") || "",
        estado: fd.get("estado") || "",
        sector: fd.get("sector") || "",
      });
    });
    document.getElementById("ag-anio").addEventListener("change", function (e) {
      var f = aFecha(st.fecha);
      location.hash = href(st, { fecha: iso(new Date(Number(e.target.value), f.getMonth(), 1)) });
    });
    document.getElementById("ag-ir").addEventListener("change", function (e) {
      if (e.target.value) location.hash = href(st, { fecha: e.target.value, vista: st.vista === "anio" ? "dia" : st.vista });
    });
    // Enlace directo a una cita (p. ej. desde un aviso de la campana).
    if (st.cita) {
      history.replaceState(null, "", href(st));
      abrirFicha(st.cita, { agentes: agentes, onCambio: view });
    }
  }

  function kpisHtml(k) {
    var cerradas = (k.mes_realizadas || 0) + (k.mes_ko || 0);
    var exito = cerradas ? Math.round(((k.mes_realizadas || 0) / cerradas) * 100) : 0;
    var tarjeta = function (valor, label, color, link, icono) {
      var inner = '<span class="icc-ag-kpi-ico">' + (icono || "•") + '</span><span class="icc-stat-value">' + valor + '</span><span class="icc-stat-label">' + label + "</span>";
      return link
        ? '<a class="icc-stat-card icc-ag-kpi" style="--stat-color:' + color + '" href="' + link + '">' + inner + "</a>"
        : '<div class="icc-stat-card icc-ag-kpi" style="--stat-color:' + color + '">' + inner + "</div>";
    };
    return (
      '<div class="icc-ag-kpis">' +
      tarjeta(k.hoy || 0, "Citas hoy", "var(--cian)", "#/agenda?vista=dia", "☀️") +
      tarjeta(k.semana || 0, "Esta semana", "#a78bfa", "#/agenda?vista=semana", "🗓️") +
      tarjeta(k.mes || 0, "Este mes", "var(--oro)", "#/agenda?vista=mes", "📆") +
      tarjeta(exito + "%", "Éxito del mes (" + (k.mes_realizadas || 0) + " realizadas / " + (k.mes_ko || 0) + " KO)", "var(--esmeralda)", "#/agenda?vista=lista&estado=realizada", "🏆") +
      tarjeta(k.sin_cerrar || 0, "Pasadas sin cerrar", (k.sin_cerrar ? "#f87171" : "#94a3b8"), "#/agenda?vista=lista&estado=programada", "⏳") +
      (agendaV2 ? tarjeta(k.sin_resumen || 0, "Realizadas sin resumen", (k.sin_resumen ? "#fbbf24" : "#94a3b8"), "#/agenda?vista=lista&estado=realizada", "📝") : "") +
      (agendaV3 && esGestor() && k.por_asignar !== undefined ? tarjeta(k.por_asignar || 0, "Visitas por asignar", (k.por_asignar ? "#f59e0b" : "#94a3b8"), "#/agenda?vista=lista&sin_asignar=1", "📥") : "") +
      "</div>"
    );
  }

  // ------------------------------------------------ Colores por comercial
  // Cada comercial tiene su color en todas las vistas (mismo orden = mismo color).
  var PALETA = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#FB923C", "#4ADE80", "#E879F9", "#2DD4BF", "#F87171", "#93C5FD", "#FDE047", "#C084FC"];
  var COLOR_SIN_ASIGNAR = "#F59E0B";
  var mapaColores = {};
  function prepararColores(agentes, citas) {
    var ids = {};
    (agentes || []).forEach(function (a) { ids[a.id] = true; });
    (citas || []).forEach(function (c) { if (c.comercial_id) ids[c.comercial_id] = true; });
    mapaColores = {};
    Object.keys(ids).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id, i) { mapaColores[id] = PALETA[i % PALETA.length]; });
  }
  function colorComercial(c) {
    if (sinAsignar(c)) return COLOR_SIN_ASIGNAR;
    var id = Number(c.comercial_id) || 0;
    return mapaColores[id] || PALETA[id % PALETA.length];
  }
  // Por comercial cuando se ve a varios; por sector cuando es la agenda de uno solo.
  function colorCita(c, porComercial) {
    return porComercial || sinAsignar(c) ? colorComercial(c) : meta("SECTORES_CITA", c.sector).color;
  }
  function iniciales(nombre) {
    return String(nombre || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join("") || "?";
  }
  function avatarComercial(c, tam) {
    var nombre = sinAsignar(c) ? "Por asignar" : (c.comercial_nombre || "");
    return '<span class="icc-ag-ava" style="--c:' + colorComercial(c) + (tam ? ";--t:" + tam + "px" : "") + '" title="' + esc(nombre) + '">' +
      (sinAsignar(c) ? "📥" : esc(iniciales(nombre))) + "</span>";
  }

  // Leyenda: quien tiene citas en el periodo (clic = ver solo las suyas).
  function leyendaHtml(st, citas) {
    if (!esGestor() || !citas.length) return "";
    var grupos = {};
    citas.forEach(function (c) {
      var k = sinAsignar(c) ? "sin" : String(c.comercial_id);
      if (!grupos[k]) grupos[k] = { c: c, n: 0 };
      grupos[k].n++;
    });
    var lista = Object.keys(grupos).map(function (k) { return grupos[k]; }).sort(function (a, b) { return b.n - a.n; });
    return (
      '<div class="icc-ag-leyenda">' +
      lista.map(function (g) {
        var activo = (st.comercial_id && String(g.c.comercial_id) === st.comercial_id) || (st.sin_asignar && sinAsignar(g.c));
        var destino = sinAsignar(g.c)
          ? href(st, { comercial_id: "", sin_asignar: activo ? "" : "1" })
          : href(st, { comercial_id: activo ? "" : String(g.c.comercial_id), sin_asignar: "" });
        return (
          '<a class="icc-ag-leyenda-item' + (activo ? " is-activo" : "") + '" style="--c:' + colorComercial(g.c) + '" href="' + destino + '" title="' + (activo ? "Ver todo el equipo" : "Ver solo sus citas") + '">' +
          avatarComercial(g.c, 24) + "<span>" + esc(sinAsignar(g.c) ? "Por asignar" : g.c.comercial_nombre || "Sin nombre") + "</span><b>" + g.n + "</b></a>"
        );
      }).join("") +
      (st.comercial_id || st.sin_asignar ? '<a class="icc-ag-leyenda-item is-todos" href="' + href(st, { comercial_id: "", sin_asignar: "" }) + '">✕ Ver todo el equipo</a>' : "") +
      "</div>"
    );
  }

  // ============================================================ SEMANA
  // Tablero: una columna por dia y una tarjeta grande por cita, ordenadas
  // por hora. Se lee bien aunque un dia tenga muchas citas a la vez.
  function tarjetaTablero(c, porComercial) {
    var e = meta("ESTADOS_CITA", c.estado);
    var t = meta("TIPOS_CITA", c.tipo || "visita", { icono: "📌", label: "Cita" });
    var s = meta("SECTORES_CITA", c.sector);
    var ahora = c.fecha === hoy() && ESTADOS_ABIERTOS.indexOf(c.estado) !== -1 && (function () {
      var n = new Date(); var m = n.getHours() * 60 + n.getMinutes();
      return m >= aMin(c.hora_inicio) && m < aMin(c.hora_fin);
    })();
    return (
      '<article class="icc-ag-tcard' + claseEstado(c) + (ahora ? " is-ahora" : "") + '" style="--c:' + colorCita(c, porComercial) + '" data-abrir-cita="' + c.id + '"' +
      (puedeGestionar() ? ' draggable="true" data-drag-cita="' + c.id + '"' : "") + ">" +
      '<header><span class="icc-ag-tcard-hora">' + hm(c.hora_inicio) + "<small> – " + hm(c.hora_fin) + "</small></span>" +
      (agendaV2 ? '<span class="icc-ag-tcard-tipo" title="' + esc(t.label) + '">' + t.icono + "</span>" : "") + "</header>" +
      '<h4 title="' + esc(c.cliente_nombre) + '">' + esc(c.cliente_nombre) + "</h4>" +
      (c.direccion ? '<p class="icc-ag-tcard-dir">📍 ' + esc(c.direccion) + "</p>" : c.contacto_nombre ? '<p class="icc-ag-tcard-dir">👤 ' + esc(c.contacto_nombre) + "</p>" : "") +
      "<footer>" +
      (porComercial || sinAsignar(c)
        ? avatarComercial(c, 22) + '<span class="icc-ag-tcard-com">' + esc(sinAsignar(c) ? "Por asignar" : c.comercial_nombre || "") + "</span>"
        : '<span class="icc-ag-tcard-sector" style="--s:' + s.color + '">' + esc(s.label) + "</span>") +
      (ahora
        ? '<span class="icc-ag-tcard-estado" style="--e:' + e.color + '">● Ahora</span>'
        : '<span class="icc-ag-tcard-punto" style="--e:' + e.color + '" title="' + esc(e.label) + '" aria-label="' + esc(e.label) + '"></span>') +
      "</footer></article>"
    );
  }

  function pintarTablero(cont, ctx) {
    var st = ctx.st;
    var porComercial = esGestor() && !st.comercial_id;
    var l = lunes(aFecha(st.fecha));
    var dias = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return mas(l, i); });
    var porDia = dias.map(function (d) {
      var f = iso(d);
      return ctx.citas.filter(function (c) { return c.fecha === f; }).sort(function (a, b) { return aMin(a.hora_inicio) - aMin(b.hora_inicio); });
    });
    var max = Math.max(1, Math.max.apply(null, porDia.map(function (x) { return x.length; })));
    cont.innerHTML =
      '<section class="icc-ag-tablero">' +
      dias.map(function (d, i) {
        var f = iso(d);
        var lista = porDia[i];
        var hechas = lista.filter(function (c) { return c.estado === "realizada"; }).length;
        return (
          '<div class="icc-ag-tcol' + (f === hoy() ? " is-hoy" : "") + (f < hoy() ? " is-pasado" : "") + (i >= 5 ? " is-finde" : "") + '" data-col-dia="' + f + '">' +
          '<a class="icc-ag-tcol-head" href="' + href(st, { vista: "dia", fecha: f }) + '" title="Ver el horario de este día">' +
          '<span class="icc-ag-tcol-dow">' + (f === hoy() ? "Hoy · " : "") + DIAS[i] + "</span>" +
          '<span class="icc-ag-tcol-num">' + d.getDate() + " <small>" + MESES[d.getMonth()].slice(0, 3).toLowerCase() + "</small></span>" +
          '<span class="icc-ag-tcol-info">' + (lista.length ? lista.length + (lista.length === 1 ? " cita" : " citas") + (hechas ? " · " + hechas + " ✓" : "") : "Libre") + "</span>" +
          '<span class="icc-ag-tcol-carga"><i style="width:' + Math.round((lista.length / max) * 100) + '%"></i></span></a>' +
          '<div class="icc-ag-tcol-body">' +
          lista.map(function (c) { return tarjetaTablero(c, porComercial); }).join("") +
          (!lista.length ? '<p class="icc-ag-tcol-vacio">Sin citas</p>' : "") +
          (puedeGestionar() ? '<button type="button" class="icc-ag-tcol-add" data-nueva-dia="' + f + '">+ Agendar</button>' : "") +
          "</div></div>"
        );
      }).join("") +
      "</section>" +
      (puedeGestionar() ? '<p class="icc-muted icc-ag-ayuda">Arrastra una cita a otro día para moverla (mantiene la hora) · pulsa la cabecera de un día para ver su horario.</p>' : "");

    if (puedeGestionar()) {
      cont.querySelectorAll("[data-nueva-dia]").forEach(function (b) {
        b.addEventListener("click", function () {
          modalCita(null, { fecha: b.getAttribute("data-nueva-dia"), agentes: ctx.agentes, onGuardado: ctx.recargar });
        });
      });
      cont.querySelectorAll("[data-col-dia]").forEach(function (col) {
        col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("is-drop"); });
        col.addEventListener("dragleave", function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove("is-drop"); });
        col.addEventListener("drop", function (e) {
          e.preventDefault();
          col.classList.remove("is-drop");
          var cita = ctx.citas.filter(function (c) { return String(c.id) === e.dataTransfer.getData("text/plain"); })[0];
          if (cita) moverCita(cita, col.getAttribute("data-col-dia"), hm(cita.hora_inicio), hm(cita.hora_fin), ctx.recargar);
        });
      });
    }
    enlazarCitas(cont, ctx);
  }

  // ============================================================ EQUIPO
  // Linea de tiempo del dia: una fila por comercial, horas en horizontal.
  function pintarEquipo(cont, ctx) {
    var st = ctx.st;
    var f = st.fecha;
    var delDia = ctx.citas.filter(function (c) { return c.fecha === f; });
    // Solo las horas con citas (minimo 9:00-18:00), con margen de media hora.
    var hMin = 9;
    var hMax = 18;
    if (delDia.length) {
      hMin = Math.min.apply(null, delDia.map(function (c) { return Math.floor(aMin(c.hora_inicio) / 60); }));
      hMax = Math.max.apply(null, delDia.map(function (c) { return Math.ceil(aMin(c.hora_fin) / 60); }));
      hMin = Math.min(hMin, 9);
      hMax = Math.max(hMax, Math.min(hMin + 9, 21));
    }
    var total = (hMax - hMin) * 60;
    var pos = function (m) { return Math.max(0, Math.min(100, ((m - hMin * 60) / total) * 100)); };

    // Filas: el equipo (aunque no tenga citas, para ver quien esta libre),
    // mas cualquiera con citas ese dia y la bandeja "por asignar".
    var filas = {};
    var orden = [];
    function fila(id, nombre, muestra) {
      if (!filas[id]) {
        filas[id] = { id: id, nombre: nombre, muestra: muestra, citas: [] };
        orden.push(id);
      }
      return filas[id];
    }
    if (!st.sin_asignar) {
      (ctx.agentes || []).filter(function (a) {
        return (a.rol === "comercial" || a.rol === "jefe_de_equipo") && !Number(a.bloqueado) && (!st.comercial_id || String(a.id) === st.comercial_id);
      }).forEach(function (a) {
        fila(String(a.id), (a.nombre + " " + (a.apellidos || "")).trim(), { comercial_id: a.id, comercial_nombre: a.nombre + " " + (a.apellidos || "") });
      });
    }
    delDia.forEach(function (c) {
      var k = sinAsignar(c) ? "sin" : String(c.comercial_id);
      fila(k, sinAsignar(c) ? "Por asignar" : c.comercial_nombre || "Sin nombre", c).citas.push(c);
    });
    orden.sort(function (a, b) {
      if (a === "sin") return -1;
      if (b === "sin") return 1;
      return filas[b].citas.length - filas[a].citas.length || filas[a].nombre.localeCompare(filas[b].nombre);
    });

    var horas = "";
    for (var h = hMin; h <= hMax; h++) horas += '<span style="left:' + pos(h * 60) + '%">' + String(h).padStart(2, "0") + ":00</span>";
    var lineas = "";
    for (h = hMin; h <= hMax; h++) lineas += '<i class="icc-ag-eq-linea" style="left:' + pos(h * 60) + '%"></i>';
    var n = new Date();
    var mAhora = n.getHours() * 60 + n.getMinutes();
    var lineaAhora = f === hoy() && mAhora >= hMin * 60 && mAhora <= hMax * 60 ? '<i class="icc-ag-eq-ahora" style="left:' + pos(mAhora) + '%"></i>' : "";
    var conAgenda = 0;

    var cuerpo = orden.map(function (k) {
      var fi = filas[k];
      // Carriles para las citas que se solapan del mismo comercial.
      var carriles = [];
      fi.citas.sort(function (a, b) { return aMin(a.hora_inicio) - aMin(b.hora_inicio); }).forEach(function (c) {
        var ini = aMin(c.hora_inicio);
        var i = 0;
        while (i < carriles.length && carriles[i] > ini) i++;
        carriles[i] = aMin(c.hora_fin);
        c._carril = i;
      });
      if (fi.citas.length) conAgenda++;
      var minutos = fi.citas.reduce(function (s, c) { return s + Math.max(0, aMin(c.hora_fin) - aMin(c.hora_inicio)); }, 0);
      return (
        '<div class="icc-ag-eq-fila' + (fi.citas.length ? "" : " is-libre") + '" style="--carriles:' + Math.max(1, carriles.length) + ";--c:" + colorComercial(fi.muestra) + '">' +
        '<div class="icc-ag-eq-quien">' + avatarComercial(fi.muestra, 36) +
        "<div><strong>" + esc(fi.nombre) + "</strong><small>" +
        (fi.citas.length ? fi.citas.length + (fi.citas.length === 1 ? " cita" : " citas") + " · " + Math.round(minutos / 6) / 10 + " h" : "Libre") +
        "</small></div></div>" +
        '<div class="icc-ag-eq-pista"' + (puedeGestionar() && k !== "sin" ? ' data-eq-comercial="' + esc(k) + '"' : "") + ">" + lineas + lineaAhora +
        fi.citas.map(function (c) {
          var izq = pos(aMin(c.hora_inicio));
          var der = pos(aMin(c.hora_fin));
          var e = meta("ESTADOS_CITA", c.estado);
          return (
            '<button type="button" class="icc-ag-eq-cita' + claseEstado(c) + '" style="--c:' + colorComercial(c) + ";left:" + izq + "%;width:calc(" + Math.max(der - izq, 3) + "% - 3px);top:calc(" + c._carril + ' * var(--carril) + 6px)"' +
            ' data-abrir-cita="' + c.id + '" title="' + esc(hm(c.hora_inicio) + "–" + hm(c.hora_fin) + " · " + c.cliente_nombre + " · " + e.label + (c.direccion ? " · " + c.direccion : "")) + '">' +
            '<span class="icc-ag-eq-hora"><i style="background:' + e.color + '"></i>' + hm(c.hora_inicio) + "–" + hm(c.hora_fin) + "</span>" +
            "<strong>" + iconoTipo(c) + esc(c.cliente_nombre) + "</strong></button>"
          );
        }).join("") +
        "</div></div>"
      );
    }).join("");

    cont.innerHTML =
      '<section class="icc-card icc-ag-equipo">' +
      '<div class="icc-ag-eq-top"><div><h3>' + esc(mayuscula(fechaLarga(f))) + "</h3>" +
      '<p class="icc-muted">' + delDia.length + (delDia.length === 1 ? " cita" : " citas") + " · " + conAgenda + " de " + orden.length + (orden.length === 1 ? " persona" : " personas") + " con agenda</p></div></div>" +
      // 150 px por hora: una cita de 30 min ya deja leer el nombre del cliente.
      '<div class="icc-ag-eq-scroll"><div class="icc-ag-eq-grid" style="min-width:' + (210 + (hMax - hMin) * 150) + 'px">' +
      '<div class="icc-ag-eq-cab"><div class="icc-ag-eq-quien-cab">Comercial</div><div class="icc-ag-eq-horas">' + horas + "</div></div>" +
      (orden.length ? cuerpo : '<p class="icc-empty">No hay nadie que mostrar con estos filtros.</p>') +
      "</div></div></section>" +
      (puedeGestionar() ? '<p class="icc-muted icc-ag-ayuda">Haz clic en el hueco de un comercial para agendarle una cita a esa hora.</p>' : "");

    // Lleva el scroll a la primera cita del dia (o a la hora actual).
    var scrollEq = cont.querySelector(".icc-ag-eq-scroll");
    var primeraEq = delDia.length ? Math.min.apply(null, delDia.map(function (c) { return aMin(c.hora_inicio); })) : (f === hoy() ? mAhora : hMin * 60);
    if (scrollEq) scrollEq.scrollLeft = Math.max(0, ((primeraEq - hMin * 60 - 30) / 60) * 150);
    if (puedeGestionar()) {
      cont.querySelectorAll("[data-eq-comercial]").forEach(function (pista) {
        pista.addEventListener("click", function (e) {
          if (e.target.closest("[data-abrir-cita]")) return;
          var r = pista.getBoundingClientRect();
          var m = redondear5(hMin * 60 + ((e.clientX - r.left) / r.width) * total);
          modalCita(null, {
            fecha: f, horaInicio: deMin(m), horaFin: deMin(m + 60),
            plantilla: { comercial_id: pista.getAttribute("data-eq-comercial") },
            agentes: ctx.agentes, onGuardado: ctx.recargar,
          });
        });
      });
    }
    enlazarCitas(cont, ctx);
  }

  // ------------------------------------------------------ Bloque de cita
  function claseEstado(c) {
    return (c.estado === "ko" ? " is-ko" : c.estado === "realizada" ? " is-hecha" : "") + (sinAsignar(c) ? " is-sin-asignar" : "");
  }

  function iconoTipo(c) {
    return agendaV2 && c.tipo ? meta("TIPOS_CITA", c.tipo, { icono: "📌" }).icono + " " : "";
  }

  function chipCita(c, mostrarComercial) {
    return (
      '<button type="button" class="icc-ag-chip' + claseEstado(c) + '" style="--c:' + colorCita(c, mostrarComercial) + '" data-abrir-cita="' + c.id + '"' +
      (puedeGestionar() ? ' draggable="true" data-drag-cita="' + c.id + '"' : "") +
      ' title="' + esc(hm(c.hora_inicio) + " · " + c.cliente_nombre + (c.comercial_nombre ? " · " + c.comercial_nombre : "")) + '">' +
      (mostrarComercial || sinAsignar(c) ? avatarComercial(c, 18) : "") +
      '<span class="icc-ag-chip-hora">' + hm(c.hora_inicio) + '</span><span class="icc-ag-chip-txt">' + iconoTipo(c) + esc(c.cliente_nombre) + "</span>" +
      "</button>"
    );
  }

  // Reparte en columnas las citas que se solapan (vista Dia/Semana).
  function columnasSolapes(lista) {
    var orden = lista.slice().sort(function (a, b) { return aMin(a.hora_inicio) - aMin(b.hora_inicio) || aMin(b.hora_fin) - aMin(a.hora_fin); });
    var grupos = [];
    var grupo = null;
    var finGrupo = -1;
    orden.forEach(function (c) {
      var ini = aMin(c.hora_inicio);
      if (!grupo || ini >= finGrupo) {
        grupo = [];
        grupos.push(grupo);
        finGrupo = -1;
      }
      grupo.push(c);
      finGrupo = Math.max(finGrupo, aMin(c.hora_fin));
    });
    var res = [];
    grupos.forEach(function (g) {
      var cols = [];
      g.forEach(function (c) {
        var ini = aMin(c.hora_inicio);
        var col = 0;
        while (cols[col] != null && cols[col] > ini) col++;
        cols[col] = aMin(c.hora_fin);
        res.push({ c: c, col: col });
      });
      res.forEach(function (x) {
        if (g.indexOf(x.c) !== -1) x.total = cols.length;
      });
    });
    return res;
  }

  // ====================================================== DIA / SEMANA
  function pintarRejilla(cont, ctx, dias) {
    var st = ctx.st;
    var citas = ctx.citas;
    var horaMin = HORA_MIN_DEFECTO;
    var horaMax = HORA_MAX_DEFECTO;
    citas.forEach(function (c) {
      horaMin = Math.min(horaMin, Math.floor(aMin(c.hora_inicio) / 60));
      horaMax = Math.max(horaMax, Math.ceil(aMin(c.hora_fin) / 60));
    });
    var minIni = horaMin * 60;
    var px = dias.length === 1 ? 1.7 : PX_MIN; // vista Dia: mas alto, se lee mejor
    var alto = (horaMax - horaMin) * 60 * px;
    var mostrarComercial = esGestor() && !st.comercial_id;
    var esDia = dias.length === 1;

    var horas = "";
    for (var h = horaMin; h <= horaMax; h++) {
      horas += '<div class="icc-ag-hora" style="top:' + (h - horaMin) * 60 * px + 'px">' + String(h).padStart(2, "0") + ":00</div>";
    }
    var lineas = "";
    for (var m = 0; m <= (horaMax - horaMin) * 60; m += 30) {
      lineas += '<div class="icc-ag-linea' + (m % 60 ? " is-media" : "") + '" style="top:' + m * px + 'px"></div>';
    }

    var ahora = new Date();
    var minAhora = ahora.getHours() * 60 + ahora.getMinutes();

    var columnas = dias.map(function (d) {
      var f = iso(d);
      var delDia = citas.filter(function (c) { return c.fecha === f; });
      var bloques = columnasSolapes(delDia).map(function (x) {
        var c = x.c;
        var e = meta("ESTADOS_CITA", c.estado);
        var top = (aMin(c.hora_inicio) - minIni) * px;
        var h = Math.max(30, (aMin(c.hora_fin) - aMin(c.hora_inicio)) * px - 3);
        var ancho = 100 / x.total;
        return (
          '<div class="icc-ag-bloque' + claseEstado(c) + '" style="--c:' + colorCita(c, mostrarComercial) + ";top:" + top + "px;height:" + h + "px;left:calc(" + x.col * ancho + "% + 2px);width:calc(" + ancho + '% - 4px)"' +
          ' data-abrir-cita="' + c.id + '"' + (puedeGestionar() ? ' draggable="true" data-drag-cita="' + c.id + '"' : "") +
          ' title="' + esc(hm(c.hora_inicio) + "–" + hm(c.hora_fin) + " · " + c.cliente_nombre) + '">' +
          '<span class="icc-ag-bloque-hora">' + hm(c.hora_inicio) + "–" + hm(c.hora_fin) + ' <i style="background:' + e.color + '"></i></span>' +
          '<strong>' + (sinAsignar(c) ? "📥 " : "") + iconoTipo(c) + esc(c.cliente_nombre) + "</strong>" +
          (h > 50 && (c.contacto_nombre || c.telefono) ? "<span>" + esc([c.contacto_nombre, c.telefono].filter(Boolean).join(" · ")) + "</span>" : "") +
          (h > 44 && (mostrarComercial || sinAsignar(c)) ? '<span class="icc-ag-bloque-com">' + avatarComercial(c, 18) + esc(sinAsignar(c) ? "Por asignar" : c.comercial_nombre || "") + "</span>" : "") +
          (h > 90 && c.direccion ? "<span>📍 " + esc(c.direccion) + "</span>" : "") +
          "</div>"
        );
      }).join("");
      var lineaAhora = f === hoy() && minAhora >= minIni && minAhora <= horaMax * 60
        ? '<div class="icc-ag-ahora" style="top:' + (minAhora - minIni) * px + 'px"></div>'
        : "";
      return '<div class="icc-ag-col' + (f === hoy() ? " is-hoy" : "") + '" data-col-fecha="' + f + '" style="height:' + alto + 'px">' + lineas + bloques + lineaAhora + "</div>";
    }).join("");

    var cabeceras = dias.map(function (d) {
      var f = iso(d);
      var n = citas.filter(function (c) { return c.fecha === f; }).length;
      return (
        '<a class="icc-ag-cab' + (f === hoy() ? " is-hoy" : "") + '" href="' + href(st, { vista: "dia", fecha: f }) + '">' +
        "<span>" + DIAS[(d.getDay() + 6) % 7] + "</span><strong>" + d.getDate() + "</strong>" +
        (n ? '<em>' + n + (n === 1 ? " cita" : " citas") + "</em>" : "<em>&nbsp;</em>") + "</a>"
      );
    }).join("");

    var listaDia = "";
    if (esDia) {
      var delDia = citas.filter(function (c) { return c.fecha === st.fecha; });
      listaDia =
        '<aside class="icc-card icc-ag-lateral"><h3>Citas del día (' + delDia.length + ")</h3>" +
        (delDia.length ? delDia.map(function (c) { return tarjetaCita(c, mostrarComercial); }).join("") : '<p class="icc-empty">Día libre. Haz clic en una hora de la rejilla para agendar.</p>') +
        "</aside>";
    }

    cont.innerHTML =
      '<div class="' + (esDia ? "icc-ag-dia-layout" : "") + '">' +
      '<section class="icc-card icc-ag-rejilla-card">' +
      '<div class="icc-ag-rejilla' + (esDia ? " is-dia" : "") + '">' +
      '<div class="icc-ag-cabs"><div></div>' + cabeceras + "</div>" +
      '<div class="icc-ag-scroll"><div class="icc-ag-cuerpo">' +
      '<div class="icc-ag-horas" style="height:' + alto + 'px">' + horas + "</div>" + columnas +
      "</div></div></div>" +
      (puedeGestionar() ? '<p class="icc-muted icc-ag-ayuda">Haz clic en un hueco para agendar a esa hora (cualquier minuto) y arrastra una cita para moverla.</p>' : "") +
      "</section>" + listaDia + "</div>";

    // Desplaza la vista a la hora actual (o a las 8:00).
    // Abre la rejilla en la primera cita del periodo (o a las 8:00 si es antes).
    var scroll = cont.querySelector(".icc-ag-scroll");
    var primera = citas.reduce(function (m, c) { return Math.min(m, aMin(c.hora_inicio)); }, 8 * 60);
    scroll.scrollTop = Math.max(0, primera - 30 - minIni) * px;

    // Clic en hueco -> nueva cita a esa hora.
    if (puedeGestionar()) {
      cont.querySelectorAll("[data-col-fecha]").forEach(function (col) {
        col.addEventListener("click", function (e) {
          if (e.target.closest("[data-abrir-cita]")) return;
          var y = e.clientY - col.getBoundingClientRect().top;
          var ini = redondear5(minIni + y / px);
          modalCita(null, { fecha: col.getAttribute("data-col-fecha"), horaInicio: deMin(ini), horaFin: deMin(ini + 60), agentes: ctx.agentes, onGuardado: ctx.recargar });
        });
        col.addEventListener("dragover", function (e) {
          e.preventDefault();
          col.classList.add("is-drop");
        });
        col.addEventListener("dragleave", function () { col.classList.remove("is-drop"); });
        col.addEventListener("drop", function (e) {
          e.preventDefault();
          col.classList.remove("is-drop");
          var id = e.dataTransfer.getData("text/plain");
          var cita = ctx.citas.filter(function (c) { return String(c.id) === id; })[0];
          if (!cita) return;
          var desplaz = Number(e.dataTransfer.getData("application/x-offset") || 0);
          var y = e.clientY - col.getBoundingClientRect().top - desplaz;
          var ini = redondear5(minIni + y / px);
          var dur = aMin(cita.hora_fin) - aMin(cita.hora_inicio);
          moverCita(cita, col.getAttribute("data-col-fecha"), deMin(ini), deMin(ini + dur), ctx.recargar);
        });
      });
    }
    enlazarCitas(cont, ctx);
  }

  function moverCita(cita, fecha, ini, fin, recargar) {
    if (fecha === cita.fecha && ini === hm(cita.hora_inicio)) return;
    D.actualizarCita(cita.id, { fecha: fecha, hora_inicio: ini, hora_fin: fin })
      .then(function (res) {
        U.toast("Cita movida al " + aFecha(fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " a las " + ini, "success");
        if (res && res.aviso) U.toast(res.aviso, "info");
        recargar();
      })
      .catch(function (err) { U.toast(err.message || "No se pudo mover la cita", "error"); });
  }

  // Abrir ficha al hacer clic y arrastrar (comun a todas las vistas).
  function enlazarCitas(cont, ctx) {
    cont.querySelectorAll("[data-abrir-cita]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest("a, [data-accion-cita]")) return;
        e.stopPropagation();
        abrirFicha(el.getAttribute("data-abrir-cita"), { agentes: ctx.agentes, onCambio: ctx.recargar });
      });
    });
    cont.querySelectorAll("[data-drag-cita]").forEach(function (el) {
      el.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", el.getAttribute("data-drag-cita"));
        e.dataTransfer.setData("application/x-offset", String(e.clientY - el.getBoundingClientRect().top));
        e.dataTransfer.effectAllowed = "move";
        el.classList.add("is-arrastrando");
      });
      el.addEventListener("dragend", function () { el.classList.remove("is-arrastrando"); });
    });
    cont.querySelectorAll("[data-accion-cita]").forEach(function (b) {
      b.addEventListener("click", async function (e) {
        e.stopPropagation();
        var id = b.getAttribute("data-id");
        var accion = b.getAttribute("data-accion-cita");
        try {
          if (accion === "estado") {
            await D.actualizarCita(id, { estado: b.getAttribute("data-valor") });
            U.toast("Cita marcada como " + meta("ESTADOS_CITA", b.getAttribute("data-valor")).label, "success");
            if (b.getAttribute("data-valor") === "realizada" && agendaV2) {
              abrirFicha(id, { agentes: ctx.agentes, onCambio: ctx.recargar, enfocarResumen: true });
            }
          }
          ctx.recargar();
        } catch (err) {
          U.toast(err.message || "No se pudo actualizar", "error");
        }
      });
    });
  }

  function tarjetaCita(c, mostrarComercial) {
    var s = meta("SECTORES_CITA", c.sector);
    var e = meta("ESTADOS_CITA", c.estado);
    var abierta = ESTADOS_ABIERTOS.indexOf(c.estado) !== -1;
    return (
      '<div class="icc-ag-tarjeta' + claseEstado(c) + '" style="--c:' + colorCita(c, mostrarComercial) + '" data-abrir-cita="' + c.id + '">' +
      '<div class="icc-ag-tarjeta-head"><strong>' + hm(c.hora_inicio) + "–" + hm(c.hora_fin) + "</strong>" +
      '<span class="icc-badge" style="--badge-color:' + e.color + '">' + esc(e.label) + "</span></div>" +
      '<p class="icc-ag-tarjeta-cliente">' + iconoTipo(c) + esc(c.cliente_nombre) +
      (c.cliente_id ? ' <span class="icc-badge" style="--badge-color:#22d3ee">CRM</span>' : "") + "</p>" +
      (c.contacto_nombre || c.telefono ? '<p class="icc-muted">' + esc([c.contacto_nombre, c.telefono].filter(Boolean).join(" · ")) + "</p>" : "") +
      ((mostrarComercial || sinAsignar(c)) && textoAsignado(c) ? '<p class="icc-ag-tarjeta-com">' + avatarComercial(c, 22) + esc(sinAsignar(c) ? textoAsignado(c) : c.comercial_nombre) + "</p>" : "") +
      (textoConcertada(c) ? '<p class="icc-muted">' + esc(textoConcertada(c)) + "</p>" : "") +
      (c.resumen ? '<p class="icc-ag-resumen">📝 ' + esc(String(c.resumen).slice(0, 160)) + (String(c.resumen).length > 160 ? "…" : "") + "</p>" : "") +
      (c.proximos_pasos ? '<p class="icc-muted">➡️ ' + esc(c.proximos_pasos) + "</p>" : "") +
      '<div class="icc-ag-tarjeta-acciones">' +
      '<span class="icc-chip" style="background:color-mix(in srgb, ' + s.color + ' 18%, transparent);color:' + s.color + '">' + esc(s.label) + "</span>" +
      (c.telefono ? '<a class="icc-link-btn" href="tel:' + esc(c.telefono.replace(/\s+/g, "")) + '">📞</a>' : "") +
      (c.direccion ? '<a class="icc-link-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.direccion) + '">📍</a>' : "") +
      (puedeGestionar() && abierta
        ? '<button type="button" class="icc-link-btn" style="color:var(--esmeralda)" data-accion-cita="estado" data-id="' + c.id + '" data-valor="realizada">✓ Realizada</button>' +
          '<button type="button" class="icc-link-btn" style="color:var(--red)" data-accion-cita="estado" data-id="' + c.id + '" data-valor="ko">✕ KO</button>'
        : "") +
      "</div></div>"
    );
  }

  // ================================================================ MES
  function pintarMes(cont, ctx) {
    var st = ctx.st;
    var f = aFecha(st.fecha);
    var ini = lunes(new Date(f.getFullYear(), f.getMonth(), 1));
    var mostrarComercial = esGestor() && !st.comercial_id;
    var celdas = "";
    for (var i = 0; i < 42; i++) {
      var d = mas(ini, i);
      var fi = iso(d);
      var delDia = ctx.citas.filter(function (c) { return c.fecha === fi; });
      var fuera = d.getMonth() !== f.getMonth();
      celdas +=
        '<div class="icc-ag-celda' + (fuera ? " is-fuera" : "") + (fi === hoy() ? " is-hoy" : "") + '" data-celda-fecha="' + fi + '">' +
        '<div class="icc-ag-celda-head"><a href="' + href(st, { vista: "dia", fecha: fi }) + '">' + d.getDate() + "</a>" +
        (delDia.length ? '<span class="icc-ag-num">' + delDia.length + "</span>" : "") + "</div>" +
        delDia.slice(0, 4).map(function (c) { return chipCita(c, mostrarComercial); }).join("") +
        (delDia.length > 4 ? '<a class="icc-ag-mas" href="' + href(st, { vista: "dia", fecha: fi }) + '">+' + (delDia.length - 4) + " más</a>" : "") +
        "</div>";
    }
    cont.innerHTML =
      '<section class="icc-card icc-ag-mes-card"><div class="icc-ag-mes">' +
      DIAS.map(function (n) { return '<div class="icc-ag-mes-dow">' + n + "</div>"; }).join("") + celdas +
      "</div>" + (puedeGestionar() ? '<p class="icc-muted icc-ag-ayuda">Doble clic en un día para agendar · arrastra una cita a otro día para moverla.</p>' : "") + "</section>";

    if (puedeGestionar()) {
      cont.querySelectorAll("[data-celda-fecha]").forEach(function (celda) {
        celda.addEventListener("dblclick", function (e) {
          if (e.target.closest("[data-abrir-cita]")) return;
          modalCita(null, { fecha: celda.getAttribute("data-celda-fecha"), agentes: ctx.agentes, onGuardado: ctx.recargar });
        });
        celda.addEventListener("dragover", function (e) { e.preventDefault(); celda.classList.add("is-drop"); });
        celda.addEventListener("dragleave", function () { celda.classList.remove("is-drop"); });
        celda.addEventListener("drop", function (e) {
          e.preventDefault();
          celda.classList.remove("is-drop");
          var cita = ctx.citas.filter(function (c) { return String(c.id) === e.dataTransfer.getData("text/plain"); })[0];
          if (cita) moverCita(cita, celda.getAttribute("data-celda-fecha"), hm(cita.hora_inicio), hm(cita.hora_fin), ctx.recargar);
        });
      });
    }
    enlazarCitas(cont, ctx);
  }

  // ================================================================ AÑO
  function pintarAnio(cont, ctx, resumen) {
    var st = ctx.st;
    var anio = aFecha(st.fecha).getFullYear();
    var porDia = {};
    var total = 0, realizadas = 0, ko = 0;
    (resumen && resumen.dias || []).forEach(function (d) {
      porDia[d.fecha] = d;
      total += Number(d.total);
      realizadas += Number(d.realizadas);
      ko += Number(d.ko);
    });
    var maximo = Math.max.apply(null, [1].concat(Object.keys(porDia).map(function (k) { return Number(porDia[k].total); })));

    var meses = MESES.map(function (nombre, m) {
      var primero = new Date(anio, m, 1);
      var ini = lunes(primero);
      var totalMes = 0;
      var celdas = DIAS_CORTOS.map(function (d) { return '<span class="icc-ag-mini-dow">' + d + "</span>"; }).join("");
      for (var i = 0; i < 42; i++) {
        var d = mas(ini, i);
        if (d.getMonth() !== m) {
          celdas += "<span></span>";
          continue;
        }
        var fi = iso(d);
        var n = porDia[fi] ? Number(porDia[fi].total) : 0;
        totalMes += n;
        var nivel = n ? Math.min(4, Math.ceil((n / maximo) * 4)) : 0;
        celdas += '<a class="icc-ag-mini-dia nivel-' + nivel + (fi === hoy() ? " is-hoy" : "") + '" href="' + href(st, { vista: "dia", fecha: fi }) + '" title="' + esc(fechaLarga(fi) + (n ? " · " + n + " citas" : "")) + '">' + d.getDate() + "</a>";
      }
      return (
        '<div class="icc-ag-mini"><a class="icc-ag-mini-titulo" href="' + href(st, { vista: "mes", fecha: iso(primero) }) + '">' + nombre +
        ' <span class="icc-muted">' + (totalMes ? totalMes + (totalMes === 1 ? " cita" : " citas") : "") + "</span></a>" +
        '<div class="icc-ag-mini-grid">' + celdas + "</div></div>"
      );
    }).join("");

    cont.innerHTML =
      '<section class="icc-card">' +
      '<div class="icc-ag-anio-resumen">' +
      "<div><strong>" + total + "</strong><span>citas en " + anio + "</span></div>" +
      '<div><strong style="color:var(--esmeralda)">' + realizadas + "</strong><span>realizadas</span></div>" +
      '<div><strong style="color:var(--red)">' + ko + "</strong><span>KO</span></div>" +
      "<div><strong>" + (realizadas + ko ? Math.round((realizadas / (realizadas + ko)) * 100) : 0) + "%</strong><span>tasa de éxito</span></div>" +
      '<div class="icc-ag-leyenda">Menos <i class="nivel-0"></i><i class="nivel-1"></i><i class="nivel-2"></i><i class="nivel-3"></i><i class="nivel-4"></i> Más</div>' +
      "</div>" +
      '<div class="icc-ag-anio">' + meses + "</div></section>";
  }

  // ================================================================ LISTA
  function pintarLista(cont, ctx) {
    var st = ctx.st;
    var mostrarComercial = esGestor() && !st.comercial_id;
    var porDia = {};
    ctx.citas.forEach(function (c) { (porDia[c.fecha] = porDia[c.fecha] || []).push(c); });
    var dias = Object.keys(porDia).sort();
    cont.innerHTML =
      '<section class="icc-card">' +
      (dias.length
        ? dias.map(function (f) {
            return (
              '<div class="icc-ag-lista-dia"><a class="icc-ag-lista-fecha' + (f === hoy() ? " is-hoy" : "") + '" href="' + href(st, { vista: "dia", fecha: f }) + '">' +
              esc(mayuscula(fechaLarga(f))) + ' <span class="icc-muted">· ' + porDia[f].length + (porDia[f].length === 1 ? " cita" : " citas") + "</span></a>" +
              '<div class="icc-ag-lista-grid">' + porDia[f].map(function (c) { return tarjetaCita(c, mostrarComercial); }).join("") + "</div></div>"
            );
          }).join("")
        : '<p class="icc-empty">No hay citas en ' + esc(titulo(st)) + " con estos filtros.</p>") +
      "</section>";
    enlazarCitas(cont, ctx);
  }

  // ======================================================== FICHA DE CITA
  async function abrirFicha(id, opts) {
    opts = opts || {};
    var datos;
    try {
      datos = await D.obtenerCita(id);
    } catch (err) {
      U.toast(err.message || "No se pudo abrir la cita", "error");
      return;
    }
    if (datos.agenda_v2 === false) agendaV2 = false;
    if (datos.agenda_v3) agendaV3 = true;
    var equipos = await cargarEquipos();
    var c = datos.cita;
    var cliente = datos.cliente;
    var s = meta("SECTORES_CITA", c.sector);
    var t = meta("TIPOS_CITA", c.tipo || "visita", { label: "Cita", icono: "📌" });
    var gestiona = puedeGestionar();
    var telLimpio = (c.telefono || "").replace(/[^\d+]/g, "");
    var whatsapp = telLimpio ? "https://wa.me/" + (telLimpio.indexOf("+") === 0 ? telLimpio.slice(1) : (telLimpio.length === 9 ? "34" + telLimpio : telLimpio)) : "";

    U.openModal(
      '<div class="icc-ag-ficha">' +
      '<div class="icc-ag-ficha-head" style="--c:' + s.color + '">' +
      "<div><p class=\"icc-cmp-kicker\">" + t.icono + " " + esc(t.label) + " · " + esc(s.label) + "</p>" +
      "<h2>" + esc(c.cliente_nombre) + "</h2>" +
      '<p class="icc-muted">' + esc(mayuscula(fechaLarga(c.fecha))) + " · " + hm(c.hora_inicio) + "–" + hm(c.hora_fin) +
      (textoAsignado(c) ? " · " + esc(textoAsignado(c)) : "") + "</p>" +
      (textoConcertada(c) ? '<p class="icc-muted">' + esc(textoConcertada(c)) + "</p>" : "") + "</div>" +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>✕</button></div>' +
      '<div class="icc-ag-estados">' +
      estados().map(function (e) {
        var m = C.ESTADOS_CITA[e];
        return '<button type="button" class="icc-ag-estado' + (c.estado === e ? " is-activo" : "") + '" style="--badge-color:' + m.color + '" data-ficha-estado="' + e + '"' + (gestiona ? "" : " disabled") + ">" + esc(m.label) + "</button>";
      }).join("") +
      "</div>" +
      '<div class="icc-ag-ficha-grid">' +
      // --- Columna izquierda: contacto + cliente + acciones
      "<div>" +
      '<section class="icc-ag-bloque-ficha"><h3>Contacto</h3>' +
      fila("Persona", c.contacto_nombre) + fila("Teléfono", c.telefono) + fila("Email", c.email) + fila("Dirección", c.direccion) +
      '<div class="icc-ag-botones">' +
      (c.telefono ? '<a class="icc-btn icc-btn-ghost" href="tel:' + esc(telLimpio) + '">📞 Llamar</a>' : "") +
      (whatsapp ? '<a class="icc-btn icc-btn-ghost" target="_blank" rel="noopener" href="' + esc(whatsapp) + '">💬 WhatsApp</a>' : "") +
      (c.email ? '<a class="icc-btn icc-btn-ghost" href="mailto:' + esc(c.email) + '">✉️ Email</a>' : "") +
      (c.direccion ? '<a class="icc-btn icc-btn-ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.direccion) + '">📍 Cómo llegar</a>' : "") +
      "</div></section>" +
      '<section class="icc-ag-bloque-ficha"><h3>Cliente en el CRM</h3>' +
      (cliente
        ? '<p><a href="#/clientes/' + cliente.id + '" data-cerrar>' + esc(cliente.razon_social) + "</a> · " + esc(cliente.cif) + "</p>" +
          '<p class="icc-muted">Estado: ' + esc((C.ESTADOS[cliente.estado] || {}).label || cliente.estado) + "</p>"
        : agendaV2
          ? '<p class="icc-muted">Esta cita no está vinculada a ningún cliente del CRM.</p>' +
            (gestiona ? '<div class="icc-ag-botones"><button type="button" class="icc-btn icc-btn-secondary" id="ficha-crear-cliente">+ Crear cliente con estos datos</button>' +
              '<button type="button" class="icc-btn icc-btn-ghost" id="ficha-vincular-cliente">🔗 Vincular a un cliente existente</button></div>' : "")
          : '<p class="icc-muted">Disponible al importar la migración de la agenda.</p>') +
      "</section>" +
      (gestiona && esGestor() && agendaV3
        ? '<section class="icc-ag-bloque-ficha"><h3>' + (sinAsignar(c) ? "📥 Asignar la visita" : "Comercial asignado") + "</h3>" +
          '<div class="icc-ag-asignar"><select class="icc-select" id="ficha-asignar">' + opcionesAsignacion(equipos, opts.agentes, c) + "</select>" +
          '<button type="button" class="icc-btn icc-btn-primary" id="ficha-asignar-ok">' + (sinAsignar(c) ? "Asignar" : "Reasignar") + "</button></div>" +
          '<p class="icc-muted">Al asignarla, el comercial recibe un aviso en la campana.</p></section>'
        : "") +
      (gestiona
        ? '<section class="icc-ag-bloque-ficha"><h3>Acciones</h3><div class="icc-ag-botones">' +
          (agendaV2 ? '<button type="button" class="icc-btn icc-btn-primary" id="ficha-presupuesto">' + (c.presupuesto_id ? "📄 Ver presupuesto" : "📄 Pasar a presupuesto") + "</button>" : "") +
          '<button type="button" class="icc-btn icc-btn-secondary" id="ficha-seguimiento">🔁 Programar seguimiento</button>' +
          (cliente && window.icc.auth.puede("comparador.usar") ? '<a class="icc-btn icc-btn-ghost" data-cerrar href="' + window.icc.comparador.urlHerramienta("energia", { cliente: cliente.id }) + '">💡 Auditar factura</a>' : "") +
          '<button type="button" class="icc-btn icc-btn-ghost" id="ficha-editar">✏️ Editar / reprogramar</button>' +
          '<button type="button" class="icc-btn icc-btn-ghost" id="ficha-duplicar">⧉ Duplicar</button>' +
          '<button type="button" class="icc-btn icc-btn-ghost" style="color:var(--red)" id="ficha-borrar">Borrar</button>' +
          "</div></section>"
        : "") +
      "</div>" +
      // --- Columna derecha: resumen + historial
      "<div>" +
      (c.notas ? '<section class="icc-ag-bloque-ficha"><h3>Preparación / notas</h3><p class="icc-ficha-texto">' + esc(c.notas) + "</p></section>" : "") +
      (agendaV2
        ? '<section class="icc-ag-bloque-ficha"><h3>Resumen de la reunión</h3>' +
          '<textarea class="icc-textarea icc-ag-resumen-input" id="ficha-resumen" placeholder="Qué se habló, necesidades del cliente, objeciones, compromisos…"' + (gestiona ? "" : " disabled") + ">" + esc(c.resumen || "") + "</textarea>" +
          '<div class="icc-field"><label>Próximos pasos</label><input class="icc-input" id="ficha-pasos" value="' + esc(c.proximos_pasos || "") + '" placeholder="Ej.: enviar estudio el jueves y llamar el lunes"' + (gestiona ? "" : " disabled") + "></div>" +
          (gestiona ? '<div class="icc-ag-botones"><button type="button" class="icc-btn icc-btn-primary" id="ficha-guardar-resumen">💾 Guardar resumen</button></div>' : "") +
          "</section>"
        : "") +
      '<section class="icc-ag-bloque-ficha"><h3>Historial con este cliente</h3>' +
      ((datos.historial || []).filter(function (h) { return String(h.id) !== String(c.id); }).length
        ? '<div class="icc-hist">' + datos.historial.filter(function (h) { return String(h.id) !== String(c.id); }).map(function (h) {
            var he = meta("ESTADOS_CITA", h.estado);
            return (
              '<div class="icc-hist-item"><strong>' + meta("TIPOS_CITA", h.tipo || "visita", { icono: "📌", label: "Cita" }).icono + " " + esc(aFecha(h.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })) + " · " + hm(h.hora_inicio) +
              ' <span class="icc-badge" style="--badge-color:' + he.color + '">' + esc(he.label) + "</span></strong>" +
              (h.resumen ? "<span>" + esc(h.resumen) + "</span>" : "") +
              (h.proximos_pasos ? '<span class="icc-muted">➡️ ' + esc(h.proximos_pasos) + "</span>" : "") +
              (h.comercial_nombre ? '<span class="icc-muted">👤 ' + esc(h.comercial_nombre) + "</span>" : "") + "</div>"
            );
          }).join("") + "</div>"
        : '<p class="icc-muted">Es la primera cita con este cliente.</p>') +
      ((datos.presupuestos || []).length
        ? "<h4>Presupuestos del cliente</h4>" + datos.presupuestos.map(function (p) {
            return '<p><a href="#/presupuestos/' + p.id + '" data-cerrar>📄 ' + esc((C.SECTORES[p.sector] || p.sector)) + " · " + esc((C.ESTADOS_PRESUPUESTO[p.estado] || {}).label || p.estado) + "</a> <span class=\"icc-muted\">" + U.formatFecha(p.created_at) + "</span></p>";
          }).join("")
        : "") +
      "</section>" +
      "</div></div></div>"
    );
    var modal = document.querySelector(".icc-modal");
    if (modal) modal.classList.add("icc-modal-ancho");

    var refrescar = function () {
      if (opts.onCambio) opts.onCambio();
    };
    var reabrir = function () {
      abrirFicha(id, opts);
      refrescar();
    };
    document.querySelectorAll("#icc-modal-root [data-cerrar]").forEach(function (a) {
      a.addEventListener("click", function () { U.closeModal(); });
    });
    if (opts.enfocarResumen) {
      var ta = document.getElementById("ficha-resumen");
      if (ta) ta.focus();
    }

    document.querySelectorAll("[data-ficha-estado]").forEach(function (b) {
      b.addEventListener("click", async function () {
        try {
          await D.actualizarCita(c.id, { estado: b.getAttribute("data-ficha-estado") });
          U.toast("Estado actualizado", "success");
          reabrir();
        } catch (err) {
          U.toast(err.message || "No se pudo actualizar", "error");
        }
      });
    });

    var btnAsignar = document.getElementById("ficha-asignar-ok");
    if (btnAsignar) {
      btnAsignar.addEventListener("click", async function () {
        var sel = document.getElementById("ficha-asignar");
        btnAsignar.disabled = true;
        try {
          var res = await D.actualizarCita(c.id, payloadAsignacion(sel.value));
          U.toast(sel.value.indexOf("eq:") === 0 ? "Visita enviada a la bandeja del equipo" : "Visita asignada a " + sel.options[sel.selectedIndex].text, "success");
          if (res && res.aviso) U.toast(res.aviso, "info");
          reabrir();
        } catch (err) {
          U.toast(err.message || "No se pudo asignar la visita", "error");
          btnAsignar.disabled = false;
        }
      });
    }

    var btnResumen = document.getElementById("ficha-guardar-resumen");
    if (btnResumen) {
      btnResumen.addEventListener("click", async function () {
        try {
          var payload = { resumen: document.getElementById("ficha-resumen").value, proximos_pasos: document.getElementById("ficha-pasos").value };
          if (ESTADOS_ABIERTOS.indexOf(c.estado) !== -1 && aFecha(c.fecha) <= aFecha(hoy()) && payload.resumen.trim() &&
              confirm("¿Marcar también la cita como realizada?")) {
            payload.estado = "realizada";
          }
          await D.actualizarCita(c.id, payload);
          U.toast("Resumen guardado", "success");
          reabrir();
        } catch (err) {
          U.toast(err.message || "No se pudo guardar", "error");
        }
      });
    }

    var btnCrearCliente = document.getElementById("ficha-crear-cliente");
    if (btnCrearCliente) {
      btnCrearCliente.addEventListener("click", function () { modalCrearClienteDesdeCita(c, reabrir); });
    }
    var btnVincular = document.getElementById("ficha-vincular-cliente");
    if (btnVincular) {
      btnVincular.addEventListener("click", function () { modalVincularCliente(c, reabrir); });
    }

    var btnPresupuesto = document.getElementById("ficha-presupuesto");
    if (btnPresupuesto) {
      btnPresupuesto.addEventListener("click", function () {
        if (c.presupuesto_id) {
          U.closeModal();
          location.hash = "#/presupuestos/" + c.presupuesto_id;
          return;
        }
        if (!cliente) {
          U.toast("Primero crea o vincula el cliente del CRM (bloque «Cliente en el CRM»)", "error");
          return;
        }
        modalPasarAPresupuesto(c, cliente);
      });
    }
    var btnSeg = document.getElementById("ficha-seguimiento");
    if (btnSeg) {
      btnSeg.addEventListener("click", function () {
        var base = mas(aFecha(c.fecha < hoy() ? hoy() : c.fecha), 7);
        modalCita(null, {
          fecha: iso(base),
          horaInicio: hm(c.hora_inicio),
          horaFin: deMin(aMin(c.hora_inicio) + 30),
          plantilla: {
            cliente_id: c.cliente_id, cliente_nombre: c.cliente_nombre, contacto_nombre: c.contacto_nombre, telefono: c.telefono,
            email: c.email, direccion: c.direccion, sector: c.sector, tipo: "seguimiento", comercial_id: c.comercial_id, equipo_id: c.equipo_id,
            comercial_nombre: c.comercial_nombre, equipo_nombre: c.equipo_nombre,
            notas: c.proximos_pasos ? "Seguimiento: " + c.proximos_pasos : "Seguimiento de la cita del " + aFecha(c.fecha).toLocaleDateString("es-ES"),
          },
          titulo: "Programar seguimiento",
          agentes: opts.agentes,
          onGuardado: refrescar,
        });
      });
    }
    var btnEditar = document.getElementById("ficha-editar");
    if (btnEditar) {
      btnEditar.addEventListener("click", function () {
        modalCita(c, { agentes: opts.agentes, onGuardado: reabrir });
      });
    }
    var btnDup = document.getElementById("ficha-duplicar");
    if (btnDup) {
      btnDup.addEventListener("click", function () {
        var copia = Object.assign({}, c);
        delete copia.id;
        delete copia.resumen;
        delete copia.proximos_pasos;
        delete copia.presupuesto_id;
        copia.estado = "programada";
        modalCita(null, { fecha: c.fecha, horaInicio: hm(c.hora_inicio), horaFin: hm(c.hora_fin), plantilla: copia, titulo: "Duplicar cita", agentes: opts.agentes, onGuardado: refrescar });
      });
    }
    var btnBorrar = document.getElementById("ficha-borrar");
    if (btnBorrar) {
      btnBorrar.addEventListener("click", async function () {
        if (!confirm("¿Borrar esta cita? No se puede deshacer.")) return;
        try {
          await D.borrarCita(c.id);
          U.closeModal();
          U.toast("Cita borrada", "success");
          refrescar();
        } catch (err) {
          U.toast(err.message || "No se pudo borrar", "error");
        }
      });
    }
  }

  function fila(label, valor) {
    return '<div class="icc-data-row"><span class="icc-muted">' + label + "</span><span>" + esc(valor || "—") + "</span></div>";
  }

  function modalCrearClienteDesdeCita(c, despues) {
    U.openModal(
      "<h2>Crear cliente desde la cita</h2>" +
      '<form id="form-cliente-cita" class="icc-form">' +
      '<div class="icc-field"><label>Nombre / Razón social *</label><input class="icc-input" name="razon_social" required value="' + esc(c.cliente_nombre) + '"></div>' +
      '<div class="icc-field"><label>NIF / CIF *</label><input class="icc-input" name="cif" required></div>' +
      '<div class="icc-field"><label>Persona de contacto</label><input class="icc-input" name="contacto_nombre" value="' + esc(c.contacto_nombre) + '"></div>' +
      '<div class="icc-field"><label>Teléfono</label><input class="icc-input" name="contacto_telefono" value="' + esc(c.telefono) + '"></div>' +
      '<div class="icc-field"><label>Email</label><input class="icc-input" name="contacto_email" type="email" value="' + esc(c.email) + '"></div>' +
      '<div class="icc-field"><label>Dirección de suministro</label><input class="icc-input" name="direccion_suministro" value="' + esc(c.direccion) + '"></div>' +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Crear cliente y vincular</button></div></form>'
    );
    document.getElementById("form-cliente-cita").addEventListener("submit", async function (e) {
      e.preventDefault();
      var payload = Object.fromEntries(new FormData(e.target).entries());
      try {
        var nuevoId = await D.crearCliente(payload, []);
        await D.actualizarCita(c.id, { cliente_id: nuevoId });
        U.toast("Cliente creado y vinculado a la cita", "success");
        despues();
      } catch (err) {
        U.toast(err.message || "No se pudo crear el cliente", "error");
      }
    });
  }

  async function modalVincularCliente(c, despues) {
    var clientes = await D.listarClientes({}).catch(function () { return []; });
    U.openModal(
      "<h2>Vincular a un cliente del CRM</h2>" +
      '<div class="icc-form">' +
      '<input class="icc-input" type="search" id="vinc-buscar" placeholder="Busca por nombre, CIF o teléfono…" value="' + esc(c.cliente_nombre) + '">' +
      '<select class="icc-select" id="vinc-select" size="8"></select>' +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="button" class="icc-btn icc-btn-primary" id="vinc-ok">Vincular</button></div></div>'
    );
    var buscar = document.getElementById("vinc-buscar");
    var sel = document.getElementById("vinc-select");
    function pintar() {
      var q = buscar.value.toLowerCase();
      var lista = clientes.filter(function (x) {
        return !q || [x.razon_social, x.cif, x.contacto_telefono, x.telefono].join(" ").toLowerCase().indexOf(q) !== -1;
      }).slice(0, 100);
      sel.innerHTML = lista.map(function (x) { return '<option value="' + x.id + '">' + esc(x.razon_social) + " · " + esc(x.cif) + "</option>"; }).join("") || "<option disabled>Sin resultados</option>";
      if (lista.length) sel.selectedIndex = 0;
    }
    pintar();
    buscar.addEventListener("input", pintar);
    document.getElementById("vinc-ok").addEventListener("click", async function () {
      if (!sel.value) return;
      try {
        await D.actualizarCita(c.id, { cliente_id: sel.value });
        U.toast("Cita vinculada al cliente", "success");
        despues();
      } catch (err) {
        U.toast(err.message || "No se pudo vincular", "error");
      }
    });
  }

  var SECTOR_PRESUPUESTO = { energia: "energia", telecomunicaciones: "telecomunicaciones", alarmas: "alarmas", seguros: "seguros", financiero: "financiero" };

  function modalPasarAPresupuesto(c, cliente) {
    var sugerido = SECTOR_PRESUPUESTO[c.sector] || "energia";
    U.openModal(
      "<h2>Pasar a presupuesto</h2>" +
      '<p class="icc-muted">Se crea un presupuesto para <strong>' + esc(cliente.razon_social) + "</strong> con el resumen de la cita y queda enlazado a ella.</p>" +
      '<form id="form-cita-presupuesto" class="icc-form">' +
      '<div class="icc-field"><label>Sector del presupuesto</label><select class="icc-select" name="sector">' +
      Object.keys(SECTOR_PRESUPUESTO).map(function (s) {
        return '<option value="' + s + '"' + (s === sugerido ? " selected" : "") + ">" + esc(C.SECTORES[s] || s) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="icc-field"><label>Notas del presupuesto</label><textarea class="icc-textarea" name="notas">' +
      esc(["Desde la cita del " + aFecha(c.fecha).toLocaleDateString("es-ES"), c.resumen, c.proximos_pasos ? "Próximos pasos: " + c.proximos_pasos : ""].filter(Boolean).join("\n").slice(0, 500)) +
      "</textarea></div>" +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">Crear presupuesto</button></div></form>'
    );
    document.getElementById("form-cita-presupuesto").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      try {
        var presId = await D.crearPresupuesto({ cliente_id: cliente.id, sector: fd.get("sector"), notas: String(fd.get("notas") || "").slice(0, 500) });
        await D.actualizarCita(c.id, { presupuesto_id: presId });
        U.closeModal();
        U.toast("Presupuesto creado desde la cita", "success");
        location.hash = "#/presupuestos/" + presId;
      } catch (err) {
        U.toast(err.message || "No se pudo crear el presupuesto", "error");
      }
    });
  }

  // ======================================================= ALTA / EDICION
  var DURACIONES = [15, 30, 45, 60, 90, 120];

  async function modalCita(cita, opts) {
    opts = opts || {};
    var esNueva = !cita || !cita.id;
    var gestor = esGestor();
    var miId = String(window.icc.auth.state.user.id);
    var base = Object.assign(
      { fecha: opts.fecha || hoy(), sector: "energia", tipo: "visita", comercial_id: miId, estado: "programada" },
      opts.plantilla || {},
      cita || {}
    );
    var ini = opts.horaInicio || hm(base.hora_inicio) || "10:00";
    var fin = opts.horaFin || hm(base.hora_fin) || deMin(aMin(ini) + 60);
    var agentes = opts.agentes || (gestor ? await D.listarAgentes({}).catch(function () { return []; }) : []);
    var equipos = gestor ? await cargarEquipos() : [];
    var conEquipos = gestor && agendaV3 && equipos.length > 0;
    var clientes = agendaV2 ? await D.listarClientes({}).catch(function () { return []; }) : [];

    U.openModal(
      "<h2>" + (opts.titulo || (esNueva ? "Nueva cita" : "Editar cita")) + "</h2>" +
      '<form id="form-cita" class="icc-form">' +
      (agendaV2
        ? '<div class="icc-ag-tipos">' + Object.keys(C.TIPOS_CITA).map(function (t) {
            return '<label class="icc-ag-tipo"><input type="radio" name="tipo" value="' + t + '"' + (base.tipo === t ? " checked" : "") + "><span>" + C.TIPOS_CITA[t].icono + " " + C.TIPOS_CITA[t].label + "</span></label>";
          }).join("") + "</div>"
        : "") +
      '<div class="icc-form-grid">' +
      '<div class="icc-field icc-col-2 icc-ag-autocomplete"><label>Negocio / cliente *</label>' +
      '<input class="icc-input" name="cliente_nombre" required autocomplete="off" value="' + esc(base.cliente_nombre) + '" placeholder="' + (agendaV2 ? "Escribe para buscar en tus clientes del CRM…" : "Nombre del negocio") + '">' +
      '<input type="hidden" name="cliente_id" value="' + esc(base.cliente_id || "") + '">' +
      '<div class="icc-ag-sugerencias" hidden></div>' +
      '<span class="icc-ayuda" id="cita-vinculo">' + (base.cliente_id ? "🔗 Vinculada a un cliente del CRM" : (agendaV2 ? "Sin vincular: puedes crear el cliente después desde la cita." : "")) + "</span></div>" +
      (conEquipos
        ? '<div class="icc-field"><label>Asignar a</label><select class="icc-select" name="asignacion">' + opcionesAsignacion(equipos, agentes, base) + "</select>" +
          '<span class="icc-ayuda">«Por asignar»: va a la bandeja del jefe de equipo para que la reparta.</span></div>'
        : gestor
        ? '<div class="icc-field"><label>Comercial</label><select class="icc-select" name="comercial_id">' +
          agentes.map(function (a) {
            return '<option value="' + a.id + '"' + (String(a.id) === String(base.comercial_id) ? " selected" : "") + ">" + esc(a.nombre + " " + (a.apellidos || "")) + "</option>";
          }).join("") + "</select></div>"
        : "<div></div>") +
      '<div class="icc-field"><label>Persona de contacto</label><input class="icc-input" name="contacto_nombre" value="' + esc(base.contacto_nombre) + '"></div>' +
      '<div class="icc-field"><label>Teléfono</label><input class="icc-input" name="telefono" type="tel" value="' + esc(base.telefono) + '"></div>' +
      (agendaV2 ? '<div class="icc-field"><label>Email</label><input class="icc-input" name="email" type="email" value="' + esc(base.email) + '"></div>' : "<div></div>") +
      '<div class="icc-field icc-col-3"><label>Dirección</label><input class="icc-input" name="direccion" value="' + esc(base.direccion) + '"></div>' +
      '<div class="icc-field"><label>Fecha *</label><input class="icc-input" type="date" name="fecha" required value="' + esc(base.fecha) + '"></div>' +
      '<div class="icc-field"><label>Hora inicio *</label><input class="icc-input" type="time" step="60" name="hora_inicio" required value="' + esc(ini) + '"></div>' +
      '<div class="icc-field"><label>Hora fin *</label><input class="icc-input" type="time" step="60" name="hora_fin" required value="' + esc(fin) + '"></div>' +
      '<div class="icc-field icc-col-3"><label>Duración rápida</label><div class="icc-ag-duraciones">' +
      DURACIONES.map(function (m) {
        return '<button type="button" class="icc-tab" data-duracion="' + m + '">' + (m < 60 ? m + " min" : (m / 60) + " h") + "</button>";
      }).join("") + "</div></div>" +
      '<div class="icc-field"><label>Sector</label><select class="icc-select" name="sector">' +
      sectores().map(function (s) {
        return '<option value="' + s + '"' + (base.sector === s ? " selected" : "") + ">" + esc(C.SECTORES_CITA[s].label) + "</option>";
      }).join("") + "</select></div>" +
      (!esNueva
        ? '<div class="icc-field"><label>Estado</label><select class="icc-select" name="estado">' +
          estados().map(function (e) {
            return '<option value="' + e + '"' + (base.estado === e ? " selected" : "") + ">" + esc(C.ESTADOS_CITA[e].label) + "</option>";
          }).join("") + "</select></div>"
        : "<div></div>") +
      "<div></div>" +
      '<div class="icc-field icc-col-3"><label>Preparación / notas</label><textarea class="icc-textarea" name="notas" rows="3" placeholder="Qué hay que llevar, objetivo de la cita…">' + esc(base.notas) + "</textarea></div>" +
      "</div>" +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary">' + (esNueva ? "Guardar cita" : "Guardar cambios") + "</button></div>" +
      "</form>"
    );
    var form = document.getElementById("form-cita");
    var modal = document.querySelector(".icc-modal");
    if (modal) modal.classList.add("icc-modal-ancho");
    var inIni = form.querySelector('[name="hora_inicio"]');
    var inFin = form.querySelector('[name="hora_fin"]');

    // Mantener la duracion al cambiar la hora de inicio.
    var duracion = Math.max(5, aMin(fin) - aMin(ini));
    inIni.addEventListener("change", function () {
      if (inIni.value) inFin.value = deMin(aMin(inIni.value) + duracion);
    });
    inFin.addEventListener("change", function () {
      if (inIni.value && inFin.value) duracion = Math.max(5, aMin(inFin.value) - aMin(inIni.value));
    });
    form.querySelectorAll("[data-duracion]").forEach(function (b) {
      b.addEventListener("click", function () {
        duracion = Number(b.getAttribute("data-duracion"));
        if (inIni.value) inFin.value = deMin(aMin(inIni.value) + duracion);
        form.querySelectorAll("[data-duracion]").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      });
    });

    // Autocompletar con clientes del CRM.
    if (agendaV2) {
      var inNombre = form.querySelector('[name="cliente_nombre"]');
      var inClienteId = form.querySelector('[name="cliente_id"]');
      var caja = form.querySelector(".icc-ag-sugerencias");
      var vinculo = document.getElementById("cita-vinculo");
      inNombre.addEventListener("input", function () {
        inClienteId.value = "";
        vinculo.textContent = "Sin vincular: puedes crear el cliente después desde la cita.";
        var q = inNombre.value.trim().toLowerCase();
        if (q.length < 2) {
          caja.hidden = true;
          return;
        }
        var lista = clientes.filter(function (x) {
          return [x.razon_social, x.cif, x.contacto_nombre, x.contacto_telefono, x.telefono].join(" ").toLowerCase().indexOf(q) !== -1;
        }).slice(0, 8);
        caja.innerHTML = lista.map(function (x) {
          return '<button type="button" data-sug="' + x.id + '"><strong>' + esc(x.razon_social) + "</strong> <span class=\"icc-muted\">" + esc(x.cif) + (x.contacto_telefono ? " · " + esc(x.contacto_telefono) : "") + "</span></button>";
        }).join("");
        caja.hidden = !lista.length;
      });
      caja.addEventListener("click", function (e) {
        var b = e.target.closest("[data-sug]");
        if (!b) return;
        var x = clientes.filter(function (y) { return String(y.id) === b.getAttribute("data-sug"); })[0];
        inNombre.value = x.razon_social;
        inClienteId.value = x.id;
        var poner = function (name, v) {
          var el = form.querySelector('[name="' + name + '"]');
          if (el && !el.value && v) el.value = v;
        };
        poner("contacto_nombre", x.contacto_nombre);
        poner("telefono", x.contacto_telefono || x.telefono);
        poner("email", x.contacto_email || x.email);
        poner("direccion", x.direccion_suministro);
        vinculo.textContent = "🔗 Vinculada a " + x.razon_social + " (cliente del CRM)";
        caja.hidden = true;
      });
      document.addEventListener("click", function cerrar(e) {
        if (!document.body.contains(caja)) {
          document.removeEventListener("click", cerrar);
          return;
        }
        if (!e.target.closest(".icc-ag-autocomplete")) caja.hidden = true;
      });
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var payload = {};
      ["cliente_nombre", "contacto_nombre", "telefono", "direccion", "sector", "fecha", "hora_inicio", "hora_fin", "notas"].forEach(function (k) {
        payload[k] = fd.get(k) || "";
      });
      if (agendaV2) {
        payload.email = fd.get("email") || "";
        payload.tipo = fd.get("tipo") || "visita";
        payload.cliente_id = fd.get("cliente_id") || null;
      }
      if (conEquipos) Object.assign(payload, payloadAsignacion(fd.get("asignacion")));
      else if (gestor && fd.get("comercial_id")) payload.comercial_id = fd.get("comercial_id");
      if (!esNueva) payload.estado = fd.get("estado");
      if (aMin(payload.hora_fin) <= aMin(payload.hora_inicio)) {
        U.toast("La hora de fin debe ser posterior a la de inicio", "error");
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        var res = esNueva ? await D.crearCita(payload) : await D.actualizarCita(cita.id, payload);
        U.closeModal();
        U.toast(esNueva
          ? (payload.equipo_id && !payload.comercial_id ? "Visita enviada a la bandeja del equipo para el " : "Cita agendada el ") +
            aFecha(payload.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " a las " + payload.hora_inicio
          : "Cita actualizada", "success");
        if (res && res.aviso) U.toast(res.aviso, "info");
        if (opts.onGuardado) opts.onGuardado();
      } catch (err) {
        U.toast(err.message || "No se pudo guardar la cita", "error");
        btn.disabled = false;
      }
    });
  }

  async function abrirModalCitaRapida() {
    modalCita(null, {
      onGuardado: function () {
        if (location.hash.indexOf("#/agenda") === 0) view();
      },
    });
  }

  return {
    view: view,
    modalCita: modalCita,
    abrirModalCitaRapida: abrirModalCitaRapida,
    abrirFicha: abrirFicha,
  };
})();
