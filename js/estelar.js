/* =============================================================================
   ICC CRM · Momento estelar: celebración a pantalla completa
   - Anuncios de dirección: se abren solos una vez en cada navegador, con la
     foto de la persona (la subida para el anuncio o la de su perfil).
   - Ventas nuevas en directo: versión corta (foto solo si es de tu equipo).
   Todo sale de datos reales (api/anuncios.php y api/sala.php).
   ============================================================================= */
(function () {
  var esc = window.icc.util.escapeHtml;
  var cola = [];
  var abierto = false;
  var vistosMem = {};
  var ultimaVenta = 0;

  function reducido() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function visto(id) {
    if (vistosMem[id]) return true;
    try { return localStorage.getItem("icc-estelar-" + id) === "1"; } catch (e) { return false; }
  }
  function marcar(id) {
    vistosMem[id] = true;
    try { localStorage.setItem("icc-estelar-" + id, "1"); } catch (e) { /* sin almacenamiento */ }
  }
  function iniciales(n) {
    return String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join("");
  }

  // ------------------------------------------------------------- Pantalla
  function abrir(d) {
    abierto = true;
    var dur = d.corto ? 7000 : 11000;
    var lugar = [d.ciudad, d.provincia].filter(Boolean);
    if (lugar.length === 2 && lugar[0].toLowerCase() === lugar[1].toLowerCase()) lugar = [lugar[0]];
    var foto = d.foto
      ? '<img src="' + esc(d.foto) + '" alt="' + esc(d.persona || "") + '">'
      : d.persona ? "<span>" + esc(iniciales(d.persona)) + "</span>" : '<span class="is-emoji">' + esc(d.emoji || "🎉") + "</span>";
    var el = document.createElement("div");
    el.className = "icc-estelar" + (d.corto ? " is-corto" : "");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", d.etiqueta);
    el.innerHTML =
      '<div class="icc-estelar-fondo" aria-hidden="true"><i class="icc-estelar-rayos"></i><i class="icc-estelar-onda"></i><i class="icc-estelar-onda is-2"></i><i class="icc-estelar-onda is-3"></i></div>' +
      '<canvas class="icc-estelar-fuegos" aria-hidden="true"></canvas>' +
      '<div class="icc-estelar-tarjeta">' +
      '<p class="icc-estelar-etiqueta">' + esc(d.etiqueta) + "</p>" +
      '<div class="icc-estelar-foto">' + foto + '<b class="icc-estelar-emoji" aria-hidden="true">' + esc(d.emoji || "🎉") + "</b></div>" +
      (d.persona ? '<p class="icc-estelar-persona">' + esc(d.persona) + "</p>" : "") +
      '<h2 class="icc-estelar-texto">' + esc(d.texto) + "</h2>" +
      (lugar.length ? '<p class="icc-estelar-lugar">📍 ' + esc(lugar.join(", ")) + "</p>" : "") +
      '<button type="button" class="icc-estelar-btn">¡Vamos! 🚀</button>' +
      '<div class="icc-estelar-tiempo" aria-hidden="true"><i style="animation-duration:' + dur + 'ms"></i></div>' +
      "</div>";
    document.body.appendChild(el);
    document.body.classList.add("icc-estelar-abierto");
    var btn = el.querySelector(".icc-estelar-btn");
    var img = el.querySelector(".icc-estelar-foto img");
    if (img) img.addEventListener("error", function () { img.outerHTML = "<span>" + esc(iniciales(d.persona) || "★") + "</span>"; });
    var parar = reducido() ? function () {} : fuegos(el.querySelector(".icc-estelar-fuegos"), d.corto ? 2600 : 5200);
    var t = setTimeout(cerrar, dur);
    function cerrar() {
      clearTimeout(t);
      parar();
      document.removeEventListener("keydown", tecla);
      el.classList.add("is-sale");
      setTimeout(function () {
        el.remove();
        document.body.classList.remove("icc-estelar-abierto");
        abierto = false;
        siguiente();
      }, reducido() ? 0 : 450);
    }
    function tecla(e) { if (e.key === "Escape") cerrar(); }
    document.addEventListener("keydown", tecla);
    btn.addEventListener("click", cerrar);
    el.addEventListener("click", function (e) { if (e.target === el || e.target.classList.contains("icc-estelar-fondo")) cerrar(); });
    setTimeout(function () { btn.focus({ preventScroll: true }); }, 60);
  }

  function siguiente() {
    if (abierto || !cola.length) return;
    // No interrumpir si hay un formulario abierto.
    var modal = document.getElementById("icc-modal-root");
    if (modal && modal.children.length) { setTimeout(siguiente, 4000); return; }
    abrir(cola.shift());
  }

  // ---------------------------------------------------------- Fuegos
  function fuegos(cv, durMs) {
    var ctx = cv.getContext("2d");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    function medir() { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    medir();
    window.addEventListener("resize", medir);
    var colores = ["#22D3EE", "#34D399", "#FBBF24", "#F472B6", "#A78BFA", "#60A5FA", "#FB923C", "#FFFFFF"];
    var parts = [];
    var vivo = true;
    var t0 = performance.now();
    var proxima = 0;
    function estallido(x, y) {
      var c1 = colores[(Math.random() * colores.length) | 0];
      var c2 = colores[(Math.random() * colores.length) | 0];
      var n = 70 + ((Math.random() * 40) | 0);
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        var v = 2.5 + Math.random() * 5.5;
        parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 1, c: i % 2 ? c1 : c2, r: 1.6 + Math.random() * 2.2, tipo: 0 });
      }
    }
    function confeti() {
      for (var i = 0; i < 140; i++) {
        parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3,
          vida: 1, c: colores[i % colores.length], r: 4 + Math.random() * 6, g: Math.random() * 6, vg: (Math.random() - 0.5) * 0.3, tipo: 1 });
      }
    }
    confeti();
    function paso(now) {
      if (!vivo) return;
      var dt = now - t0;
      if (dt < durMs && now > proxima) {
        estallido(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.12 + Math.random() * 0.45));
        proxima = now + 260 + Math.random() * 380;
      }
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalCompositeOperation = "lighter";
      parts = parts.filter(function (p) { return p.vida > 0 && p.y < innerHeight + 40; });
      parts.forEach(function (p) {
        if (p.tipo === 0) {
          p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.07; p.x += p.vx; p.y += p.vy; p.vida -= 0.012;
          ctx.globalAlpha = Math.max(0, p.vida);
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        } else {
          p.x += p.vx; p.y += p.vy; p.g += p.vg; p.vida -= 0.003;
          ctx.globalAlpha = 1;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.g); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
        }
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (dt < durMs + 4000) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
    return function () { vivo = false; window.removeEventListener("resize", medir); };
  }

  // ------------------------------------------------------------ Entradas
  /** Anuncios vigentes: cada uno se celebra una vez por navegador. */
  function anuncios(lista, forzar) {
    (lista || []).slice().reverse().forEach(function (a) {
      var clave = "anuncio-" + a.id;
      if (!forzar && visto(clave)) return;
      marcar(clave);
      cola.push({ etiqueta: "📣 Anuncio de dirección", texto: a.texto, emoji: a.emoji, foto: a.foto, persona: a.persona, ciudad: a.ciudad, provincia: a.provincia });
    });
    siguiente();
  }

  /** Venta nueva en directo (un contrato que acaba de entrar). Como mucho una cada 20 s. */
  function venta(e, texto) {
    var clave = "venta-" + e.id;
    if (visto(clave) || Date.now() - ultimaVenta < 20000) return;
    marcar(clave);
    ultimaVenta = Date.now();
    cola.push({ corto: true, etiqueta: "🔥 ¡Nueva venta!", texto: texto, emoji: e.tipo === "contrato_ok" ? "✅" : "📝", foto: e.foto, persona: e.foto ? e.quien : "", provincia: e.provincia });
    siguiente();
  }

  window.icc = window.icc || {};
  window.icc.estelar = { anuncios: anuncios, venta: venta, repetir: function (a) { anuncios([a], true); } };
})();
