/* =============================================================================
   ICC CRM · Comparador (Energia y Telefonia)
   Los dos comparadores son paginas propias dentro del CRM:
     comparador/energia/    estudio de luz y gas (factura con IA, SIPS o a mano)
     comparador/telefonia/  informe de auditoria de telecomunicaciones
   Usan la misma sesion y jerarquia que el CRM. Aqui viven el panel con el
   historico de los dos y los accesos desde clientes, presupuestos y agenda.

   Rutas:
     #/comparador                       panel + historico
     #/comparador/energia?cliente=ID    abre el comparador de energia (con el cliente)
     #/comparador/telefonia?cliente=ID  abre el comparador de telefonia (con el cliente)
   ============================================================================= */
window.icc = window.icc || {};

window.icc.comparador = (function () {
  var U = window.icc.util;
  var D = window.icc.data;

  var HERRAMIENTAS = {
    energia: { titulo: "Comparador de energía", icono: "⚡", ruta: "comparador/energia/index.html",
      desc: "Luz y gas: lee la factura con IA, por CUPS (SIPS) o a mano, compara con vuestras tarifas y las de mercado y genera el informe en PDF." },
    telefonia: { titulo: "Comparador de telefonía", icono: "📶", ruta: "comparador/telefonia/index.html",
      desc: "Fibra, fijo y móvil: compara la factura actual con las operadoras, ranking por comisión y el informe de auditoría en PDF." },
  };

  function main() {
    return document.getElementById("icc-main");
  }
  function esc(v) {
    return U.escapeHtml(v == null ? "" : String(v));
  }
  function eur(n) {
    return n == null || n === "" ? "—" : U.formatEur(n);
  }

  /** URL de la pagina de un comparador (opciones: cliente, informe). */
  function urlHerramienta(tipo, opciones) {
    var h = HERRAMIENTAS[tipo] || HERRAMIENTAS.energia;
    var p = new URLSearchParams();
    if (opciones && opciones.cliente) p.set("cliente", opciones.cliente);
    if (opciones && opciones.informe) p.set("informe", opciones.informe);
    var qs = p.toString();
    return h.ruta + (qs ? "?" + qs : "");
  }

  function urlPdf(i) {
    return "api/cmp_" + i.sector + ".php?recurso=pdf&id=" + encodeURIComponent(i.id);
  }

  function resumenInforme(i) {
    return i.sector === "energia"
      ? (i.tipo === "gas" ? "Gas" : "Luz") + (i.comercializadora_actual ? " · " + i.comercializadora_actual : "") + (i.tarifa_propuesta ? " → " + i.tarifa_propuesta : "")
      : (i.operador_actual || "Operador actual") + (i.operador_propuesto ? " → " + i.operador_propuesto : "");
  }

  // ----------------------------------------------------------------- Panel
  async function viewPanel() {
    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var filtro = { tipo: params.get("tipo") || "", q: (params.get("q") || "").trim(), comercial: params.get("comercial") || "" };
    main().innerHTML = '<div class="icc-loading">Cargando comparador…</div>';

    var errores = [];
    var listas = await Promise.all(["energia", "telefonia"].map(function (t) {
      return D.informesComparador(t).catch(function (err) { errores.push(err); return []; });
    }));
    var todos = listas[0].concat(listas[1]).sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
    var sinInstalar = errores.some(function (e) { return e.status === 503; });

    var comerciales = {};
    todos.forEach(function (i) { if (i.usuario_id) comerciales[i.usuario_id] = i.usuario_nombre || ("#" + i.usuario_id); });
    var verComercial = Object.keys(comerciales).length > 1 || !window.icc.auth.tieneRol("comercial");

    var q = filtro.q.toLowerCase();
    var lista = todos.filter(function (i) {
      if (filtro.tipo && i.sector !== filtro.tipo) return false;
      if (filtro.comercial && String(i.usuario_id) !== filtro.comercial) return false;
      if (q && [i.numero, i.cliente_nombre, i.cups, i.comercializadora_actual, i.operador_actual].join(" ").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    var inicioMes = new Date();
    inicioMes = inicioMes.getFullYear() + "-" + String(inicioMes.getMonth() + 1).padStart(2, "0");
    var delMes = todos.filter(function (i) { return String(i.created_at).slice(0, 7) === inicioMes; });
    var ahorroMes = delMes.reduce(function (s, i) { return s + (Number(i.ahorro_anual) || 0); }, 0);

    main().innerHTML =
      '<div class="icc-page-head"><div><h1>Comparador</h1><p class="icc-muted">Auditorías de factura de energía y telefonía con informe en PDF para el cliente.</p></div></div>' +
      (sinInstalar
        ? '<div class="icc-aviso icc-aviso-oro">⚠️ Falta importar <code>sql/migracion_comparadores.sql</code> en la base de datos para usar los comparadores.</div>'
        : errores.length ? '<div class="icc-aviso">' + esc(errores[0].message) + "</div>" : "") +
      '<div class="icc-cmp-herramientas">' +
      Object.keys(HERRAMIENTAS).map(function (t) {
        var h = HERRAMIENTAS[t];
        return (
          '<a class="icc-card icc-cmp-herramienta" href="' + urlHerramienta(t) + '">' +
          '<span class="icc-cmp-herramienta-icono">' + h.icono + "</span>" +
          "<div><h2>" + esc(h.titulo) + "</h2><p>" + esc(h.desc) + "</p>" +
          '<span class="icc-btn icc-btn-primary">Nuevo estudio →</span></div></a>'
        );
      }).join("") +
      "</div>" +
      '<div class="icc-stat-grid icc-cmp-kpis">' +
      '<div class="icc-stat-card" style="--stat-color:var(--cian)"><span class="icc-stat-value">' + todos.length + '</span><span class="icc-stat-label">Informes guardados</span></div>' +
      '<div class="icc-stat-card" style="--stat-color:var(--oro)"><span class="icc-stat-value">' + delMes.length + '</span><span class="icc-stat-label">Este mes</span></div>' +
      '<div class="icc-stat-card" style="--stat-color:var(--esmeralda)"><span class="icc-stat-value">' + esc(U.formatEur(ahorroMes)) + '</span><span class="icc-stat-label">Ahorro anual propuesto este mes</span></div>' +
      "</div>" +
      '<section class="icc-card">' +
      "<h2>Histórico de auditorías</h2>" +
      '<form id="cmp-filtros" class="icc-filtros-row">' +
      '<input class="icc-input" name="q" placeholder="🔎 Cliente, nº de presupuesto, CUPS u operador" value="' + esc(filtro.q) + '">' +
      '<select class="icc-select" name="tipo"><option value="">Energía y telefonía</option>' +
      '<option value="energia"' + (filtro.tipo === "energia" ? " selected" : "") + ">⚡ Energía</option>" +
      '<option value="telefonia"' + (filtro.tipo === "telefonia" ? " selected" : "") + ">📶 Telefonía</option></select>" +
      (verComercial
        ? '<select class="icc-select" name="comercial"><option value="">Todo el equipo</option>' +
          Object.keys(comerciales).map(function (id) {
            return '<option value="' + esc(id) + '"' + (id === filtro.comercial ? " selected" : "") + ">" + esc(comerciales[id]) + "</option>";
          }).join("") + "</select>"
        : "") +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button></form></section>' +
      '<section class="icc-card icc-table-wrap">' +
      (lista.length
        ? '<table class="icc-table"><thead><tr><th>Fecha</th><th>Nº</th><th>Tipo</th><th>Cliente</th><th>Actual → propuesta</th><th>Ahorro anual</th>' +
          (verComercial ? "<th>Comercial</th>" : "") + "<th></th></tr></thead><tbody>" +
          lista.map(function (i) {
            return (
              "<tr><td>" + esc(U.formatFecha(i.updated_at)) + "</td>" +
              "<td>" + esc(i.numero) + "</td>" +
              "<td>" + (i.sector === "energia" ? "⚡ Energía" : "📶 Telefonía") + "</td>" +
              "<td>" + (i.cliente_id ? '<a class="icc-link-btn" href="#/clientes/' + i.cliente_id + '">' + esc(i.cliente_nombre || "Cliente") + "</a>" : esc(i.cliente_nombre || "—")) + "</td>" +
              '<td class="icc-muted">' + esc(resumenInforme(i)) + "</td>" +
              '<td><strong style="color:' + (Number(i.ahorro_anual) < 0 ? "var(--red)" : "var(--esmeralda)") + '">' + esc(eur(i.ahorro_anual)) + "</strong></td>" +
              (verComercial ? "<td>" + esc(i.usuario_nombre || "") + "</td>" : "") +
              '<td class="icc-cmp-celda-acciones"><a class="icc-link-btn" href="' + urlHerramienta(i.sector, { informe: i.id }) + '">Abrir</a>' +
              (i.tiene_pdf ? ' <a class="icc-link-btn" href="' + urlPdf(i) + '" download>PDF</a>' : "") +
              ' <button type="button" class="icc-link-btn" style="color:var(--red)" data-borrar-informe="' + esc(i.sector + ":" + i.id) + '">Borrar</button></td></tr>'
            );
          }).join("") +
          "</tbody></table>"
        : '<p class="icc-empty">' + (todos.length ? "Ningún informe coincide con el filtro." : "Aún no hay auditorías. Empieza un estudio de energía o de telefonía.") + "</p>") +
      "</section>";

    document.getElementById("cmp-filtros").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var p = new URLSearchParams();
      ["q", "tipo", "comercial"].forEach(function (k) { if (fd.get(k)) p.set(k, String(fd.get(k)).trim()); });
      location.hash = "#/comparador" + (p.toString() ? "?" + p.toString() : "");
    });
    main().querySelectorAll("[data-borrar-informe]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var partes = b.getAttribute("data-borrar-informe").split(":");
        if (!confirm("¿Borrar este informe del histórico? No se puede deshacer.")) return;
        try {
          await D.borrarInformeComparador(partes[0], partes[1]);
          U.toast("Informe borrado", "success");
          viewPanel();
        } catch (err) {
          U.toast(err.message || "No se pudo borrar", "error");
        }
      });
    });
  }

  // ------------------------------------------- Accesos desde el resto del CRM
  /** Rutas #/comparador/energia y #/comparador/telefonia (y las antiguas). */
  function abrirDesdeRuta(ruta, hash) {
    var p = new URLSearchParams(hash.split("?")[1] || "");
    var tipo = null;
    if (ruta === "#/comparador/energia") tipo = "energia";
    else if (ruta === "#/comparador/telefonia" || ruta === "#/comparador/telecom") tipo = "telefonia";
    else if (ruta === "#/comparador/nueva") tipo = p.get("sector") === "telefonia" ? "telefonia" : p.get("sector") === "energia" ? "energia" : null;
    var cliente = p.get("cliente");
    var partes = ruta.split("/");
    if (ruta.indexOf("#/comparador/nueva/") === 0) {
      // Enlace antiguo: #/comparador/nueva/:cliente/:sector
      cliente = partes[3];
      tipo = partes[4] === "telefonia" || partes[4] === "telecomunicaciones" ? "telefonia" : partes[4] === "energia" ? "energia" : null;
    }
    if (!tipo) {
      location.replace("#/comparador");
      return;
    }
    location.href = urlHerramienta(tipo, { cliente: /^\d+$/.test(cliente || "") ? cliente : null });
  }

  function listaInformesCliente(informes) {
    if (!informes || !informes.length) {
      return '<p class="icc-empty">Aún no se ha hecho ninguna auditoría para este cliente.</p>';
    }
    return (
      '<ul class="icc-doc-list">' +
      informes.map(function (i) {
        return (
          "<li><span>" + (i.sector === "energia" ? "⚡ " : "📶 ") + esc(i.numero) + " · " + esc(resumenInforme(i)) +
          (i.ahorro_anual != null ? " · Ahorro " + esc(eur(i.ahorro_anual)) + "/año" : "") + "</span>" +
          '<span class="icc-muted">' + esc(U.formatFechaHora(i.updated_at)) + (i.usuario_nombre ? " · " + esc(i.usuario_nombre) : "") + "</span>" +
          '<span><a class="icc-link-btn" href="' + urlHerramienta(i.sector, { informe: i.id }) + '">Abrir</a>' +
          (i.tiene_pdf ? ' <a class="icc-link-btn" href="' + urlPdf(i) + '" download>PDF</a>' : "") + "</span></li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function modalNuevoInformeCliente(cliente) {
    U.openModal(
      "<h2>Nueva auditoría</h2>" +
      '<p class="icc-muted">¿Qué factura de ' + esc(cliente.razon_social) + " vas a auditar? El informe quedará vinculado a su ficha.</p>" +
      '<div class="icc-form">' +
      Object.keys(HERRAMIENTAS).map(function (t) {
        return '<a class="icc-btn icc-btn-secondary" style="display:block;text-align:left" href="' + urlHerramienta(t, { cliente: cliente.id }) + '">' +
          HERRAMIENTAS[t].icono + " " + esc(HERRAMIENTAS[t].titulo) + "</a>";
      }).join("") +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button></div></div>'
    );
  }

  return {
    viewPanel: viewPanel,
    abrirDesdeRuta: abrirDesdeRuta,
    urlHerramienta: urlHerramienta,
    listaInformesCliente: listaInformesCliente,
    modalNuevoInformeCliente: modalNuevoInformeCliente,
  };
})();
