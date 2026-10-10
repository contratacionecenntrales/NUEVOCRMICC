/* =============================================================================
   ICC CRM · Diagnostico de arranque visible en pantalla (sin necesidad de F12)
   Debe cargarse ANTES que cualquier otro script. Se autodesactiva en cuanto
   la app arranca correctamente.
   ============================================================================= */
(function () {
  var log = [];
  var mostrado = false;
  // Una vez la app ha arrancado bien (todas las piezas cargadas), dejamos de
  // tapar toda la pantalla ante cualquier error suelto durante el uso normal
  // (p.ej. que falle la campana de notificaciones): eso se queda en la
  // consola, no debe ocultar una pantalla que en realidad funciona.
  var arrancoOk = false;

  function pintar() {
    var el = document.getElementById("icc-diagnostico");
    if (!el) return;
    mostrado = true;
    el.style.display = "block";
    el.innerHTML =
      "<button id='icc-diag-cerrar' style='float:right;background:#1f2937;color:#fff;border:1px solid #374151;border-radius:8px;padding:6px 12px;cursor:pointer'>Cerrar y ver la app</button>" +
      "<h2 style='color:#34d399'>Diagnostico ICC CRM</h2>" +
      "<p>Si ves esto, hubo un problema cargando la app. Haz una captura de esta pantalla completa y enviala.</p><hr>" +
      log
        .map(function (l) {
          return "<div style='margin:4px 0'>" + l + "</div>";
        })
        .join("");
    document.getElementById("icc-diag-cerrar").addEventListener("click", function () {
      el.style.display = "none";
    });
  }

  function iccLog(msg) {
    log.push(msg);
    if (mostrado) pintar();
  }
  window.iccLog = iccLog;

  // Captura errores de carga de recursos (script/link con 404, etc.) y
  // errores de JavaScript en tiempo de ejecucion. Debe registrarse con
  // capture:true porque los errores de recursos no burbujean.
  window.addEventListener(
    "error",
    function (e) {
      if (e.target && e.target !== window && e.target.tagName) {
        var src = e.target.src || e.target.href || "";
        iccLog(
          "<span style='color:#f87171'>&#10060; ERROR cargando recurso: &lt;" +
            e.target.tagName.toLowerCase() +
            "&gt; " +
            src +
            " (revisa que ese archivo exista en esa ruta exacta del servidor)</span>"
        );
      } else {
        iccLog(
          "<span style='color:#f87171'>&#10060; Error de JavaScript: " +
            (e.message || e) +
            " (" +
            (e.filename || "") +
            ":" +
            (e.lineno || "") +
            ")</span>"
        );
      }
      if (!arrancoOk) pintar();
      else console.error("[ICC CRM]", e);
    },
    true
  );

  window.addEventListener("unhandledrejection", function (e) {
    var motivo = e.reason && e.reason.message ? e.reason.message : e.reason;
    iccLog("<span style='color:#f87171'>&#10060; Promesa rechazada sin capturar: " + motivo + "</span>");
    if (!arrancoOk) pintar();
    else console.error("[ICC CRM] Promesa rechazada:", e.reason);
  });

  iccLog("Pagina cargada, iniciando scripts…");

  function marca(nombre, existe) {
    return (
      "<span style='color:" +
      (existe ? "#34d399" : "#f87171") +
      "'>" +
      (existe ? "&#9989; " : "&#10060; ") +
      nombre +
      (existe ? " cargado" : " NO disponible") +
      "</span>"
    );
  }

  setTimeout(function () {
    iccLog("--- Estado tras 6s de cada pieza de la cadena ---");
    iccLog(marca("window.ICC_CONST (config.js)", !!window.ICC_CONST));
    iccLog(marca("window.icc.api (api.js)", !!(window.icc && window.icc.api)));
    iccLog(marca("window.icc.util (util.js)", !!(window.icc && window.icc.util)));
    iccLog(marca("window.icc.auth (auth.js)", !!(window.icc && window.icc.auth)));
    iccLog(marca("window.icc.data (data.js)", !!(window.icc && window.icc.data)));
    iccLog(marca("window.icc.views (views.js)", !!(window.icc && window.icc.views)));
    if (!window.icc || !window.icc.auth || !window.icc.views) {
      iccLog(
        "<span style='color:#fbbf24'>&#9888; La cadena se corta en la primera pieza marcada en rojo de arriba. Si todas estan en verde pero aun asi no arranca, el problema esta en app.js.</span>"
      );
      pintar();
    } else {
      // Todo cargo bien: no se muestra el panel, se deja ver la app real, y
      // a partir de ahora los errores sueltos ya no tapan la pantalla.
      arrancoOk = true;
    }
  }, 6000);
})();
