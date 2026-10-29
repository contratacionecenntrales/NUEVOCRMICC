/* =============================================================================
   ICC CRM · Cliente ligero para la API PHP propia (fetch + sesion por cookie)
   ============================================================================= */
window.icc = window.icc || {};

window.icc.api = (function () {
  var csrf = "";

  function setCsrf(token) {
    csrf = token || "";
  }

  async function manejarRespuesta(res) {
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      // Sesion cerrada en remoto (Seguridad avanzada) o contrasena que hay
      // que cambiar: se recarga para mostrar el login o la pantalla de cambio.
      var conSesion = window.icc.auth && window.icc.auth.state && window.icc.auth.state.user;
      if (conSesion && (res.status === 401 || (res.status === 403 && data && data.debe_cambiar_password))) {
        setTimeout(function () { location.reload(); }, 600);
      }
      var err = new Error((data && data.error) || "Error inesperado (" + res.status + ")");
      err.status = res.status;
      err.datos = data || {};
      throw err;
    }
    return data;
  }

  function get(url) {
    return fetch(url, { credentials: "same-origin" }).then(manejarRespuesta);
  }

  function post(url, body) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify(body || {}),
    }).then(manejarRespuesta);
  }

  function put(url, body) {
    // Se envia como POST (no PUT) porque algunos hostings compartidos
    // bloquean tambien el metodo PUT a nivel de servidor y devuelven un
    // 405 en blanco antes de llegar al PHP (igual que pasaba con DELETE).
    // La cabecera le dice al backend que es en realidad un PUT.
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, "X-HTTP-Method-Override": "PUT" },
      body: JSON.stringify(body || {}),
    }).then(manejarRespuesta);
  }

  function del(url) {
    // Se envia como POST (no DELETE) porque algunos hostings compartidos
    // bloquean el metodo DELETE a nivel de servidor y devuelven un 405 en
    // blanco antes de llegar al PHP. La cabecera le dice al backend que
    // es en realidad un borrado (ver api/config.php).
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": csrf, "X-HTTP-Method-Override": "DELETE" },
    }).then(manejarRespuesta);
  }

  function postForm(url, formData) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": csrf },
      body: formData,
    }).then(manejarRespuesta);
  }

  return {
    setCsrf: setCsrf,
    get: get,
    post: post,
    put: put,
    del: del,
    postForm: postForm,
  };
})();
