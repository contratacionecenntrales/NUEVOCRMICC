/* =============================================================================
   ICC CRM · Jarvis, asistente de voz y texto en todas las pantallas.
   Núcleo flotante abajo a la derecha, botón en la cabecera o Alt+J. El panel
   no se cierra al cambiar de pantalla. Los cambios llegan como tarjetas «Para
   confirmar» (también por voz: «sí», «vale», «confirma» / «no», «cancela»).
   API: api/jarvis.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var S = { cfg: null, abierto: false, historial: [], pendientes: [], ocupado: false, grabando: false, vozActiva: false, iniciado: false };
  var rec = null, trozos = [], ctxAudio = null, audioActual = null;

  function el(id) { return document.getElementById(id); }

  async function iniciar() {
    if (!window.icc.auth.state.user) return;
    if (!S.iniciado) {
      S.iniciado = true;
      document.addEventListener("keydown", function (ev) {
        if (ev.altKey && (ev.key === "j" || ev.key === "J")) { ev.preventDefault(); alternar(); }
        if (ev.key === "Escape" && S.abierto) alternar(false);
      });
    }
    // Otra persona en el mismo navegador: conversación nueva.
    var uid = window.icc.auth.state.user.id;
    if (S.uid && S.uid !== uid) { ["jv-nucleo", "jv-panel"].forEach(function (id) { var x = el(id); if (x) x.remove(); }); S.historial = []; S.pendientes = []; S.abierto = false; }
    S.uid = uid;
    try { S.cfg = await API.get("api/jarvis.php?action=estado"); } catch (e) { return; }
    if (!S.cfg.activo) return;
    if (!el("jv-nucleo")) {
      var b = document.createElement("button");
      b.id = "jv-nucleo"; b.type = "button"; b.className = "icc-jv-nucleo";
      b.setAttribute("aria-label", "Abrir " + S.cfg.nombre + " (Alt+J)");
      b.title = S.cfg.nombre + " · Alt+J";
      b.innerHTML = '<span class="icc-jv-orb"></span>';
      b.addEventListener("click", function () { alternar(); });
      document.body.appendChild(b);
      var p = document.createElement("section");
      p.id = "jv-panel"; p.className = "icc-jv-panel"; p.hidden = true;
      p.setAttribute("role", "dialog"); p.setAttribute("aria-label", S.cfg.nombre);
      p.innerHTML = '<header><span class="icc-jv-orb icc-jv-orb--mini"></span><div><strong>' + esc(S.cfg.nombre) + "</strong><small>" + (S.cfg.ia ? "Asistente de IA · ve solo lo que ves tú" : "Sin IA: órdenes sencillas") + '</small></div>' +
        '<button type="button" class="icc-jv-x" id="jv-cerrar" aria-label="Cerrar">×</button></header>' +
        '<div class="icc-jv-msgs" id="jv-msgs" aria-live="polite"></div>' +
        '<form class="icc-jv-form" id="jv-form"><button type="button" class="icc-jv-mic" id="jv-mic" aria-label="Hablar"' + (S.cfg.ia ? "" : " disabled") + ">🎙️</button>" +
        '<input class="icc-input" id="jv-txt" autocomplete="off" placeholder="Pregunta o pide algo…" aria-label="Mensaje">' +
        '<button class="icc-btn icc-btn-primary" type="submit" aria-label="Enviar">➤</button></form>';
      document.body.appendChild(p);
      el("jv-cerrar").addEventListener("click", function () { alternar(false); });
      el("jv-form").addEventListener("submit", function (ev) { ev.preventDefault(); var t = el("jv-txt").value.trim(); if (t) { el("jv-txt").value = ""; enviar(t, false); } });
      el("jv-mic").addEventListener("click", function () { S.grabando ? parar() : grabar(); });
      saludar();
    }
    var cab = el("btn-jarvis");
    if (cab) { cab.hidden = false; cab.onclick = function () { alternar(); }; }
  }

  function saludar() {
    var nombre = (window.icc.auth.state.user.nombre || "").split(" ")[0];
    burbuja("assistant", "Hola, " + nombre + ". Soy " + S.cfg.nombre + ". Pregúntame por tu agenda, un cliente o tus ventas, o pídeme que prepare una cita, una nota o un cambio de fase: siempre te lo dejo para que lo confirmes." +
      (window.isSecureContext ? "" : "\n\n(El micrófono necesita que el CRM vaya por https; mientras tanto, escríbeme.)"), true);
  }

  function alternar(forzar) {
    S.abierto = typeof forzar === "boolean" ? forzar : !S.abierto;
    var p = el("jv-panel");
    if (!p) return;
    p.hidden = !S.abierto;
    el("jv-nucleo").classList.toggle("is-abierto", S.abierto);
    if (S.abierto) setTimeout(function () { el("jv-txt").focus(); }, 50);
    else if (S.grabando) parar(true);
  }

  function burbuja(rol, texto, sinHistorial) {
    var m = el("jv-msgs");
    var d = document.createElement("div");
    d.className = "icc-jv-msg is-" + rol;
    d.textContent = texto;
    m.appendChild(d);
    m.scrollTop = m.scrollHeight;
    if (!sinHistorial) S.historial.push({ rol: rol, texto: texto });
    S.historial = S.historial.slice(-12);
    return d;
  }

  function tarjeta(p) {
    var m = el("jv-msgs");
    var d = document.createElement("div");
    d.className = "icc-jv-tarjeta";
    d.innerHTML = '<b>Para confirmar</b><p>' + esc(p.resumen) + '</p><div><button type="button" class="icc-btn icc-btn-primary icc-mo-mini" data-si>✓ Confirmar</button><button type="button" class="icc-btn icc-btn-ghost icc-mo-mini" data-no>Descartar</button></div>';
    m.appendChild(d);
    m.scrollTop = m.scrollHeight;
    p.nodo = d;
    S.pendientes.push(p);
    d.querySelector("[data-si]").addEventListener("click", function () { decidir(p, true); });
    d.querySelector("[data-no]").addEventListener("click", function () { decidir(p, false); });
  }

  async function decidir(p, si) {
    if (p.hecha) return;
    p.hecha = true;
    S.pendientes = S.pendientes.filter(function (x) { return x !== p; });
    p.nodo.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    try {
      var r = await API.post("api/jarvis.php?action=confirmar", { token: p.token, decision: si ? "confirmar" : "descartar" });
      p.nodo.classList.add(si ? "is-ok" : "is-no");
      p.nodo.querySelector("b").textContent = si ? "✓ " + (r.texto || "Hecho") : "Descartado";
      p.nodo.querySelector("div").remove();
      if (si && r.navegar) location.hash = r.navegar;
      if (si && !r.navegar && window.icc.app && window.icc.app.refrescar) window.icc.app.refrescar();
    } catch (e) {
      p.nodo.classList.add("is-no");
      p.nodo.querySelector("b").textContent = "✕ " + e.message;
      var botones = p.nodo.querySelector("div"); if (botones) botones.remove();
    }
  }

  async function enviar(texto, deVoz) {
    if (S.ocupado) return;
    // Confirmación por voz o por texto de la última propuesta pendiente.
    var t = texto.toLowerCase().replace(/[.!¡¿?,]/g, "").trim();
    if (S.pendientes.length && /^(sí|si|vale|confirma|confirmar|confirmo|adelante|ok)$/.test(t)) { burbuja("user", texto, true); return decidir(S.pendientes[S.pendientes.length - 1], true); }
    if (S.pendientes.length && /^(no|cancela|cancelar|descarta|descartar)$/.test(t)) { burbuja("user", texto, true); return decidir(S.pendientes[S.pendientes.length - 1], false); }
    var historial = S.historial.slice();
    burbuja("user", texto);
    S.ocupado = true;
    var pensando = burbuja("assistant", "…", true);
    pensando.classList.add("is-pensando");
    try {
      var r = await API.post("api/jarvis.php?action=chat", { mensaje: texto, historial: historial, pantalla: location.hash.split("?")[0], voz: !!deVoz });
      pensando.remove();
      burbuja("assistant", r.respuesta || "Hecho.");
      (r.propuestas || []).forEach(tarjeta);
      if (r.navegar) location.hash = r.navegar;
      if (deVoz) hablar(r.respuesta || "");
    } catch (e) {
      pensando.remove();
      burbuja("assistant", "✕ " + e.message, true);
    }
    S.ocupado = false;
  }

  /* ----------------------------------------------------------------- VOZ */
  async function grabar() {
    if (!window.isSecureContext || !navigator.mediaDevices || !window.MediaRecorder) { U.toast("El micrófono necesita que el CRM vaya por https.", "error"); return; }
    var flujo;
    try { flujo = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { U.toast("No hay permiso para usar el micrófono.", "error"); return; }
    var tipo = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
    rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined);
    trozos = [];
    rec.ondataavailable = function (e) { if (e.data.size) trozos.push(e.data); };
    rec.onstop = function () { flujo.getTracks().forEach(function (t) { t.stop(); }); if (!rec.cancelado) transcribir(new Blob(trozos, { type: rec.mimeType || "audio/webm" })); };
    rec.start(250);
    S.grabando = true;
    el("jv-mic").classList.add("is-grabando");
    el("jv-nucleo").classList.add("is-escuchando");
    // Termina solo al callarse 1,4 s (máximo 30 s).
    var inicio = Date.now(), ultimoSonido = Date.now(), hablo = false;
    ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
    var an = ctxAudio.createAnalyser();
    ctxAudio.createMediaStreamSource(flujo).connect(an);
    var datos = new Uint8Array(an.fftSize);
    (function vigilar() {
      if (!S.grabando) return;
      an.getByteTimeDomainData(datos);
      var suma = 0;
      for (var i = 0; i < datos.length; i++) { var v = (datos[i] - 128) / 128; suma += v * v; }
      if (Math.sqrt(suma / datos.length) > 0.04) { ultimoSonido = Date.now(); hablo = true; }
      if ((hablo && Date.now() - ultimoSonido > 1400) || Date.now() - inicio > 30000) return parar();
      requestAnimationFrame(vigilar);
    })();
  }

  function parar(cancelar) {
    if (!rec) return;
    S.grabando = false;
    rec.cancelado = !!cancelar;
    try { rec.stop(); } catch (e) {}
    if (ctxAudio) { ctxAudio.close(); ctxAudio = null; }
    el("jv-mic").classList.remove("is-grabando");
    el("jv-nucleo").classList.remove("is-escuchando");
  }

  async function transcribir(blob) {
    var fd = new FormData();
    fd.append("audio", blob, "voz." + (blob.type.indexOf("mp4") !== -1 ? "mp4" : "webm"));
    var aviso = burbuja("user", "🎙️ …", true);
    try {
      var r = await API.postForm("api/jarvis.php?action=transcribir", fd);
      aviso.remove();
      if (r.texto) enviar(r.texto, true);
    } catch (e) { aviso.textContent = "✕ " + e.message; }
  }

  async function hablar(texto) {
    if (!texto) return;
    if (audioActual) { audioActual.pause(); audioActual = null; }
    try {
      var res = await fetch("api/jarvis.php?action=hablar", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": API.getCsrf() }, body: JSON.stringify({ texto: texto }) });
      if (!res.ok) throw new Error("tts");
      var url = URL.createObjectURL(await res.blob());
      audioActual = new Audio(url);
      el("jv-nucleo").classList.add("is-hablando");
      audioActual.onended = function () { el("jv-nucleo").classList.remove("is-hablando"); URL.revokeObjectURL(url); };
      await audioActual.play();
    } catch (e) {
      // Si falla, la voz del navegador.
      if (window.speechSynthesis) { var u = new SpeechSynthesisUtterance(texto); u.lang = "es-ES"; speechSynthesis.speak(u); }
    }
  }

  window.icc.jarvis = { iniciar: iniciar, abrir: function () { alternar(true); } };
})();
