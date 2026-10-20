<?php
/**
 * ICC CRM · Sesion para las paginas de los comparadores.
 * GET -> { user: {id, email, nombre, rol} | null, csrf, crm_cliente? }
 * Con ?cliente=ID devuelve tambien los datos basicos de ese cliente del CRM
 * para rellenar el informe (solo si quien entra puede verlo).
 */
require __DIR__ . '/cmp_comun.php';

$user = icc_current_user();
if (!$user) icc_json(['user' => null]);
if (!empty($user['debe_cambiar_password']) && empty($_SESSION['impersonador_id'])) {
  icc_json(['user' => null, 'aviso' => 'Debes cambiar tu contrasena en el CRM antes de usar el comparador.']);
}
if (!icc_tiene_permiso($user, 'comparador.usar')) {
  icc_json(['error' => 'No tienes permiso para usar el comparador.'], 403);
}

$respuesta = ['user' => cmp_usuario_publico($user), 'csrf' => icc_ensure_csrf(), 'instalado' => cmp_instalado()];
if (!empty($_GET['cliente'])) {
  $stmt = icc_db()->prepare('SELECT id, comercial_id, razon_social, cif, contacto_nombre, contacto_telefono, contacto_email, telefono, email, direccion_suministro, tipo_cliente FROM clientes WHERE id = ?');
  $stmt->execute([(int)$_GET['cliente']]);
  $c = $stmt->fetch();
  if ($c && icc_puede_ver_comercial($user, $c['comercial_id'])) {
    unset($c['comercial_id']);
    $respuesta['crm_cliente'] = $c;
  }
}
icc_json($respuesta);
