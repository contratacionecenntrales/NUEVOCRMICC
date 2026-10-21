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
    var filtro = { tipo: params.get("tipo") || "", q: (params.get("q") || "").trim(), comercial: params.get("comercial") || "", mes: params.get("mes") === "1" ? "1" : "" };
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
    var inicioMes = new Date();
    inicioMes = inicioMes.getFullYear() + "-" + String(inicioMes.getMonth() + 1).padStart(2, "0");
    var lista = todos.filter(function (i) {
      if (filtro.mes && String(i.created_at).slice(0, 7) !== inicioMes) return false;
      if (filtro.tipo && i.sector !== filtro.tipo) return false;
      if (filtro.comercial && String(i.usuario_id) !== filtro.comercial) return false;
      if (q && [i.numero, i.cliente_nombre, i.cups, i.comercializadora_actual, i.operador_actual].join(" ").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    var delMes = todos.filter(function (i) { return String(i.created_at).slice(0, 7) === inicioMes; });
    var ahorroMes = delMes.reduce(function (s, i) { return s + (Number(i.ahorro_anual) || 0); }, 0);

    var nEnergia = todos.filter(function (i) { return i.sector === "energia"; }).length;
    var nTelefonia = todos.length - nEnergia;
    var ahorroTotal = todos.reduce(function (s, i) { return s + (Number(i.ahorro_anual) || 0); }, 0);
    // Enlace a este mismo panel con otros filtros.
    var linkPanel = function (cambios) {
      var x = Object.assign({}, filtro, cambios || {});
      var p = new URLSearchParams();
      ["q", "tipo", "comercial", "mes"].forEach(function (k) { if (x[k]) p.set(k, x[k]); });
      return "#/comparador" + (p.toString() ? "?" + p.toString() : "");
    };
    var kpi = function (href, icono, valor, label, color, activo) {
      return '<a class="icc-cp-kpi' + (activo ? " is-activo" : "") + '" href="' + href + '" style="--c:' + color + '">' +
        '<span class="icc-cp-kpi-ico" aria-hidden="true">' + icono + "</span><b>" + valor + "</b><span>" + label + "</span>" +
        '<em aria-hidden="true">Ver →</em></a>';
    };
    var filtrando = filtro.tipo || filtro.q || filtro.comercial || filtro.mes;

    main().innerHTML =
      '<header class="icc-ag-hero icc-cp-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">🧮 Comparador</span>' +
      "<h1>Auditorías de energía y telefonía</h1>" +
      '<p class="icc-ag-hero-res"><b>' + todos.length + "</b> " + (todos.length === 1 ? "informe guardado" : "informes guardados") +
      " · <b>" + delMes.length + "</b> este mes · <b class=\"ok\">" + esc(U.formatEur(ahorroMes)) + "</b> de ahorro anual propuesto este mes</p></div>" +
      '<div class="icc-ag-hero-acc icc-cp-hero-acc">' +
      '<a class="icc-btn icc-btn-primary icc-ag-btn-nueva" href="' + urlHerramienta("energia") + '">⚡ Nuevo estudio de energía</a>' +
      '<a class="icc-btn icc-btn-secondary" href="' + urlHerramienta("telefonia") + '">📶 Nuevo de telefonía</a>' +
      "</div></header>" +
      (sinInstalar
        ? '<div class="icc-aviso icc-aviso-oro">⚠️ Falta importar <code>sql/migracion_comparadores.sql</code> en la base de datos para usar los comparadores.</div>'
        : errores.length ? '<div class="icc-aviso">' + esc(errores[0].message) + "</div>" : "") +

      '<div class="icc-cp-herramientas">' +
      Object.keys(HERRAMIENTAS).map(function (t) {
        var h = HERRAMIENTAS[t];
        var n = t === "energia" ? nEnergia : nTelefonia;
        return (
          '<a class="icc-cp-herramienta is-' + t + '" href="' + urlHerramienta(t) + '">' +
          '<span class="icc-cp-herramienta-ico" aria-hidden="true">' + h.icono + "</span>" +
          '<div class="icc-cp-herramienta-txt"><h2>' + esc(h.titulo) + "</h2><p>" + esc(h.desc) + "</p>" +
          '<span class="icc-cp-herramienta-pie"><span class="icc-cp-herramienta-btn">Nuevo estudio →</span><small>' + n + (n === 1 ? " informe" : " informes") + "</small></span></div></a>"
        );
      }).join("") +
      "</div>" +

      '<div class="icc-cp-kpis">' +
      kpi(linkPanel({ tipo: "", mes: "", q: "", comercial: "" }), "🗂️", todos.length, "Informes guardados", "#22D3EE", !filtrando) +
      kpi(linkPanel({ mes: filtro.mes ? "" : "1" }), "📅", delMes.length, "Este mes", "#FBBF24", !!filtro.mes) +
      kpi(linkPanel({ tipo: filtro.tipo === "energia" ? "" : "energia" }), "⚡", nEnergia, "De energía", "#60A5FA", filtro.tipo === "energia") +
      kpi(linkPanel({ tipo: filtro.tipo === "telefonia" ? "" : "telefonia" }), "📶", nTelefonia, "De telefonía", "#34D399", filtro.tipo === "telefonia") +
      kpi(linkPanel({ mes: "1" }), "💶", esc(U.formatEur(ahorroMes)), "Ahorro propuesto este mes", "#4ADE80", false) +
      "</div>" +

      '<section class="icc-card icc-cp-barra">' +
      '<form id="cmp-filtros" class="icc-cp-filtros">' +
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
      (filtro.mes ? '<input type="hidden" name="mes" value="1">' : "") +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      (filtrando ? '<a class="icc-link-btn" href="#/comparador">Quitar filtros</a>' : "") +
      "</form></section>" +

      '<section class="icc-cp-historico"><h2>Histórico de auditorías <span>' + lista.length + "</span>" + (filtro.mes ? ' <small>· solo este mes</small>' : "") + "</h2>" +
      (lista.length
        ? '<div class="icc-cp-lista">' +
          lista.map(function (i) {
            var ahorro = Number(i.ahorro_anual);
            var esEnergia = i.sector === "energia";
            return (
              '<article class="icc-cp-fila is-' + esc(i.sector) + '">' +
              '<span class="icc-cp-fila-ico" aria-hidden="true">' + (esEnergia ? "⚡" : "📶") + "</span>" +
              '<div class="icc-cp-fila-txt">' +
              '<a href="' + urlHerramienta(i.sector, { informe: i.id }) + '"><strong>' + esc(i.cliente_nombre || "Sin cliente") + "</strong></a>" +
              "<small>" + esc(["Nº " + (i.numero || "—"), U.formatFecha(i.updated_at), verComercial && i.usuario_nombre ? i.usuario_nombre : ""].filter(Boolean).join(" · ")) + "</small>" +
              '<small class="icc-cp-fila-res">' + esc(resumenInforme(i)) + "</small></div>" +
              '<div class="icc-cp-fila-ahorro' + (ahorro < 0 ? " is-neg" : "") + '"><b>' + esc(eur(i.ahorro_anual)) + "</b><span>ahorro anual</span></div>" +
              '<div class="icc-cp-fila-acc">' +
              (i.cliente_id ? '<a class="icc-btn icc-btn-ghost icc-cp-btn" href="#/clientes/' + i.cliente_id + '" title="Ficha del cliente">👤 Cliente</a>' : "") +
              (i.tiene_pdf ? '<a class="icc-btn icc-btn-ghost icc-cp-btn" href="' + urlPdf(i) + '" download>⬇ PDF</a>' : "") +
              '<a class="icc-btn icc-btn-secondary icc-cp-btn" href="' + urlHerramienta(i.sector, { informe: i.id }) + '">Abrir →</a>' +
              '<button type="button" class="icc-cp-borrar" title="Borrar informe" aria-label="Borrar informe ' + esc(i.numero || "") + '" data-borrar-informe="' + esc(i.sector + ":" + i.id) + '">🗑</button>' +
              "</div></article>"
            );
          }).join("") +
          "</div>"
        : '<p class="icc-empty">' + (todos.length ? "Ningún informe coincide con el filtro." : "Aún no hay auditorías. Empieza un estudio de energía o de telefonía.") + "</p>") +
      "</section>";

    document.getElementById("cmp-filtros").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var p = new URLSearchParams();
      ["q", "tipo", "comercial", "mes"].forEach(function (k) { if (fd.get(k)) p.set(k, String(fd.get(k)).trim()); });
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
