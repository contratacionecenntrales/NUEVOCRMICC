/* =============================================================================
   ICC CRM · firmar.html - firma digital biometrica y validacion legal
   ============================================================================= */
(function () {
  var U = null;
  var canvas, ctx;
  var trazando = false;
  var tieneTrazo = false;
  var puntoAnterior = null;
  var cliente = null;

  function limpiarCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    tieneTrazo = false;
  }

  function prepararCanvas() {
    canvas = document.getElementById("firma-canvas");
    ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0B1220";
    limpiarCanvas();

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    canvas.addEventListener("pointerdown", function (e) {
      trazando = true;
      puntoAnterior = pos(e);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!trazando) return;
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(puntoAnterior.x, puntoAnterior.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      puntoAnterior = p;
      tieneTrazo = true;
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
      canvas.addEventListener(ev, function () {
        trazando = false;
      });
    });

    document.getElementById("btn-limpiar-firma").addEventListener("click", limpiarCanvas);
  }

  function canvasToBlob() {
    return new Promise(function (resolve) {
      canvas.toBlob(resolve, "image/png");
    });
  }

  async function cargarCliente(id) {
    cliente = await window.icc.data.obtenerCliente(id);
    var host = document.getElementById("firma-cliente-info");
    if (!cliente) {
      host.innerHTML = '<p class="icc-empty">No se encontro el cliente o no tienes acceso.</p>';
      document.getElementById("form-firma").hidden = true;
      return;
    }
    host.innerHTML =
      "<h2>" +
      U.escapeHtml(cliente.razon_social) +
      "</h2><p class=\"icc-muted\">" +
      U.escapeHtml(cliente.cif) +
      " · " +
      U.servicioChips(cliente.servicios) +
      "</p>";
    document.getElementById("input-firmante-nombre").value = cliente.contacto_nombre || "";
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!cliente) return;
    if (!tieneTrazo) {
      U.toast("Dibuja la firma antes de continuar", "error");
      return;
    }
    var nombre = document.getElementById("input-firmante-nombre").value.trim();
    var dni = document.getElementById("input-firmante-dni").value.trim();
    var consiento = document.getElementById("input-consentimiento").checked;
    if (!nombre || !dni) {
      U.toast("Indica el nombre y el DNI/NIF del firmante", "error");
      return;
    }
    if (!consiento) {
      U.toast("El firmante debe aceptar la clausula de consentimiento", "error");
      return;
    }

    var btn = document.getElementById("btn-firmar");
    btn.disabled = true;
    btn.textContent = "Guardando firma…";
    try {
      var blob = await canvasToBlob();
      var resultado = await window.icc.data.registrarFirma(cliente.id, nombre, dni, blob);

      document.getElementById("firma-resultado").innerHTML =
        '<div class="icc-card"><h2>✅ Firma registrada</h2>' +
        '<p class="icc-muted">La propuesta queda firmada digitalmente y el expediente pasa a "En Cierre".</p>' +
        "<p><strong>Hash de integridad (SHA-256):</strong><br><code style=\"word-break:break-all;font-size:11px\">" +
        resultado.hash +
        "</code></p>" +
        '<a class="icc-btn icc-btn-primary" href="index.html#/clientes/' +
        cliente.id +
        '">Volver a la ficha del cliente</a></div>';
      document.getElementById("form-firma").hidden = true;
    } catch (err) {
      U.toast(err.message || "No se pudo registrar la firma", "error");
      btn.disabled = false;
      btn.textContent = "Firmar y guardar";
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    U = window.icc.util;

    function pintarSegunEstado(state) {
      if (state.loading) return;
      var app = document.getElementById("firma-app");
      if (!state.user) {
        app.innerHTML =
          '<div class="icc-card"><h2>Acceso requerido</h2><p class="icc-muted">Inicia sesion en el CRM para firmar contratos.</p>' +
          '<a class="icc-btn icc-btn-primary" href="index.html">Ir al login</a></div>';
        return;
      }
      arrancar();
    }

    await window.icc.auth.init();
    window.icc.auth.onChange(pintarSegunEstado);
    pintarSegunEstado(window.icc.auth.state);
  });

  async function arrancar() {
    var idCliente = U.qs("cliente");
    if (!idCliente) {
      document.getElementById("firma-app").innerHTML =
        '<div class="icc-card"><h2>Selecciona un cliente</h2><p class="icc-muted">Accede a la firma desde la ficha del cliente en el CRM.</p>' +
        '<a class="icc-btn icc-btn-primary" href="index.html#/clientes">Ir a clientes</a></div>';
      return;
    }
    await cargarCliente(idCliente);
    if (!cliente) return;
    prepararCanvas();
    document.getElementById("form-firma").addEventListener("submit", onSubmit);
  }
})();
