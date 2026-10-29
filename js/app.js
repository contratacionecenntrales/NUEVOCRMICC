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
    var hora = new Date().getHours();
    var saludo = hora < 6 ? "Buenas noches" : hora < 14 ? "Buenos días" : hora < 21 ? "Buenas tardes" : "Buenas noches";
    var palabras = ["energía", "telefonía", "alarmas", "seguros"];

    root().innerHTML =
      '<div class="icc-login">' +
      // Fondo animado (solo decorativo)
      '<div class="icc-login-fondo" aria-hidden="true">' +
      '<span class="icc-login-blob b1"></span><span class="icc-login-blob b2"></span><span class="icc-login-blob b3"></span><span class="icc-login-blob b4"></span>' +
      '<span class="icc-login-rejilla"></span><span class="icc-login-estrellas"></span><span class="icc-login-estrellas e2"></span>' +
      "</div>" +

      '<main class="icc-login-marco">' +
      // ---- Lado izquierdo: marca y escena
      '<section class="icc-login-hero">' +
      '<div class="icc-login-marca">' +
      '<span class="icc-login-logo"><span class="icc-login-logo-aro" aria-hidden="true"></span><img src="assets/logo.svg" alt="ICC"></span>' +
      "<div><strong>Integral Connection</strong><span>Consulting</span></div></div>" +
      '<span class="icc-login-kicker"><i aria-hidden="true"></i>CRM comercial · acceso del equipo</span>' +
      '<h1>Vende más <span class="icc-login-rota" id="login-rota">' + palabras[0] + "</span><br>con todo tu negocio<br>en un solo lugar.</h1>" +
      '<p class="icc-login-tagline">Clientes, pipeline, agenda, comparadores, contratos y ficheros, siempre sincronizados para todo el equipo.</p>' +

      '<div class="icc-login-escena" aria-hidden="true">' +
      '<div class="icc-login-mini m1"><header><span>📈</span>Pipeline</header>' +
      '<div class="icc-login-embudo"><i style="--w:100%;--c:#22D3EE"></i><i style="--w:78%;--c:#A78BFA"></i><i style="--w:56%;--c:#FBBF24"></i><i style="--w:38%;--c:#34D399"></i></div></div>' +
      '<div class="icc-login-mini m2"><header><span>📅</span>Agenda de hoy</header>' +
      '<div class="icc-login-citas"><p><b style="--c:#22D3EE"></b><em></em></p><p><b style="--c:#F472B6"></b><em style="width:62%"></em></p><p><b style="--c:#34D399"></b><em style="width:74%"></em></p></div></div>' +
      '<div class="icc-login-mini m3"><header><span>⚡</span>Comparador</header>' +
      '<div class="icc-login-barras"><i style="--h:82%"></i><i style="--h:58%"></i><i style="--h:70%"></i><i style="--h:44%" class="mejor"></i></div>' +
      '<small>✓ Mejor oferta encontrada</small></div>' +
      "</div>" +

      '<ul class="icc-login-chips">' +
      "<li>👥 Pipeline</li><li>📅 Agenda</li><li>⚡ Energía</li><li>📶 Telefonía</li><li>✍️ Firma digital</li><li>🗂️ Ficheros</li>" +
      "</ul>" +
      '<p class="icc-login-pie">© ' + new Date().getFullYear() + " Integral Connection Consulting · Acceso exclusivo para el equipo</p>" +
      "</section>" +

      // ---- Lado derecho: formulario
      '<section class="icc-login-panel">' +
      '<div class="icc-login-card" id="login-card">' +
      '<div class="icc-login-marca icc-login-marca-movil"><span class="icc-login-logo"><span class="icc-login-logo-aro" aria-hidden="true"></span><img src="assets/logo.svg" alt="ICC"></span>' +
      "<div><strong>Integral Connection</strong><span>Consulting · CRM</span></div></div>" +
      '<p class="icc-login-saludo">👋 ' + saludo + "</p>" +
      "<h2>Accede a tu CRM</h2>" +
      '<p class="icc-login-sub">Entra con el email y la contraseña de tu cuenta del equipo.</p>' +
      // Formulario de acceso "de verdad" (method, name, id y autocomplete) para
      // que Chrome, Edge, Firefox y Safari ofrezcan guardar la contraseña.
      '<form id="form-auth" name="login" class="icc-login-form" method="post" action="#" autocomplete="on">' +
      '<div class="icc-login-campo"><label for="login-email">Email</label>' +
      '<div class="icc-login-input"><span aria-hidden="true">✉️</span>' +
      '<input id="login-email" name="email" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" inputmode="email" placeholder="nombre@empresa.es" required></div></div>' +
      '<div class="icc-login-campo"><label for="login-password">Contraseña</label>' +
      '<div class="icc-login-input"><span aria-hidden="true">🔒</span>' +
      '<input id="login-password" name="password" type="password" autocomplete="current-password" minlength="6" placeholder="••••••••" required>' +
      '<button type="button" class="icc-pass-ver" id="btn-ver-password" aria-label="Mostrar contraseña" aria-pressed="false" title="Mostrar contraseña">👁</button></div>' +
      '<p class="icc-login-mayus" id="login-mayus" hidden>⇪ Bloq Mayús está activado</p></div>' +
      // Paso del doble factor: solo aparece si la cuenta lo tiene activado.
      '<div class="icc-login-campo icc-login-2fa" id="login-2fa" hidden><label for="login-codigo">Código de verificación</label>' +
      '<div class="icc-login-input"><span aria-hidden="true">📱</span>' +
      '<input id="login-codigo" name="codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="9" placeholder="123456"></div>' +
      '<p class="icc-login-2fa-ayuda">Abre Google o Microsoft Authenticator y escribe el código de 6 cifras de <b>ICC CRM</b>. ¿Sin móvil? Usa un código de recuperación (XXXX-XXXX).</p></div>' +
      '<label class="icc-recordar"><input type="checkbox" name="recordar" id="login-recordar"> Recordar mi email en este equipo</label>' +
      '<button type="submit" class="icc-login-btn" id="btn-submit-auth"><span class="icc-login-btn-txt">Entrar</span><span class="icc-login-btn-flecha" aria-hidden="true">→</span></button>' +
      "</form>" +
      '<p class="icc-login-nota">🔑 Al entrar, tu navegador te ofrecerá <b>guardar la contraseña</b>.</p>' +
      '<p class="icc-login-nota icc-login-nota-2">Las cuentas nuevas las crea un administrador desde «Agentes».</p>' +
      "</div></section>" +
      "</main></div>";

    var formAuth = document.getElementById("form-auth");
    var campoEmail = document.getElementById("login-email");
    var campoPass = document.getElementById("login-password");
    var casillaRecordar = document.getElementById("login-recordar");
    var tarjeta = document.getElementById("login-card");
    var reducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Palabra que va rotando en el titular.
    var rota = document.getElementById("login-rota");
    if (!reducido) {
      var i = 0;
      var temporizador = setInterval(function () {
        if (!document.body.contains(rota)) { clearInterval(temporizador); return; }
        rota.classList.add("is-saliendo");
        setTimeout(function () {
          i = (i + 1) % palabras.length;
          rota.textContent = palabras[i];
          rota.classList.remove("is-saliendo");
        }, 380);
      }, 2600);
    }

    // Brillo que sigue al raton sobre la tarjeta.
    tarjeta.addEventListener("pointermove", function (e) {
      var r = tarjeta.getBoundingClientRect();
      tarjeta.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      tarjeta.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });

    // Email recordado (solo el email: la contraseña la guarda el navegador).
    var emailGuardado = "";
    try { emailGuardado = localStorage.getItem("icc_login_email") || ""; } catch (e) { /* sin almacenamiento */ }
    if (emailGuardado) {
      campoEmail.value = emailGuardado;
      casillaRecordar.checked = true;
      campoPass.focus();
    } else {
      campoEmail.focus();
    }

    var btnVer = document.getElementById("btn-ver-password");
    btnVer.addEventListener("click", function () {
      var mostrar = campoPass.type === "password";
      campoPass.type = mostrar ? "text" : "password";
      btnVer.setAttribute("aria-pressed", mostrar ? "true" : "false");
      btnVer.setAttribute("aria-label", mostrar ? "Ocultar contraseña" : "Mostrar contraseña");
      btnVer.title = mostrar ? "Ocultar contraseña" : "Mostrar contraseña";
      btnVer.textContent = mostrar ? "🙈" : "👁";
      campoPass.focus();
    });

    // Aviso de Bloq Mayus.
    var avisoMayus = document.getElementById("login-mayus");
    ["keydown", "keyup"].forEach(function (ev) {
      campoPass.addEventListener(ev, function (e) {
        if (e.getModifierState) avisoMayus.hidden = !e.getModifierState("CapsLock");
      });
    });

    var btn = document.getElementById("btn-submit-auth");
    var txtBtn = btn.querySelector(".icc-login-btn-txt");
    // Con las 6 cifras escritas se envía solo.
    document.getElementById("login-codigo").addEventListener("input", function (e) {
      if (/^\d{6}$/.test(e.target.value.trim()) && !btn.disabled) {
        if (formAuth.requestSubmit) formAuth.requestSubmit(); else btn.click();
      }
    });
    formAuth.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = campoEmail.value.trim();
      var password = campoPass.value;
      var campoCodigo = document.getElementById("login-codigo");
      var codigo = campoCodigo && !document.getElementById("login-2fa").hidden ? campoCodigo.value.trim() : "";
      btn.disabled = true;
      btn.classList.add("is-cargando");
      txtBtn.textContent = "Entrando…";
      // Antes de enviar se vuelve a "password" para que el navegador lo reconozca.
      if (campoPass.type !== "password") btnVer.click();
      try {
        await window.icc.auth.signIn(email, password, codigo);
        try {
          if (casillaRecordar.checked) localStorage.setItem("icc_login_email", email);
          else localStorage.removeItem("icc_login_email");
        } catch (e2) { /* sin almacenamiento */ }
        // Con HTTPS, Chrome/Edge permiten pedirlo de forma explicita. Sin
        // certificado se usa la deteccion normal del navegador (envio del
        // formulario + desaparicion de la pantalla de acceso).
        try {
          if (window.PasswordCredential && window.isSecureContext && navigator.credentials) {
            navigator.credentials.store(new window.PasswordCredential({ id: email, password: password, name: email })).catch(function () {});
          }
        } catch (e3) { /* navegador sin soporte */ }
      } catch (err) {
        btn.disabled = false;
        btn.classList.remove("is-cargando");
        txtBtn.textContent = "Entrar";
        // La cuenta tiene doble factor: se pide el código del móvil.
        if (err.datos && err.datos.mfa) {
          var bloque = document.getElementById("login-2fa");
          var cc = document.getElementById("login-codigo");
          var primeraVez = bloque.hidden;
          bloque.hidden = false;
          txtBtn.textContent = "Verificar y entrar";
          if (primeraVez) {
            U.toast("Tu cuenta tiene doble factor: escribe el código del móvil", "info");
          } else {
            U.toast(err.message, "error");
            tarjeta.classList.remove("is-error");
            void tarjeta.offsetWidth;
            tarjeta.classList.add("is-error");
          }
          cc.value = "";
          cc.focus();
          return;
        }
        U.toast(err.message || "No se pudo iniciar sesion", "error");
        tarjeta.classList.remove("is-error");
        void tarjeta.offsetWidth;
        tarjeta.classList.add("is-error");
        campoPass.select();
      }
    });
  }

  // -------------------------------------------------------------- Shell app
  var shellPintado = false;

  function navItems() {
    var interno = window.icc.auth.esBackofficeOAdmin();
    var puede = window.icc.auth.puede;
    var items = [{ href: "#/dashboard", label: "Inicio" }];
    if (window.icc.auth.puedeVerSala()) items.push({ href: "#/sala-ventas", label: "Sala de ventas" });

    if (puede("agenda.ver")) items.push({ label: "Agenda", href: "#/agenda" });

    if (puede("clientes.ver")) items.push({ label: "Pipeline", href: "#/pipeline" });

    if (puede("presupuestos.ver")) items.push({ label: "Presupuestos", href: "#/presupuestos" });

    if (puede("contratos.ver")) items.push({
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
    // Red de oficinas: Admin la gestiona entera; el resto ve su oficina y solo
    // agregados anónimos de la red (lo decide api/oficinas.php).
    items.push({ label: "Oficinas", href: "#/oficinas" });

    if (puede("comparador.usar")) {
      items.push({
        label: "Comparador",
        href: "#/comparador",
        submenu: [
          { href: "#/comparador", label: "Panel e histórico de auditorías" },
          { href: "#/comparador/energia", label: "⚡ Comparador de energía" },
          { href: "#/comparador/telefonia", label: "📶 Comparador de telefonía" },
          { href: "#/comparador/novedades", label: "🔔 Novedades de tarifas", badge: "novedades" },
        ],
      });
    }

    if (puede("ficheros.ver")) items.push({ label: "Ficheros", href: "#/ficheros" });

    items.push({ label: "Mi ficha", href: "#/mi-ficha" });

    if (puede("proformas.ver")) items.push({ label: "Proformas / Facturas", href: "#/proformas" });

    if (puede("informes.ver")) items.push({
      label: "Informes / Reportes",
      href: "#/informes",
      submenu: [
        { href: "#/informes", label: "Resumen de informes" },
        { href: "#/informes?ver=cartera", label: "Listado de clientes en cartera" },
        { href: "#/informes?ver=kw", label: "Total de kW en cartera" },
        { href: "#/informes?ver=sector", label: "Contratos por sector" },
        { href: "#/informes?ver=tarifa", label: "Contratos por tarifa" },
        { href: "#/informes?ver=compania", label: "Contratos por compañía" },
      ],
    });

    // Centro de Seguridad: dirección lo ve entero. El resto entra a su doble
    // factor y sus sesiones desde «Mi ficha → Seguridad avanzada».
    if (window.icc.auth.esAdminOSuperior()) items.push({
      label: "Seguridad",
      href: "#/seguridad",
      submenu: [
        { href: "#/seguridad", label: "🛡️ Centro de Seguridad" },
        { href: "#/copias-seguridad", label: "💾 Copias de seguridad" },
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
      U.avatar(st.user, 34) +
      "<div><p class=\"icc-user-name\">" +
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
          (tieneSubmenu && item.submenu.some(function (s) { return s.badge; })
            ? '<span class="icc-nov-badge icc-nov-badge--dot" data-nov-badge hidden></span>' : "") +
          (tieneSubmenu ? ' <span class="icc-caret">▾</span>' : "") +
          "</a>" +
          (tieneSubmenu
            ? '<div class="icc-topnav-dropdown">' +
              item.submenu
                .map(function (s) {
                  return '<a href="' + s.href + '">' + s.label +
                    (s.badge ? '<span class="icc-nov-badge" data-nov-badge hidden></span>' : "") + "</a>";
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
        else if (tipoNotif.indexOf("cita:") === 0) location.hash = "#/agenda?cita=" + tipoNotif.split(":")[1];
        else if (tipoNotif === "tarifas_novedades") location.hash = "#/comparador/novedades";
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

  // Rutas que dependen de un permiso granular (ver api/config.php).
  var PERMISO_RUTA = [
    ["#/agenda", "agenda.ver"],
    ["#/presupuestos", "presupuestos.ver"],
    ["#/contratos", "contratos.ver"],
    ["#/clientes", "clientes.ver"],
    ["#/pipeline", "clientes.ver"],
    ["#/ficheros", "ficheros.ver"],
    ["#/proformas", "proformas.ver"],
    ["#/informes", "informes.ver"],
    ["#/comparador", "comparador.usar"],
  ];

  function sinPermisoRuta(ruta) {
    return PERMISO_RUTA.some(function (r) {
      var coincide = ruta === r[0] || (!r[2] && ruta.indexOf(r[0] + "/") === 0);
      return coincide && !window.icc.auth.puede(r[1]);
    });
  }

  // Oculta botones de acciones para las que el usuario no tiene permiso
  // (el servidor las rechaza igualmente; esto evita botones que fallan).
  var REGLAS_BOTONES = [
    ["#btn-nuevo-cliente, #btn-toggle-nuevo-cliente", "clientes.crear"],
    ["#btn-editar-cliente, #select-estado", "clientes.editar"],
    ["#btn-subir-factura", "documentos.subir"],
    ["#btn-nuevo-presupuesto, #btn-nuevo-presupuesto-general", "presupuestos.crear"],
    ["#btn-nueva-comparativa", "comparador.usar"],
    ["#btn-nuevo-contrato", "contratos.crear"],
    ["#btn-borrar-contrato", "contratos.borrar"],
    ["#btn-exportar-contratos-csv, #btn-exportar-contratos-xlsx", "contratos.exportar"],
    ["#btn-nueva-cita, #btn-dashboard-nueva-cita, #btn-fab-cita", "agenda.gestionar"],
    ["#btn-nueva-proforma", "proformas.crear"],
  ];

  function aplicarPermisosUI() {
    if (!window.icc.auth.state.user) return;
    REGLAS_BOTONES.forEach(function (r) {
      if (window.icc.auth.puede(r[1])) return;
      document.querySelectorAll(r[0]).forEach(function (el) { el.style.display = "none"; });
    });
  }

  var permisosUIPendiente = false;
  new MutationObserver(function () {
    if (permisosUIPendiente) return;
    permisosUIPendiente = true;
    requestAnimationFrame(function () {
      permisosUIPendiente = false;
      aplicarPermisosUI();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ------------------------------------------------- Cambio de contrasena obligatorio
  function renderCambioObligatorio() {
    var st = window.icc.auth.state;
    root().innerHTML =
      '<div class="icc-auth-wrap"><div class="icc-auth-card icc-card" style="max-width:440px;margin:auto">' +
      '<div class="icc-brand"><img src="assets/logo.svg" alt="ICC" class="icc-brand-logo">' +
      "<div><strong>Integral Connection</strong><span>Consulting · CRM</span></div></div>" +
      "<h2>Cambia tu contraseña</h2>" +
      '<p class="icc-muted">Hola ' + U.escapeHtml(st.user.nombre) + ", estás usando una contraseña provisional. " +
      "Por seguridad, elige una nueva antes de continuar.</p>" +
      '<form id="form-cambio-obligatorio" class="icc-form" method="post" action="#">' +
      '<input type="email" name="username" autocomplete="username" value="' + U.escapeHtml(st.user.email || "") + '" hidden readonly>' +
      '<div class="icc-field"><label>Contraseña provisional</label><input class="icc-input" name="actual" type="password" autocomplete="current-password" required></div>' +
      '<div class="icc-field"><label>Nueva contraseña</label><input class="icc-input" name="nueva" type="password" autocomplete="new-password" minlength="8" required>' +
      '<span class="icc-ayuda">Mínimo 8 caracteres, con letras y números.</span></div>' +
      '<div class="icc-field"><label>Repite la nueva</label><input class="icc-input" name="repetir" type="password" autocomplete="new-password" minlength="8" required></div>' +
      '<button type="submit" class="icc-btn icc-btn-primary icc-btn-block">Guardar y entrar</button>' +
      '<button type="button" class="icc-btn icc-btn-ghost icc-btn-block" id="btn-salir-cambio">Salir</button>' +
      "</form></div></div>";
    document.getElementById("btn-salir-cambio").addEventListener("click", function () {
      window.icc.auth.signOut();
    });
    document.getElementById("form-cambio-obligatorio").addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      if (fd.get("nueva") !== fd.get("repetir")) {
        U.toast("Las contraseñas nuevas no coinciden", "error");
        return;
      }
      try {
        await window.icc.auth.cambiarPassword(fd.get("actual"), fd.get("nueva"));
        U.toast("Contraseña actualizada", "success");
      } catch (err) {
        U.toast(err.message || "No se pudo cambiar la contraseña", "error");
      }
    });
  }

  function debeCambiarPassword(state) {
    return !!state.user && Number(state.user.debe_cambiar_password) === 1 && !state.impersonando;
  }

  window.icc.app = {
    repintarCabecera: function () {
      shellPintado = false;
      router();
    },
  };

  // ------------------------------------------------------------------ Router
  async function router() {
    if (!window.icc.auth.state.user) return;
    if (debeCambiarPassword(window.icc.auth.state)) {
      shellPintado = false;
      renderCambioObligatorio();
      return;
    }
    if (!shellPintado) renderShell();
    pintarNav();
    if (window.icc.novedades) window.icc.novedades.alNavegar();
    if (window.icc.cinta) window.icc.cinta.alNavegar();

    var hash = location.hash || "#/dashboard";
    var ruta = hash.split("?")[0];
    var main = document.getElementById("icc-main");

    try {
      if (sinPermisoRuta(ruta) || (ruta === "#/sala-ventas" && !window.icc.auth.puedeVerSala())) {
        main.innerHTML = '<p class="icc-empty">No tienes permiso para acceder a esta sección. Si lo necesitas, pídeselo a dirección.</p>';
      } else if (ruta === "#/dashboard" || hash === "" || hash === "#") {
        await window.icc.views.viewDashboard();
      } else if (ruta === "#/sala-ventas") {
        await window.icc.sala.view();
      } else if (ruta === "#/clientes") {
        await window.icc.views.viewClientes();
      } else if (ruta.indexOf("#/clientes/") === 0) {
        await window.icc.views.viewClienteDetalle(ruta.replace("#/clientes/", ""));
      } else if (ruta === "#/agenda") {
        await window.icc.views.viewAgenda();
      } else if (ruta === "#/pipeline") {
        await window.icc.pipeline.view();
      } else if (ruta === "#/oficinas") {
        // El permiso real lo decide api/oficinas.php (comercial: sin acceso).
        await window.icc.oficinas.view();
      } else if (/^#\/oficinas\/\d+$/.test(ruta)) {
        await window.icc.oficinas.viewDetalle(ruta.split("/")[2]);
      } else if (ruta === "#/presupuestos") {
        await window.icc.views.viewPresupuestos();
      } else if (ruta.indexOf("#/presupuestos/") === 0) {
        await window.icc.views.viewPresupuestoDetalle(ruta.replace("#/presupuestos/", ""));
      } else if (ruta === "#/contratos") {
        await window.icc.views.viewContratos();
      } else if (/^#\/mi-ficha(\/[a-z]+)?$/.test(ruta)) {
        await window.icc.views.viewFichaAgente(window.icc.auth.state.user.id, ruta.split("/")[2] || "resumen");
      } else if (/^#\/agentes\/\d+(\/[a-z]+)?$/.test(ruta)) {
        // El permiso real lo deciden api/usuario.php y api/ficha_agente.php
        // (propio usuario, su jefe de equipo o Admin/Super Admin).
        var partesFicha = ruta.split("/");
        await window.icc.views.viewFichaAgente(partesFicha[2], partesFicha[3] || "resumen");
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
      } else if (ruta === "#/comparador") {
        await window.icc.comparador.viewPanel();
      } else if (ruta === "#/comparador/novedades") {
        await window.icc.novedades.view();
      } else if (ruta.indexOf("#/comparador/") === 0) {
        // Abre la pagina del comparador (y redirige los enlaces antiguos).
        window.icc.comparador.abrirDesdeRuta(ruta, hash);
      } else if (ruta === "#/diagnostico-storage") {
        await window.icc.views.viewDiagnosticoStorage();
      } else if (ruta === "#/copias-seguridad") {
        await window.icc.views.viewCopiasSeguridad();
      } else if (ruta.indexOf("#/ficheros") === 0) {
        var carpetaIdTxt = ruta.replace("#/ficheros", "").replace(/^\//, "");
        var carpetaId = carpetaIdTxt && /^\d+$/.test(carpetaIdTxt) ? parseInt(carpetaIdTxt, 10) : null;
        await window.icc.views.viewFicheros(carpetaId);
      } else if (ruta === "#/seguridad") {
        await window.icc.seguridad.view();
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
    // Cualquier recuadro con data-ir="selector" lleva hasta ese bloque.
    document.addEventListener("click", function (e) {
      var destino = e.target.closest && e.target.closest("[data-ir]");
      if (!destino) return;
      e.preventDefault();
      if (!U.irA(destino.getAttribute("data-ir"))) U.toast("No hay nada que mostrar aquí todavía", "info");
    });
    pintarSegunEstado(window.icc.auth.state);
  });
})();
