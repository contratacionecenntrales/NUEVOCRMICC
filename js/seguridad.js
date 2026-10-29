/* =============================================================================
   ICC CRM · Centro de Seguridad (#/seguridad) — adaptado del CRM de Labs.
   Todo lo comprueba el servidor (api/seguridad.php): puntuación, prueba de
   ataque desde fuera, sesiones, intentos de entrada, bloqueos y la cadena de la
   bitácora. El navegador solo pinta.
   Dirección ve todo; el resto del equipo, su doble factor y sus sesiones.
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = U.escapeHtml;
  var URL_API = "api/seguridad.php?action=";

  var S = { cargado: false, error: "", sinMigracion: false, estado: null, sesiones: [], accesos: null, bloqueos: [], bitacora: null,
    mi2fa: null, alta: null, exposicion: null, probando: false, ocupado: false, verAccesos: "todos" };

  function esAdmin() {
    return window.icc.auth.esAdminOSuperior();
  }
  function main() {
    return document.getElementById("icc-main");
  }
  function api(accion, cuerpo) {
    return cuerpo === undefined ? API.get(URL_API + accion) : API.post(URL_API + accion, cuerpo);
  }

  async function cargar() {
    S.error = "";
    try {
      var tareas = [api("2fa"), api(esAdmin() ? "sesiones" : "mis_sesiones")];
      if (esAdmin()) tareas.push(api("estado"), api("accesos"), api("bloqueos"), api("bitacora"));
      var r = await Promise.all(tareas);
      S.mi2fa = r[0];
      S.sesiones = r[1].sesiones || [];
      if (esAdmin()) {
        S.estado = r[2];
        S.accesos = r[3];
        S.bloqueos = r[4].bloqueos || [];
        S.bitacora = r[5];
      }
      S.sinMigracion = false;
    } catch (err) {
      S.sinMigracion = !!(err.datos && err.datos.sin_migracion);
      S.error = err.message || "Sin conexión con el servidor.";
    }
    S.cargado = true;
  }

  async function view() {
    S.cargado = false;
    S.exposicion = null;
    S.alta = null;
    main().innerHTML = '<div class="icc-loading">Analizando la seguridad del CRM…</div>';
    await cargar();
    pintar();
  }

  // ------------------------------------------------------------- Utilidades
  function fecha(ts) {
    if (!ts) return "—";
    var d = new Date(String(ts).replace(" ", "T"));
    var ms = Date.now() - d.getTime();
    if (ms < 60000) return "ahora mismo";
    if (ms < 3600000) return "hace " + Math.round(ms / 60000) + " min";
    if (ms < 86400000) return "hace " + Math.round(ms / 3600000) + " h";
    return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function navegador(ua) {
    ua = String(ua || "");
    var nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
    var so = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone / iPad" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
    return (/Android|iPhone|iPad|Mobile/.test(ua) ? "📱 " : "💻 ") + nav + (so ? " · " + so : "");
  }
  function anillo(p) {
    var r = 52, c = 2 * Math.PI * r, col = p >= 85 ? "#34D399" : p >= 60 ? "#FBBF24" : "#F87171";
    return '<svg class="icc-seg-anillo" viewBox="0 0 130 130" width="130" height="130" role="img" aria-label="Puntuación ' + p + ' de 100">' +
      '<circle cx="65" cy="65" r="' + r + '" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="11"></circle>' +
      '<circle cx="65" cy="65" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + (c * p / 100).toFixed(1) + " " + c.toFixed(1) +
      '" transform="rotate(-90 65 65)" style="filter:drop-shadow(0 0 8px ' + col + '66)"></circle>' +
      '<text x="65" y="63" text-anchor="middle" fill="currentColor" font-size="32" font-weight="800">' + p + "</text>" +
      '<text x="65" y="84" text-anchor="middle" fill="currentColor" fill-opacity=".6" font-size="11">de 100</text></svg>';
  }
  function chip(e) {
    return e === "ok" ? '<span class="icc-seg-chip is-ok">✓ Correcto</span>' : e === "aviso" ? '<span class="icc-seg-chip is-aviso">! Mejorable</span>' : '<span class="icc-seg-chip is-mal">⚠ Riesgo</span>';
  }
  var TEXTO_ACCION = { "proteger-config": "Llevar a la carpeta privada", "mover-archivos": "Mover documentos", limpiar: "Revisar y eliminar", "activar-2fa": "Activar el mío ahora" };
  var RESULTADOS = { ok: ["Entrada", "ok"], fallo: ["Contraseña mal", "mal"], mfa_fallo: ["Código mal", "mal"], bloqueado: ["Frenado", "mal"],
    mfa_pedido: ["Pidió código", "aviso"], inactiva: ["Cuenta bloqueada", "aviso"] };

  // ------------------------------------------------------------------ Vista
  function pintar() {
    var admin = esAdmin();
    if (S.error && !S.mi2fa) {
      main().innerHTML = '<div class="icc-seg">' +
        '<div class="icc-card"><h2>🛡️ Centro de Seguridad</h2><p class="icc-muted">' + esc(S.error) + "</p>" +
        (S.sinMigracion ? '<p>Importa en phpMyAdmin la <b>base de datos completa</b> que va en la carpeta <code>ACTUALIZAR-BASE-DE-DATOS</code> del zip y vuelve a entrar.</p>' : "") +
        '<button type="button" class="icc-btn icc-btn-secondary" id="seg-reintentar">↻ Reintentar</button></div></div>';
      document.getElementById("seg-reintentar").addEventListener("click", view);
      return;
    }
    var E = S.estado;
    var html = '<div class="icc-seg">';
    if (admin && E) {
      var p = E.puntuacion;
      var nivel = p >= 85 ? "Blindado" : p >= 60 ? "Protegido, con mejoras pendientes" : "En riesgo";
      var riesgos = E.comprobaciones.filter(function (c) { return c.estado === "mal"; }).length;
      html +=
        '<section class="icc-seg-hero icc-seg-nivel-' + (p >= 85 ? "ok" : p >= 60 ? "aviso" : "mal") + '">' + anillo(p) +
        '<div class="icc-seg-hero-txt"><span class="icc-seg-eyebrow">Centro de Seguridad</span>' +
        "<h1>Nivel de blindaje: " + esc(nivel) + "</h1>" +
        "<p>" + (riesgos ? riesgos + " punto(s) en riesgo. Arréglalos con los botones de abajo: cada uno lo hace el servidor en el momento." : "Sin riesgos abiertos. El servidor lo vigila en cada acceso.") + "</p>" +
        '<div class="icc-seg-botones"><button type="button" class="icc-btn icc-btn-primary" id="seg-atacar"' + (S.probando ? " disabled" : "") + ">" +
        (S.probando ? "⏳ Atacando…" : "⚡ Lanzar prueba de ataque") + '</button><button type="button" class="icc-btn icc-btn-ghost" id="seg-reanalizar">↻ Volver a analizar</button></div>' +
        "</div></section>" +
        '<div class="icc-seg-kpis">' +
        [["👥", "Sesiones abiertas", E.resumen.sesiones, "#seg-sesiones"], ["⚠️", "Intentos fallidos (24 h)", E.resumen.fallos24h, "#seg-accesos"],
          ["⛔", "Bloqueos activos", E.resumen.bloqueos, "#seg-bloqueos"], ["🔗", "Apuntes de bitácora sellados", E.resumen.apuntes, "#seg-bitacora"]].map(function (k) {
          return '<button type="button" class="icc-seg-kpi" data-ir="' + k[3] + '"><span aria-hidden="true">' + k[0] + "</span><b>" + k[2] + "</b><small>" + k[1] + "</small></button>";
        }).join("") + "</div>" +
        '<section class="icc-card icc-seg-bloque"><h2>🚪 Puertas revisadas</h2><p class="icc-muted">Lo que un atacante probaría primero en un hosting como Hostalia, comprobado ahora mismo en tu servidor.</p>' +
        E.comprobaciones.map(function (c) {
          return '<div class="icc-seg-fila"><i class="icc-seg-punto is-' + c.estado + '"></i><div class="icc-seg-fila-txt"><strong>' + esc(c.titulo) + "</strong><span>" + esc(c.detalle) + "</span>" +
            (c.accion === "limpiar" && E.peligrosos.length
              ? '<ul class="icc-seg-lista">' + E.peligrosos.map(function (x) { return "<li><code>" + esc(x.ruta) + "</code> — " + esc(x.motivo) + "</li>"; }).join("") + "</ul>"
              : "") +
            '</div><div class="icc-seg-fila-acc">' + chip(c.estado) +
            (c.accion ? '<button type="button" class="icc-btn icc-btn-primary icc-btn-sm" data-seg-accion="' + esc(c.accion) + '"' + (S.ocupado ? " disabled" : "") + ">" + esc(TEXTO_ACCION[c.accion] || "Arreglar") + "</button>" : "") +
            "</div></div>";
        }).join("") + "</section>";

      if (S.exposicion) {
        var X = S.exposicion;
        html += '<section class="icc-card icc-seg-bloque" id="seg-exposicion"><h2>⚡ Prueba de ataque desde fuera</h2>' +
          '<p class="icc-muted">El servidor ha dejado archivos cebo con un secreto y ha intentado descargarlos como lo haría un atacante. Después los ha borrado.</p>' +
          (X.comprobable
            ? X.pruebas.map(function (t) {
                var e = t.resultado === "protegido" ? "ok" : t.resultado === "expuesto" ? "mal" : "aviso";
                return '<div class="icc-seg-fila"><i class="icc-seg-punto is-' + e + '"></i><div class="icc-seg-fila-txt"><strong>' + esc(t.prueba) + "</strong><span>" + esc(t.detalle) + "</span></div>" +
                  '<div class="icc-seg-fila-acc"><span class="icc-seg-chip is-' + e + '">' + (e === "ok" ? "Bloqueado" : e === "mal" ? "Expuesto" : "Revisar") + "</span></div></div>";
              }).join("")
            : '<p class="icc-muted">' + esc(X.mensaje) + "</p>") + "</section>";
      }
    }

    // Doble factor propio (+ el de dirección)
    html += '<div class="icc-seg-dos">' +
      '<section class="icc-card icc-seg-bloque" id="seg-mi2fa"><h2>📱 Tu doble factor</h2><p class="icc-muted">Contraseña + un código de 6 cifras del móvil que cambia cada 30 segundos.</p>' + mi2faHtml() + "</section>";
    if (admin && E) {
      html += '<section class="icc-card icc-seg-bloque"><h2>👔 Doble factor de dirección</h2><p class="icc-muted">Si alguien pierde el móvil, quítaselo aquí y que lo vuelva a activar.</p>' +
        E.admins.map(function (a) {
          var propio = String(a.id) === String((window.icc.auth.state.user || {}).id);
          return '<div class="icc-seg-fila"><i class="icc-seg-punto is-' + (a.con2fa ? "ok" : "mal") + '"></i><div class="icc-seg-fila-txt"><strong>' + esc(a.nombre) +
            (a.rol === "super_admin" ? ' <span class="icc-seg-chip is-violeta">Super Admin</span>' : "") + "</strong><span>" +
            (a.con2fa ? "Pide el código del móvil al entrar." : "Entra solo con contraseña.") + '</span></div><div class="icc-seg-fila-acc">' +
            (a.con2fa ? '<span class="icc-seg-chip is-ok">Activado</span>' : '<span class="icc-seg-chip is-mal">Sin activar</span>') +
            (a.con2fa && !propio ? '<button type="button" class="icc-btn icc-btn-ghost icc-btn-sm" data-seg-reset="' + a.id + '">Quitar</button>' : "") + "</div></div>";
        }).join("") + "</section>";
    }
    html += "</div>";

    // Sesiones
    html += '<section class="icc-card icc-seg-bloque" id="seg-sesiones"><div class="icc-seg-tit"><div><h2>🌐 ' + (admin ? "Sesiones abiertas en el CRM" : "Tus sesiones abiertas") + "</h2>" +
      '<p class="icc-muted">Se cierran solas tras 3 días sin uso y, como mucho, a los 30 días.</p></div>' +
      (!admin ? '<button type="button" class="icc-btn icc-btn-ghost icc-btn-sm" id="seg-cerrar-otras">⇥ Cerrar las demás</button>' : "") + "</div>" +
      '<div class="icc-seg-tabla-caja"><table class="icc-seg-tabla"><thead><tr>' + (admin ? "<th>Persona</th>" : "") + "<th>Dispositivo</th><th>IP</th><th>Último uso</th><th>Desde</th><th></th></tr></thead><tbody>" +
      (S.sesiones.length
        ? S.sesiones.map(function (s) {
            return "<tr>" + (admin ? "<td><strong>" + esc(s.nombre || "—") + "</strong><small>" + esc(s.email || "") + "</small></td>" : "") +
              "<td>" + esc(navegador(s.agente)) + (s.actual ? ' <span class="icc-seg-chip is-azul">Esta</span>' : "") + "</td><td><code>" + esc(s.ip || "—") + "</code></td><td>" + esc(fecha(s.ultimo_uso)) + "</td><td>" + esc(fecha(s.creado)) + "</td>" +
              "<td>" + (s.actual ? "" : '<button type="button" class="icc-btn icc-btn-ghost icc-btn-sm" data-seg-cerrar="' + s.id + '">Cerrar</button>') + "</td></tr>";
          }).join("")
        : '<tr><td colspan="6" class="icc-muted">No hay sesiones abiertas.</td></tr>') + "</tbody></table></div></section>";

    if (admin && S.accesos) {
      var lista = S.accesos.accesos.filter(function (a) { return S.verAccesos === "todos" || (RESULTADOS[a.resultado] || [])[1] === "mal"; });
      html += '<div class="icc-seg-dos">' +
        '<section class="icc-card icc-seg-bloque" id="seg-accesos"><div class="icc-seg-tit"><div><h2>🔑 Últimos accesos</h2><p class="icc-muted">Cada intento de entrada, bueno o malo, con su IP y dispositivo.</p></div>' +
        '<div class="icc-seg-filtro"><button type="button" class="' + (S.verAccesos === "todos" ? "is-activo" : "") + '" data-seg-filtro="todos">Todos</button><button type="button" class="' + (S.verAccesos === "fallos" ? "is-activo" : "") + '" data-seg-filtro="fallos">Solo fallos</button></div></div>' +
        '<div class="icc-seg-tabla-caja is-alta"><table class="icc-seg-tabla"><thead><tr><th>Cuándo</th><th>Cuenta</th><th>Resultado</th><th>IP</th></tr></thead><tbody>' +
        (lista.length
          ? lista.slice(0, 120).map(function (a) {
              var r = RESULTADOS[a.resultado] || [a.resultado, "aviso"];
              return "<tr><td>" + esc(fecha(a.ts)) + "</td><td><strong>" + esc(a.nombre || a.email || "—") + "</strong>" + (a.nombre ? "<small>" + esc(a.email || "") + "</small>" : "") + "</td>" +
                '<td><span class="icc-seg-chip is-' + r[1] + '">' + esc(r[0]) + "</span>" + (a.detalle ? "<small>" + esc(a.detalle) + "</small>" : "") + "</td><td><code>" + esc(a.ip || "—") + "</code><small>" + esc(navegador(a.agente)) + "</small></td></tr>";
            }).join("")
          : '<tr><td colspan="4" class="icc-muted">Sin accesos registrados todavía.</td></tr>') + "</tbody></table></div></section>" +
        '<div class="icc-seg-col">' +
        '<section class="icc-card icc-seg-bloque"><h2>🕵️ Conexiones sospechosas (7 días)</h2>' +
        (S.accesos.atacantes.length
          ? S.accesos.atacantes.map(function (x) {
              return '<div class="icc-seg-fila"><i class="icc-seg-punto is-' + (x.fallos >= 30 ? "mal" : "aviso") + '"></i><div class="icc-seg-fila-txt"><strong><code>' + esc(x.ip || "—") + "</code></strong><span>" +
                x.fallos + " fallo(s) contra " + x.cuentas + " cuenta(s) · último " + esc(fecha(x.ultimo)) + "</span></div></div>";
            }).join("")
          : '<p class="icc-muted">Ninguna conexión con intentos fallidos en la última semana.</p>') + "</section>" +
        '<section class="icc-card icc-seg-bloque" id="seg-bloqueos"><h2>⛔ Bloqueos activos</h2>' +
        (S.bloqueos.length
          ? S.bloqueos.map(function (x) {
              return '<div class="icc-seg-fila"><i class="icc-seg-punto is-mal"></i><div class="icc-seg-fila-txt"><strong>' + (x.tipo === "ip" ? "IP " : "Cuenta ") + "<code>" + esc(x.valor) + "</code></strong><span>" +
                esc(x.motivo) + " · hasta " + esc(new Date(String(x.hasta).replace(" ", "T")).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })) +
                '</span></div><div class="icc-seg-fila-acc"><button type="button" class="icc-btn icc-btn-ghost icc-btn-sm" data-seg-desbloquear="' + x.id + '">Quitar</button></div></div>';
            }).join("")
          : '<p class="icc-muted">No hay ninguna IP ni cuenta frenada ahora mismo.</p>') + "</section></div></div>";
    }

    if (admin && S.bitacora) {
      var B = S.bitacora;
      html += '<section class="icc-card icc-seg-bloque" id="seg-bitacora"><h2>🔗 Bitácora sellada</h2>' +
        '<p class="icc-muted">Cada apunte lleva la huella del anterior: si alguien cambia o borra uno por fuera del CRM (por ejemplo, desde phpMyAdmin), la cadena se rompe y se ve aquí.</p>' +
        '<div class="icc-seg-sello is-' + (B.ok ? "ok" : "mal") + '">' + (B.ok ? "✅ " : "🚨 ") + esc(B.mensaje) + "</div>" +
        '<div class="icc-seg-tabla-caja is-alta"><table class="icc-seg-tabla"><thead><tr><th>Nº</th><th>Cuándo</th><th>Quién</th><th>Qué</th></tr></thead><tbody>' +
        ((B.ultimos || []).length
          ? B.ultimos.map(function (a) {
              return "<tr" + (B.rota_en && Number(a.seq) === B.rota_en ? ' class="is-rota"' : "") + "><td>" + a.seq + "</td><td>" + esc(fecha(a.ts)) + "</td><td>" + esc(a.actor_nombre) + "</td><td><strong>" + esc(a.accion) + "</strong>" + (a.detalle ? "<small>" + esc(a.detalle) + "</small>" : "") + "</td></tr>";
            }).join("")
          : '<tr><td colspan="4" class="icc-muted">Todavía no hay apuntes.</td></tr>') + "</tbody></table></div></section>";
    }
    html += "</div>";
    main().innerHTML = html;
    enlazar();
  }

  function mi2faHtml() {
    var f = S.mi2fa || {};
    if (f.ver_como) return '<p class="icc-muted">Estás en «Ver como»: el doble factor solo lo gestiona la propia persona desde su cuenta.</p>';
    if (S.alta && S.alta.codigos) {
      return '<div class="icc-seg-caja is-ok">✅ <div><strong>Doble factor activado.</strong> Guarda estos códigos de recuperación en un sitio seguro (no en el móvil). Cada uno sirve <b>una sola vez</b> si pierdes el teléfono.</div></div>' +
        '<div class="icc-seg-codigos">' + S.alta.codigos.map(function (c) { return "<code>" + esc(c) + "</code>"; }).join("") + "</div>" +
        '<div class="icc-seg-botones"><button type="button" class="icc-btn icc-btn-secondary" id="seg-cod-bajar">⬇ Descargar códigos</button><button type="button" class="icc-btn icc-btn-primary" id="seg-cod-listo">✓ Ya los he guardado</button></div>';
    }
    if (S.alta) {
      var grupos = S.alta.secreto.replace(/(.{4})/g, "$1 ").trim();
      var qr = "";
      try { qr = window.icc.qr.svg(S.alta.otpauth, 196); } catch (e) { qr = '<p class="icc-muted">No se pudo dibujar el QR: usa la clave.</p>'; }
      return '<div class="icc-seg-alta"><div class="icc-seg-qr">' + qr + "</div><div>" +
        '<ol class="icc-seg-pasos"><li>Instala <b>Google Authenticator</b> o <b>Microsoft Authenticator</b> en el móvil.</li>' +
        '<li>Pulsa «+» y <b>escanea este código</b>. Si no puedes, elige «Introducir clave» y escribe:<code class="icc-seg-clave">' + esc(grupos) + "</code></li>" +
        "<li>Escribe el código de 6 cifras que te muestra la aplicación:</li></ol>" +
        '<div class="icc-seg-botones"><input class="icc-input icc-seg-codigo" id="seg-cod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">' +
        '<button type="button" class="icc-btn icc-btn-primary" id="seg-activar"' + (S.ocupado ? " disabled" : "") + '>🛡️ Confirmar y activar</button><button type="button" class="icc-btn icc-btn-ghost" id="seg-alta-x">Cancelar</button></div>' +
        "</div></div>";
    }
    if (f.activo) {
      return '<div class="icc-seg-caja is-ok">🛡️ <div><strong>Protegida con doble factor</strong> desde ' + esc(fecha(f.activado)) + ". Al entrar se pide el código del móvil. Te quedan <b>" + f.recuperacion_restantes + "</b> códigos de recuperación.</div></div>" +
        '<div class="icc-seg-botones"><input class="icc-input icc-seg-codigo" id="seg-cod-off" inputmode="numeric" maxlength="9" placeholder="Código actual"><button type="button" class="icc-btn icc-btn-ghost" id="seg-desactivar"' + (S.ocupado ? " disabled" : "") + ">✕ Quitar doble factor</button></div>";
    }
    return '<div class="icc-seg-caja is-mal">⚠️ <div><strong>Tu cuenta entra solo con contraseña.</strong> Si alguien la adivina o la ve, entra. Con el doble factor necesitaría además tu móvil.</div></div>' +
      '<div class="icc-seg-botones"><button type="button" class="icc-btn icc-btn-primary" id="seg-iniciar"' + (S.ocupado ? " disabled" : "") + ">🛡️ Activar doble factor</button></div>";
  }

  // ------------------------------------------------------------ Acciones
  async function accion(fn, okMsg) {
    S.ocupado = true;
    try {
      var r = await fn();
      if (okMsg) U.toast(typeof okMsg === "function" ? okMsg(r) : okMsg, "success");
      return r;
    } catch (err) {
      U.toast(err.message || "No se pudo completar", "error");
      return null;
    } finally {
      S.ocupado = false;
    }
  }
  async function recargar() {
    await cargar();
    pintar();
  }
  function pintarMi2fa() {
    var b = document.getElementById("seg-mi2fa");
    if (!b) return pintar();
    b.innerHTML = '<h2>📱 Tu doble factor</h2><p class="icc-muted">Contraseña + un código de 6 cifras del móvil que cambia cada 30 segundos.</p>' + mi2faHtml();
    enlazarMi2fa();
  }

  function enlazarMi2fa() {
    var q = function (id) { return document.getElementById(id); };
    if (q("seg-iniciar")) q("seg-iniciar").addEventListener("click", async function () {
      var r = await accion(function () { return api("2fa_iniciar", {}); });
      if (r) { S.alta = r; pintarMi2fa(); setTimeout(function () { if (q("seg-cod")) q("seg-cod").focus(); }, 50); }
    });
    if (q("seg-alta-x")) q("seg-alta-x").addEventListener("click", function () { S.alta = null; pintarMi2fa(); });
    var activar = async function () {
      var c = (q("seg-cod").value || "").trim();
      if (!/^\d{6}$/.test(c)) { U.toast("Escribe las 6 cifras que muestra la aplicación", "error"); return; }
      var r = await accion(function () { return api("2fa_activar", { codigo: c }); }, "Doble factor activado");
      if (r) { S.alta.codigos = r.codigos; S.mi2fa = { activo: true, activado: new Date().toISOString(), recuperacion_restantes: r.codigos.length }; pintarMi2fa(); }
    };
    if (q("seg-activar")) {
      q("seg-activar").addEventListener("click", activar);
      q("seg-cod").addEventListener("keydown", function (e) { if (e.key === "Enter") activar(); });
    }
    if (q("seg-cod-bajar")) q("seg-cod-bajar").addEventListener("click", function () {
      var u = window.icc.auth.state.user || {};
      var txt = "ICC CRM · Códigos de recuperación del doble factor\nCuenta: " + (u.email || "") + "\nGenerados: " + new Date().toLocaleString("es-ES") +
        "\n\nCada código sirve UNA sola vez para entrar si pierdes el móvil.\n\n" + S.alta.codigos.join("\n") + "\n";
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
      a.download = "icc-crm-codigos-recuperacion.txt";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    if (q("seg-cod-listo")) q("seg-cod-listo").addEventListener("click", function () { S.alta = null; recargar(); });
    if (q("seg-desactivar")) q("seg-desactivar").addEventListener("click", async function () {
      var c = (q("seg-cod-off").value || "").trim();
      if (!c) { U.toast("Escribe un código actual del móvil (o uno de recuperación)", "error"); return; }
      if (!confirm("¿Quitar el doble factor? Tu cuenta volverá a entrar solo con contraseña.")) return;
      var r = await accion(function () { return api("2fa_desactivar", { codigo: c }); }, "Doble factor quitado");
      if (r) recargar();
    });
  }

  function enlazar() {
    var m = main();
    var q = function (id) { return document.getElementById(id); };
    enlazarMi2fa();
    if (q("seg-reanalizar")) q("seg-reanalizar").addEventListener("click", function () { S.exposicion = null; view(); });
    if (q("seg-atacar")) q("seg-atacar").addEventListener("click", async function () {
      S.probando = true;
      pintar();
      try {
        S.exposicion = await api("exposicion");
      } catch (err) {
        U.toast(err.message || "No se pudo lanzar la prueba", "error");
      }
      S.probando = false;
      pintar();
      var b = q("seg-exposicion");
      if (b && b.scrollIntoView) b.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    m.querySelectorAll("[data-seg-accion]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var a = b.getAttribute("data-seg-accion");
        if (a === "activar-2fa") {
          var mi = q("seg-mi2fa");
          if (mi) mi.scrollIntoView({ behavior: "smooth", block: "center" });
          if (q("seg-iniciar")) q("seg-iniciar").click();
          return;
        }
        if (a === "limpiar") {
          var rutas = (S.estado.peligrosos || []).map(function (x) { return x.ruta; });
          if (!confirm("Se van a eliminar del servidor:\n\n" + rutas.join("\n") + "\n\n¿Seguro? No se puede deshacer.")) return;
          var r = await accion(function () { return api("limpiar", { rutas: rutas }); }, function (x) { return x.borrados.length + " eliminado(s)" + (x.fallidos.length ? ", " + x.fallidos.length + " no se pudo/pudieron borrar" : ""); });
          if (r) recargar();
          return;
        }
        if (a === "proteger-config") {
          if (!confirm("Se llevará la configuración (con la contraseña de MySQL) a la carpeta privada del hosting, fuera de la web. ¿Continuar?")) return;
          var r2 = await accion(function () { return api("proteger_config", {}); }, function (x) { return x.mensaje; });
          if (r2) recargar();
          return;
        }
        if (a === "mover-archivos") {
          if (!confirm("Se copiarán todos los documentos (facturas, contratos, fotos…) a la carpeta privada del hosting y después se borrarán de storage/. Puede tardar un poco. ¿Continuar?")) return;
          b.disabled = true;
          b.textContent = "Moviendo…";
          var r3 = await accion(function () { return api("mover_archivos", {}); }, function (x) { return x.mensaje; });
          recargar();
          return r3;
        }
      });
    });
    m.querySelectorAll("[data-seg-reset]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!confirm("¿Quitar el doble factor de esta persona (móvil perdido)? Se cerrarán sus sesiones y tendrá que volver a activarlo.")) return;
        var r = await accion(function () { return api("2fa_reiniciar", { usuario_id: b.getAttribute("data-seg-reset") }); }, "Doble factor quitado");
        if (r) recargar();
      });
    });
    m.querySelectorAll("[data-seg-cerrar]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var id = b.getAttribute("data-seg-cerrar");
        var r = await accion(function () { return esAdmin() ? api("cerrar_sesion", { id: id }) : api("cerrar_mis_sesiones", { id: id }); }, "Sesión cerrada");
        if (r) recargar();
      });
    });
    if (q("seg-cerrar-otras")) q("seg-cerrar-otras").addEventListener("click", async function () {
      var r = await accion(function () { return api("cerrar_mis_sesiones", { id: "otras" }); }, function (x) { return x.cerradas ? x.cerradas + " sesión(es) cerrada(s)" : "No había otras sesiones"; });
      if (r) recargar();
    });
    m.querySelectorAll("[data-seg-desbloquear]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var r = await accion(function () { return api("quitar_bloqueo", { id: b.getAttribute("data-seg-desbloquear") }); }, "Bloqueo retirado");
        if (r) recargar();
      });
    });
    m.querySelectorAll("[data-seg-filtro]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.verAccesos = b.getAttribute("data-seg-filtro");
        var y = window.scrollY;
        pintar();
        window.scrollTo(0, y);
      });
    });
  }

  window.icc = window.icc || {};
  window.icc.seguridad = { view: view };
})();
