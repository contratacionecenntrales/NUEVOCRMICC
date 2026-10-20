/* =============================================================================
   ICC CRM · Pipeline comercial
   Tablero de oportunidades por fase (Lead → Auditoría → Propuesta →
   Negociación → Ganado / Perdido), con valor, previsión ponderada, días en
   fase, próxima acción de la agenda y métricas de conversión.
   Ruta: #/pipeline
   ============================================================================= */
window.icc = window.icc || {};

window.icc.pipeline = (function () {
  var U = window.icc.util;
  var C = window.ICC_CONST;
  var API = window.icc.api;

  // Fases abiertas, con su probabilidad de cierre y a partir de cuántos días
  // sin moverse se considera "estancada".
  var FASES = [
    { id: "lead_captado", corto: "Lead", prob: 10, alerta: 7, icono: "🎯" },
    { id: "estudio_backoffice", corto: "Auditoría", prob: 25, alerta: 5, icono: "🔎" },
    { id: "oferta_presentada", corto: "Propuesta", prob: 50, alerta: 10, icono: "📄" },
    { id: "en_cierre", corto: "Negociación", prob: 75, alerta: 14, icono: "🤝" },
    { id: "cliente_activo", corto: "Ganado", prob: 100, alerta: 0, icono: "🏆", cerrada: true },
    { id: "perdido", corto: "Perdido", prob: 0, alerta: 0, icono: "✖", cerrada: true },
  ];
  var MOTIVOS = ["Precio", "Se queda con su compañía actual", "Permanencia vigente", "No contesta / sin interés", "Elige a la competencia", "No cumple requisitos", "Otro"];
  var PALETA = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#FB923C", "#4ADE80", "#E879F9", "#2DD4BF", "#F87171", "#93C5FD", "#FDE047", "#C084FC"];
  var colores = {};
  var datos = null;
  var agentes = [];

  function main() { return document.getElementById("icc-main"); }
  function esc(v) { return U.escapeHtml(v == null ? "" : String(v)); }
  function fase(id) { return FASES.filter(function (f) { return f.id === id; })[0] || FASES[0]; }
  function eur(n) {
    return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €";
  }
  function esGestor() { return window.icc.auth.esBackofficeOAdmin(); }
  function puedeEditar() { return window.icc.auth.puede("clientes.editar"); }
  function hoyIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function iniciales(n) {
    return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join("") || "?";
  }
  // Mismo color por comercial que en la Agenda (orden por id).
  function prepararColores(lista) {
    var ids = {};
    agentes.forEach(function (a) { ids[a.id] = 1; });
    lista.forEach(function (o) { if (o.comercial_id) ids[o.comercial_id] = 1; });
    colores = {};
    Object.keys(ids).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id, i) { colores[id] = PALETA[i % PALETA.length]; });
  }
  function color(o) { return o.comercial_id ? colores[o.comercial_id] || PALETA[o.comercial_id % PALETA.length] : "#64748B"; }
  function avatar(o, t) {
    return '<span class="icc-ag-ava" style="--c:' + color(o) + ";--t:" + (t || 24) + 'px" title="' + esc(o.comercial_nombre || "Sin comercial") + '">' + esc(iniciales(o.comercial_nombre)) + "</span>";
  }
  function fechaCorta(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
  function textoProxima(p) {
    if (!p) return "";
    var hoy = hoyIso();
    var man = new Date(); man.setDate(man.getDate() + 1);
    var manIso = man.getFullYear() + "-" + String(man.getMonth() + 1).padStart(2, "0") + "-" + String(man.getDate()).padStart(2, "0");
    var dia = p.fecha === hoy ? "Hoy" : p.fecha === manIso ? "Mañana" : fechaCorta(p.fecha);
    var t = (C.TIPOS_CITA && C.TIPOS_CITA[p.tipo]) || { icono: "📅", label: "Cita" };
    return t.icono + " " + dia + " " + p.hora + " · " + t.label;
  }
  function estancada(o) {
    var f = fase(o.estado);
    return !f.cerrada && f.alerta && o.dias_en_fase >= f.alerta;
  }
  function valorPonderado(o) { return (o.valor_estimado || 0) * fase(o.estado).prob / 100; }

  // ------------------------------------------------------------- Estado URL
  function leerFiltros() {
    var p = new URLSearchParams(location.hash.split("?")[1] || "");
    return {
      q: p.get("q") || "",
      comercial_id: p.get("comercial_id") || "",
      servicio: p.get("servicio") || "",
      tipo_cliente: p.get("tipo_cliente") || "",
      cerrados_dias: p.get("cerrados_dias") || "90",
      estancadas: p.get("estancadas") === "1",
    };
  }
  function href(f, cambios) {
    var x = Object.assign({}, f, cambios || {});
    var p = new URLSearchParams();
    ["q", "comercial_id", "servicio", "tipo_cliente"].forEach(function (k) { if (x[k]) p.set(k, x[k]); });
    if (x.cerrados_dias && x.cerrados_dias !== "90") p.set("cerrados_dias", x.cerrados_dias);
    if (x.estancadas) p.set("estancadas", "1");
    return "#/pipeline" + (p.toString() ? "?" + p.toString() : "");
  }

  // ===================================================================== VISTA
  async function view() {
    var f = leerFiltros();
    main().innerHTML = '<div class="icc-loading">Cargando pipeline…</div>';
    var qs = new URLSearchParams();
    ["q", "comercial_id", "servicio", "tipo_cliente", "cerrados_dias"].forEach(function (k) { if (f[k]) qs.set(k, f[k]); });
    try {
      var res = await Promise.all([
        API.get("api/pipeline.php?" + qs.toString()),
        esGestor() ? window.icc.data.listarAgentes({}).catch(function () { return []; }) : Promise.resolve([]),
      ]);
      datos = res[0];
      agentes = res[1] || [];
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + esc(err.message || "No se pudo cargar el pipeline") + "</p>";
      return;
    }
    prepararColores(datos.oportunidades);
    pintar(f);
  }

  function pintar(f) {
    var todas = datos.oportunidades;
    var lista = f.estancadas ? todas.filter(estancada) : todas;
    var abiertas = todas.filter(function (o) { return !fase(o.estado).cerrada; });
    var valorAbierto = abiertas.reduce(function (s, o) { return s + (o.valor_estimado || 0); }, 0);
    var prevision = abiertas.reduce(function (s, o) { return s + valorPonderado(o); }, 0);
    var nEstancadas = abiertas.filter(estancada).length;
    var sinAccion = datos.con_citas ? abiertas.filter(function (o) { return !o.proxima_cita; }).length : 0;
    var m = datos.metricas;
    var conValor = datos.con_valor;

    main().innerHTML =
      '<header class="icc-ag-hero icc-pl-hero">' +
      '<div class="icc-ag-hero-txt"><span class="icc-ag-hero-kicker">📈 Pipeline comercial</span>' +
      "<h1>" + abiertas.length + (abiertas.length === 1 ? " oportunidad abierta" : " oportunidades abiertas") + "</h1>" +
      '<p class="icc-ag-hero-res">' +
      (conValor ? "<b>" + eur(valorAbierto) + "</b> en juego · previsión ponderada <b class=\"ok\">" + eur(prevision) + "</b>" : "Arrastra cada oportunidad a su fase") +
      "</p></div>" +
      '<div class="icc-ag-hero-acc">' +
      '<button class="icc-btn icc-btn-ghost" id="pl-exportar" title="Descargar las oportunidades filtradas (se abre en Excel)">⬇ Exportar</button> ' +
      (window.icc.auth.puede("clientes.crear") ? '<button class="icc-btn icc-btn-primary icc-ag-btn-nueva" id="pl-nueva">+ Nueva oportunidad</button>' : "") +
      "</div></header>" +
      (!conValor ? '<div class="icc-aviso icc-aviso-oro">⚠️ Importa <code>sql/migracion_pipeline_oportunidades.sql</code> para poner valor y fecha de cierre a cada oportunidad (previsión de ventas).</div>' : "") +
      kpis(abiertas, m, nEstancadas, sinAccion, conValor, prevision) +
      embudo(todas, m) +
      barra(f) +
      '<section class="icc-pl-tablero">' + FASES.map(function (fa) { return columna(fa, lista); }).join("") + "</section>" +
      '<div class="icc-pl-paneles">' + (conValor ? panelPrevision(abiertas) : "") + panelMotivos(m) + panelComerciales(abiertas, conValor) + "</div>";

    enlazar(f);
  }

  function kpis(abiertas, m, nEstancadas, sinAccion, conValor, prevision) {
    var t = function (valor, label, colorK, icono, extra) {
      return '<div class="icc-stat-card icc-ag-kpi" style="--stat-color:' + colorK + '"><span class="icc-ag-kpi-ico">' + icono + '</span><span class="icc-stat-value">' + valor + '</span><span class="icc-stat-label">' + label + "</span>" + (extra || "") + "</div>";
    };
    return (
      '<div class="icc-ag-kpis">' +
      t(abiertas.length, "Oportunidades abiertas", "var(--cian)", "🎯") +
      (conValor ? t(eur(prevision), "Previsión ponderada", "var(--esmeralda)", "💶") : "") +
      t(m.tasa_cierre == null ? "—" : m.tasa_cierre + "%", "Tasa de cierre (" + m.cerrados_dias + " días): " + m.ganados + " ganadas / " + m.perdidos + " perdidas", "#a78bfa", "🏆") +
      t(m.ciclo_medio_dias == null ? "—" : m.ciclo_medio_dias + " días", "Ciclo medio de venta", "var(--oro)", "⏱️") +
      t(nEstancadas, "Estancadas (sin avanzar)", nEstancadas ? "#f87171" : "#94a3b8", "🧊") +
      (datos.con_citas ? t(sinAccion, "Sin próxima acción en agenda", sinAccion ? "#fbbf24" : "#94a3b8", "📅") : "") +
      "</div>"
    );
  }

  // Embudo: cuántas oportunidades hay en cada fase y qué parte llega a la siguiente.
  function embudo(todas, m) {
    var abiertas = FASES.filter(function (f) { return !f.cerrada; });
    var cuenta = {};
    todas.forEach(function (o) { cuenta[o.estado] = (cuenta[o.estado] || 0) + 1; });
    // Las que han pasado por cada fase = las que estan en ella o mas adelante.
    var acumulado = [];
    var resto = m.ganados;
    for (var i = abiertas.length - 1; i >= 0; i--) {
      resto += cuenta[abiertas[i].id] || 0;
      acumulado[i] = resto;
    }
    var max = Math.max(1, acumulado[0] || 0);
    return (
      '<section class="icc-card icc-pl-embudo">' +
      abiertas.map(function (fa, i) {
        var n = cuenta[fa.id] || 0;
        var conv = i < abiertas.length - 1 && acumulado[i] ? Math.round((acumulado[i + 1] / acumulado[i]) * 100) : acumulado[i] ? Math.round((m.ganados / acumulado[i]) * 100) : null;
        return (
          '<div class="icc-pl-embudo-paso" style="--c:' + C.ESTADOS[fa.id].color + ";--w:" + Math.max(18, Math.round((acumulado[i] / max) * 100)) + '%">' +
          '<div class="icc-pl-embudo-barra"><span>' + fa.icono + " " + esc(fa.corto) + "</span><b>" + n + "</b></div>" +
          (conv != null ? '<small>' + conv + "% pasa a " + (i < abiertas.length - 1 ? esc(abiertas[i + 1].corto) : "Ganado") + "</small>" : "<small>&nbsp;</small>") +
          "</div>"
        );
      }).join("") +
      "</section>"
    );
  }

  function barra(f) {
    var servicios = Object.keys(C.SERVICIOS || {});
    var tipos = Object.keys(C.TIPO_CLIENTE || {});
    return (
      '<section class="icc-card icc-ag-barra"><form id="pl-filtros" class="icc-filtros-row">' +
      '<input class="icc-input" name="q" placeholder="🔎 Buscar empresa, CIF, contacto o teléfono" value="' + esc(f.q) + '">' +
      (esGestor()
        ? '<select class="icc-select" name="comercial_id"><option value="">Todo el equipo</option>' +
          agentes.filter(function (a) { return !Number(a.bloqueado); }).map(function (a) {
            return '<option value="' + a.id + '"' + (String(a.id) === f.comercial_id ? " selected" : "") + ">" + esc(a.nombre + " " + (a.apellidos || "")) + "</option>";
          }).join("") + "</select>"
        : "") +
      '<select class="icc-select" name="servicio"><option value="">Todos los servicios</option>' +
      servicios.map(function (s) { return '<option value="' + s + '"' + (s === f.servicio ? " selected" : "") + ">" + esc(C.SERVICIOS[s]) + "</option>"; }).join("") + "</select>" +
      '<select class="icc-select" name="tipo_cliente"><option value="">Todo tipo de cliente</option>' +
      tipos.map(function (s) { return '<option value="' + s + '"' + (s === f.tipo_cliente ? " selected" : "") + ">" + esc(C.TIPO_CLIENTE[s]) + "</option>"; }).join("") + "</select>" +
      '<select class="icc-select" name="cerrados_dias" title="Ganadas y perdidas que se muestran">' +
      [["30", "Cerradas: 30 días"], ["90", "Cerradas: 90 días"], ["365", "Cerradas: 1 año"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === f.cerrados_dias ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select>" +
      '<label class="icc-check icc-pl-check"><input type="checkbox" name="estancadas"' + (f.estancadas ? " checked" : "") + "> 🧊 Solo estancadas</label>" +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      "</form></section>"
    );
  }

  function columna(fa, lista) {
    var items = lista.filter(function (o) { return o.estado === fa.id; });
    // Las mas urgentes arriba: estancadas y con mas dias en la fase.
    items.sort(function (a, b) { return (estancada(b) - estancada(a)) || b.dias_en_fase - a.dias_en_fase; });
    var total = items.reduce(function (s, o) { return s + (o.valor_estimado || 0); }, 0);
    var col = C.ESTADOS[fa.id].color;
    return (
      '<div class="icc-pl-col' + (fa.cerrada ? " is-cerrada" : "") + '" data-fase="' + fa.id + '" style="--f:' + col + '">' +
      '<div class="icc-pl-col-head"><div class="icc-pl-col-tit"><span>' + fa.icono + "</span><strong>" + esc(fa.corto) + "</strong><b>" + items.length + "</b></div>" +
      '<small>' + esc(C.ESTADOS[fa.id].label) + "</small>" +
      (datos.con_valor ? '<div class="icc-pl-col-valor">' + eur(total) + (!fa.cerrada ? ' <span title="Probabilidad de cierre de la fase">· ' + fa.prob + "%</span>" : "") + "</div>" : "") +
      "</div>" +
      '<div class="icc-pl-col-body">' +
      (items.length ? items.map(tarjeta).join("") : '<p class="icc-pl-vacio">' + (fa.cerrada ? "Ninguna en el periodo" : "Arrastra aquí") + "</p>") +
      "</div></div>"
    );
  }

  function tarjeta(o) {
    var fa = fase(o.estado);
    var est = estancada(o);
    var vencida = o.fecha_cierre_prevista && o.fecha_cierre_prevista < hoyIso() && !fa.cerrada;
    return (
      '<article class="icc-pl-card' + (est ? " is-estancada" : "") + '" style="--c:' + color(o) + '" data-op="' + o.id + '"' +
      (puedeEditar() ? ' draggable="true"' : "") + ">" +
      '<header><h4 title="' + esc(o.razon_social) + '">' + esc(o.razon_social) + "</h4>" +
      (o.valor_estimado != null ? '<span class="icc-pl-valor">' + eur(o.valor_estimado) + "</span>" : "") + "</header>" +
      '<div class="icc-pl-meta">' +
      '<span class="icc-pl-dias' + (est ? " is-alerta" : "") + '" title="Días en esta fase">' + (est ? "🧊 " : "⏱ ") + o.dias_en_fase + " d</span>" +
      (o.tipo_cliente && C.TIPO_CLIENTE ? '<span class="icc-pl-tag">' + esc(C.TIPO_CLIENTE[o.tipo_cliente] || o.tipo_cliente) + "</span>" : "") +
      (o.ahorro_cliente ? '<span class="icc-pl-tag is-ahorro" title="Ahorro anual encontrado para el cliente">💡 ' + eur(o.ahorro_cliente) + "/año</span>" : "") +
      "</div>" +
      (o.servicios && o.servicios.length ? '<div class="icc-pl-servicios">' + o.servicios.slice(0, 3).map(function (s) { return "<span>" + esc((C.SERVICIOS || {})[s] || s) + "</span>"; }).join("") + (o.servicios.length > 3 ? "<span>+" + (o.servicios.length - 3) + "</span>" : "") + "</div>" : "") +
      (fa.cerrada
        ? (o.estado === "perdido" && o.motivo_perdida ? '<p class="icc-pl-accion">✖ ' + esc(o.motivo_perdida) + "</p>" : "")
        : datos.con_citas
          ? (o.proxima_cita ? '<p class="icc-pl-accion">' + esc(textoProxima(o.proxima_cita)) + "</p>" : '<p class="icc-pl-accion is-falta">⚠ Sin próxima acción</p>')
          : "") +
      "<footer>" + avatar(o, 22) + '<span class="icc-pl-com">' + esc(o.comercial_nombre || "Sin comercial") + "</span>" +
      (o.fecha_cierre_prevista && !fa.cerrada ? '<span class="icc-pl-cierre' + (vencida ? " is-vencida" : "") + '" title="Cierre previsto">🏁 ' + esc(fechaCorta(o.fecha_cierre_prevista)) + "</span>" : "") +
      "</footer></article>"
    );
  }

  // Previsión: valor ponderado por mes de cierre previsto (próximos 4 meses).
  function panelPrevision(abiertas) {
    var meses = [];
    var d = new Date(); d.setDate(1);
    for (var i = 0; i < 4; i++) {
      var k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      meses.push({ k: k, label: d.toLocaleDateString("es-ES", { month: "long" }), total: 0, pond: 0, n: 0 });
      d.setMonth(d.getMonth() + 1);
    }
    var sinFecha = 0;
    abiertas.forEach(function (o) {
      if (!o.fecha_cierre_prevista) { if (o.valor_estimado) sinFecha++; return; }
      var mes = meses.filter(function (x) { return x.k === o.fecha_cierre_prevista.slice(0, 7); })[0] ||
        (o.fecha_cierre_prevista.slice(0, 7) < meses[0].k ? meses[0] : null);
      if (!mes) return;
      mes.total += o.valor_estimado || 0; mes.pond += valorPonderado(o); mes.n++;
    });
    var max = Math.max(1, Math.max.apply(null, meses.map(function (x) { return x.total; })));
    return (
      '<section class="icc-card icc-pl-panel"><h3>💶 Previsión de cierre</h3>' +
      meses.map(function (x) {
        return (
          '<div class="icc-pl-prev"><span class="icc-pl-prev-mes">' + esc(x.label) + "</span>" +
          '<div class="icc-pl-prev-barra"><i class="is-total" style="width:' + (x.total / max) * 100 + '%"></i><i class="is-pond" style="width:' + (x.pond / max) * 100 + '%"></i></div>' +
          "<b>" + eur(x.pond) + '</b><small>' + x.n + " op. · " + eur(x.total) + " total</small></div>"
        );
      }).join("") +
      '<p class="icc-muted icc-pl-nota">Barra clara: valor total · barra verde: ponderado por la probabilidad de cada fase.' +
      (sinFecha ? " " + sinFecha + " oportunidades con valor no tienen fecha de cierre prevista." : "") + "</p></section>"
    );
  }

  function panelMotivos(m) {
    var max = Math.max(1, Math.max.apply(null, m.motivos_perdida.map(function (x) { return x.n; }).concat([0])));
    return (
      '<section class="icc-card icc-pl-panel"><h3>✖ Por qué se pierden (' + m.cerrados_dias + " días)</h3>" +
      (m.motivos_perdida.length
        ? m.motivos_perdida.map(function (x) {
            return '<div class="icc-pl-motivo"><span>' + esc(x.motivo) + '</span><div class="icc-pl-prev-barra"><i class="is-perdida" style="width:' + (x.n / max) * 100 + '%"></i></div><b>' + x.n + "</b></div>";
          }).join("")
        : '<p class="icc-muted">Ninguna oportunidad perdida en el periodo.</p>') +
      "</section>"
    );
  }

  function panelComerciales(abiertas, conValor) {
    if (!esGestor()) return "";
    var g = {};
    abiertas.forEach(function (o) {
      var k = o.comercial_id || 0;
      if (!g[k]) g[k] = { o: o, n: 0, valor: 0, pond: 0, est: 0 };
      g[k].n++; g[k].valor += o.valor_estimado || 0; g[k].pond += valorPonderado(o); if (estancada(o)) g[k].est++;
    });
    var lista = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.pond - a.pond || b.n - a.n; });
    return (
      '<section class="icc-card icc-pl-panel"><h3>👥 Pipeline por comercial</h3>' +
      (lista.length
        ? lista.map(function (x) {
            return (
              '<a class="icc-pl-comercial" href="' + href(leerFiltros(), { comercial_id: x.o.comercial_id ? String(x.o.comercial_id) : "" }) + '">' + avatar(x.o, 28) +
              "<span><strong>" + esc(x.o.comercial_nombre || "Sin comercial") + "</strong><small>" + x.n + " abiertas" + (x.est ? " · " + x.est + " estancadas" : "") + "</small></span>" +
              (conValor ? "<b>" + eur(x.pond) + "</b>" : "<b>" + x.n + "</b>") + "</a>"
            );
          }).join("")
        : '<p class="icc-muted">Sin oportunidades abiertas.</p>') +
      "</section>"
    );
  }

  // ------------------------------------------------------------- Acciones
  function enlazar(f) {
    var raiz = main();
    document.getElementById("pl-filtros").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      location.hash = href({}, {
        q: String(fd.get("q") || "").trim(), comercial_id: fd.get("comercial_id") || "", servicio: fd.get("servicio") || "",
        tipo_cliente: fd.get("tipo_cliente") || "", cerrados_dias: fd.get("cerrados_dias") || "90", estancadas: !!fd.get("estancadas"),
      });
    });
    document.getElementById("pl-exportar").addEventListener("click", function () { exportarCsv(f); });
    var btnNueva = document.getElementById("pl-nueva");
    if (btnNueva) btnNueva.addEventListener("click", function () {
      window.icc.views.modalNuevoCliente(function () { view(); });
    });
    raiz.querySelectorAll("[data-op]").forEach(function (card) {
      card.addEventListener("click", function () { abrirOportunidad(Number(card.getAttribute("data-op"))); });
      card.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", card.getAttribute("data-op"));
        e.dataTransfer.effectAllowed = "move";
        card.classList.add("is-arrastrando");
        raiz.querySelector(".icc-pl-tablero").classList.add("is-arrastrando");
      });
      card.addEventListener("dragend", function () {
        card.classList.remove("is-arrastrando");
        var t = raiz.querySelector(".icc-pl-tablero"); if (t) t.classList.remove("is-arrastrando");
      });
    });
    if (!puedeEditar()) return;
    raiz.querySelectorAll("[data-fase]").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("is-drop"); });
      col.addEventListener("dragleave", function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove("is-drop"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.classList.remove("is-drop");
        var o = datos.oportunidades.filter(function (x) { return String(x.id) === e.dataTransfer.getData("text/plain"); })[0];
        if (o) moverA(o, col.getAttribute("data-fase"));
      });
    });
  }

  async function guardar(o, cambios, mensaje) {
    try {
      await API.put("api/pipeline.php?id=" + encodeURIComponent(o.id), cambios);
      if (mensaje) U.toast(mensaje, "success");
      await view();
      return true;
    } catch (err) {
      U.toast(err.message || "No se pudo guardar", "error");
      return false;
    }
  }

  function moverA(o, destino) {
    if (!destino || destino === o.estado) return;
    if (destino === "perdido") { modalPerdido(o); return; }
    var f = fase(destino);
    guardar(o, { estado: destino }, destino === "cliente_activo" ? "🎉 ¡" + o.razon_social + " ganado!" : o.razon_social + " → " + f.corto)
      .then(function (ok) { if (ok && destino === "cliente_activo") celebrar(); });
  }

  function modalPerdido(o, despues) {
    U.openModal(
      "<h2>✖ Marcar como perdida</h2>" +
      '<p class="icc-muted">' + esc(o.razon_social) + ": ¿por qué no ha salido? Sirve para ver en qué se pierden las ventas.</p>" +
      '<form id="pl-form-perdido" class="icc-form">' +
      '<div class="icc-pl-motivos">' + MOTIVOS.map(function (mo, i) {
        return '<label class="icc-ag-tipo"><input type="radio" name="motivo" value="' + esc(mo) + '"' + (i === 0 ? " checked" : "") + "><span>" + esc(mo) + "</span></label>";
      }).join("") + "</div>" +
      '<div class="icc-field"><label>Detalle (opcional)</label><input class="icc-input" name="detalle" maxlength="180" placeholder="Ej.: le ofrecen 3 € menos al mes con permanencia"></div>' +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button>' +
      '<button type="submit" class="icc-btn icc-btn-primary" style="background:var(--red)">Marcar como perdida</button></div></form>'
    );
    document.getElementById("pl-form-perdido").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var motivo = String(fd.get("motivo") || "Otro") + (String(fd.get("detalle") || "").trim() ? ": " + String(fd.get("detalle")).trim() : "");
      U.closeModal();
      await guardar(o, { estado: "perdido", motivo_perdida: motivo }, o.razon_social + " marcada como perdida");
      if (despues) despues();
    });
  }

  function abrirOportunidad(id) {
    var o = datos.oportunidades.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var fa = fase(o.estado);
    var tel = (o.telefono || "").replace(/[^\d+]/g, "");
    U.openModal(
      '<div class="icc-pl-ficha" style="--c:' + color(o) + ";--f:" + C.ESTADOS[o.estado].color + '">' +
      '<div class="icc-pl-ficha-head"><div><span class="icc-pl-ficha-fase">' + fa.icono + " " + esc(C.ESTADOS[o.estado].label) + " · " + o.dias_en_fase + " días</span>" +
      "<h2>" + esc(o.razon_social) + '</h2><p class="icc-muted">' + esc([o.cif, o.contacto, o.telefono].filter(Boolean).join(" · ")) + "</p></div>" +
      '<button type="button" class="icc-btn icc-btn-ghost" data-close-btn>✕</button></div>' +
      '<div class="icc-pl-fases">' + FASES.map(function (x) {
        return '<button type="button" class="icc-pl-fase-btn' + (x.id === o.estado ? " is-activa" : "") + '" style="--f:' + C.ESTADOS[x.id].color + '" data-mover="' + x.id + '"' + (puedeEditar() ? "" : " disabled") + ">" + x.icono + " " + esc(x.corto) + "</button>";
      }).join("") + "</div>" +
      (datos.con_valor
        ? '<form id="pl-form-op" class="icc-form icc-pl-form">' +
          '<div class="icc-field"><label>Valor estimado para ICC (€)</label><input class="icc-input" name="valor_estimado" type="number" min="0" step="1" value="' + (o.valor_estimado != null ? o.valor_estimado : "") + '" placeholder="Comisión / margen previsto"' + (puedeEditar() ? "" : " disabled") + "></div>" +
          '<div class="icc-field"><label>Cierre previsto</label><input class="icc-input" name="fecha_cierre_prevista" type="date" value="' + esc(o.fecha_cierre_prevista || "") + '"' + (puedeEditar() ? "" : " disabled") + "></div>" +
          (puedeEditar() ? '<div class="icc-field"><label>&nbsp;</label><button type="submit" class="icc-btn icc-btn-primary">Guardar</button></div>' : "") +
          "</form>"
        : "") +
      '<div class="icc-pl-ficha-datos">' +
      "<div><small>Comercial</small><span>" + avatar(o, 22) + " " + esc(o.comercial_nombre || "Sin comercial") + "</span></div>" +
      "<div><small>Próxima acción</small><span>" + (o.proxima_cita ? esc(textoProxima(o.proxima_cita)) : '<em class="icc-pl-falta">Sin cita agendada</em>') + "</span></div>" +
      "<div><small>Ahorro para el cliente</small><span>" + (o.ahorro_cliente ? "💡 " + eur(o.ahorro_cliente) + "/año" : "—") + "</span></div>" +
      "<div><small>Presupuestos</small><span>" + (o.n_presupuestos != null ? o.n_presupuestos : "—") + "</span></div>" +
      "</div>" +
      '<div class="icc-ag-botones">' +
      '<a class="icc-btn icc-btn-secondary" href="#/clientes/' + o.id + '" data-cerrar>📇 Abrir ficha</a>' +
      (window.icc.auth.puede("agenda.gestionar") && window.icc.agenda ? '<button type="button" class="icc-btn icc-btn-ghost" id="pl-cita">📅 Programar cita</button>' : "") +
      (window.icc.auth.puede("comparador.usar") && window.icc.comparador
        ? '<a class="icc-btn icc-btn-ghost" href="' + window.icc.comparador.urlHerramienta("energia", { cliente: o.id }) + '">⚡ Auditar energía</a>' +
          '<a class="icc-btn icc-btn-ghost" href="' + window.icc.comparador.urlHerramienta("telefonia", { cliente: o.id }) + '">📶 Auditar telefonía</a>'
        : "") +
      (tel ? '<a class="icc-btn icc-btn-ghost" href="tel:' + esc(tel) + '">📞 Llamar</a>' : "") +
      "</div></div>"
    );
    var modal = document.querySelector(".icc-modal");
    if (modal) modal.classList.add("icc-modal-ancho");
    document.querySelectorAll("#icc-modal-root [data-cerrar]").forEach(function (a) { a.addEventListener("click", function () { U.closeModal(); }); });
    document.querySelectorAll("[data-mover]").forEach(function (b) {
      b.addEventListener("click", function () {
        var destino = b.getAttribute("data-mover");
        if (destino === o.estado) return;
        U.closeModal();
        moverA(o, destino);
      });
    });
    var form = document.getElementById("pl-form-op");
    if (form) form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      U.closeModal();
      await guardar(o, { valor_estimado: fd.get("valor_estimado"), fecha_cierre_prevista: fd.get("fecha_cierre_prevista") }, "Oportunidad actualizada");
    });
    var bCita = document.getElementById("pl-cita");
    if (bCita) bCita.addEventListener("click", function () {
      U.closeModal();
      window.icc.agenda.modalCita(null, {
        plantilla: { cliente_id: o.id, cliente_nombre: o.razon_social, contacto_nombre: o.contacto, telefono: o.telefono, tipo: "visita", comercial_id: o.comercial_id },
        titulo: "Programar cita · " + o.razon_social,
        onGuardado: view,
      });
    });
  }

  // CSV con las oportunidades filtradas (separador ";" y BOM para que Excel
  // en español lo abra bien con tildes).
  function exportarCsv(f) {
    var lista = f.estancadas ? datos.oportunidades.filter(estancada) : datos.oportunidades;
    var celda = function (v) { v = v == null ? "" : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var num = function (v) { return v == null ? "" : String(v).replace(".", ","); };
    var filas = [["Empresa", "CIF", "Contacto", "Teléfono", "Fase", "Días en fase", "Estancada", "Valor estimado (€)", "Probabilidad (%)", "Valor ponderado (€)",
      "Cierre previsto", "Próxima acción", "Ahorro cliente (€/año)", "Servicios", "Tipo de cliente", "Comercial", "Motivo de pérdida", "Alta"]];
    lista.forEach(function (o) {
      var fa = fase(o.estado);
      filas.push([o.razon_social, o.cif, o.contacto, o.telefono, C.ESTADOS[o.estado].label, o.dias_en_fase, estancada(o) ? "Sí" : "No",
        num(o.valor_estimado), fa.prob, num(o.valor_estimado != null ? Math.round(valorPonderado(o) * 100) / 100 : null),
        o.fecha_cierre_prevista || "", o.proxima_cita ? textoProxima(o.proxima_cita).replace(/^\S+\s/, "") : "", num(o.ahorro_cliente),
        (o.servicios || []).map(function (s) { return (C.SERVICIOS || {})[s] || s; }).join(", "),
        (C.TIPO_CLIENTE || {})[o.tipo_cliente] || o.tipo_cliente, o.comercial_nombre, o.motivo_perdida, String(o.created_at || "").slice(0, 10)]);
    });
    var csv = "\ufeff" + filas.map(function (r) { return r.map(celda).join(";"); }).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "pipeline-" + hoyIso() + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    U.toast(lista.length + " oportunidades exportadas", "success");
  }

  // Pequeña celebración al ganar una oportunidad.
  function celebrar() {
    var capa = document.createElement("div");
    capa.className = "icc-pl-confeti";
    var html = "";
    for (var i = 0; i < 70; i++) {
      html += '<i style="left:' + Math.random() * 100 + "%;background:" + PALETA[i % PALETA.length] + ";animation-delay:" + (Math.random() * 0.6).toFixed(2) + "s;animation-duration:" + (1.6 + Math.random() * 1.4).toFixed(2) + 's"></i>';
    }
    capa.innerHTML = html;
    document.body.appendChild(capa);
    setTimeout(function () { capa.remove(); }, 3400);
  }

  return { view: view };
})();
