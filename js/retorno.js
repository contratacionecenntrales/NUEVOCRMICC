/* =============================================================================
   ICC CRM · Retorno (#/retorno): lo que firma y ahorra, por canal, sector y
   gestor; pipeline ponderado; venta cruzada y renovaciones; recomendaciones y
   el agente CRO que mueve el esfuerzo a lo que firma. API: api/retorno.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { dias: 90, d: null };
  var COLS = { energia: "#22D3EE", telecomunicaciones: "#A78BFA", alarmas: "#F59E0B", seguros: "#F472B6", financiero: "#34D399" };

  function main() { return document.getElementById("icc-main"); }
  function eur(n) { return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"; }
  function num(n) { return Number(n || 0).toLocaleString("es-ES"); }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }

  async function view() {
    main().innerHTML = '<div class="icc-loading">Calculando el retorno…</div>';
    try { S.d = await API.get("api/retorno.php?action=panel&dias=" + S.dias); } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; return; }
    pintar();
  }

  function tabla(titulo, filas, vacio) {
    var max = Math.max.apply(null, filas.map(function (f) { return f.firmados; }).concat([1]));
    return '<section class="icc-card icc-ia-bloque"><h2>' + titulo + "</h2>" + (filas.length ? '<div class="icc-rt-tabla"><div class="icc-rt-fila icc-rt-fila--cab"><span></span><span>Leads</span><span>Con presupuesto</span><span>Firmados</span><span>Firman</span><span>Valor firmado</span><span>Ahorro al cliente</span></div>' +
      filas.map(function (f) {
        return '<div class="icc-rt-fila"><span><strong>' + esc(f.nombre) + '</strong><i class="icc-rt-barra" style="--w:' + Math.round(f.firmados / max * 100) + '%"></i></span><span>' + num(f.leads) + "</span><span>" + num(f.con_presupuesto) + "</span><span><b>" + num(f.firmados) + "</b></span><span>" + (f.tasa == null ? "—" : f.tasa + " %") + "</span><span>" + eur(f.valor) + "</span><span>" + (f.ahorro ? eur(f.ahorro) + "/año" : "—") + "</span></div>";
      }).join("") + "</div>" : '<p class="icc-muted">' + vacio + "</p>") + "</section>";
  }

  function grafica(meses, servicios) {
    var porMes = {};
    meses.forEach(function (m) { (porMes[m.mes] = porMes[m.mes] || {})[m.sector] = Number(m.n); });
    var claves = Object.keys(porMes).sort();
    if (!claves.length) return '<p class="icc-muted">Todavía no hay contratos en los últimos 6 meses.</p>';
    var max = Math.max.apply(null, claves.map(function (k) { return Object.keys(porMes[k]).reduce(function (a, s) { return a + porMes[k][s]; }, 0); }).concat([1]));
    var nombreMes = function (k) { var p = k.split("-"); return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(p[1]) - 1] + " " + p[0].slice(2); };
    return '<div class="icc-rt-graf" role="img" aria-label="Contratos por mes y servicio">' + claves.map(function (k) {
      var tot = Object.keys(porMes[k]).reduce(function (a, s) { return a + porMes[k][s]; }, 0);
      return '<div class="icc-rt-col"><b>' + tot + '</b><div class="icc-rt-pila" style="height:' + Math.max(4, Math.round(tot / max * 150)) + 'px">' + Object.keys(servicios).filter(function (s) { return porMes[k][s]; }).map(function (s) {
        return '<i style="flex:' + porMes[k][s] + ';background:' + COLS[s] + '" title="' + esc(servicios[s]) + ": " + porMes[k][s] + '"></i>'; }).join("") + "</div><small>" + nombreMes(k) + "</small></div>";
    }).join("") + '</div><div class="icc-rt-leyenda">' + Object.keys(servicios).map(function (s) { return '<span><i style="background:' + COLS[s] + '"></i>' + esc(servicios[s]) + "</span>"; }).join("") + "</div>";
  }

  function pintar() {
    var d = S.d, t = d.totales;
    var html = '<div class="icc-ia icc-mo icc-rt">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">Retorno · lo que firma y ahorra</span><h1>🚀 Retorno</h1>' +
      "<p>Qué canal, sector y gestor <b>firma de verdad</b>, cuánto vale y cuánto ahorra ICC a sus clientes (de sus estudios, nunca inventado). El agente <b>CRO · Director de Retorno</b> usa estos datos cada día para mover el esfuerzo a lo que firma." + (d.equipo ? " Ves los datos de tu equipo." : "") + "</p>" +
      '<div class="icc-ia-fila">' + [30, 90, 180, 365].map(function (n) { return '<button class="icc-btn ' + (S.dias === n ? "icc-btn-primary" : "icc-btn-ghost") + ' icc-mo-mini" data-dias="' + n + '">' + (n === 365 ? "12 meses" : n + " días") + "</button>"; }).join("") + "</div></div>" +
      (d.es_config ? '<button class="icc-btn icc-btn-primary" id="rt-opt">🧠 Optimizar ahora (CRO)</button>' : "") + "</section>" +
      '<div class="icc-mo-kpis">' + [["✍️", num(t.firmados), "Clientes firmados"], ["💶", eur(t.valor), "Valor firmado"], ["🎯", t.tasa == null ? "—" : t.tasa + " %", "De los leads firman"], ["📈", eur(t.pipeline_ponderado), "Pipeline ponderado"], ["🌱", eur(t.ahorro_cartera), "Ahorro anual a la cartera"]]
        .map(function (k) { return '<div class="icc-card icc-mo-kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
      '<section class="icc-card icc-ia-bloque"><h2>💡 Dónde está el siguiente euro</h2>' + (d.recomendaciones.length ? '<ul class="icc-ia-lista">' + d.recomendaciones.map(function (r) { return "<li><div><strong>" + r.icono + " " + esc(r.texto) + '</strong></div><div class="icc-ia-fila"><a class="icc-btn icc-btn-ghost icc-mo-mini" href="' + esc(r.enlace) + '">Ir →</a></div></li>'; }).join("") + "</ul>" : '<p class="icc-muted">Cuando haya firmas suficientes, aquí verás qué canal, sector y acción dan más retorno.</p>') +
      (d.cro ? '<small class="icc-muted">Último turno del CRO: ' + esc(new Date(String(d.cro.inicio).replace(" ", "T")).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })) + " · " + esc(String(d.cro.resumen || "").slice(0, 200)) + "</small>" : "") + "</section>" +
      '<div class="icc-ia-dos"><section class="icc-card icc-ia-bloque"><h2>📄 Contratos por mes y servicio</h2>' + grafica(d.meses, d.servicios) + "</section>" +
      '<section class="icc-card icc-ia-bloque"><h2>🔁 Crecer con los clientes que ya firmaron</h2><ul class="icc-ia-lista">' +
        "<li><div><strong>" + num(t.activos) + " clientes activos</strong><small>Ahorran " + eur(t.ahorro_cartera) + " al año con ICC según sus estudios.</small></div></li>" +
        "<li><div><strong>" + num(t.monoservicio) + " con un solo servicio</strong><small>Venta cruzada: energía → telefonía → alarmas → seguros (100 % servicios).</small></div></li>" +
        "<li><div><strong>" + num(t.renovaciones_60) + (Number(t.renovaciones_60) === 1 ? " renovación" : " renovaciones") + " en 60 días</strong><small>Revisión antes de que se renueven: se retienen y se mejora la tarifa.</small></div></li>" +
        "<li><div><strong>Informe de ahorro a los 60 días</strong><small>Cada cliente recibe su ahorro real y se le pide un referido (automatización «Informe de ahorro»).</small></div></li></ul></section></div>" +
      tabla("📡 Por canal", d.canales, "Sin altas ni firmas en el periodo.") + tabla("🏷️ Por sector", d.sectores, "Sin datos en el periodo.") + tabla("👤 Por gestor", d.gestores, "Sin datos en el periodo.") + "</div>";
    main().innerHTML = html;
    main().querySelectorAll("[data-dias]").forEach(function (b) { b.addEventListener("click", function () { S.dias = Number(b.dataset.dias); view(); }); });
    var o = document.getElementById("rt-opt");
    if (o) o.addEventListener("click", function () { hacer(o, async function () { var x = await API.post("api/retorno.php?action=optimizar", {}); U.toast(x.texto, "success"); await view(); }); });
  }

  window.icc = window.icc || {};
  window.icc.retorno = { view: view };
})();
