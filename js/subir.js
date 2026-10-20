/* =============================================================================
   ICC CRM · subir.html - enlace publico de subida rapida de facturas
   Pagina sin login: el propio cliente sube su documentacion de suministros.
   ============================================================================= */
(function () {
  var U = null;
  var token = null;

  function pintarLista(items) {
    document.getElementById("subir-lista").innerHTML = items
      .map(function (it) {
        return (
          '<li class="icc-doc-list-item ' +
          it.estado +
          '"><span>' +
          (it.estado === "ok" ? "✅" : it.estado === "error" ? "⚠️" : "⏳") +
          " " +
          U.escapeHtml(it.nombre) +
          "</span>" +
          (it.mensaje ? '<span class="icc-muted">' + U.escapeHtml(it.mensaje) + "</span>" : "") +
          "</li>"
        );
      })
      .join("");
  }

  async function subirArchivos(files) {
    var items = Array.prototype.map.call(files, function (f) {
      return { nombre: f.name, estado: "pendiente" };
    });
    pintarLista(items);

    for (var i = 0; i < files.length; i++) {
      try {
        var fd = new FormData();
        fd.append("token", token);
        fd.append("archivo", files[i]);
        var res = await fetch("api/subir_publico.php?token=" + encodeURIComponent(token), {
          method: "POST",
          body: fd,
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo subir");

        items[i].estado = "ok";
        items[i].mensaje = "Subido correctamente";
      } catch (err) {
        items[i].estado = "error";
        items[i].mensaje = err.message || "No se pudo subir";
      }
      pintarLista(items);
    }

    if (items.every(function (it) { return it.estado === "ok"; })) {
      U.toast("Documentacion recibida. Gracias.", "success");
    }
  }

  async function init() {
    U = window.icc.util;
    var params = new URLSearchParams(window.location.search);
    token = params.get("token");
    var host = document.getElementById("subir-app");

    if (!token) {
      host.innerHTML = '<div class="icc-card"><h2>Enlace no valido</h2><p class="icc-muted">Falta el codigo de acceso. Solicita el enlace a tu comercial de Integral Connection Consulting.</p></div>';
      return;
    }

    var info = null;
    try {
      var res = await fetch("api/subir_publico.php?token=" + encodeURIComponent(token));
      if (res.ok) info = await res.json();
    } catch (e) {
      info = null;
    }
    if (!info) {
      host.innerHTML = '<div class="icc-card"><h2>Enlace no valido</h2><p class="icc-muted">Este enlace ha caducado o no es correcto. Solicita uno nuevo a tu comercial.</p></div>';
      return;
    }

    host.innerHTML =
      '<div class="icc-card">' +
      "<h2>Hola, " +
      U.escapeHtml(info.razon_social) +
      "</h2>" +
      '<p class="icc-muted">Sube aqui tus facturas o documentacion de suministros actuales (PDF o foto). Nuestro equipo elaborara tu estudio comparativo de ahorro.</p>' +
      '<div class="icc-field"><label>Archivos</label><input class="icc-input" type="file" id="input-archivos" accept="application/pdf,image/*" multiple></div>' +
      '<button class="icc-btn icc-btn-primary" id="btn-subir">Subir documentacion</button>' +
      '<ul class="icc-doc-list" id="subir-lista" style="margin-top:16px"></ul>' +
      "</div>";

    document.getElementById("btn-subir").addEventListener("click", function () {
      var files = document.getElementById("input-archivos").files;
      if (!files.length) {
        U.toast("Selecciona al menos un archivo", "error");
        return;
      }
      subirArchivos(files);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
