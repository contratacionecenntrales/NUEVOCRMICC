/* =============================================================================
   ICC CRM · Arranque, layout de la aplicacion y enrutado
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var C = window.ICC_CONST;

  function root() {
    return document.getElementById("icc-root");
  }

  // ------------------------------------------------------------ Pantalla login
  function renderAuth() {
    root().innerHTML =
      '<div class="icc-auth-wrap"><div class="icc-auth-shell">' +
      '<div class="icc-auth-hero">' +
      '<div class="icc-auth-hero-top icc-brand">' +
      '<img src="assets/logo.svg" alt="ICC" class="icc-brand-logo">' +
      '<div><strong>Integral Connection</strong><span>Consulting</span></div>' +
      "</div>" +
      "<div>" +
      "<h1>El CRM comercial de Integral Connection Consulting</h1>" +
      '<p class="icc-auth-tagline">Leads, contratos, agentes, ficheros, proformas e informes — todo en un mismo lugar, alojado en tu propio servidor.</p>' +
      '<ul class="icc-auth-features">' +
      '<li><span class="ico">👥</span> Embudo comercial de Lead a Cliente Activo</li>' +
      '<li><span class="ico">📄</span> Contratos, proformas y biblioteca de ficheros</li>' +
      '<li><span class="ico">✍️</span> Firma digital con validez legal</li>' +
      "</ul>" +
      "</div>" +
      '<p class="icc-auth-hero-foot">© ' +
      new Date().getFullYear() +
      " Integral Connection Consulting. Acceso exclusivo para el equipo.</p>" +
      "</div>" +
      '<div class="icc-auth-panel"><div class="icc-auth-card">' +
      '<div class="icc-brand"><img src="assets/logo.svg" alt="ICC" class="icc-brand-logo">' +
      '<div><strong>Integral Connection</strong><span>Consulting · CRM</span></div></div>' +
      '<form id="form-auth" class="icc-form">' +
      '<div class="icc-field"><label>Email</label><input class="icc-input" name="email" type="email" required></div>' +
      '<div class="icc-field"><label>Contrasena</label><input class="icc-input" name="password" type="password" minlength="6" required></div>' +
      '<button type="submit" class="icc-btn icc-btn-primary icc-btn-block" id="btn-submit-auth">Entrar</button>' +
      "</form>" +
      '<p class="icc-muted icc-auth-foot">Acceso exclusivo para el equipo de Integral Connection Consulting. Las cuentas nuevas las crea un administrador desde "Agentes".</p>' +
      "</div></div></div></div>";

    document.getElementById("form-auth").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var btn = document.getElementById("btn-submit-auth");
      btn.disabled = true;
      try {
        await window.icc.auth.signIn(fd.get("email"), fd.get("password"));
      } catch (err) {
        U.toast(err.message || "No se pudo iniciar sesion", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // -------------------------------------------------------------- Shell app
  var shellPintado = false;

  function navItems() {
    var interno = window.icc.auth.esBackofficeOAdmin();
    var items = [{ href: "#/dashboard", label: "Inicio" }];

    items.push({ label: "Agenda", href: "#/agenda" });

    items.push({ label: "Presupuestos", href: "#/presupuestos" });

    items.push({
      label: "Contratos",
      href: "#/contratos",
      submenu: [
        { href: "#/contratos", label: "Listado" },
        { href: "#/contratos?estado=tramitado", label: "Pendientes / Tramitados" },
      ].concat(
        Object.keys(C.SECTORES).map(function (s) {
          return { href: "#/contratos?sector=" + s, label: C.SECTORES[s] };
        })
      ),
    });

    if (interno) {
      items.push({ label: "Agentes", href: "#/agentes" });
    }

    if (interno) {
      items.push({
        label: "Comparador",
        href: "#/comparador/tarifas",
        submenu: Object.keys(C.COMPARADOR_SECTORES).map(function (s) {
          return { href: "#/comparador/tarifas/" + s, label: C.COMPARADOR_SECTORES[s] };
        }),
      });
    }

    items.push({ label: "Ficheros", href: "#/ficheros" });

    items.push({ label: "Mi ficha", href: "#/mi-ficha" });

    items.push({ label: "Proformas / Facturas", href: "#/proformas" });

    items.push({
      label: "Informes / Reportes",
      href: "#/informes",
      submenu: [
        { href: "#/informes", label: "Listado de clientes en cartera" },
        { href: "#/informes", label: "Total de kW en cartera" },
        { href: "#/informes", label: "Contratos por sector" },
        { href: "#/informes", label: "Contratos por tarifa" },
        { href: "#/informes", label: "Contratos por compañia" },
      ],
    });

    return items;
  }

  function renderShell() {
    var st = window.icc.auth.state;
    var banner = st.impersonando
      ? '<div class="icc-imp-banner">⚠️ Estas viendo el CRM como <strong>' +
        U.escapeHtml(st.user.nombre) +
        "</strong> (" + C.ROLES[st.rolPrincipal] + ") · Admin: " + U.escapeHtml(st.impersonando.admin_nombre) +
        '<button class="icc-btn icc-btn-ghost icc-imp-banner-btn" id="btn-salir-ver-como">Volver a mi cuenta</button></div>'
      : "";
    root().innerHTML =
      '<div class="icc-app icc-app--topnav">' +
      '<div class="icc-sticky-top">' +
      banner +
      '<header class="icc-topnav">' +
      '<div class="icc-topnav-inner">' +
      '<div class="icc-brand icc-topnav-brand"><img src="assets/logo.svg" alt="ICC" class="icc-brand-logo">' +
      "<div><strong>Integral Connection</strong><span>Consulting</span></div></div>" +
      '<button class="icc-menu-btn" id="btn-menu">☰</button>' +
      '<nav class="icc-topnav-nav" id="icc-nav"></nav>' +
      '<div class="icc-topnav-right">' +
      '<div class="icc-notif-wrap">' +
      '<button class="icc-notif-btn" id="btn-notif">🔔<span class="icc-notif-dot" id="notif-dot" hidden></span></button>' +
      '<div class="icc-notif-panel" id="notif-panel" hidden></div>' +
      "</div>" +
      '<div class="icc-user-card icc-user-card--top">' +
      '<a class="icc-user-link" href="#/mi-ficha" title="Mi ficha de agente" style="display:flex;align-items:center;gap:10px">' +
      '<div class="icc-avatar">' +
      U.initials(st.user.nombre) +
      "</div><div><p class=\"icc-user-name\">" +
      U.escapeHtml(st.user.nombre) +
      "</p><span class=\"icc-tag-role\">" +
      C.ROLES[st.rolPrincipal] +
      '</span></div></a><button class="icc-signout" id="btn-signout" title="Cerrar sesion">⏻</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</header>" +
      "</div>" +
      '<main id="icc-main"></main>' +
      '<button class="icc-fab-cita" id="btn-fab-cita" title="Agendar cita rapida">📅 +</button>' +
      "</div>";

    pintarNav();
    document.getElementById("btn-signout").addEventListener("click", async function () {
      try {
        await window.icc.auth.signOut();
      } catch (err) {
        U.toast(err.message || "No se pudo cerrar sesion", "error");
      }
    });
    document.getElementById("btn-notif").addEventListener("click", toggleNotificaciones);
    document.getElementById("btn-menu").addEventListener("click", function () {
      document.getElementById("icc-nav").classList.toggle("is-open");
    });
    document.getElementById("btn-fab-cita").addEventListener("click", function () {
      window.icc.views.abrirModalCitaRapida();
    });
    var btnSalirVerComo = document.getElementById("btn-salir-ver-como");
    if (btnSalirVerComo) {
      btnSalirVerComo.addEventListener("click", async function () {
        btnSalirVerComo.disabled = true;
        // Navega primero, por el mismo motivo que al entrar en "Ver como":
        // evita que el repintado automatico y el cambio de hash compitan.
        location.hash = "#/agentes";
        try {
          await window.icc.auth.detenerImpersonacion();
          U.toast("De vuelta en tu cuenta", "success");
        } catch (err) {
          U.toast(err.message || "No se pudo volver a tu cuenta", "error");
          btnSalirVerComo.disabled = false;
        }
      });
    }
    shellPintado = true;
  }

  function pintarNav() {
    var actual = (location.hash.split("?")[0] || "#/dashboard").replace(/\/$/, "");
    document.getElementById("icc-nav").innerHTML = navItems()
      .map(function (item) {
        var rutaItem = item.href.split("?")[0];
        var activo = actual === rutaItem || actual.indexOf(rutaItem + "/") === 0;
        var tieneSubmenu = item.submenu && item.submenu.length;
        return (
          '<div class="icc-topnav-item' + (tieneSubmenu ? " has-submenu" : "") + '">' +
          '<a class="icc-topnav-link' +
          (activo ? " is-active" : "") +
          '" href="' +
          item.href +
          '">' +
          item.label +
          (tieneSubmenu ? ' <span class="icc-caret">▾</span>' : "") +
          "</a>" +
          (tieneSubmenu
            ? '<div class="icc-topnav-dropdown">' +
              item.submenu
                .map(function (s) {
                  return '<a href="' + s.href + '">' + s.label + "</a>";
                })
                .join("") +
              "</div>"
            : "") +
          "</div>"
        );
      })
      .join("");

    document.querySelectorAll("#icc-nav .icc-topnav-link, #icc-nav .icc-topnav-dropdown a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.getElementById("icc-nav").classList.remove("is-open");
      });
    });
  }

  async function toggleNotificaciones() {
    var panel = document.getElementById("notif-panel");
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    var notifs;
    try {
      notifs = await window.icc.data.listarNotificaciones();
    } catch (err) {
      U.toast(err.message || "No se pudieron cargar las notificaciones", "error");
      return;
    }
    panel.innerHTML = notifs.length
      ? notifs
          .map(function (n) {
            return (
              '<div class="icc-notif-item' +
              (n.leido ? "" : " is-unread") +
              '" data-notif-id="' +
              n.id +
              '" data-cliente-id="' +
              (n.cliente_id || "") +
              '" data-tipo="' +
              U.escapeHtml(n.tipo || "") +
              '"><p>' +
              U.escapeHtml(n.mensaje) +
              "</p><span class=\"icc-muted\">" +
              U.formatFechaHora(n.created_at) +
              "</span></div>"
            );
          })
          .join("")
      : '<p class="icc-empty">Sin notificaciones.</p>';
    panel.hidden = false;
    panel.querySelectorAll("[data-notif-id]").forEach(function (item) {
      item.addEventListener("click", async function () {
        try {
          await window.icc.data.marcarNotificacionLeida(item.getAttribute("data-notif-id"));
        } catch (err) {
          U.toast(err.message || "No se pudo marcar como leida", "error");
        }
        var clienteId = item.getAttribute("data-cliente-id");
        var tipoNotif = item.getAttribute("data-tipo") || "";
        panel.hidden = true;
        if (clienteId) location.hash = "#/clientes/" + clienteId;
        else if (tipoNotif.indexOf("ficha_agente:") === 0) location.hash = "#/agentes/" + tipoNotif.split(":")[1];
        actualizarBadgeNotif();
      });
    });
  }

  async function actualizarBadgeNotif() {
    if (!shellPintado) return;
    try {
      var notifs = await window.icc.data.listarNotificaciones();
      var pendientes = notifs.filter(function (n) {
        return !n.leido;
      }).length;
      var dot = document.getElementById("notif-dot");
      if (dot) dot.hidden = pendientes === 0;
    } catch (err) {
      console.error("No se pudo actualizar el contador de notificaciones", err);
    }
  }

  // ------------------------------------------------------------------ Router
  async function router() {
    if (!window.icc.auth.state.user) return;
    if (!shellPintado) renderShell();
    pintarNav();

    var hash = location.hash || "#/dashboard";
    var ruta = hash.split("?")[0];
    var main = document.getElementById("icc-main");

    try {
      if (ruta === "#/dashboard" || hash === "" || hash === "#") {
        await window.icc.views.viewDashboard();
      } else if (ruta === "#/clientes") {
        await window.icc.views.viewClientes();
      } else if (ruta.indexOf("#/clientes/") === 0) {
        await window.icc.views.viewClienteDetalle(ruta.replace("#/clientes/", ""));
      } else if (ruta === "#/agenda") {
        await window.icc.views.viewAgenda();
      } else if (ruta === "#/presupuestos") {
        await window.icc.views.viewPresupuestos();
      } else if (ruta.indexOf("#/presupuestos/") === 0) {
        await window.icc.views.viewPresupuestoDetalle(ruta.replace("#/presupuestos/", ""));
      } else if (ruta === "#/contratos") {
        await window.icc.views.viewContratos();
      } else if (ruta === "#/mi-ficha") {
        await window.icc.views.viewFichaAgente(window.icc.auth.state.user.id);
      } else if (/^#\/agentes\/\d+$/.test(ruta)) {
        // El permiso real lo decide api/ficha_agente.php (propio agente,
        // su jefe de equipo o Admin/Super Admin).
        await window.icc.views.viewFichaAgente(ruta.replace("#/agentes/", ""));
      } else if (ruta === "#/agentes") {
        if (!window.icc.auth.esBackofficeOAdmin()) {
          main.innerHTML = '<p class="icc-empty">No tienes acceso a esta seccion.</p>';
        } else {
          await window.icc.views.viewAgentes();
        }
      } else if (ruta === "#/auditoria-ver-como") {
        if (!window.icc.auth.esAdminOSuperior()) {
          main.innerHTML = '<p class="icc-empty">No tienes acceso a esta seccion.</p>';
        } else {
          await window.icc.views.viewAuditoriaVerComo();
        }
      } else if (ruta.indexOf("#/comparador/nueva/") === 0) {
        var partesComparador = ruta.replace("#/comparador/nueva/", "").split("/");
        await window.icc.views.viewComparadorWizard(partesComparador[0], partesComparador[1]);
      } else if (ruta.indexOf("#/comparador/tarifas") === 0) {
        var catalogoTarifa = ruta.replace("#/comparador/tarifas", "").replace(/^\//, "") || null;
        await window.icc.views.viewTarifas(catalogoTarifa);
      } else if (ruta === "#/diagnostico-storage") {
        await window.icc.views.viewDiagnosticoStorage();
      } else if (ruta === "#/copias-seguridad") {
        await window.icc.views.viewCopiasSeguridad();
      } else if (ruta.indexOf("#/ficheros") === 0) {
        var carpetaIdTxt = ruta.replace("#/ficheros", "").replace(/^\//, "");
        var carpetaId = carpetaIdTxt && /^\d+$/.test(carpetaIdTxt) ? parseInt(carpetaIdTxt, 10) : null;
        await window.icc.views.viewFicheros(carpetaId);
      } else if (ruta === "#/proformas") {
        await window.icc.views.viewProformas();
      } else if (ruta === "#/informes") {
        await window.icc.views.viewInformes();
      } else {
        location.hash = "#/dashboard";
      }
    } catch (err) {
      console.error(err);
      main.innerHTML =
        '<p class="icc-empty">Ha ocurrido un error cargando esta pantalla: ' + U.escapeHtml(err.message || "") + "</p>";
    }
    actualizarBadgeNotif();
  }

  // -------------------------------------------------------------------- Boot
  window.addEventListener("hashchange", router);

  function pantallaErrorArranque(detalle) {
    root().innerHTML =
      '<div class="icc-auth-wrap"><div class="icc-card" style="max-width:440px;margin:auto">' +
      "<h2>No se pudo conectar</h2>" +
      '<p class="icc-muted">El CRM no ha podido inicializar. Comprueba tu conexion e inténtalo de nuevo.</p>' +
      (detalle ? '<p class="icc-muted" style="font-size:11px">Detalle tecnico: ' + U.escapeHtml(detalle) + "</p>" : "") +
      '<button class="icc-btn icc-btn-primary" onclick="location.reload()">Reintentar</button>' +
      "</div></div>";
  }

  document.addEventListener("DOMContentLoaded", async function () {
    var avisado = false;
    var timeoutArranque = setTimeout(function () {
      avisado = true;
      pantallaErrorArranque("Tiempo de espera agotado conectando con la API (api/auth.php).");
    }, 12000);

    try {
      await window.icc.auth.init();
    } catch (err) {
      clearTimeout(timeoutArranque);
      console.error(err);
      pantallaErrorArranque(err && err.message);
      return;
    }
    clearTimeout(timeoutArranque);
    if (avisado) return;

    function pintarSegunEstado(state) {
      shellPintado = false;
      if (state.loading) {
        root().innerHTML = '<div class="icc-loading icc-loading-full">Cargando ICC CRM…</div>';
        return;
      }
      if (!state.user) {
        renderAuth();
      } else {
        router();
      }
    }

    window.icc.auth.onChange(pintarSegunEstado);
    pintarSegunEstado(window.icc.auth.state);
  });
})();
