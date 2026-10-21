/* =============================================================================
   ICC CRM · Utilidades compartidas
   ============================================================================= */
window.icc = window.icc || {};

window.icc.util = (function () {
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function parseFechaSql(value) {
    // Los DATETIME de MySQL llegan como "2026-09-18 09:20:15" (con espacio),
    // formato que Safari/iOS no reconoce en el constructor Date. Lo
    // normalizamos a ISO (con "T") para que funcione en todos los navegadores.
    return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(" ", "T") : value);
  }

  function formatFecha(value) {
    if (!value) return "-";
    var d = parseFechaSql(value);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatFechaHora(value) {
    if (!value) return "-";
    var d = parseFechaSql(value);
    return (
      d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) +
      " " +
      d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    );
  }

  var eurFormatter = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  function formatEur(value) {
    return eurFormatter.format(Number(value || 0));
  }

  function toast(message, kind) {
    var host = document.getElementById("icc-toasts");
    if (!host) return;
    var el = document.createElement("div");
    el.className = "icc-toast icc-toast--" + (kind || "info");
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add("is-visible");
    });
    setTimeout(function () {
      el.classList.remove("is-visible");
      setTimeout(function () {
        el.remove();
      }, 250);
    }, 4200);
  }

  function openModal(html) {
    var host = document.getElementById("icc-modal-root");
    host.innerHTML =
      '<div class="icc-modal-backdrop" data-modal-close>' +
      '<div class="icc-modal" role="dialog" aria-modal="true">' +
      html +
      "</div></div>";
    host.classList.add("is-open");
    host.querySelector("[data-modal-close]").addEventListener("click", function (e) {
      if (e.target === e.currentTarget) window.icc.util.closeModal();
    });
    host.querySelectorAll("[data-close-btn]").forEach(function (btn) {
      btn.addEventListener("click", window.icc.util.closeModal);
    });
  }

  function closeModal() {
    var host = document.getElementById("icc-modal-root");
    host.classList.remove("is-open");
    host.innerHTML = "";
  }

  function estadoBadge(estado) {
    var meta = window.ICC_CONST.ESTADOS[estado] || { label: estado, color: "#94a3b8" };
    return (
      '<span class="icc-badge" style="--badge-color:' +
      meta.color +
      '">' +
      escapeHtml(meta.label) +
      "</span>"
    );
  }

  function servicioChips(servicios) {
    if (!servicios || !servicios.length) return '<span class="icc-muted">Sin servicios</span>';
    return servicios
      .map(function (s) {
        return (
          '<span class="icc-chip">' + escapeHtml(window.ICC_CONST.SERVICIOS[s] || s) + "</span>"
        );
      })
      .join(" ");
  }

  function slugFile(name) {
    return String(name)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
      .toLowerCase();
  }

  function initials(name) {
    return String(name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map(function (p) {
        return p.charAt(0).toUpperCase();
      })
      .join("");
  }

  // Foto de perfil del usuario, o sus iniciales si no tiene.
  function avatar(user, size) {
    size = size || 34;
    var estilo = 'style="width:' + size + "px;height:" + size + "px;font-size:" + Math.round(size * 0.36) + 'px"';
    if (user && user.avatar_ruta) {
      return (
        '<img class="icc-avatar icc-avatar-img" ' + estilo + ' alt="" src="api/descargar.php?tipo=avatares&ruta=' +
        encodeURIComponent(user.avatar_ruta) + '">'
      );
    }
    return '<div class="icc-avatar" ' + estilo + ">" + initials(user ? user.nombre + " " + (user.apellidos || "") : "") + "</div>";
  }

  function haceCuanto(value) {
    if (!value) return "nunca";
    var d = parseFechaSql(value);
    var seg = Math.round((Date.now() - d.getTime()) / 1000);
    if (seg < 90) return "hace un momento";
    var min = Math.round(seg / 60);
    if (min < 60) return "hace " + min + " min";
    var h = Math.round(min / 60);
    if (h < 24) return "hace " + h + (h === 1 ? " hora" : " horas");
    var dias = Math.round(h / 24);
    return "hace " + dias + (dias === 1 ? " dia" : " dias");
  }

  function qs(params) {
    var url = new URLSearchParams(window.location.search);
    return params ? url.get(params) : url;
  }

  // Lleva la pantalla hasta un bloque y lo resalta un momento (lo usan los
  // recuadros con data-ir="selector", p. ej. un KPI que explica un panel).
  function irA(selector) {
    var el = null;
    try { el = document.querySelector(selector); } catch (e) { el = null; }
    if (!el) return false;
    var reducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reducido ? "auto" : "smooth", block: "center", inline: "center" });
    el.classList.remove("icc-resaltado");
    void el.offsetWidth;
    el.classList.add("icc-resaltado");
    setTimeout(function () { el.classList.remove("icc-resaltado"); }, 1800);
    return true;
  }

  return {
    irA: irA,
    escapeHtml: escapeHtml,
    formatFecha: formatFecha,
    formatFechaHora: formatFechaHora,
    formatEur: formatEur,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    estadoBadge: estadoBadge,
    servicioChips: servicioChips,
    slugFile: slugFile,
    initials: initials,
    avatar: avatar,
    haceCuanto: haceCuanto,
    qs: qs,
  };
})();
