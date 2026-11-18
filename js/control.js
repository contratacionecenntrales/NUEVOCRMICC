/* =============================================================================
   ICC CRM · Control 360 · Ahorro siempre (#/control y #/control?cliente=ID)
   El cliente manda sus facturas; la IA las lee, compara cada servicio con todo
   el mercado (energía, telefonía, alarmas y seguros) y lo revisa cada mes.
   Cada persona ve su cartera. API: api/control.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { d: null, f: null, filtro: "" };
  var IMPACTO = { alto: "🔥", medio: "👍", bajo: "·" };
  var EST_FACT = { pendiente: ["Leyendo…", ""], leida: ["Leída", "ok"], error: ["No se pudo leer", "aviso"], descartada: ["No es factura", ""] };
  var EST_AUD = { borrador: "Por revisar", revisada: "Revisado", enviada: "Enviado al cliente", descartada: "Descartado" };

  function main() { return document.getElementById("icc-main"); }
  function pill(t, c) { return '<span class="icc-ia-pill' + (c ? " is-" + c : "") + '">' + t + "</span>"; }
  function eur(n) { return n == null || n === "" ? "—" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"; }
  function fechaC(f) { if (!f) return ""; return new Date(String(f).replace(" ", "T")).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }); }
  async function hacer(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message || "No se pudo completar", "error"); } if (btn) btn.disabled = false; }
  function clienteRuta() { var m = location.hash.match(/[?&]cliente=(\d+)/); return m ? Number(m[1]) : 0; }
  function verClase(v) { return v === "paga_de_mas" ? "mal" : v === "mejorable" ? "aviso" : v === "optimo" ? "ok" : ""; }

  async function view() {
    var cid = clienteRuta();
    main().innerHTML = '<div class="icc-loading">Cargando Control 360…</div>';
    try {
      if (cid) { S.f = await API.get("api/control.php?action=ficha&cliente=" + cid); pintarFicha(); }
      else { S.d = await API.get("api/control.php?action=panel"); pintarPanel(); }
    } catch (e) { main().innerHTML = '<p class="icc-empty">' + esc(e.message) + "</p>"; }
  }

  /* ---------------------------------------------------------------- panel */
  function pintarPanel() {
    var d = S.d, k = d.kpis;
    var lista = d.clientes.filter(function (c) {
      if (!S.filtro) return true;
      if (S.filtro === "ahorro") return c.ahorro > 0;
      if (S.filtro === "sin") return !c.auditorias.length;
      return c.auditorias.some(function (a) { return a.veredicto === S.filtro; });
    });
    var html = '<div class="icc-ia icc-mo icc-cx">' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">Con ICC, ahorro siempre</span><h1>🛡️ Control 360</h1>' +
      "<p>El cliente nos manda sus facturas y la IA hace el resto: lee cada una (<b>luz, gas, telefonía, alarma y seguros</b>), la compara con las tarifas vigentes de <b>todas las compañías</b> y las ofertas del mes, le dice dónde está en el mercado, qué tiene, qué necesita y qué mejorar. <b>Cada mes lo vuelve a revisar</b> con las tarifas nuevas: si aparece una mejora, el gestor recibe el estudio listo para enviar.</p></div>" +
      '<div class="icc-cx-hero-acc"><button class="icc-btn icc-btn-primary" id="cx-subir-abrir">📤 Subir factura de un cliente</button>' + (d.direccion ? '<button class="icc-btn icc-btn-ghost" id="cx-ejecutar">🔄 Revisar ahora</button>' : "") + "</div></section>" +
      (!d.ia ? '<div class="icc-card icc-cx-aviso">⚠️ La IA no está activada: las facturas se guardan, pero se leerán cuando dirección añada la clave en «Ajustes de IA y cron».</div>' : "") +
      (!d.activo ? '<div class="icc-card icc-cx-aviso">⏸️ Control 360 está en pausa: no lee facturas ni revisa cada mes.</div>' : "") +
      '<div id="cx-subir" class="icc-card icc-cx-subir" hidden><h2>📤 Subir una factura</h2><p class="icc-ia-nota">PDF o foto de la factura de luz, gas, teléfono, alarma o seguro. Se lee en el momento y el estudio se actualiza.</p>' +
        '<form id="cx-form-subir" class="icc-cx-form"><label>Cliente<input class="icc-input" id="cx-buscar" placeholder="Escribe el nombre o CIF" autocomplete="off" required><input type="hidden" name="cliente"></label><div id="cx-resultados" class="icc-cx-resultados"></div>' +
        '<label>Factura<input class="icc-input" type="file" name="factura" accept="application/pdf,image/*" required></label><button class="icc-btn icc-btn-primary">Subir y analizar</button></form></div>' +
      '<div class="icc-mo-kpis">' + [["👥", k.clientes, "Clientes vigilados", ""], ["🧾", k.facturas_mes, "Facturas este mes", ""], ["💶", eur(k.ahorro_detectado), "Ahorro detectado / año", "ahorro"], ["⚠️", k.mejoras, "Servicios a mejorar", "paga_de_mas"], ["✅", k.optimos, "En lo mejor del mercado", "optimo"], ["📝", k.por_revisar, "Estudios por revisar", ""]]
        .map(function (x) { return '<button type="button" class="icc-card icc-mo-kpi icc-cx-kpi' + (x[3] && S.filtro === x[3] ? " is-sel" : "") + '"' + (x[3] ? ' data-filtro="' + x[3] + '"' : " disabled") + "><span>" + x[0] + "</span><b>" + x[1] + "</b><small>" + x[2] + "</small></button>"; }).join("") + "</div>" +
      '<section class="icc-cx-pasos">' + [["1", "📥", "Nos manda sus facturas", "Enlace de subida, correo a facturacion@ o el gestor las sube."], ["2", "🤖", "La IA las lee", "Proveedor, consumo, potencias, líneas, coberturas, permanencia y cargos raros."], ["3", "📊", "Estudio de mercado", "Lo que paga frente a todas las compañías: posición, mejor opción y mejoras."], ["4", "🔁", "Mes a mes", "Revisión con las tarifas nuevas, aviso al gestor y petición de facturas que faltan."]]
        .map(function (p) { return '<div class="icc-card"><b>' + p[1] + " " + p[2] + "</b><small>" + p[3] + "</small></div>"; }).join("") + "</section>" +
      (d.direccion ? '<section class="icc-card icc-cx-ajustes"><label><input type="checkbox" id="cx-activo"' + (d.activo ? " checked" : "") + "> Control 360 encendido (lee, revisa cada mes y avisa)</label><label><input type=\"checkbox\" id=\"cx-pedir\"" + (d.pedir ? " checked" : "") + "> Pedir por correo la última factura a quien no la mande en 40 días (máx. 1 al mes)</label></section>" : "") +
      (d.cola.length ? '<section class="icc-card icc-ia-bloque"><h2>🧾 Facturas en cola</h2><ul class="icc-ia-lista">' + d.cola.map(function (f) {
        return '<li><div><strong><a href="#/control?cliente=' + f.cliente_id + '">' + esc(f.razon_social) + "</a></strong><small>" + esc(fechaC(f.created_at)) + (f.error ? " · " + esc(f.error) : "") + '</small></div><div class="icc-ia-fila">' + pill(EST_FACT[f.estado][0], EST_FACT[f.estado][1]) + '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-leer="' + f.id + '">Leer ahora</button></div></li>';
      }).join("") + "</ul></section>" : "") +
      '<section class="icc-ia-bloque"><div class="icc-cx-cab"><h2 class="icc-fl-h2">' + (S.filtro ? "Filtrado" : "Clientes en Control 360") + " (" + lista.length + ")</h2>" + (S.filtro ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-filtro="">Ver todos</button>' : "") + "</div>" +
      (lista.length ? '<div class="icc-cx-lista">' + lista.map(tarjeta).join("") + "</div>" : '<p class="icc-muted">' + (d.clientes.length ? "Ninguno con este filtro." : "Aún no hay clientes. Sube la primera factura o pide las facturas desde la ficha del cliente.") + "</p>") + "</section></div>";
    main().innerHTML = html;
    enlazarPanel();
  }

  function tarjeta(c) {
    var d = S.d;
    var porS = {}; c.auditorias.forEach(function (a) { porS[a.servicio] = a; });
    return '<article class="icc-card icc-cx-cli"><header><div><strong><a href="#/control?cliente=' + c.id + '">' + esc(c.razon_social) + "</a></strong><small>" + esc((c.gestor || "Sin gestor").trim()) + " · " + c.facturas + " facturas" + (c.ultima_factura ? " · última " + esc(fechaC(c.ultima_factura)) : "") + "</small></div>" +
      (c.ahorro > 0 ? '<span class="icc-cx-ahorro">' + eur(c.ahorro) + "<small>/año</small></span>" : Number(c.activo) ? "" : pill("Sin vigilar", "")) + "</header>" +
      '<div class="icc-cx-chips">' + Object.keys(d.servicios).map(function (s) {
        var a = porS[s], sv = d.servicios[s];
        if (!a) return '<span class="icc-cx-chip is-vacio" title="Sin factura de ' + esc(sv[0]) + '">' + sv[1] + " " + esc(sv[0]) + "</span>";
        var v = d.veredictos[a.veredicto];
        return '<span class="icc-cx-chip is-' + verClase(a.veredicto) + '" title="' + esc(v[0]) + '">' + sv[1] + " " + esc(sv[0]) + " · " + v[1] + (Number(a.ahorro_anual) > 0 && a.veredicto !== "optimo" ? " " + eur(a.ahorro_anual) : "") + "</span>";
      }).join("") + "</div>" +
      '<div class="icc-ia-fila"><a class="icc-btn icc-btn-primary icc-mo-mini" href="#/control?cliente=' + c.id + '">Ver estudio</a><button class="icc-btn icc-btn-ghost icc-mo-mini" data-pedir="' + c.id + '">✉️ Pedir facturas</button></div></article>';
  }

  function enlazarPanel() {
    var m = main();
    m.querySelectorAll("[data-filtro]").forEach(function (b) { b.addEventListener("click", function () { S.filtro = S.filtro === b.dataset.filtro ? "" : b.dataset.filtro; pintarPanel(); }); });
    m.querySelectorAll("[data-leer]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { var r = await API.post("api/control.php?action=leer", { id: Number(b.dataset.leer) }); U.toast(r.texto, "success"); await view(); }); }); });
    m.querySelectorAll("[data-pedir]").forEach(function (b) { b.addEventListener("click", function () { hacer(b, async function () { var r = await API.post("api/control.php?action=pedir", { cliente: Number(b.dataset.pedir) }); U.toast("✓ " + r.texto, "success"); }); }); });
    var ab = document.getElementById("cx-subir-abrir");
    if (ab) ab.addEventListener("click", function () { var s = document.getElementById("cx-subir"); s.hidden = !s.hidden; if (!s.hidden) document.getElementById("cx-buscar").focus(); });
    var ej = document.getElementById("cx-ejecutar");
    if (ej) ej.addEventListener("click", function () { hacer(ej, async function () { var r = await API.post("api/control.php?action=ejecutar", {}); U.toast(r.texto, "success"); await view(); }); });
    ["cx-activo", "cx-pedir"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", function () { var b = {}; b[id === "cx-activo" ? "activo" : "pedir"] = el.checked; hacer(null, async function () { await API.post("api/control.php?action=ajustes", b); U.toast("✓ Guardado", "success"); }); });
    });
    // Buscador de cliente para subir.
    var bus = document.getElementById("cx-buscar"), res = document.getElementById("cx-resultados"), t = null, form = document.getElementById("cx-form-subir");
    if (bus) bus.addEventListener("input", function () {
      form.cliente.value = "";
      clearTimeout(t);
      if (bus.value.trim().length < 2) { res.innerHTML = ""; return; }
      t = setTimeout(async function () {
        try {
          var r = await API.get("api/control.php?action=buscar&q=" + encodeURIComponent(bus.value.trim()));
          res.innerHTML = r.clientes.map(function (c) { return '<button type="button" data-cli="' + c.id + '">' + esc(c.razon_social) + "</button>"; }).join("") || '<small class="icc-muted">Sin resultados en tu cartera.</small>';
          res.querySelectorAll("[data-cli]").forEach(function (b) { b.addEventListener("click", function () { form.cliente.value = b.dataset.cli; bus.value = b.textContent; res.innerHTML = ""; }); });
        } catch (e) { res.innerHTML = ""; }
      }, 250);
    });
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!form.cliente.value) { U.toast("Elige el cliente de la lista", "error"); return; }
      subir(ev.submitter, form.cliente.value, form.factura.files[0], true);
    });
  }

  function subir(btn, cid, archivo, irAFicha) {
    if (!archivo) { U.toast("Elige el archivo de la factura", "error"); return; }
    var fd = new FormData(); fd.append("cliente", cid); fd.append("factura", archivo);
    hacer(btn, async function () {
      if (btn) btn.textContent = "Leyendo la factura…";
      var r = await API.postForm("api/control.php?action=subir", fd);
      U.toast("✓ " + r.texto, "success");
      if (irAFicha && clienteRuta() !== Number(cid)) location.hash = "#/control?cliente=" + cid; else await view();
    });
  }

  /* ---------------------------------------------------------------- ficha */
  function pintarFicha() {
    var f = S.f, c = f.cliente;
    var este = f.auditorias.filter(function (a) { return a.mes === f.mes; });
    var pendientes = este.filter(function (a) { return (a.estado === "borrador" || a.estado === "revisada") && a.veredicto !== "sin_datos"; });
    var ahorro = este.reduce(function (s, a) { return s + (a.veredicto === "mejorable" || a.veredicto === "paga_de_mas" ? Number(a.ahorro_anual || 0) : 0); }, 0);
    var activo = !f.control || Number(f.control.activo);
    var html = '<div class="icc-ia icc-mo icc-cx">' +
      '<a class="icc-cx-volver" href="#/control">← Control 360</a>' +
      '<section class="icc-ia-hero icc-mo-hero"><div><span class="icc-ia-eyebrow">Control 360 · ' + esc(c.sector || "Sin sector") + "</span><h1>" + esc(c.razon_social) + "</h1>" +
      "<p>" + (este.length ? (ahorro > 0 ? "Este mes hemos encontrado <b>" + eur(ahorro) + " al año</b> de ahorro posible." : "Este mes está en lo mejor del mercado en lo que hemos revisado.") : "Sube su factura o pídesela: en cuanto llegue, la IA hace el estudio.") +
      (f.control && f.control.ultimo_informe ? " Último informe enviado el " + esc(fechaC(f.control.ultimo_informe)) + "." : "") + "</p></div>" +
      '<div class="icc-cx-hero-acc">' + (pendientes.length ? '<button class="icc-btn icc-btn-primary" id="cx-enviar">✉️ Enviar informe del mes</button>' : "") +
      '<label class="icc-btn icc-btn-ghost icc-cx-file">📤 Subir factura<input type="file" id="cx-file" accept="application/pdf,image/*" hidden></label>' +
      '<button class="icc-btn icc-btn-ghost" id="cx-auditar">🔄 Revisar con las tarifas de hoy</button><button class="icc-btn icc-btn-ghost" id="cx-pedir-uno">✉️ Pedir facturas</button></div></section>' +
      '<section class="icc-card icc-cx-ajustes"><label><input type="checkbox" id="cx-vigilar"' + (activo ? " checked" : "") + "> Revisión mensual activa para este cliente</label>" +
      (c.enlace ? '<span class="icc-cx-enlace">Enlace de subida para el cliente: <code>' + esc(c.enlace) + '</code> <button class="icc-btn icc-btn-ghost icc-mo-mini" id="cx-copiar">Copiar</button></span>' : "") +
      (!c.email ? '<span class="icc-muted">Sin correo en la ficha: no se le pueden pedir facturas ni enviar el informe.</span>' : "") + "</section>" +
      (este.length ? este.map(estudio).join("") : '<section class="icc-card"><p class="icc-muted">Aún no hay estudio de este mes.</p></section>') +
      historial(f) +
      '<section class="icc-card icc-ia-bloque"><h2>🧾 Facturas (' + f.facturas.length + ")</h2>" + (f.facturas.length ? '<ul class="icc-ia-lista">' + f.facturas.map(function (x) {
        return "<li><div><strong>" + esc(x.proveedor || x.nombre_archivo || "Factura") + (x.producto ? " · " + esc(x.producto) : "") + "</strong><small>" + esc(NOMBRES[x.servicio] ? NOMBRES[x.servicio][0] : "Sin clasificar") + (x.fecha_factura ? " · " + esc(fechaC(x.fecha_factura)) : " · subida " + esc(fechaC(x.created_at))) + (Number(x.importe_total) ? " · " + eur(x.importe_total) : "") + (Number(x.coste_mensual) ? " (" + eur(x.coste_mensual) + "/mes)" : "") + (x.fin_permanencia ? " · permanencia hasta " + esc(fechaC(x.fin_permanencia)) : "") + (x.error ? " · " + esc(x.error) : "") + '</small></div><div class="icc-ia-fila">' + pill(EST_FACT[x.estado][0], EST_FACT[x.estado][1]) + (x.estado !== "leida" ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-leer="' + x.id + '">Leer otra vez</button>' : "") + "</div></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Ninguna todavía.</p>') + "</section></div>";
    main().innerHTML = html;
    enlazarFicha();
  }

  var NOMBRES = { energia: ["Energía", "⚡"], telefonia: ["Telefonía", "📶"], alarmas: ["Seguridad y alarmas", "🛡️"], seguros: ["Seguros", "📄"] };
  var VERED = { optimo: ["En lo mejor del mercado", "✅"], mejorable: ["Mejorable", "⚠️"], paga_de_mas: ["Paga de más", "🔴"], sin_datos: ["Falta estudio a mano", "📝"] };

  function barra(a) {
    if (a.mercado_min == null || a.mercado_max == null) return "";
    var min = Math.min(Number(a.mercado_min), Number(a.coste_actual_anual)), max = Math.max(Number(a.mercado_max), Number(a.coste_actual_anual));
    var pos = function (v) { return max > min ? Math.round((Number(v) - min) / (max - min) * 100) : 50; };
    var lado = function (v) { var x = pos(v); return x < 15 ? " is-izq" : x > 85 ? " is-der" : ""; };
    return '<div class="icc-cx-mercado"><div class="icc-cx-pista"><i class="icc-cx-marca is-usted' + lado(a.coste_actual_anual) + '" style="--x:' + pos(a.coste_actual_anual) + '%"><span>Hoy ' + eur(a.coste_actual_anual) + "</span></i>" +
      (a.coste_propuesto_anual != null ? '<i class="icc-cx-marca is-icc' + lado(a.coste_propuesto_anual) + '" style="--x:' + pos(a.coste_propuesto_anual) + '%"><span>Con ICC ' + eur(a.coste_propuesto_anual) + "</span></i>" : "") + "</div>" +
      '<div class="icc-cx-escala"><small>Más barato ' + eur(a.mercado_min) + "</small><small>Media " + eur(a.mercado_medio) + "</small><small>Más caro " + eur(a.mercado_max) + "</small></div>" +
      '<p class="icc-cx-pos">' + (a.posicion != null ? "<b>" + a.posicion + " %</b> de las " + a.n_ofertas + " alternativas vigentes son más baratas que lo que paga hoy." : "") + "</p></div>";
  }

  function estudio(a) {
    var e = a.estudio || {}, n = NOMBRES[a.servicio], v = VERED[a.veredicto];
    return '<section class="icc-card icc-cx-est is-' + verClase(a.veredicto) + '"><header><h2>' + n[1] + " " + n[0] + "</h2>" + pill(v[1] + " " + v[0], verClase(a.veredicto) === "mal" ? "aviso" : verClase(a.veredicto)) + pill(EST_AUD[a.estado], a.estado === "enviada" ? "ok" : "") + "</header>" +
      '<div class="icc-cx-cifras"><div><small>Paga hoy</small><b>' + eur(a.coste_actual_anual) + "<i>/año</i></b>" + (e.factura ? "<small>" + esc(e.factura.proveedor || "") + (e.factura.producto ? " · " + esc(e.factura.producto) : "") + "</small>" : "") + "</div>" +
        (a.mejor_opcion ? "<div><small>Mejor opción</small><b>" + eur(a.coste_propuesto_anual) + "<i>/año</i></b><small>" + esc(a.mejor_opcion) + "</small></div>" : "") +
        (Number(a.ahorro_anual) > 0 ? '<div class="is-ahorro"><small>Ahorro estimado</small><b>' + eur(a.ahorro_anual) + "<i>/año</i></b><small>" + (a.coste_actual_anual > 0 ? Math.round(a.ahorro_anual / a.coste_actual_anual * 100) + " % menos" : "") + "</small></div>" : "") + "</div>" +
      barra(a) +
      (e.situacion ? '<p class="icc-cx-sit">' + esc(e.situacion) + "</p>" : "") +
      '<div class="icc-cx-2col"><div><h3>Lo que tiene</h3><ul>' + (e.tiene || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div><div><h3>Lo que necesita</h3><ul>" + ((e.necesita || []).length ? e.necesita.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") : "<li class=\"icc-muted\">Pendiente de valorar con el cliente.</li>") + "</ul></div></div>" +
      ((e.mejoras || []).length ? "<h3>Mejoras</h3><ol class=\"icc-cx-mejoras\">" + e.mejoras.map(function (m) { return "<li><b>" + (IMPACTO[m.impacto] || "") + " " + esc(m.titulo) + "</b>" + (m.detalle ? "<small>" + esc(m.detalle) + "</small>" : "") + "</li>"; }).join("") + "</ol>" : "") +
      ((e.ranking || []).length ? '<details class="icc-cx-rank"><summary>Ver el estudio de mercado (' + e.ranking.length + ' alternativas)</summary><div class="icc-cx-tabla"><table><thead><tr><th>Compañía y tarifa</th><th>Coste / año</th><th>Ahorro</th></tr></thead><tbody>' +
        e.ranking.map(function (o) { return "<tr><td>" + esc(o.nombre) + (o.icc && a.servicio === "energia" ? ' <span class="icc-cx-icc">ICC</span>' : "") + "</td><td>" + eur(o.anual) + '</td><td class="' + (o.ahorro > 0 ? "is-pos" : "is-neg") + '">' + (o.ahorro > 0 ? "−" + eur(o.ahorro) : "+" + eur(-o.ahorro)) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        ((e.notas || []).filter(function (x) { return /^Comparado con/.test(x); }).map(function (x) { return '<p class="icc-ia-nota">' + esc(x) + "</p>"; }).join("")) + "</details>" : "") +
      ((e.ofertas_mes || []).length ? '<div class="icc-cx-ofertas"><b>🔥 Ofertas exclusivas del mes</b>' + e.ofertas_mes.map(function (o) { return "<small>" + esc(o.titulo) + (o.compania ? " · " + esc(o.compania) : "") + (o.condiciones ? " (" + esc(o.condiciones) + ")" : "") + "</small>"; }).join("") + "</div>" : "") +
      (e.mensaje_cliente ? '<details class="icc-cx-rank"><summary>Mensaje propuesto para el cliente</summary><p class="icc-cx-msg">' + esc(e.mensaje_cliente) + "</p></details>" : "") +
      '<footer class="icc-ia-fila"><small class="icc-muted">Calculado el ' + esc(e.fecha_calculo || "") + " con la última factura y las tarifas vigentes. Cifras estimadas: se confirman con la compañía antes de firmar.</small>" +
      (a.estado !== "enviada" ? (a.estado !== "revisada" ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-est="revisada" data-id="' + a.id + '">✓ Revisado</button>' : "") + (a.estado !== "descartada" ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-est="descartada" data-id="' + a.id + '">No enviar</button>' : '<button class="icc-btn icc-btn-ghost icc-mo-mini" data-est="borrador" data-id="' + a.id + '">Recuperar</button>') : "") + "</footer></section>";
  }

  function historial(f) {
    var meses = {};
    f.auditorias.forEach(function (a) { (meses[a.mes] = meses[a.mes] || []).push(a); });
    var ks = Object.keys(meses);
    if (ks.length < 2) return "";
    return '<section class="icc-card icc-ia-bloque"><h2>📅 Mes a mes</h2><div class="icc-cx-tabla"><table><thead><tr><th>Mes</th>' + Object.keys(NOMBRES).map(function (s) { return "<th>" + NOMBRES[s][1] + " " + NOMBRES[s][0] + "</th>"; }).join("") + "</tr></thead><tbody>" +
      ks.map(function (m) { var por = {}; meses[m].forEach(function (a) { por[a.servicio] = a; }); return "<tr><td>" + esc(m) + "</td>" + Object.keys(NOMBRES).map(function (s) { var a = por[s]; return "<td>" + (a ? VERED[a.veredicto][1] + " " + eur(a.coste_actual_anual) + (Number(a.ahorro_anual) > 0 && a.veredicto !== "optimo" ? ' <small class="is-pos">−' + eur(a.ahorro_anual) + "</small>" : "") : "—") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></section>";
  }

  function enlazarFicha() {
    var m = main(), cid = S.f.cliente.id;
    var post = function (btn, accion, body, recargar) { hacer(btn, async function () { var r = await API.post("api/control.php?action=" + accion, Object.assign({ cliente: cid }, body || {})); if (r.texto) U.toast("✓ " + r.texto, "success"); if (recargar !== false) await view(); }); };
    var b;
    if ((b = document.getElementById("cx-enviar"))) b.addEventListener("click", function () { if (confirm("¿Enviar al cliente el informe de este mes? Revisa antes las cifras y las mejoras.")) post(b, "enviar"); });
    if ((b = document.getElementById("cx-auditar"))) b.addEventListener("click", function () { post(this, "auditar"); });
    if ((b = document.getElementById("cx-pedir-uno"))) b.addEventListener("click", function () { post(this, "pedir", {}, false); });
    if ((b = document.getElementById("cx-file"))) b.addEventListener("change", function () { subir(null, cid, this.files[0], false); });
    if ((b = document.getElementById("cx-vigilar"))) b.addEventListener("change", function () { post(null, "alta", { activo: this.checked }, false); });
    if ((b = document.getElementById("cx-copiar"))) b.addEventListener("click", function () { try { navigator.clipboard.writeText(S.f.cliente.enlace); U.toast("✓ Enlace copiado", "success"); } catch (e) { U.toast("Cópialo a mano", "error"); } });
    m.querySelectorAll("[data-est]").forEach(function (x) { x.addEventListener("click", function () { hacer(x, async function () { await API.post("api/control.php?action=estado", { id: Number(x.dataset.id), estado: x.dataset.est }); await view(); }); }); });
    m.querySelectorAll("[data-leer]").forEach(function (x) { x.addEventListener("click", function () { hacer(x, async function () { x.textContent = "Leyendo…"; var r = await API.post("api/control.php?action=leer", { id: Number(x.dataset.leer) }); U.toast(r.texto, "success"); await view(); }); }); });
  }

  window.icc = window.icc || {};
  window.icc.control = { view: view };
})();
