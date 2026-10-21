/* =============================================================================
   ICC CRM · Sesion, perfil y rol del usuario (backend PHP propio)
   ============================================================================= */
window.icc = window.icc || {};

window.icc.auth = (function () {
  var API = window.icc.api;
  var state = {
    user: null,
    rolPrincipal: "comercial",
    loading: true,
    impersonando: null,
  };
  var listeners = [];

  function notify() {
    listeners.forEach(function (fn) {
      fn(state);
    });
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function aplicarUsuario(user, csrf, impersonando) {
    state.user = user;
    state.rolPrincipal = user ? user.rol : "comercial";
    state.impersonando = impersonando || null;
    if (csrf) API.setCsrf(csrf);
  }

  async function init() {
    try {
      var data = await API.get("api/auth.php?action=me");
      aplicarUsuario(data.user, data.csrf, data.impersonando);
    } catch (e) {
      console.error(e);
      state.user = null;
    }
    state.loading = false;
    notify();
  }

  async function signIn(email, password) {
    var data = await API.post("api/auth.php?action=login", { email: email, password: password });
    aplicarUsuario(data.user, data.csrf, data.impersonando);
    notify();
  }

  async function signOut() {
    await API.post("api/auth.php?action=logout", {});
    state.user = null;
    state.rolPrincipal = "comercial";
    state.impersonando = null;
    notify();
  }

  async function verComo(id) {
    var data = await API.post("api/auth.php?action=ver_como", { id: id });
    aplicarUsuario(data.user, data.csrf, data.impersonando);
    notify();
  }

  async function detenerImpersonacion() {
    var data = await API.post("api/auth.php?action=detener_impersonacion", {});
    aplicarUsuario(data.user, data.csrf, data.impersonando);
    notify();
  }

  function tieneRol(rol) {
    return !!state.user && state.user.rol === rol;
  }

  function esBackofficeOAdmin() {
    return tieneRol("backoffice") || tieneRol("jefe_de_equipo") || esAdminOSuperior();
  }

  function esAdminOSuperior() {
    // Administrador, Gerente, Coordinador y Super Admin: mismo nivel.
    return !!state.user && window.ICC_CONST.ROLES_ADMIN.indexOf(state.user.rol) !== -1;
  }

  function esSuperAdmin() {
    return tieneRol("super_admin");
  }

  // Permisos granulares calculados por el servidor (rol + excepciones).
  function puede(permiso) {
    if (!state.user) return false;
    if (!Array.isArray(state.user.permisos)) return true;
    return state.user.permisos.indexOf(permiso) !== -1;
  }

  async function cambiarPassword(actual, nueva) {
    var data = await API.post("api/auth.php?action=cambiar_password", { actual: actual, nueva: nueva });
    if (data.user) state.user = data.user;
    notify();
  }

  async function refrescarUsuario() {
    var data = await API.get("api/auth.php?action=me");
    if (data.user) state.user = data.user;
  }

  return {
    init: init,
    onChange: onChange,
    signIn: signIn,
    signOut: signOut,
    verComo: verComo,
    detenerImpersonacion: detenerImpersonacion,
    tieneRol: tieneRol,
    esBackofficeOAdmin: esBackofficeOAdmin,
    esAdminOSuperior: esAdminOSuperior,
    esSuperAdmin: esSuperAdmin,
    puede: puede,
    cambiarPassword: cambiarPassword,
    refrescarUsuario: refrescarUsuario,
    get state() {
      return state;
    },
  };
})();
