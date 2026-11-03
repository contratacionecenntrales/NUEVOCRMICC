/* =============================================================================
   ICC CRM · Copias de seguridad y restauración individual (#/copias-seguridad)
   Solo dirección. Copias diarias automáticas de la base de datos y de los
   archivos, copia extra antes de cada borrado y restauración de un único
   cliente, cuenta, factura, contrato... con todo lo suyo. API: api/copias.php.
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = U.escapeHtml;
  var S = { datos: null, copia: "", tipo: "cliente", q: "", resultados: null, buscando: false };
  var ICONOS = { cliente: "🏢", usuario: "👤", factura: "🧾", documento: "📎", contrato: "📝", presupuesto: "📄", cita: "📅", fichero: "📁" };
  var ESTADOS = { borrado: ["Borrado", "mal"], cambiado: ["Modificado", "aviso"], existe: ["Igual que ahora", "ok"] };

  function main() { return document.getElementById("icc-main"); }
  function tam(b) { return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB"; }
  function fecha(f) {
    var d = new Date(String(f).replace(" ", "T"));
    return d.toLocaleString("es-ES", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  async function view() {
    if (!window.icc.auth.esAdminOSuperior()) {
      main().innerHTML = '<p class="icc-empty">Las copias de seguridad son solo para dirección.</p>';
      return;
    }
    main().innerHTML = '<div class="icc-loading">Cargando las copias de seguridad…</div>';
    try {
      S.datos = await API.get("api/copias.php?action=lista");
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + esc(err.message || "No se pudieron cargar las copias") + "</p>";
      return;
    }
    if (!S.copia || !S.datos.bd.some(function (c) { return c.nombre === S.copia; })) S.copia = S.datos.bd.length ? S.datos.bd[0].nombre : "";
    S.resultados = null;
    pintar();
  }

  function pintar() {
    var d = S.datos;
    var ultima = d.bd[0];
    var html = '<div class="icc-cop">' +
      '<section class="icc-cop-hero"><div><span class="icc-cop-eyebrow">Seguridad · Copias</span><h1>💾 Copias de seguridad</h1>' +
      "<p>El CRM guarda <b>cada día, solo,</b> una copia de toda la base de datos y de los archivos (facturas, contratos, fotos…), y otra copia extra <b>justo antes de cada borrado</b>. Se conservan " + d.dias + " días.</p>" +
      '<div class="icc-cop-estado">' +
      (ultima ? '<span class="icc-cop-ok">✓ Última copia: ' + esc(fecha(ultima.fecha)) + "</span>" : '<span class="icc-cop-mal">Aún no hay ninguna copia: se hará sola hoy, o pulsa «Hacer copia ahora».</span>') +
      "<span>" + d.bd.length + " copias de la base de datos · " + d.archivos.length + " copias de archivos</span>" +
      (d.carpeta_privada ? '<span class="icc-cop-ok">🔒 Guardadas fuera de la web</span>' : '<span>🔒 Protegidas: nunca se sirven por URL</span>') + "</div></div>" +
      '<button type="button" class="icc-btn icc-btn-primary" id="cop-crear">💾 Hacer copia ahora</button></section>';

    html += '<section class="icc-card icc-cop-bloque"><h2>♻️ Restaurar algo concreto</h2>' +
      '<p class="icc-muted">Si un gestor borra o estropea su cuenta, un cliente, una factura o un contrato, recupéralo aquí sin tocar nada más del CRM.</p>' +
      (d.bd.length
        ? '<div class="icc-cop-pasos">' +
          '<label class="icc-cop-paso"><span>1 · De qué copia</span><select class="icc-select" id="cop-copia">' +
          d.bd.map(function (c) {
            return '<option value="' + esc(c.nombre) + '"' + (c.nombre === S.copia ? " selected" : "") + ">" + esc(fecha(c.fecha)) + " · " + esc(c.motivo === "diaria" ? "copia diaria" : c.motivo) + "</option>";
          }).join("") + "</select></label>" +
          '<div class="icc-cop-paso"><span>2 · Qué quieres recuperar</span><div class="icc-cop-tipos" role="radiogroup">' +
          Object.keys(d.tipos).map(function (k) {
            return '<button type="button" role="radio" aria-checked="' + (S.tipo === k) + '" class="icc-cop-tipo' + (S.tipo === k ? " is-activo" : "") + '" data-tipo="' + k + '">' + (ICONOS[k] || "•") + " " + esc(d.tipos[k]) + "</button>";
          }).join("") + "</div></div>" +
          '<label class="icc-cop-paso"><span>3 · Búscalo</span><div class="icc-cop-buscar"><input class="icc-input" id="cop-q" placeholder="Nombre, CIF, email, número…" value="' + esc(S.q) + '"><button type="button" class="icc-btn icc-btn-primary" id="cop-buscar">🔎 Buscar en la copia</button></div></label>' +
          "</div>" + resultadosHtml()
        : '<p class="icc-muted">Todavía no hay copias de la base de datos. Pulsa «Hacer copia ahora» para crear la primera.</p>') + "</section>";

    html += '<div class="icc-cop-dos"><section class="icc-card icc-cop-bloque"><h2>🗄️ Copias de la base de datos</h2>' +
      (d.bd.length ? '<ul class="icc-cop-lista">' + d.bd.slice(0, 40).map(function (c) {
        return "<li><div><strong>" + esc(fecha(c.fecha)) + "</strong><small>" + esc(c.motivo === "diaria" ? "Copia diaria automática" : c.motivo.charAt(0).toUpperCase() + c.motivo.slice(1)) + "</small></div><span>" + tam(c.tamano) + "</span></li>";
      }).join("") + "</ul>" : '<p class="icc-muted">Sin copias todavía.</p>') + "</section>" +
      '<section class="icc-card icc-cop-bloque"><h2>📦 Copias de los archivos</h2><p class="icc-muted">Facturas, estudios, firmas, fotos y ficheros. Se hace una al día si ha cambiado algo.</p>' +
      (d.archivos.length ? '<ul class="icc-cop-lista">' + d.archivos.map(function (c) {
        return "<li><div><strong>" + esc(fecha(c.fecha)) + "</strong><small>" + tam(c.tamano) + '</small></div><a class="icc-btn icc-btn-ghost icc-cop-btn" href="api/backup.php?accion=descargar&archivo=' + encodeURIComponent(c.nombre) + '">⬇ Descargar</a></li>';
      }).join("") + "</ul>" : '<p class="icc-muted">Sin copias todavía.</p>') + "</section></div>";
    html += "</div>";
    main().innerHTML = html;
    enlazar();
  }

  function resultadosHtml() {
    if (S.buscando) return '<p class="icc-muted icc-cop-res">Buscando en la copia…</p>';
    if (!S.resultados) return "";
    if (!S.resultados.length) return '<p class="icc-muted icc-cop-res">No hay nada con ese nombre en esa copia. Prueba con otra fecha o con menos palabras.</p>';
    return '<ul class="icc-cop-res">' + S.resultados.map(function (r) {
      var e = ESTADOS[r.estado] || ["", "ok"];
      return '<li><span class="icc-cop-ico" aria-hidden="true">' + (ICONOS[S.tipo] || "•") + '</span><div><strong>' + esc(r.titulo) + "</strong><small>" + esc(r.sub || "") + " · #" + r.id + "</small></div>" +
        '<span class="icc-cop-chip is-' + e[1] + '">' + e[0] + "</span>" +
        '<button type="button" class="icc-btn ' + (r.estado === "existe" ? "icc-btn-ghost" : "icc-btn-primary") + ' icc-cop-btn" data-restaurar="' + r.id + '" data-titulo="' + esc(r.titulo) + '">♻️ Restaurar…</button></li>';
    }).join("") + "</ul>";
  }

  async function buscar() {
    S.q = (document.getElementById("cop-q").value || "").trim();
    S.buscando = true;
    pintar();
    try {
      var r = await API.get("api/copias.php?action=buscar&copia=" + encodeURIComponent(S.copia) + "&tipo=" + S.tipo + "&q=" + encodeURIComponent(S.q));
      S.resultados = r.resultados;
    } catch (err) {
      S.resultados = null;
      U.toast(err.message || "No se pudo buscar", "error");
    }
    S.buscando = false;
    pintar();
    var q = document.getElementById("cop-q");
    if (q) q.focus();
  }

  async function restaurar(id, titulo) {
    var nombreTipo = S.datos.tipos[S.tipo];
    var esUsuario = S.tipo === "usuario";
    U.openModal('<h2>♻️ Restaurar ' + esc(nombreTipo.toLowerCase()) + "</h2><p><b>" + esc(titulo) + "</b> · copia del " + esc(fecha((S.datos.bd.filter(function (c) { return c.nombre === S.copia; })[0] || {}).fecha || "")) + "</p>" +
      '<div id="cop-plan" class="icc-cop-plan"><p class="icc-muted">Calculando qué se recuperaría…</p></div>' +
      '<fieldset class="icc-cop-modos"><legend>Cómo restaurar</legend>' +
      '<label><input type="radio" name="cop-modo" value="faltan" checked> <span><b>Recuperar lo que falta</b><small>Vuelve a poner lo borrado. No cambia nada de lo que existe ahora.</small></span></label>' +
      '<label><input type="radio" name="cop-modo" value="version"> <span><b>Volver a como estaba</b><small>Además deja este ' + esc(nombreTipo.toLowerCase()) + " exactamente como en la copia (deshace cambios posteriores).</small></span></label></fieldset>" +
      (esUsuario ? '<label class="icc-check icc-cop-devolver"><input type="checkbox" id="cop-devolver"> Devolverle los clientes, contratos y citas que tenía en esa copia (si se traspasaron a otra persona al borrar la cuenta)</label>' : "") +
      '<p class="icc-muted" style="font-size:12.5px">Antes de restaurar se hace una copia de cómo está todo ahora, por si hubiera que deshacerlo. Queda apuntado en la bitácora de seguridad.</p>' +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button><button type="button" class="icc-btn icc-btn-primary" id="cop-ok" disabled>♻️ Restaurar</button></div>');
    var cargarPlan = async function () {
      var cont = document.getElementById("cop-plan");
      var dev = document.getElementById("cop-devolver");
      try {
        var r = await API.get("api/copias.php?action=detalle&copia=" + encodeURIComponent(S.copia) + "&tipo=" + S.tipo + "&id=" + id + (dev && dev.checked ? "&devolver=1" : ""));
        var NOMBRES = { clientes: "clientes", usuarios: "cuentas", contratos: "contratos", citas: "citas", documentos: "documentos", presupuestos: "presupuestos", proformas: "facturas", estudios: "estudios", firmas: "firmas", ficheros: "archivos de Ficheros",
          historial_estado: "cambios de fase", agentes_ficha: "fichas de agente", cliente_servicios: "servicios", usuarios_permisos: "permisos", usuarios_preferencias: "preferencias", ficheros_carpetas: "carpetas", usuarios_auditoria: "apuntes de historial" };
        var lineas = [];
        Object.keys(r.resumen).forEach(function (t) {
          var x = r.resumen[t];
          var n = NOMBRES[t] || t.replace(/_/g, " ");
          if (x.insertar) lineas.push("<li>➕ <b>" + x.insertar + "</b> " + esc(n) + " que ya no están</li>");
          if (x.vincular) lineas.push("<li>🔗 <b>" + x.vincular + "</b> " + esc(n) + " que se volverán a vincular</li>");
          if (x.devolver) lineas.push("<li>↩️ <b>" + x.devolver + "</b> " + esc(n) + " que se le devolverán</li>");
        });
        if (r.archivos_faltan) lineas.push("<li>📎 <b>" + r.archivos_faltan + "</b> archivos (facturas, PDFs, fotos) que faltan en el disco</li>");
        cont.innerHTML = lineas.length ? "<p><b>Se recuperará:</b></p><ul>" + lineas.join("") + "</ul>" : '<p class="icc-cop-ok">✓ No falta nada: todo lo de esta copia sigue en el CRM. Si quieres deshacer cambios, elige «Volver a como estaba».</p>';
        document.getElementById("cop-ok").disabled = false;
      } catch (err) {
        cont.innerHTML = '<p class="icc-cop-mal">' + esc(err.message || "No se pudo calcular") + "</p>";
      }
    };
    cargarPlan();
    var dev = document.getElementById("cop-devolver");
    if (dev) dev.addEventListener("change", cargarPlan);
    document.getElementById("cop-ok").addEventListener("click", async function () {
      var b = this;
      b.disabled = true;
      b.textContent = "Restaurando…";
      var modo = (document.querySelector('input[name="cop-modo"]:checked') || {}).value || "faltan";
      try {
        var r = await API.post("api/copias.php?action=restaurar", { copia: S.copia, tipo: S.tipo, id: id, modo: modo, devolver: !!(dev && dev.checked) });
        var partes = [];
        if (r.insertadas) partes.push(r.insertadas + " recuperados");
        if (r.vinculadas) partes.push(r.vinculadas + " revinculados");
        if (r.devueltas) partes.push(r.devueltas + " devueltos");
        if (r.actualizada) partes.push("registro vuelto a su versión");
        if (r.archivos) partes.push(r.archivos + " archivos");
        U.toast("✓ Restaurado: " + (partes.join(", ") || "no faltaba nada") + (r.archivos_sin_copia ? ". " + r.archivos_sin_copia + " archivos no estaban en ninguna copia." : ""), "success");
        U.closeModal();
        view();
      } catch (err) {
        b.disabled = false;
        b.textContent = "♻️ Restaurar";
        U.toast(err.message || "No se pudo restaurar", "error");
      }
    });
  }

  function enlazar() {
    var q = function (id) { return document.getElementById(id); };
    q("cop-crear").addEventListener("click", async function () {
      var b = this;
      b.disabled = true;
      b.textContent = "Haciendo la copia…";
      try {
        await API.post("api/copias.php?action=crear", {});
        U.toast("✓ Copia de seguridad completa creada", "success");
        view();
      } catch (err) {
        b.disabled = false;
        b.textContent = "💾 Hacer copia ahora";
        U.toast(err.message || "No se pudo crear la copia", "error");
      }
    });
    if (q("cop-copia")) q("cop-copia").addEventListener("change", function (e) { S.copia = e.target.value; S.resultados = null; pintar(); });
    main().querySelectorAll("[data-tipo]").forEach(function (b) {
      b.addEventListener("click", function () { S.tipo = b.getAttribute("data-tipo"); S.resultados = null; S.q = (q("cop-q") || {}).value || ""; pintar(); });
    });
    if (q("cop-buscar")) q("cop-buscar").addEventListener("click", buscar);
    if (q("cop-q")) q("cop-q").addEventListener("keydown", function (e) { if (e.key === "Enter") buscar(); });
    main().querySelectorAll("[data-restaurar]").forEach(function (b) {
      b.addEventListener("click", function () { restaurar(Number(b.getAttribute("data-restaurar")), b.getAttribute("data-titulo")); });
    });
  }

  window.icc = window.icc || {};
  window.icc.copias = { view: view };
})();
