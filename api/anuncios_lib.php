<?php
/**
 * ICC CRM · Utilidades de anuncios (las usan api/anuncios.php y api/sala.php).
 */

/** Enlace a la foto del anuncio: la subida para el anuncio o, si no, la de perfil de la persona. */
function icc_anuncio_foto(array $a): ?string {
  if (!empty($a['foto_ruta'])) return 'api/descargar.php?tipo=anuncios&ruta=' . rawurlencode($a['foto_ruta']);
  if (!empty($a['persona_avatar'])) return 'api/descargar.php?tipo=avatares&ruta=' . rawurlencode($a['persona_avatar']);
  return null;
}

/** Normaliza una fila de anuncio para el cliente (sin rutas internas). */
function icc_anuncio_publico(array $a): array {
  $out = [
    'id' => (int)$a['id'],
    'texto' => $a['texto'],
    'emoji' => $a['emoji'],
    'provincia' => $a['provincia'],
    'ciudad' => $a['ciudad'],
    'inicio' => $a['inicio'],
    'expira' => $a['expira'],
    'foto' => icc_anuncio_foto($a),
    'persona' => trim((string)($a['persona_nombre'] ?? '')),
    'usuario_id' => isset($a['usuario_id']) && $a['usuario_id'] !== null ? (int)$a['usuario_id'] : null,
  ];
  foreach (['autor', 'vigente', 'created_at'] as $k) if (array_key_exists($k, $a)) $out[$k] = $a[$k];
  return $out;
}

/** true si la tabla tiene ya las columnas usuario_id y foto_ruta. */
function icc_anuncios_con_foto(PDO $db): bool {
  static $ok = null;
  if ($ok === null) {
    try {
      $db->query('SELECT usuario_id, foto_ruta FROM anuncios LIMIT 0');
      $ok = true;
    } catch (PDOException $e) {
      $ok = false;
    }
  }
  return $ok;
}

/** SELECT base con la persona protagonista. */
function icc_anuncios_select(PDO $db, string $extra = ''): string {
  $extra = $extra !== '' ? ', ' . $extra : '';
  if (icc_anuncios_con_foto($db)) {
    return "SELECT a.*, p.avatar_ruta persona_avatar, TRIM(CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellidos, ''))) persona_nombre$extra
            FROM anuncios a LEFT JOIN usuarios p ON p.id = a.usuario_id";
  }
  return "SELECT a.*, NULL usuario_id, NULL foto_ruta, NULL persona_avatar, NULL persona_nombre$extra FROM anuncios a";
}

function icc_anuncios_vigentes(PDO $db): array {
  $filas = $db->query(icc_anuncios_select($db) . ' WHERE a.inicio <= NOW() AND a.expira > NOW() ORDER BY a.inicio DESC LIMIT 20')->fetchAll();
  return array_map('icc_anuncio_publico', $filas);
}
