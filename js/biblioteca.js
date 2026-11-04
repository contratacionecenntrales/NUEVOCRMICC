/* =============================================================================
   ICC CRM · Biblioteca de formación y recursos (#/ficheros)
   Portada ordenada de Ficheros: ruta de inicio del comercial con progreso,
   presentaciones para el cliente, cómo tramitar, formación por área y ofertas
   tácticas. Miniaturas reales de los PDF y modo presentación a pantalla
   completa con pdf.js (assets/vendor/pdfjs). Datos: api/biblioteca.php.
   El explorador de carpetas de siempre sigue en #/ficheros/carpetas.
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = U.escapeHtml;
  var VER = "85";

  var S = { datos: null, porId: {}, busca: "", miniaturas: {}, observador: null, cola: [], activos: 0 };

  var SECCIONES = [
    { cat: "presentaciones", eyebrow: "Para la reunión", titulo: "Material para el cliente", sub: "Lo que se enseña y se deja en cada visita: quiénes somos y lo que ofrecemos.", icono: "🎤", estilo: "grande", etiqueta: "Material para clientes" },
    { cat: "dosieres", eyebrow: "Para descargar y enviar", titulo: "Dosieres corporativos por división", sub: "El dosier oficial de cada división de ICC: descárgalo y envíaselo al cliente después de la visita.", icono: "💼", estilo: "divisiones", etiqueta: "Dosier corporativo" },
    { cat: "tramitacion", eyebrow: "Paso a paso", titulo: "Cómo tramitar", sub: "Procedimientos, documentación y checklists para dar de alta cada contrato sin errores.", icono: "🧾", estilo: "lista", etiqueta: "Tramitación" },
    { cat: "formacion", eyebrow: "Aprende el producto", titulo: "Formación por área", sub: "Energía, telefonía, alarmas y seguros: lo que hay que dominar de cada producto.", icono: "🎓", estilo: "grid", agrupar: true, etiqueta: "Formación" },
    { cat: "ofertas", eyebrow: "Campañas en vigor", titulo: "Ofertas tácticas", sub: "Promociones y condiciones especiales para cerrar ventas este mes.", icono: "🔥", estilo: "grid", etiqueta: "Oferta táctica" },
    { cat: "otros", eyebrow: "Más documentos", titulo: "Otros recursos", sub: "Tarifas, plantillas y documentación de apoyo.", icono: "🗂️", estilo: "grid", agrupar: true, etiqueta: "Recurso" },
  ];
  var DIVISIONES = [
    { clave: "general", nombre: "ICC Corporativo", ico: "🏢", c: "#D4A62A", sub: "Quiénes somos y todas las divisiones" },
    { clave: "energia", nombre: "Energía", ico: "⚡", c: "#FBBF24", sub: "Luz, gas, autoconsumo y eficiencia" },
    { clave: "telefonia", nombre: "Telefonía", ico: "📶", c: "#22D3EE", sub: "Fibra, móvil y centralitas" },
    { clave: "alarmas", nombre: "Alarmas y seguridad", ico: "🚨", c: "#F87171", sub: "Hogar y negocio protegidos" },
    { clave: "seguros", nombre: "Seguros", ico: "🛡️", c: "#A78BFA", sub: "Particulares y empresas" },
  ];
  var NOMBRE_CAT = { presentaciones: "Material para el cliente", dosieres: "Dosieres por división", tramitacion: "Cómo tramitar", formacion: "Formación por área", ofertas: "Ofertas tácticas", otros: "Otros recursos", oculto: "Ocultar de la portada" };
  var TIPOS = {
    pdf: { ico: "📕", nombre: "PDF", c: "#F87171" }, doc: { ico: "📘", nombre: "Word", c: "#60A5FA" }, docx: { ico: "📘", nombre: "Word", c: "#60A5FA" },
    xls: { ico: "📗", nombre: "Excel", c: "#34D399" }, xlsx: { ico: "📗", nombre: "Excel", c: "#34D399" }, ppt: { ico: "📙", nombre: "PowerPoint", c: "#FB923C" },
    pptx: { ico: "📙", nombre: "PowerPoint", c: "#FB923C" }, png: { ico: "🖼️", nombre: "Imagen", c: "#A78BFA" }, jpg: { ico: "🖼️", nombre: "Imagen", c: "#A78BFA" },
    jpeg: { ico: "🖼️", nombre: "Imagen", c: "#A78BFA" }, zip: { ico: "🗜️", nombre: "ZIP", c: "#94A3B8" },
  };
  function tipo(a) { return TIPOS[a.ext] || { ico: "📄", nombre: (a.ext || "archivo").toUpperCase(), c: "#94A3B8" }; }
  function esImagen(a) { return ["png", "jpg", "jpeg"].indexOf(a.ext) !== -1; }
  function presentable(a) { return a.existe && (a.ext === "pdf" || esImagen(a)); }
  function main() { return document.getElementById("icc-main"); }

  // ------------------------------------------------------------- pdf.js
  var cargaPdf = null;
  function pdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (cargaPdf) return cargaPdf;
    cargaPdf = new Promise(function (ok, mal) {
      var s = document.createElement("script");
      s.src = "assets/vendor/pdfjs/pdf.min.js?v=" + VER;
      s.onload = function () {
        if (!window.pdfjsLib) return mal(new Error("No se pudo cargar el visor de PDF"));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "assets/vendor/pdfjs/pdf.worker.min.js?v=" + VER;
        ok(window.pdfjsLib);
      };
      s.onerror = function () { cargaPdf = null; mal(new Error("No se pudo cargar el visor de PDF")); };
      document.head.appendChild(s);
    });
    return cargaPdf;
  }
  var docs = {};
  function abrirPdf(a) {
    if (docs[a.id]) return docs[a.id];
    docs[a.id] = pdfjs().then(function (lib) {
      return lib.getDocument({ url: a.url, isEvalSupported: false, withCredentials: true }).promise;
    }).then(function (doc) {
      if (!a.paginas && doc.numPages) {
        a.paginas = doc.numPages;
        if (!a.duracion_min) a.minutos = Math.max(2, Math.round(doc.numPages * 1.5));
        API.post("api/biblioteca.php?action=paginas", { fichero_id: a.id, paginas: doc.numPages }).catch(function () {});
      }
      return doc;
    });
    docs[a.id].catch(function () { delete docs[a.id]; });
    return docs[a.id];
  }

  // ------------------------------------------------------- Miniaturas
  function portada(a, grande) {
    var t = tipo(a);
    var dentro = S.miniaturas[a.id]
      ? '<img src="' + S.miniaturas[a.id] + '" alt="">'
      : esImagen(a) && a.existe
        ? '<img src="' + esc(a.url) + '" alt="" loading="lazy">'
        : '<div class="icc-bib-portada-falsa" style="--c:' + t.c + '"><span class="icc-bib-marca">INTEGRAL CONNECTION</span><strong>' + esc(a.titulo) + "</strong><i>" + t.ico + " " + esc(t.nombre) + "</i></div>";
    return '<div class="icc-bib-portada' + (grande ? " is-grande" : "") + '"' + (a.ext === "pdf" && a.existe && !S.miniaturas[a.id] ? ' data-mini="' + a.id + '"' : "") + ">" + dentro + "</div>";
  }
  function vigilarMiniaturas() {
    if (S.observador) S.observador.disconnect();
    var nodos = main().querySelectorAll("[data-mini]");
    if (!nodos.length) return;
    if (!("IntersectionObserver" in window)) { nodos.forEach(function (n) { encolar(n); }); return; }
    S.observador = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) { S.observador.unobserve(e.target); encolar(e.target); }
      });
    }, { rootMargin: "200px" });
    nodos.forEach(function (n) { S.observador.observe(n); });
  }
  function encolar(nodo) {
    S.cola.push(nodo);
    siguienteMini();
  }
  function siguienteMini() {
    if (S.activos >= 2 || !S.cola.length) return;
    var nodo = S.cola.shift();
    var a = S.porId[nodo.getAttribute("data-mini")];
    if (!a) return siguienteMini();
    if (S.miniaturas[a.id]) { pintarMini(a); return siguienteMini(); }
    S.activos++;
    abrirPdf(a).then(function (doc) { return doc.getPage(1); }).then(function (pag) {
      var v0 = pag.getViewport({ scale: 1 });
      var esc2 = 420 / v0.width;
      var v = pag.getViewport({ scale: esc2 });
      var cv = document.createElement("canvas");
      cv.width = Math.round(v.width);
      cv.height = Math.round(v.height);
      return pag.render({ canvasContext: cv.getContext("2d"), viewport: v }).promise.then(function () {
        S.miniaturas[a.id] = cv.toDataURL("image/jpeg", 0.82);
        pintarMini(a);
      });
    }).catch(function () { /* se queda la portada de respaldo */ }).then(function () {
      S.activos--;
      siguienteMini();
    });
  }
  function pintarMini(a) {
    document.querySelectorAll('[data-mini="' + a.id + '"]').forEach(function (n) {
      n.innerHTML = '<img src="' + S.miniaturas[a.id] + '" alt="">';
      n.removeAttribute("data-mini");
      n.classList.add("is-lista");
    });
    document.querySelectorAll('[data-meta="' + a.id + '"]').forEach(function (n) {
      n.textContent = (n.closest(".icc-bib-fila") ? a.seccion_label + " · " : "") + meta(a);
    });
    // Minutos de la ruta en cuanto se conocen las páginas.
    document.querySelectorAll('[data-meta-paso="' + a.id + '"]').forEach(function (n) {
      if (!a.completado && a.minutos && n.textContent.indexOf("min") === -1) n.textContent += " · " + a.minutos + " min";
    });
  }

  // ------------------------------------------------------------ Datos
  async function cargar() {
    var d = await API.get("api/biblioteca.php");
    S.datos = d;
    S.porId = {};
    d.archivos.forEach(function (a) { S.porId[a.id] = a; });
    return d;
  }
  function tam(b) {
    if (!b && b !== 0) return "";
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + " KB";
    return (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
  }
  function meta(a) {
    var p = [tipo(a).nombre];
    if (a.paginas) p.push(a.paginas + (a.paginas === 1 ? " pág." : " págs."));
    if (a.minutos) p.push("≈ " + a.minutos + " min");
    if (a.tamano) p.push(tam(a.tamano));
    if (a.vistas) p.push(a.vistas + (a.vistas === 1 ? " vista" : " vistas"));
    return p.join(" · ");
  }
  function pasosRuta() {
    return (S.datos.ruta.ids || []).map(function (id) { return S.porId[id]; }).filter(Boolean);
  }

  // ------------------------------------------------------------ Vista
  async function view() {
    main().innerHTML = '<div class="icc-loading">Abriendo la biblioteca…</div>';
    try {
      await cargar();
    } catch (err) {
      main().innerHTML = '<div class="icc-card"><h2>Formación y recursos</h2><p class="icc-muted">' + esc(err.message || "No se pudo abrir la biblioteca") + "</p>" +
        (err.datos && err.datos.sin_migracion ? "<p>Importa la base de datos completa del zip en phpMyAdmin y vuelve a entrar.</p>" : "") +
        '<a class="icc-btn icc-btn-secondary" href="#/ficheros/carpetas">📁 Ver las carpetas</a></div>';
      return;
    }
    pintar();
  }

  function pintar() {
    var d = S.datos;
    var visibles = d.archivos.filter(function (a) { return a.categoria !== "oculto" && a.existe; });
    var cuenta = {};
    visibles.forEach(function (a) { cuenta[a.categoria] = (cuenta[a.categoria] || 0) + 1; });
    var html = '<div class="icc-bib">' +
      '<header class="icc-bib-hero"><div class="icc-bib-hero-txt"><span class="icc-bib-eyebrow">Biblioteca ICC</span>' +
      "<h1>Formación y recursos del Gestor Comercial</h1>" +
      "<p>Tu primer día empieza aquí: la formación de inicio paso a paso, el material para cada visita, los dosieres de cada división, cómo tramitar y las ofertas en vigor.</p>" +
      '<div class="icc-bib-chips">' +
      SECCIONES.filter(function (s) { return cuenta[s.cat]; }).map(function (s) {
        return '<button type="button" class="icc-bib-chip" data-ir="#bib-' + s.cat + '">' + s.icono + " " + esc(NOMBRE_CAT[s.cat]) + " <b>" + cuenta[s.cat] + "</b></button>";
      }).join("") + "</div></div>" +
      '<div class="icc-bib-hero-acc"><label class="icc-bib-buscar"><span aria-hidden="true">🔎</span><input type="search" id="bib-buscar" placeholder="Buscar un documento…" value="' + esc(S.busca) + '" aria-label="Buscar un documento"></label>' +
      '<div class="icc-bib-hero-btns">' + (d.puede_gestionar ? '<button type="button" class="icc-btn icc-btn-primary" id="bib-organizar">⚙️ Organizar biblioteca</button>' : "") +
      '<a class="icc-btn icc-btn-ghost" href="#/ficheros/carpetas">📁 Todas las carpetas</a></div></div></header>';

    if (S.busca.trim()) {
      var q = normal(S.busca);
      var res = visibles.filter(function (a) { return normal(a.titulo + " " + a.descripcion + " " + a.carpeta + " " + a.nombre_archivo + " " + a.seccion_label).indexOf(q) !== -1; });
      html += '<section class="icc-bib-seccion"><div class="icc-bib-sec-cab"><span class="icc-bib-sec-ico" aria-hidden="true">🔎</span><div><span class="icc-bib-eyebrow">Resultados</span><h2>' + res.length + (res.length === 1 ? " documento" : " documentos") + " para «" + esc(S.busca.trim()) + "»</h2></div></div>" +
        (res.length ? '<div class="icc-bib-grid">' + res.map(function (a) { return tarjetaGrid(a, NOMBRE_CAT[a.categoria]); }).join("") + "</div>" : '<p class="icc-muted">No hay ningún documento con ese nombre.</p>') + "</section>";
    } else {
      html += rutaHtml();
      var enRuta = {};
      (d.ruta.ids || []).forEach(function (id) { enRuta[id] = true; });
      SECCIONES.forEach(function (s) {
        var lista = visibles.filter(function (a) { return a.categoria === s.cat && !(s.cat === "formacion" && enRuta[a.id]); });
        if (!lista.length && s.cat === "dosieres" && d.puede_gestionar) {
          html += '<section class="icc-bib-seccion" id="bib-' + s.cat + '">' + cabecera(s) + divisionesHtml(lista, true) + "</section>";
          return;
        }
        // Si toda la formación ya está en la ruta de inicio, no hace falta la sección vacía.
        if (!lista.length && s.cat === "formacion" && visibles.some(function (a) { return a.categoria === "formacion" && enRuta[a.id]; })) return;
        if (!lista.length) {
          if (d.puede_gestionar && s.cat !== "otros") {
            html += '<section class="icc-bib-seccion is-vacia" id="bib-' + s.cat + '">' + cabecera(s) + '<p class="icc-muted">Todavía no hay documentos aquí. Pulsa <b>Organizar biblioteca</b> y elige «' + esc(NOMBRE_CAT[s.cat]) + "» en los que correspondan.</p></section>";
          }
          return;
        }
        html += '<section class="icc-bib-seccion" id="bib-' + s.cat + '">' + cabecera(s);
        if (s.estilo === "divisiones") {
          html += divisionesHtml(lista, d.puede_gestionar);
        } else if (s.estilo === "grande") {
          html += '<div class="icc-bib-grandes">' + lista.map(function (a) { return tarjetaGrande(a, s.etiqueta); }).join("") + "</div>";
        } else if (s.estilo === "lista") {
          html += '<ol class="icc-bib-lista">' + lista.map(function (a, i) { return filaLista(a, i + 1); }).join("") + "</ol>";
        } else if (s.agrupar) {
          var grupos = {};
          var orden = [];
          lista.forEach(function (a) {
            if (!grupos[a.seccion]) { grupos[a.seccion] = []; orden.push(a.seccion); }
            grupos[a.seccion].push(a);
          });
          var ordenSec = (d.secciones || []).map(function (x) { return x.clave; });
          orden.sort(function (x, y) { return ordenSec.indexOf(x) - ordenSec.indexOf(y); });
          html += orden.map(function (k) {
            var g = grupos[k];
            return '<div class="icc-bib-grupo"><h3><span aria-hidden="true">' + g[0].seccion_icono + "</span> " + esc(g[0].seccion_label) + " <small>" + g.length + "</small></h3>" +
              '<div class="icc-bib-grid">' + g.map(function (a) { return tarjetaGrid(a, s.etiqueta); }).join("") + "</div></div>";
          }).join("");
        } else {
          html += '<div class="icc-bib-grid">' + lista.map(function (a) { return tarjetaGrid(a, s.etiqueta); }).join("") + "</div>";
        }
        html += "</section>";
      });
      if (d.puede_ver_equipo && pasosRuta().length) html += '<section class="icc-bib-seccion" id="bib-equipo"><div class="icc-bib-sec-cab"><span class="icc-bib-sec-ico" aria-hidden="true">👥</span><div><span class="icc-bib-eyebrow">Seguimiento</span><h2>Progreso del equipo en la ruta de inicio</h2><p class="icc-muted">Quién ha completado la formación de inicio y quién necesita un empujón.</p></div></div><div id="bib-equipo-cuerpo"><p class="icc-muted">Cargando…</p></div></section>';
    }
    html += "</div>";
    main().innerHTML = html;
    enlazar();
    vigilarMiniaturas();
    if (document.getElementById("bib-equipo-cuerpo")) cargarEquipo();
  }

  function normal(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function cabecera(s) {
    return '<div class="icc-bib-sec-cab"><span class="icc-bib-sec-ico" aria-hidden="true">' + s.icono + "</span><div><span class=\"icc-bib-eyebrow\">" + esc(s.eyebrow) + "</span><h2>" + esc(s.titulo) + '</h2><p class="icc-muted">' + esc(s.sub) + "</p></div></div>";
  }
  function botones(a, compacto) {
    if (!a.existe) return '<span class="icc-bib-aviso">Archivo no disponible</span>';
    return (presentable(a) ? '<button type="button" class="icc-btn icc-btn-primary icc-bib-btn" data-presentar="' + a.id + '">⛶ ' + (compacto ? "Ver" : "Presentar a pantalla completa") + "</button>" : "") +
      '<a class="icc-btn icc-btn-ghost icc-bib-btn" href="' + esc(a.url) + '&descargar=1" data-descargar="' + a.id + '">⬇ Descargar</a>';
  }
  function tarjetaGrande(a, etiqueta) {
    return '<article class="icc-bib-grande">' + '<button type="button" class="icc-bib-portada-btn" ' + (presentable(a) ? 'data-presentar="' + a.id + '"' : "disabled") + ' aria-label="Abrir ' + esc(a.titulo) + '">' + portada(a, true) + "</button>" +
      '<div class="icc-bib-grande-txt"><span class="icc-bib-eyebrow">' + esc(etiqueta) + "</span><h3>" + esc(a.titulo) + "</h3>" +
      (a.descripcion ? "<p>" + esc(a.descripcion) + "</p>" : "") + '<small data-meta="' + a.id + '">' + esc(meta(a)) + "</small>" +
      '<div class="icc-bib-acc">' + botones(a) + "</div></div></article>";
  }
  function filaLista(a, n) {
    return '<li class="icc-bib-fila"><span class="icc-bib-num">' + n + "</span>" + '<button type="button" class="icc-bib-portada-btn is-mini" ' + (presentable(a) ? 'data-presentar="' + a.id + '"' : "disabled") + ' aria-label="Abrir ' + esc(a.titulo) + '">' + portada(a) + "</button>" +
      '<div class="icc-bib-fila-txt"><h3>' + esc(a.titulo) + "</h3>" + (a.descripcion ? "<p>" + esc(a.descripcion) + "</p>" : "") + '<small data-meta="' + a.id + '">' + esc(a.seccion_label) + " · " + esc(meta(a)) + "</small></div>" +
      '<div class="icc-bib-acc">' + botones(a, true) + "</div></li>";
  }
  // Una tarjeta por división con su dosier (o sus dosieres) listo para descargar.
  function divisionesHtml(lista, gestiona) {
    return '<div class="icc-bib-divs">' + DIVISIONES.map(function (dv) {
      var docsDiv = lista.filter(function (a) { return a.division === dv.clave; });
      if (!docsDiv.length && !gestiona) return "";
      var principal = docsDiv[0];
      return '<article class="icc-bib-div" style="--c:' + dv.c + '">' +
        '<header><span class="icc-bib-div-ico" aria-hidden="true">' + dv.ico + '</span><div><span class="icc-bib-eyebrow">División</span><h3>' + esc(dv.nombre) + "</h3><small>" + esc(dv.sub) + "</small></div></header>" +
        (principal
          ? '<button type="button" class="icc-bib-portada-btn" ' + (presentable(principal) ? 'data-presentar="' + principal.id + '"' : "disabled") + ' aria-label="Ver ' + esc(principal.titulo) + '">' + portada(principal) + "</button>" +
            docsDiv.map(function (a, i) {
              return '<div class="icc-bib-div-doc' + (i ? " is-extra" : "") + '"><div><strong>' + esc(a.titulo) + "</strong>" + (a.descripcion ? "<p>" + esc(a.descripcion) + "</p>" : "") + '<small data-meta="' + a.id + '">' + esc(meta(a)) + "</small></div>" +
                '<div class="icc-bib-acc">' + (a.existe ? '<a class="icc-btn icc-btn-primary icc-bib-btn" href="' + esc(a.url) + '&descargar=1" data-descargar="' + a.id + '">⬇ Descargar dosier</a>' +
                  (presentable(a) ? '<button type="button" class="icc-btn icc-btn-ghost icc-bib-btn" data-presentar="' + a.id + '">⛶ Ver</button>' : "") : '<span class="icc-bib-aviso">Archivo no disponible</span>') + "</div></div>";
            }).join("")
          : '<div class="icc-bib-div-falta"><span aria-hidden="true">📄</span><p>Falta el dosier de <b>' + esc(dv.nombre) + "</b>.</p><small>Súbelo a su carpeta y, en <b>Organizar biblioteca</b>, elige la sección «Dosieres por división» y la división " + esc(dv.nombre) + ".</small></div>") +
        "</article>";
    }).join("") + "</div>";
  }

  function tarjetaGrid(a, etiqueta) {
    return '<article class="icc-bib-tarjeta"><button type="button" class="icc-bib-portada-btn" ' + (presentable(a) ? 'data-presentar="' + a.id + '"' : "disabled") + ' aria-label="Abrir ' + esc(a.titulo) + '">' + portada(a) + "</button>" +
      '<div class="icc-bib-tarjeta-txt"><span class="icc-bib-eyebrow">' + esc(etiqueta || a.seccion_label) + "</span><h3>" + esc(a.titulo) + "</h3>" +
      (a.descripcion ? "<p>" + esc(a.descripcion) + "</p>" : "") + '<small data-meta="' + a.id + '">' + esc(meta(a)) + "</small>" +
      '<div class="icc-bib-acc">' + botones(a, true) + "</div></div></article>";
  }

  // ----------------------------------------------------- Ruta de inicio
  function anillo(p) {
    var r = 30, c = 2 * Math.PI * r;
    return '<svg class="icc-bib-anillo" viewBox="0 0 76 76" width="76" height="76" role="img" aria-label="' + p + '% completado">' +
      '<circle cx="38" cy="38" r="' + r + '" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="7"></circle>' +
      '<circle cx="38" cy="38" r="' + r + '" fill="none" stroke="#34D399" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (c * p / 100).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 38 38)"></circle>' +
      '<text x="38" y="43" text-anchor="middle" fill="currentColor" font-size="16" font-weight="800">' + p + "%</text></svg>";
  }
  function rutaHtml() {
    var pasos = pasosRuta();
    var d = S.datos;
    if (!pasos.length) {
      return d.puede_gestionar
        ? '<section class="icc-bib-ruta is-vacia"><div class="icc-bib-ruta-cab"><span class="icc-bib-ruta-ico" aria-hidden="true">🎯</span><div><span class="icc-bib-eyebrow is-oro">Itinerario</span><h2>Formación de inicio del Gestor Comercial</h2>' +
          '<p class="icc-muted">Elige en orden los documentos que debe ver cada comercial nuevo el primer día. Verán su progreso y tú el de todo el equipo.</p></div>' +
          '<button type="button" class="icc-btn icc-btn-primary" data-organizar-ruta>🎯 Crear la ruta</button></div></section>'
        : "";
    }
    var hechos = pasos.filter(function (a) { return a.completado; }).length;
    var total = pasos.reduce(function (s, a) { return s + (a.minutos || 0); }, 0);
    var pct = Math.round(hechos * 100 / pasos.length);
    var sig = pasos.filter(function (a) { return !a.completado; })[0];
    return '<section class="icc-bib-ruta" id="bib-ruta"><div class="icc-bib-ruta-cab"><span class="icc-bib-ruta-ico" aria-hidden="true">🎯</span><div class="icc-bib-ruta-tit">' +
      '<span class="icc-bib-eyebrow is-oro">Itinerario · ' + pasos.length + (pasos.length === 1 ? " paso" : " pasos") + "</span><h2>Formación de inicio del Gestor Comercial</h2>" +
      '<p class="icc-muted">' + pasos.length + " pasos" + (total ? " · ≈ " + total + " min en total" : "") + " · " + hechos + " de " + pasos.length + " completados</p></div>" +
      '<div class="icc-bib-ruta-acc">' + anillo(pct) +
      (sig ? '<button type="button" class="icc-btn icc-btn-primary" data-presentar="' + sig.id + '" data-ruta="1">▶ ' + (hechos ? "Continuar la ruta" : "Empezar la ruta") + "</button>"
        : '<span class="icc-bib-hecho">🏆 Ruta completada</span>') + "</div></div>" +
      (d.ruta.sugerida && d.puede_gestionar ? '<p class="icc-bib-nota">💡 Ruta propuesta automáticamente con los documentos de formación. Ajústala en <button type="button" class="icc-bib-enlace" data-organizar-ruta>Organizar biblioteca</button>.</p>' : "") +
      '<ol class="icc-bib-pasos">' + pasos.map(function (a, i) {
        var estado = a.completado ? "hecho" : a === sig ? "siguiente" : "pendiente";
        return '<li class="icc-bib-paso is-' + estado + '"><button type="button" class="icc-bib-paso-btn" ' + (presentable(a) ? 'data-presentar="' + a.id + '" data-ruta="1"' : 'data-descargar-paso="' + a.id + '"') + ">" +
          '<span class="icc-bib-paso-num">' + (a.completado ? "✓" : i + 1) + "</span>" + portada(a) + "<strong>" + esc(a.titulo) + "</strong>" +
          '<small data-meta-paso="' + a.id + '">' + (a.completado ? "✓ Completado" : (estado === "siguiente" ? "Siguiente" : "Pendiente") + (a.minutos ? " · " + a.minutos + " min" : "")) + "</small></button></li>";
      }).join("") + "</ol></section>";
  }

  async function cargarEquipo() {
    var cont = document.getElementById("bib-equipo-cuerpo");
    try {
      var r = await API.get("api/biblioteca.php?action=equipo");
      if (!document.body.contains(cont)) return;
      if (!r.personas.length) { cont.innerHTML = '<p class="icc-muted">No hay comerciales en tu equipo todavía.</p>'; return; }
      r.personas.sort(function (a, b) { return a.hechos - b.hechos || a.nombre.localeCompare(b.nombre, "es"); });
      cont.innerHTML = '<div class="icc-bib-equipo">' + r.personas.map(function (p) {
        var pct = r.pasos ? Math.round(p.hechos * 100 / r.pasos) : 0;
        return '<div class="icc-bib-persona"><strong>' + esc(p.nombre) + "</strong>" +
          '<div class="icc-bib-barra" role="img" aria-label="' + pct + '% completado"><i style="width:' + pct + '%"></i></div>' +
          "<span>" + p.hechos + " / " + r.pasos + (pct === 100 ? " 🏆" : "") + "</span></div>";
      }).join("") + "</div>";
    } catch (err) {
      cont.innerHTML = '<p class="icc-muted">' + esc(err.message || "No se pudo cargar el progreso del equipo") + "</p>";
    }
  }

  // --------------------------------------------------------- Interacción
  function enlazar() {
    var m = main();
    var b = document.getElementById("bib-buscar");
    if (b) {
      b.addEventListener("input", function () {
        S.busca = b.value;
        var pos = b.selectionStart;
        pintar();
        var nb = document.getElementById("bib-buscar");
        nb.focus();
        try { nb.setSelectionRange(pos, pos); } catch (e) { /* nada */ }
      });
    }
    var org = document.getElementById("bib-organizar");
    if (org) org.addEventListener("click", organizar);
    m.querySelectorAll("[data-organizar-ruta]").forEach(function (x) { x.addEventListener("click", organizar); });
    m.querySelectorAll("[data-presentar]").forEach(function (x) {
      x.addEventListener("click", function () {
        var a = S.porId[x.getAttribute("data-presentar")];
        if (a) presentar(a, x.hasAttribute("data-ruta"));
      });
    });
    m.querySelectorAll("[data-descargar]").forEach(function (x) {
      x.addEventListener("click", function () { contarVista(S.porId[x.getAttribute("data-descargar")]); });
    });
    m.querySelectorAll("[data-descargar-paso]").forEach(function (x) {
      x.addEventListener("click", function () {
        var a = S.porId[x.getAttribute("data-descargar-paso")];
        if (!a || !a.existe) return;
        contarVista(a);
        window.open(a.url + "&descargar=1", "_blank", "noopener");
        if (!a.completado) marcar(a, true);
      });
    });
  }
  function contarVista(a) {
    if (!a) return;
    a.vistas = (a.vistas || 0) + 1;
    API.post("api/biblioteca.php?action=vista", { fichero_id: a.id }).catch(function () {});
  }
  async function marcar(a, hecho) {
    try {
      await API.post("api/biblioteca.php?action=hecho", { fichero_id: a.id, hecho: hecho });
      a.completado = hecho;
      return true;
    } catch (err) {
      U.toast(err.message || "No se pudo guardar el progreso", "error");
      return false;
    }
  }

  // ----------------------------------------------------- Presentación
  function presentar(a, enRuta) {
    contarVista(a);
    var pasos = enRuta ? pasosRuta() : [];
    var idx = pasos.indexOf(a);
    var el = document.createElement("div");
    el.className = "icc-bib-pres";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", a.titulo);
    el.innerHTML =
      '<div class="icc-bib-pres-barra"><div class="icc-bib-pres-tit"><strong>' + esc(a.titulo) + "</strong>" + (enRuta && idx !== -1 ? "<small>Ruta de inicio · paso " + (idx + 1) + " de " + pasos.length + "</small>" : "<small>" + esc(meta(a)) + "</small>") + "</div>" +
      '<div class="icc-bib-pres-ctrl"><button type="button" data-p="ant" aria-label="Página anterior">◀</button><span class="icc-bib-pres-pag" aria-live="polite">…</span><button type="button" data-p="sig" aria-label="Página siguiente">▶</button>' +
      '<button type="button" data-p="pantalla" aria-label="Pantalla completa" title="Pantalla completa (F)">⛶</button><a href="' + esc(a.url) + '&descargar=1" aria-label="Descargar" title="Descargar">⬇</a><button type="button" data-p="cerrar" aria-label="Cerrar" title="Cerrar (Esc)">✕</button></div></div>' +
      '<div class="icc-bib-pres-lienzo"><div class="icc-bib-pres-carga">Preparando la presentación…</div></div>' +
      '<div class="icc-bib-pres-progreso"><i></i></div>' +
      (enRuta && idx !== -1 ? '<div class="icc-bib-pres-ruta"><span>' + (a.completado ? "✓ Paso completado" : "Al llegar a la última página se marca como completado") + "</span>" +
        '<button type="button" class="icc-btn icc-btn-ghost icc-bib-btn" data-p="hecho">' + (a.completado ? "Marcar como pendiente" : "✓ Marcar como completado") + "</button>" +
        (pasos[idx + 1] ? '<button type="button" class="icc-btn icc-btn-primary icc-bib-btn" data-p="siguiente-paso">Siguiente paso →</button>' : '<button type="button" class="icc-btn icc-btn-primary icc-bib-btn" data-p="cerrar">Terminar</button>') + "</div>" : "");
    document.body.appendChild(el);
    document.body.classList.add("icc-bib-pres-abierta");
    // La pantalla completa se pide en el mismo clic (el navegador lo exige).
    try { if (el.requestFullscreen && window.innerWidth > 700) el.requestFullscreen().catch(function () {}); } catch (e) { /* nada */ }

    var lienzo = el.querySelector(".icc-bib-pres-lienzo");
    var pagTxt = el.querySelector(".icc-bib-pres-pag");
    var barra = el.querySelector(".icc-bib-pres-progreso i");
    var st = { doc: null, n: 1, total: 1, pintando: false, pendiente: null, cerrado: false };

    function cerrar() {
      if (st.cerrado) return;
      st.cerrado = true;
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("resize", repintar);
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      el.remove();
      document.body.classList.remove("icc-bib-pres-abierta");
      if (enRuta && location.hash.split("?")[0] === "#/ficheros") pintar();
    }
    function actualizarPie() {
      pagTxt.textContent = st.total > 1 ? st.n + " / " + st.total : "";
      barra.style.width = Math.round(st.n * 100 / st.total) + "%";
      el.querySelector('[data-p="ant"]').disabled = st.n <= 1;
      el.querySelector('[data-p="sig"]').disabled = st.n >= st.total;
      if (enRuta && idx !== -1 && st.n >= st.total && !a.completado) {
        marcar(a, true).then(function (ok) {
          if (!ok || st.cerrado) return;
          var t = el.querySelector(".icc-bib-pres-ruta span");
          if (t) t.textContent = "✓ Paso completado";
          var bh = el.querySelector('[data-p="hecho"]');
          if (bh) bh.textContent = "Marcar como pendiente";
          U.toast("✓ Paso " + (idx + 1) + " completado", "success");
        });
      }
    }
    function pagina(n) {
      if (!st.doc) return;
      st.n = Math.max(1, Math.min(st.total, n));
      if (st.pintando) { st.pendiente = st.n; return; }
      st.pintando = true;
      st.doc.getPage(st.n).then(function (pag) {
        var v0 = pag.getViewport({ scale: 1 });
        var caja = lienzo.getBoundingClientRect();
        var escala = Math.min((caja.width - 24) / v0.width, (caja.height - 24) / v0.height);
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var v = pag.getViewport({ scale: escala * dpr });
        var cv = document.createElement("canvas");
        cv.width = Math.round(v.width);
        cv.height = Math.round(v.height);
        cv.style.width = Math.round(v.width / dpr) + "px";
        cv.style.height = Math.round(v.height / dpr) + "px";
        return pag.render({ canvasContext: cv.getContext("2d"), viewport: v }).promise.then(function () {
          if (st.cerrado) return;
          lienzo.innerHTML = "";
          lienzo.appendChild(cv);
        });
      }).catch(function () {
        lienzo.innerHTML = '<div class="icc-bib-pres-carga">No se pudo mostrar esta página.</div>';
      }).then(function () {
        st.pintando = false;
        actualizarPie();
        if (st.pendiente !== null && st.pendiente !== st.n) { var p = st.pendiente; st.pendiente = null; pagina(p); } else st.pendiente = null;
      });
    }
    var tRes = null;
    function repintar() { clearTimeout(tRes); tRes = setTimeout(function () { if (st.doc) pagina(st.n); }, 150); }
    function tecla(e) {
      if (e.key === "Escape" && !document.fullscreenElement) cerrar();
      else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); pagina(st.n + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); pagina(st.n - 1); }
      else if (e.key === "f" || e.key === "F") pantalla();
    }
    function pantalla() {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else if (el.requestFullscreen) el.requestFullscreen().catch(function () { U.toast("Tu navegador no permite pantalla completa aquí (prueba con F11)", "info"); });
    }
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", repintar);
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-p]");
      if (!b) return;
      var p = b.getAttribute("data-p");
      if (p === "cerrar") cerrar();
      else if (p === "ant") pagina(st.n - 1);
      else if (p === "sig") pagina(st.n + 1);
      else if (p === "pantalla") pantalla();
      else if (p === "hecho") {
        marcar(a, !a.completado).then(function (ok) {
          if (!ok) return;
          b.textContent = a.completado ? "Marcar como pendiente" : "✓ Marcar como completado";
          el.querySelector(".icc-bib-pres-ruta span").textContent = a.completado ? "✓ Paso completado" : "Al llegar a la última página se marca como completado";
        });
      } else if (p === "siguiente-paso") {
        var sigA = pasos[idx + 1];
        st.cerrado = true;
        document.removeEventListener("keydown", tecla);
        window.removeEventListener("resize", repintar);
        el.remove();
        document.body.classList.remove("icc-bib-pres-abierta");
        presentar(sigA, true);
      }
    });
    // Deslizar con el dedo en el móvil.
    var x0 = null;
    lienzo.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lienzo.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) pagina(st.n + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    lienzo.addEventListener("click", function (e) {
      if (!st.doc || e.target.tagName !== "CANVAS") return;
      var r = e.target.getBoundingClientRect();
      pagina(st.n + (e.clientX - r.left > r.width / 3 ? 1 : -1));
    });

    if (esImagen(a)) {
      lienzo.innerHTML = '<img src="' + esc(a.url) + '" alt="' + esc(a.titulo) + '">';
      st.total = 1;
      actualizarPie();
      return;
    }
    abrirPdf(a).then(function (doc) {
      if (st.cerrado) return;
      st.doc = doc;
      st.total = doc.numPages || 1;
      pagina(1);
    }).catch(function () {
      lienzo.innerHTML = '<div class="icc-bib-pres-carga">No se pudo abrir el documento. <a href="' + esc(a.url) + '&descargar=1">Descárgalo aquí</a>.</div>';
    });
  }

  // ------------------------------------------------------- Organizar
  function nombreDiv(k) {
    var dv = DIVISIONES.filter(function (x) { return x.clave === k; })[0];
    return dv ? dv.nombre : "ICC Corporativo";
  }

  function organizar() {
    var d = S.datos;
    var archivos = d.archivos.filter(function (a) { return a.existe; }).slice().sort(function (x, y) {
      return (x.carpeta + x.titulo).localeCompare(y.carpeta + y.titulo, "es");
    });
    var ruta = (d.ruta.ids || []).slice();
    var opcionesCat = function (a) {
      return '<option value="">Automática (' + esc(NOMBRE_CAT[a.categoria_auto]) + ")</option>" +
        ["presentaciones", "dosieres", "tramitacion", "formacion", "ofertas", "otros", "oculto"].map(function (c) {
          return '<option value="' + c + '"' + (a.categoria_elegida === c ? " selected" : "") + ">" + esc(NOMBRE_CAT[c]) + "</option>";
        }).join("");
    };
    U.openModal(
      '<div class="icc-bib-org"><h2>⚙️ Organizar la biblioteca</h2>' +
      '<p class="icc-muted">Pon a cada documento un título profesional, una frase que explique para qué sirve y la sección donde debe aparecer. Los cambios se ven al momento para todo el equipo.</p>' +
      '<h3>🎯 Formación de inicio del Gestor Comercial</h3><p class="icc-muted">Los documentos que debe ver un comercial nuevo, en orden.' + (d.ruta.sugerida ? " Ahora mismo es una propuesta automática: guárdala para fijarla." : "") + "</p>" +
      '<ol class="icc-bib-org-ruta" id="org-ruta"></ol>' +
      '<div class="icc-bib-org-anadir"><select class="icc-select" id="org-anadir"><option value="">+ Añadir un paso…</option>' +
      archivos.map(function (a) { return '<option value="' + a.id + '">' + esc(a.titulo) + " · " + esc(a.carpeta) + "</option>"; }).join("") + "</select></div>" +
      '<h3 style="margin-top:18px">📚 Documentos (' + archivos.length + ")</h3>" +
      '<div class="icc-bib-org-tabla">' + archivos.map(function (a) {
        return '<div class="icc-bib-org-fila" data-id="' + a.id + '">' +
          '<div class="icc-bib-org-arch"><span>' + tipo(a).ico + "</span><small>" + esc(a.carpeta) + " / " + esc(a.nombre_archivo) + "</small></div>" +
          '<label><span>Título</span><input class="icc-input" data-c="titulo" maxlength="200" value="' + esc(a.titulo_propio ? a.titulo : "") + '" placeholder="' + esc(a.titulo) + '"></label>' +
          '<label><span>Sección</span><select class="icc-select" data-c="categoria">' + opcionesCat(a) + "</select></label>" +
          '<label><span>División</span><select class="icc-select" data-c="division"><option value="">Automática (' + esc(nombreDiv(a.division_auto)) + ")</option>" +
          DIVISIONES.map(function (dv) { return '<option value="' + dv.clave + '"' + (a.division_elegida === dv.clave ? " selected" : "") + ">" + esc(dv.nombre) + "</option>"; }).join("") + "</select></label>" +
          '<label class="is-ancha"><span>Para qué sirve (opcional)</span><input class="icc-input" data-c="descripcion" maxlength="400" value="' + esc(a.descripcion) + '" placeholder="Ej.: Presentación para abrir la primera visita con el cliente"></label>' +
          '<label class="is-min"><span>Min.</span><input class="icc-input" data-c="duracion_min" type="number" min="1" max="600" value="' + (a.duracion_min || "") + '" placeholder="' + (a.minutos || "") + '"></label>' +
          "</div>";
      }).join("") + "</div>" +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button><button type="button" class="icc-btn icc-btn-primary" id="org-guardar">Guardar cambios</button></div></div>'
    );
    var modal = document.querySelector("#icc-modal-root .icc-modal");
    if (modal) modal.classList.add("is-ancho");
    var ol = document.getElementById("org-ruta");
    function pintarRuta() {
      ol.innerHTML = ruta.length ? ruta.map(function (id, i) {
        var a = S.porId[id];
        return "<li><span class=\"icc-bib-paso-num\">" + (i + 1) + "</span><strong>" + esc(a ? a.titulo : "Documento " + id) + "</strong>" +
          '<button type="button" data-r="sube" data-i="' + i + '" aria-label="Subir"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
          '<button type="button" data-r="baja" data-i="' + i + '" aria-label="Bajar"' + (i === ruta.length - 1 ? " disabled" : "") + ">↓</button>" +
          '<button type="button" data-r="quita" data-i="' + i + '" aria-label="Quitar de la ruta">✕</button></li>';
      }).join("") : '<li class="icc-muted">Sin pasos todavía. Añade el primero con el desplegable.</li>';
    }
    pintarRuta();
    ol.addEventListener("click", function (e) {
      var b = e.target.closest("[data-r]");
      if (!b) return;
      var i = Number(b.getAttribute("data-i"));
      var r = b.getAttribute("data-r");
      if (r === "sube" && i > 0) ruta.splice(i - 1, 0, ruta.splice(i, 1)[0]);
      if (r === "baja" && i < ruta.length - 1) ruta.splice(i + 1, 0, ruta.splice(i, 1)[0]);
      if (r === "quita") ruta.splice(i, 1);
      pintarRuta();
    });
    document.getElementById("org-anadir").addEventListener("change", function (e) {
      var id = Number(e.target.value);
      if (id && ruta.indexOf(id) === -1) ruta.push(id);
      e.target.value = "";
      pintarRuta();
    });
    document.getElementById("org-guardar").addEventListener("click", async function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = "Guardando…";
      try {
        var filas = document.querySelectorAll(".icc-bib-org-fila");
        for (var i = 0; i < filas.length; i++) {
          var f = filas[i];
          var a = S.porId[f.getAttribute("data-id")];
          var v = {};
          f.querySelectorAll("[data-c]").forEach(function (x) { v[x.getAttribute("data-c")] = x.value.trim(); });
          var antes = { titulo: a.titulo_propio ? a.titulo : "", categoria: a.categoria_elegida || "", division: a.division_elegida || "", descripcion: a.descripcion || "", duracion_min: a.duracion_min ? String(a.duracion_min) : "" };
          if (v.titulo !== antes.titulo || v.categoria !== antes.categoria || v.division !== antes.division || v.descripcion !== antes.descripcion || v.duracion_min !== antes.duracion_min) {
            await API.put("api/biblioteca.php?action=meta&id=" + a.id, v);
          }
        }
        var rutaAntes = (d.ruta.ids || []).join(",");
        if (ruta.join(",") !== rutaAntes || d.ruta.sugerida) await API.post("api/biblioteca.php?action=ruta", { ids: ruta });
        U.toast("Biblioteca organizada", "success");
        U.closeModal();
        await cargar();
        pintar();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Guardar cambios";
        U.toast(err.message || "No se pudo guardar", "error");
      }
    });
  }

  window.icc = window.icc || {};
  window.icc.biblioteca = { view: view };
})();
