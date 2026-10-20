/* =============================================================================
   ICC CRM · Capa de acceso a datos (API PHP propia)
   ============================================================================= */
window.icc = window.icc || {};

window.icc.data = (function () {
  var API = window.icc.api;

  // ---------------------------------------------------------------- Clientes
  async function listarClientes(filtros) {
    var qs = new URLSearchParams(filtros || {}).toString();
    var data = await API.get("api/clientes.php" + (qs ? "?" + qs : ""));
    return data.clientes;
  }

  async function obtenerCliente(id) {
    var data = await API.get("api/clientes.php?id=" + encodeURIComponent(id));
    return data.cliente;
  }

  async function crearCliente(payload, servicios) {
    payload = Object.assign({}, payload, { servicios: servicios || [] });
    var data = await API.post("api/clientes.php", payload);
    return data.id;
  }

  async function actualizarCliente(id, payload) {
    await API.put("api/clientes.php?id=" + encodeURIComponent(id), payload);
  }

  async function actualizarEstado(id, estado) {
    return actualizarCliente(id, { estado: estado });
  }

  async function reemplazarServicios(clienteId, servicios) {
    await API.put("api/clientes.php?id=" + encodeURIComponent(clienteId), { servicios: servicios || [] });
  }

  // -------------------------------------------------------------- Documentos
  async function listarDocumentos(clienteId, presupuestoId) {
    var qs = "cliente_id=" + encodeURIComponent(clienteId);
    if (presupuestoId) qs += "&presupuesto_id=" + encodeURIComponent(presupuestoId);
    var data = await API.get("api/documentos.php?" + qs);
    return data.documentos;
  }

  async function subirDocumento(clienteId, tipo, file, notas, presupuestoId) {
    var fd = new FormData();
    fd.append("cliente_id", clienteId);
    fd.append("tipo", tipo);
    fd.append("notas", notas || "");
    fd.append("archivo", file);
    if (presupuestoId) fd.append("presupuesto_id", presupuestoId);
    var data = await API.postForm("api/documentos.php", fd);
    return data.id;
  }

  // ---------------------------------------------------------------- Estudios
  async function listarEstudios(clienteId) {
    var data = await API.get("api/estudios.php?cliente_id=" + encodeURIComponent(clienteId));
    return data.estudios;
  }

  async function crearEstudio(clienteId, file, ahorroEstimado, resumen) {
    var fd = new FormData();
    fd.append("cliente_id", clienteId);
    fd.append("ahorro_estimado", ahorroEstimado != null ? ahorroEstimado : "");
    fd.append("resumen", resumen || "");
    fd.append("archivo", file);
    return API.postForm("api/estudios.php", fd);
  }

  // ------------------------------------------------------------------ Firmas
  async function listarFirmas(clienteId) {
    var data = await API.get("api/firmas.php?cliente_id=" + encodeURIComponent(clienteId));
    return data.firmas;
  }

  async function registrarFirma(clienteId, firmanteNombre, firmanteDni, blobPng) {
    var fd = new FormData();
    fd.append("cliente_id", clienteId);
    fd.append("firmante_nombre", firmanteNombre);
    fd.append("firmante_dni", firmanteDni);
    fd.append("archivo", blobPng, "firma.png");
    return API.postForm("api/firmas.php", fd);
  }

  // ------------------------------------------------------------ Notificaciones
  async function listarNotificaciones() {
    var data = await API.get("api/notificaciones.php");
    return data.notificaciones;
  }

  async function marcarNotificacionLeida(id) {
    await API.put("api/notificaciones.php?id=" + encodeURIComponent(id), {});
  }

  // --------------------------------------------------------------- Contratos
  async function listarContratos(filtros) {
    var qs = new URLSearchParams(filtros || {}).toString();
    var data = await API.get("api/contratos.php" + (qs ? "?" + qs : ""));
    return data.contratos;
  }

  async function crearContrato(payload) {
    var data = await API.post("api/contratos.php", payload);
    return data.id;
  }

  async function actualizarContrato(id, payload) {
    await API.put("api/contratos.php?id=" + encodeURIComponent(id), payload);
  }

  async function borrarContrato(id) {
    await API.del("api/contratos.php?id=" + encodeURIComponent(id));
  }

  // ----------------------------------------------------------------- Agentes
  async function listarAgentes(filtros) {
    var qs = new URLSearchParams(filtros || {}).toString();
    var data = await API.get("api/agentes.php" + (qs ? "?" + qs : ""));
    return data.agentes;
  }

  async function crearAgente(payload) {
    var data = await API.post("api/agentes.php", payload);
    return data.id;
  }

  async function actualizarAgente(id, payload) {
    await API.put("api/agentes.php?id=" + encodeURIComponent(id), payload);
  }

  async function borrarAgente(id) {
    await API.del("api/agentes.php?id=" + encodeURIComponent(id));
  }

  // Comerciales asignados a cada usuario de Backoffice (solo Admin).
  async function listarAsignacionesBackoffice() {
    var data = await API.get("api/backoffice_asignaciones.php");
    return data.asignaciones || {};
  }

  async function guardarAsignacionesBackoffice(backofficeId, comercialIds) {
    await API.put("api/backoffice_asignaciones.php?id=" + encodeURIComponent(backofficeId), { comercial_ids: comercialIds });
  }

  // ---------------------------------------------------------- Ficha de agente
  async function obtenerFichaAgente(id) {
    return API.get("api/ficha_agente.php?id=" + encodeURIComponent(id));
  }

  async function guardarFichaAgente(id, payload) {
    await API.put("api/ficha_agente.php?id=" + encodeURIComponent(id), payload);
  }

  async function crearSeguimientoAgente(id, payload) {
    var data = await API.post("api/ficha_agente.php?id=" + encodeURIComponent(id), payload);
    return data.id;
  }

  async function borrarSeguimientoAgente(id, seguimientoId) {
    await API.del("api/ficha_agente.php?id=" + encodeURIComponent(id) + "&seguimiento_id=" + encodeURIComponent(seguimientoId));
  }

  async function historialImpersonacion() {
    var data = await API.get("api/auth.php?action=historial_impersonacion");
    return data.historial;
  }

  // ---------------------------------------------------------------- Ficheros
  async function listarCarpetasFicheros(parentId) {
    var qs = parentId ? "?parent_id=" + encodeURIComponent(parentId) : "";
    return API.get("api/ficheros_carpetas.php" + qs);
  }

  async function crearCarpetaFichero(nombre, parentId) {
    return API.post("api/ficheros_carpetas.php", { nombre: nombre, parent_id: parentId || null });
  }

  async function borrarCarpetaFichero(id) {
    await API.del("api/ficheros_carpetas.php?id=" + encodeURIComponent(id));
  }

  async function listarFicheros(carpetaId) {
    var data = await API.get("api/ficheros.php?carpeta_id=" + encodeURIComponent(carpetaId));
    return data.ficheros;
  }

  async function subirFichero(carpetaId, file) {
    var fd = new FormData();
    fd.append("carpeta_id", carpetaId);
    fd.append("archivo", file);
    return API.postForm("api/ficheros.php", fd);
  }

  async function borrarFichero(id) {
    await API.del("api/ficheros.php?id=" + encodeURIComponent(id));
  }

  // --------------------------------------------------------------- Proformas
  async function listarProformas(filtros) {
    var qs = new URLSearchParams(filtros || {}).toString();
    var data = await API.get("api/proformas.php" + (qs ? "?" + qs : ""));
    return data.proformas;
  }

  async function crearProforma(formData) {
    var data = await API.postForm("api/proformas.php", formData);
    return data.id;
  }

  async function actualizarProforma(id, payload) {
    await API.put("api/proformas.php?id=" + encodeURIComponent(id), payload);
  }

  async function borrarProforma(id) {
    await API.del("api/proformas.php?id=" + encodeURIComponent(id));
  }

  // ------------------------------------------------------------ Presupuestos
  async function listarPresupuestos(filtros) {
    var qs = new URLSearchParams(filtros || {}).toString();
    var data = await API.get("api/presupuestos.php" + (qs ? "?" + qs : ""));
    return data.presupuestos;
  }

  async function obtenerPresupuesto(id) {
    var data = await API.get("api/presupuestos.php?id=" + encodeURIComponent(id));
    return data.presupuesto;
  }

  async function crearPresupuesto(payload) {
    var data = await API.post("api/presupuestos.php", payload);
    return data.id;
  }

  async function actualizarPresupuesto(id, payload) {
    return API.put("api/presupuestos.php?id=" + encodeURIComponent(id), payload);
  }

  async function cerrarPresupuesto(id) {
    return API.put("api/presupuestos.php?id=" + encodeURIComponent(id), { action: "cerrar" });
  }

  async function borrarPresupuesto(id) {
    await API.del("api/presupuestos.php?id=" + encodeURIComponent(id));
  }

  // -------------------------------------------------------------- Comparador
  async function listarTarifas(catalogo, soloActivas) {
    var qs = "catalogo=" + encodeURIComponent(catalogo) + "&soloActivas=" + (soloActivas === false ? "0" : "1");
    var data = await API.get("api/tarifas.php?" + qs);
    return data.tarifas;
  }

  async function crearTarifa(catalogo, payload) {
    var data = await API.post("api/tarifas.php?catalogo=" + encodeURIComponent(catalogo), payload);
    return data;
  }

  async function actualizarTarifa(catalogo, id, payload) {
    var data = await API.put("api/tarifas.php?catalogo=" + encodeURIComponent(catalogo) + "&id=" + encodeURIComponent(id), payload);
    return data;
  }

  async function borrarTarifa(catalogo, id) {
    await API.del("api/tarifas.php?catalogo=" + encodeURIComponent(catalogo) + "&id=" + encodeURIComponent(id));
  }

  async function listarAuditoriasComparador(clienteId) {
    var data = await API.get("api/comparador_auditorias.php?cliente_id=" + encodeURIComponent(clienteId));
    return data.auditorias;
  }

  async function historialAuditorias(filtros) {
    var qs = new URLSearchParams(filtros || {}).toString();
    return API.get("api/comparador_auditorias.php" + (qs ? "?" + qs : ""));
  }

  async function obtenerAuditoriaComparador(id) {
    var data = await API.get("api/comparador_auditorias.php?id=" + encodeURIComponent(id));
    return data.auditoria;
  }

  async function borrarAuditoriaComparador(id) {
    await API.del("api/comparador_auditorias.php?id=" + encodeURIComponent(id));
  }

  async function guardarAuditoriaComparador(payload) {
    var data = await API.post("api/comparador_auditorias.php", payload);
    return data.id;
  }

  // ---------------------------------------------------------------- Informes
  async function informe(tipo) {
    return API.get("api/informes.php?tipo=" + encodeURIComponent(tipo));
  }

  // ------------------------------------------------------------ Mantenimiento
  async function diagnosticoStorage() {
    var data = await API.get("api/mantenimiento.php");
    return data.resultado;
  }

  async function limpiarStorage() {
    var data = await API.del("api/mantenimiento.php");
    return data.limpiados;
  }

  async function listarCopiasSeguridad() {
    var data = await API.get("api/backup.php?accion=listar");
    return data.backups;
  }

  async function crearCopiaSeguridad() {
    return API.get("api/backup.php?accion=crear");
  }

  function urlDescargaCopia(nombre) {
    return "api/backup.php?accion=descargar&archivo=" + encodeURIComponent(nombre);
  }

  function urlExportarContratos(filtros) {
    var qs = new URLSearchParams(filtros || {}).toString();
    return "api/exportar_contratos.php" + (qs ? "?" + qs : "");
  }

  // ------------------------------------------------------------------- Agenda
  function listarCitas(filtros) {
    var qs = new URLSearchParams(filtros || {}).toString();
    return API.get("api/citas.php" + (qs ? "?" + qs : "")).then(function (data) {
      return data.citas;
    });
  }

  function listarCitasRango(filtros) {
    var qs = new URLSearchParams(filtros || {}).toString();
    return API.get("api/citas.php" + (qs ? "?" + qs : ""));
  }

  function obtenerCita(id) {
    return API.get("api/citas.php?id=" + encodeURIComponent(id));
  }

  function resumenAnualCitas(anio, filtros) {
    var p = new URLSearchParams(filtros || {});
    p.set("resumen", "anio");
    p.set("anio", anio);
    return API.get("api/citas.php?" + p.toString());
  }

  function kpisAgenda(fecha, filtros) {
    var p = new URLSearchParams(filtros || {});
    p.set("kpis", "1");
    p.set("fecha", fecha);
    return API.get("api/citas.php?" + p.toString());
  }

  async function crearCita(payload) {
    return await API.post("api/citas.php", payload);
  }

  async function actualizarCita(id, payload) {
    return await API.put("api/citas.php?id=" + encodeURIComponent(id), payload);
  }

  async function borrarCita(id) {
    await API.del("api/citas.php?id=" + encodeURIComponent(id));
  }

  // ---------------------------------------------------- Ficha de usuario
  async function obtenerUsuario(id) {
    return API.get("api/usuario.php?id=" + encodeURIComponent(id));
  }

  async function accionUsuario(id, accion, payload) {
    return API.post("api/usuario.php?id=" + encodeURIComponent(id) + "&accion=" + accion, payload || {});
  }

  async function subirAvatarUsuario(id, file) {
    var fd = new FormData();
    fd.append("archivo", file);
    return API.postForm("api/usuario.php?id=" + encodeURIComponent(id) + "&accion=avatar", fd);
  }

  async function borrarAvatarUsuario(id) {
    return API.del("api/usuario.php?id=" + encodeURIComponent(id) + "&accion=avatar");
  }

  // ---------------------------------------------------------------- Descargas
  function urlDescarga(tipo, ruta, forzarDescarga) {
    return (
      "api/descargar.php?tipo=" + encodeURIComponent(tipo) + "&ruta=" + encodeURIComponent(ruta) +
      (forzarDescarga ? "&descargar=1" : "")
    );
  }

  return {
    listarClientes: listarClientes,
    obtenerCliente: obtenerCliente,
    crearCliente: crearCliente,
    actualizarCliente: actualizarCliente,
    actualizarEstado: actualizarEstado,
    reemplazarServicios: reemplazarServicios,
    listarDocumentos: listarDocumentos,
    subirDocumento: subirDocumento,
    listarEstudios: listarEstudios,
    crearEstudio: crearEstudio,
    listarFirmas: listarFirmas,
    registrarFirma: registrarFirma,
    listarNotificaciones: listarNotificaciones,
    marcarNotificacionLeida: marcarNotificacionLeida,
    listarContratos: listarContratos,
    crearContrato: crearContrato,
    actualizarContrato: actualizarContrato,
    borrarContrato: borrarContrato,
    listarAgentes: listarAgentes,
    listarAsignacionesBackoffice: listarAsignacionesBackoffice,
    guardarAsignacionesBackoffice: guardarAsignacionesBackoffice,
    crearAgente: crearAgente,
    actualizarAgente: actualizarAgente,
    borrarAgente: borrarAgente,
    obtenerFichaAgente: obtenerFichaAgente,
    obtenerUsuario: obtenerUsuario,
    accionUsuario: accionUsuario,
    subirAvatarUsuario: subirAvatarUsuario,
    borrarAvatarUsuario: borrarAvatarUsuario,
    guardarFichaAgente: guardarFichaAgente,
    crearSeguimientoAgente: crearSeguimientoAgente,
    borrarSeguimientoAgente: borrarSeguimientoAgente,
    historialImpersonacion: historialImpersonacion,
    listarCarpetasFicheros: listarCarpetasFicheros,
    crearCarpetaFichero: crearCarpetaFichero,
    borrarCarpetaFichero: borrarCarpetaFichero,
    listarFicheros: listarFicheros,
    subirFichero: subirFichero,
    borrarFichero: borrarFichero,
    listarProformas: listarProformas,
    crearProforma: crearProforma,
    actualizarProforma: actualizarProforma,
    borrarProforma: borrarProforma,
    listarCitas: listarCitas,
    listarCitasRango: listarCitasRango,
    obtenerCita: obtenerCita,
    resumenAnualCitas: resumenAnualCitas,
    kpisAgenda: kpisAgenda,
    crearCita: crearCita,
    actualizarCita: actualizarCita,
    borrarCita: borrarCita,
    listarTarifas: listarTarifas,
    crearTarifa: crearTarifa,
    actualizarTarifa: actualizarTarifa,
    borrarTarifa: borrarTarifa,
    listarAuditoriasComparador: listarAuditoriasComparador,
    guardarAuditoriaComparador: guardarAuditoriaComparador,
    historialAuditorias: historialAuditorias,
    obtenerAuditoriaComparador: obtenerAuditoriaComparador,
    borrarAuditoriaComparador: borrarAuditoriaComparador,
    listarPresupuestos: listarPresupuestos,
    obtenerPresupuesto: obtenerPresupuesto,
    crearPresupuesto: crearPresupuesto,
    actualizarPresupuesto: actualizarPresupuesto,
    cerrarPresupuesto: cerrarPresupuesto,
    borrarPresupuesto: borrarPresupuesto,
    informe: informe,
    urlDescarga: urlDescarga,
    urlExportarContratos: urlExportarContratos,
    diagnosticoStorage: diagnosticoStorage,
    limpiarStorage: limpiarStorage,
    listarCopiasSeguridad: listarCopiasSeguridad,
    crearCopiaSeguridad: crearCopiaSeguridad,
    urlDescargaCopia: urlDescargaCopia,
  };
})();
