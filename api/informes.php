<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
$idsEquipo = icc_equipo_comercial_ids($user);
$tipo = $_GET['tipo'] ?? '';
$db = icc_db();

function icc_informe_where(?array $idsEquipo, string $columna = 'comercial_id'): string {
  if ($idsEquipo === null) return '';
  $ids = implode(',', array_map('intval', $idsEquipo));
  return "WHERE $columna IN ($ids)";
}

if ($tipo === 'clientes_cartera') {
  $where = icc_informe_where($idsEquipo);
  $condicion = $where === '' ? 'WHERE estado = "cliente_activo"' : $where . ' AND estado = "cliente_activo"';
  $stmt = $db->query("SELECT id, razon_social, cif, sector, estado, created_at FROM clientes $condicion ORDER BY razon_social");
  icc_json(['clientes' => $stmt->fetchAll()]);
}

if ($tipo === 'kw_cartera') {
  $where = icc_informe_where($idsEquipo);
  $total = $db->query("SELECT COALESCE(SUM(kw), 0) AS total_kw, COUNT(*) AS total_contratos FROM contratos $where")->fetch();
  $porComercializadora = $db->query(
    "SELECT comercializadora, COALESCE(SUM(kw), 0) AS total_kw, COUNT(*) AS total_contratos
     FROM contratos $where GROUP BY comercializadora ORDER BY total_kw DESC"
  )->fetchAll();
  icc_json(['total' => $total, 'por_comercializadora' => $porComercializadora]);
}

if ($tipo === 'por_tarifa') {
  $where = icc_informe_where($idsEquipo);
  $stmt = $db->query("SELECT tarifa, COUNT(*) AS total FROM contratos $where GROUP BY tarifa ORDER BY total DESC");
  icc_json(['datos' => $stmt->fetchAll()]);
}

if ($tipo === 'por_comercializadora') {
  $where = icc_informe_where($idsEquipo);
  $stmt = $db->query("SELECT comercializadora, COUNT(*) AS total FROM contratos $where GROUP BY comercializadora ORDER BY total DESC");
  icc_json(['datos' => $stmt->fetchAll()]);
}

if ($tipo === 'por_sector') {
  $where = icc_informe_where($idsEquipo);
  $stmt = $db->query("SELECT sector, COUNT(*) AS total FROM contratos $where GROUP BY sector ORDER BY total DESC");
  icc_json(['datos' => $stmt->fetchAll()]);
}

icc_json(['error' => 'Informe no valido'], 400);
