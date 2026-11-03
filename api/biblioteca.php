<?php
/**
 * ICC CRM · Biblioteca de formacion y recursos (portada de Ficheros).
 * Requiere sql/migracion_ficheros_biblioteca.sql.
 *
 * GET                       portada: archivos de las carpetas compartidas con su
 *                           titulo profesional, categoria, ruta de inicio y progreso.
 * GET  ?action=equipo       direccion, jefes y backoffice: progreso de la ruta por persona.
 * POST ?action=hecho        {fichero_id, hecho}  marca un paso de la ruta como completado.
 * POST ?action=vista        {fichero_id}         cuenta una apertura (estadistica).
 * POST ?action=paginas      {fichero_id, paginas} paginas de un PDF que el servidor no supo contar.
 * PUT  ?action=meta&id=     direccion: {titulo, descripcion, categoria, division, duracion_min}
 * POST ?action=ruta         direccion: {ids: [...]} pasos de la ruta, en orden.
 *
 * Las carpetas personales (facturacion de cada comercial) nunca salen aqui.
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso($user, 'ficheros.ver');
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? '');
$db = icc_db();
$miId = (int)$user['id'];
$gestiona = icc_puede_gestionar_ficheros($user);

try {
  $db->query('SELECT titulo, categoria, ruta_paso, paginas, division FROM ficheros LIMIT 0');
  $db->query('SELECT 1 FROM ficheros_progreso LIMIT 0');
} catch (PDOException $e) {
  icc_json(['error' => 'Falta importar la base de datos completa (biblioteca de Ficheros).', 'sin_migracion' => true], 409);
}

const BIB_CATEGORIAS = ['presentaciones', 'dosieres', 'tramitacion', 'formacion', 'ofertas', 'otros', 'oculto'];
const BIB_DIVISIONES = ['energia', 'telefonia', 'alarmas', 'seguros', 'general'];

function bib_normaliza(string $t): string {
  $t = mb_strtolower($t, 'UTF-8');
  return strtr($t, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', '_' => ' ', '-' => ' ', '.' => ' ']);
}

/** Categoria que le corresponde a un archivo por su nombre y su carpeta. */
function bib_categoria_auto(string $archivo, string $carpeta, ?string $seccion): string {
  $n = ' ' . bib_normaliza($archivo) . ' ';
  $c = ' ' . bib_normaliza($carpeta) . ' ';
  $reglas = [
    'ofertas' => '/[^a-z](oferta|promo|campana|descuento|black friday|precio|condiciones especiales)/',
    'dosieres' => '/[^a-z](dosier|dossier|catalog|brochure|folleto|portfolio)/',
    'presentaciones' => '/[^a-z](presentaci|corporativ|quienes somos|propuesta comercial|pitch)/',
    'tramitacion' => '/[^a-z](tramit|procedimiento|proceso de alta|alta de|como dar|checklist|check list|documentacion|requisitos|formulario|mandato|sepa|paso a paso|instrucciones)/',
    'formacion' => '/[^a-z](formaci|manual|curso|guia|argumentario|onboarding|tutorial|modulo|leccion|bienvenida|introduc|rutina|kit de venta|objeciones)/',
  ];
  foreach ($reglas as $cat => $re) if (preg_match($re, $n)) return $cat;
  foreach ($reglas as $cat => $re) if (preg_match($re, $c)) return $cat;
  return $seccion === 'formacion' ? 'formacion' : 'otros';
}

/** Titulo profesional a partir del nombre del archivo: sin extension, guiones, versiones ni copias. */
function bib_titulo_limpio(string $archivo): string {
  $t = preg_replace('/\.[a-z0-9]{2,5}$/i', '', $archivo);
  $t = str_replace(['_', '-', '.', '+'], ' ', $t);
  $t = preg_replace('/\((\d+|copia|copy)\)/i', ' ', $t);
  $t = preg_replace('/\b(v\s?\d+(\s\d+)*|ver\s?\d+|version\s?\d+|final|definitivo|def|copia|copy|ok|nuevo|new|rev\s?\d*)\b/i', ' ', $t);
  $t = preg_replace('/\b(19|20)\d{2}\s?\d{2}\s?\d{2}\b|\b\d{2}\s\d{2}\s(19|20)\d{2}\b/', ' ', $t);
  $t = trim(preg_replace('/\s+/u', ' ', $t));
  if ($t === '') return $archivo;
  // Todo en mayusculas o todo en minusculas: tipo frase, respetando siglas cortas.
  if ($t === mb_strtoupper($t, 'UTF-8') || $t === mb_strtolower($t, 'UTF-8')) {
    $palabras = explode(' ', mb_strtolower($t, 'UTF-8'));
    $siglas = ['icc', 'cups', 'kw', 'kwh', 'pdf', 'iva', 'sepa', 'crm', 'ia', 'tv', 'b2b', 'b2c', 'pyme', 'pymes', 'faq', 'dni', 'nif', 'cif'];
    foreach ($palabras as $i => &$p) {
      if (in_array($p, $siglas, true)) $p = mb_strtoupper($p, 'UTF-8');
      elseif ($i === 0) $p = mb_strtoupper(mb_substr($p, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($p, 1, null, 'UTF-8');
    }
    unset($p);
    $t = implode(' ', $palabras);
  }
  // Tildes y nombres de marcas, para que el titulo quede profesional.
  $dic = [
    'presentacion' => 'presentación', 'presentaciones' => 'presentaciones', 'documentacion' => 'documentación', 'tramitacion' => 'tramitación',
    'formacion' => 'formación', 'guia' => 'guía', 'guias' => 'guías', 'energia' => 'energía', 'telefonia' => 'telefonía', 'informacion' => 'información',
    'introduccion' => 'introducción', 'comision' => 'comisión', 'comisiones' => 'comisiones', 'contratacion' => 'contratación', 'facturacion' => 'facturación',
    'gestion' => 'gestión', 'ultima' => 'última', 'ultimo' => 'último', 'basico' => 'básico', 'basica' => 'básica', 'tecnico' => 'técnico', 'tecnica' => 'técnica',
    'electrica' => 'eléctrica', 'electricas' => 'eléctricas', 'analisis' => 'análisis', 'catalogo' => 'catálogo', 'rapido' => 'rápido', 'rapida' => 'rápida',
    'telefono' => 'teléfono', 'movil' => 'móvil', 'moviles' => 'móviles', 'credito' => 'crédito', 'promocion' => 'promoción', 'promociones' => 'promociones',
    'captacion' => 'captación', 'atencion' => 'atención', 'comunicacion' => 'comunicación', 'renovacion' => 'renovación', 'instalacion' => 'instalación',
    'campana' => 'campaña', 'campanas' => 'campañas', 'pequena' => 'pequeña', 'tamano' => 'tamaño', 'metodo' => 'método', 'tactica' => 'táctica', 'tacticas' => 'tácticas',
    'estrategia' => 'estrategia', 'ahorro' => 'ahorro', 'excelencia' => 'excelencia', 'operativa' => 'operativa', 'politica' => 'política', 'protocolo' => 'protocolo',
    'iberdrola' => 'Iberdrola', 'endesa' => 'Endesa', 'naturgy' => 'Naturgy', 'repsol' => 'Repsol', 'totalenergies' => 'TotalEnergies', 'holaluz' => 'Holaluz',
    'octopus' => 'Octopus', 'movistar' => 'Movistar', 'vodafone' => 'Vodafone', 'orange' => 'Orange', 'yoigo' => 'Yoigo', 'masmovil' => 'MásMóvil', 'digi' => 'Digi',
    'securitas' => 'Securitas', 'prosegur' => 'Prosegur', 'adt' => 'ADT', 'lowi' => 'Lowi', 'pepephone' => 'Pepephone', 'simyo' => 'Simyo', 'jazztel' => 'Jazztel',
    'finetwork' => 'Finetwork', 'axa' => 'AXA', 'mapfre' => 'Mapfre', 'allianz' => 'Allianz', 'gana' => 'Gana', 'audax' => 'Audax', 'plenitude' => 'Plenitude',
  ];
  $palabras = explode(' ', $t);
  foreach ($palabras as $i => &$p) {
    $k = mb_strtolower($p, 'UTF-8');
    if (isset($dic[$k]) && ($p === $k || $p === mb_strtoupper(mb_substr($k, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($k, 1, null, 'UTF-8'))) {
      $nuevo = $dic[$k];
      $p = $i === 0 ? mb_strtoupper(mb_substr($nuevo, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($nuevo, 1, null, 'UTF-8') : $nuevo;
    }
    // "como" al principio de un titulo es una pregunta: "Cómo dar de alta…"
    if ($i === 0 && $k === 'como') $p = 'Cómo';
  }
  unset($p);
  $t = implode(' ', $palabras);
  return mb_strtoupper(mb_substr($t, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($t, 1, null, 'UTF-8');
}

/** Numero de paginas de un PDF (0 si no se puede saber). */
function bib_paginas_pdf(string $ruta): int {
  if (!is_file($ruta) || filesize($ruta) > 40 * 1024 * 1024) return 0;
  $c = @file_get_contents($ruta);
  if ($c === false) return 0;
  $n = preg_match_all('/\/Type\s*\/Page(?![a-zA-Z])/', $c);
  if (!$n && preg_match_all('/\/Count\s+(\d+)/', $c, $m)) $n = max(array_map('intval', $m[1]));
  return (int)$n;
}

/** Archivos de carpetas compartidas (nunca personales), con todo lo que necesita la portada. */
function bib_archivos(PDO $db, array $user, int $miId): array {
  $secciones = [];
  foreach (icc_ficheros_secciones() as $s) $secciones[$s['clave']] = $s;
  $carpetas = [];
  foreach ($db->query('SELECT * FROM ficheros_carpetas')->fetchAll() as $c) $carpetas[(int)$c['id']] = $c;
  // Una carpeta es personal si ella o alguna de sus madres tiene dueno, o es la de facturacion.
  $personal = function (int $id) use (&$carpetas): bool {
    $vueltas = 0;
    while (isset($carpetas[$id]) && $vueltas++ < 30) {
      $c = $carpetas[$id];
      if ($c['propietario_id'] !== null || $c['nombre'] === 'Facturacion de Comerciales') return true;
      if ($c['parent_id'] === null) return false;
      $id = (int)$c['parent_id'];
    }
    return false;
  };
  $seccionDe = function (int $id) use (&$carpetas): ?string {
    $vueltas = 0;
    while (isset($carpetas[$id]) && $vueltas++ < 30) {
      if (!empty($carpetas[$id]['seccion'])) return $carpetas[$id]['seccion'];
      if ($carpetas[$id]['parent_id'] === null) return icc_ficheros_seccion_auto($carpetas[$id]['nombre']);
      $id = (int)$carpetas[$id]['parent_id'];
    }
    return null;
  };
  $hechos = [];
  $st = $db->prepare('SELECT fichero_id FROM ficheros_progreso WHERE usuario_id = ?');
  $st->execute([$miId]);
  foreach ($st->fetchAll() as $f) $hechos[(int)$f['fichero_id']] = true;

  $out = [];
  foreach ($db->query('SELECT * FROM ficheros ORDER BY orden, created_at DESC')->fetchAll() as $f) {
    $cid = (int)$f['carpeta_id'];
    if (!isset($carpetas[$cid]) || $personal($cid)) continue;
    $fisica = ICC_STORAGE_DIR . '/ficheros/' . $f['ruta_archivo'];
    $existe = is_file($fisica);
    $ext = strtolower(pathinfo($f['nombre_archivo'], PATHINFO_EXTENSION));
    if ($ext === 'pdf' && $existe && $f['paginas'] === null) {
      $f['paginas'] = bib_paginas_pdf($fisica);
      $db->prepare('UPDATE ficheros SET paginas = ? WHERE id = ?')->execute([$f['paginas'], $f['id']]);
    }
    $paginas = (int)($f['paginas'] ?? 0);
    $seccion = $seccionDe($cid);
    $catAuto = bib_categoria_auto($f['nombre_archivo'], $carpetas[$cid]['nombre'], $seccion);
    // Division del dosier: la elegida, la que diga el nombre del archivo o la de su carpeta.
    $divNombre = icc_ficheros_seccion_auto(bib_normaliza($f['nombre_archivo']));
    $divAuto = in_array($divNombre, BIB_DIVISIONES, true) && $divNombre !== 'general' ? $divNombre
      : (in_array($seccion, BIB_DIVISIONES, true) ? $seccion : 'general');
    $division = in_array((string)($f['division'] ?? ''), BIB_DIVISIONES, true) ? $f['division'] : $divAuto;
    $minutos = $f['duracion_min'] !== null ? (int)$f['duracion_min'] : ($paginas ? max(2, (int)round($paginas * 1.5)) : null);
    $out[] = [
      'id' => (int)$f['id'],
      'titulo' => $f['titulo'] !== null && $f['titulo'] !== '' ? $f['titulo'] : bib_titulo_limpio($f['nombre_archivo']),
      'titulo_propio' => $f['titulo'] !== null && $f['titulo'] !== '',
      'nombre_archivo' => $f['nombre_archivo'],
      'descripcion' => (string)($f['descripcion'] ?? ''),
      'categoria' => $f['categoria'] ?: $catAuto,
      'categoria_elegida' => $f['categoria'],
      'categoria_auto' => $catAuto,
      'seccion' => $seccion ?: 'general',
      'seccion_label' => isset($secciones[$seccion]) ? $secciones[$seccion]['label'] : 'General',
      'seccion_icono' => isset($secciones[$seccion]) ? $secciones[$seccion]['icono'] : '📁',
      'division' => $division,
      'division_elegida' => in_array((string)($f['division'] ?? ''), BIB_DIVISIONES, true) ? $f['division'] : null,
      'division_auto' => $divAuto,
      'carpeta' => $carpetas[$cid]['nombre'],
      'carpeta_id' => $cid,
      'ext' => $ext,
      'existe' => $existe,
      'tamano' => $existe ? (int)filesize($fisica) : null,
      'paginas' => $paginas ?: null,
      'minutos' => $minutos,
      'duracion_min' => $f['duracion_min'] !== null ? (int)$f['duracion_min'] : null,
      'ruta_paso' => $f['ruta_paso'] !== null ? (int)$f['ruta_paso'] : null,
      'vistas' => (int)$f['vistas'],
      'completado' => isset($hechos[(int)$f['id']]),
      'url' => 'api/descargar.php?tipo=ficheros&ruta=' . rawurlencode($f['ruta_archivo']),
      'created_at' => $f['created_at'],
    ];
  }
  return $out;
}

/** Pasos de la ruta: los elegidos por direccion o, si no hay, una sugerencia automatica. */
function bib_ruta(array $archivos): array {
  $elegidos = array_values(array_filter($archivos, function ($a) { return $a['ruta_paso'] !== null && $a['categoria'] !== 'oculto'; }));
  if ($elegidos) {
    usort($elegidos, function ($a, $b) { return $a['ruta_paso'] <=> $b['ruta_paso']; });
    return ['ids' => array_map(function ($a) { return $a['id']; }, $elegidos), 'sugerida' => false];
  }
  $peso = function ($a) {
    $n = ' ' . bib_normaliza($a['titulo'] . ' ' . $a['nombre_archivo']) . ' ';
    foreach (['bienvenida', 'introduc', 'quienes somos', 'onboarding', 'manual', 'rutina', 'argumentario', 'kit', 'objeciones', 'guia'] as $i => $p) {
      if (strpos($n, $p) !== false) return $i;
    }
    return 50;
  };
  $cands = array_values(array_filter($archivos, function ($a) use ($peso) { return $a['categoria'] === 'formacion' && $a['existe'] && $peso($a) < 50; }));
  usort($cands, function ($a, $b) use ($peso) { return [$peso($a), $a['titulo']] <=> [$peso($b), $b['titulo']]; });
  return ['ids' => array_map(function ($a) { return $a['id']; }, array_slice($cands, 0, 6)), 'sugerida' => true];
}

$body = $metodo === 'GET' ? [] : icc_body();
if ($metodo !== 'GET') icc_require_csrf();

if ($metodo === 'GET' && $accion === '') {
  $archivos = bib_archivos($db, $user, $miId);
  $verEquipo = icc_es_rol_admin((string)$user['rol']) || in_array($user['rol'], ['jefe_de_equipo', 'backoffice'], true);
  icc_json([
    'archivos' => $archivos,
    'ruta' => bib_ruta($archivos),
    'puede_gestionar' => $gestiona,
    'puede_ver_equipo' => $verEquipo,
    'secciones' => icc_ficheros_secciones(),
  ]);
}

if ($metodo === 'GET' && $accion === 'equipo') {
  if (!(icc_es_rol_admin((string)$user['rol']) || in_array($user['rol'], ['jefe_de_equipo', 'backoffice'], true))) {
    icc_json(['error' => 'No tienes permiso para ver el progreso del equipo'], 403);
  }
  $ruta = bib_ruta(bib_archivos($db, $user, $miId))['ids'];
  $ids = icc_equipo_comercial_ids($user);
  $sql = "SELECT id, TRIM(CONCAT(nombre, ' ', COALESCE(apellidos, ''))) nombre, rol, created_at FROM usuarios
          WHERE bloqueado = 0 AND rol IN ('comercial', 'jefe_de_equipo')";
  $p = [];
  if ($ids !== null) {
    if (!$ids) icc_json(['personas' => [], 'pasos' => count($ruta)]);
    $sql .= ' AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $p = $ids;
  }
  $st = $db->prepare($sql . ' ORDER BY nombre');
  $st->execute($p);
  $personas = $st->fetchAll();
  $hechos = [];
  if ($ruta) {
    $st = $db->query('SELECT usuario_id, COUNT(*) n, MAX(completado_en) ultimo FROM ficheros_progreso WHERE fichero_id IN (' . implode(',', array_map('intval', $ruta)) . ') GROUP BY usuario_id');
    foreach ($st->fetchAll() as $h) $hechos[(int)$h['usuario_id']] = $h;
  }
  foreach ($personas as &$x) {
    $x['id'] = (int)$x['id'];
    $x['hechos'] = isset($hechos[$x['id']]) ? (int)$hechos[$x['id']]['n'] : 0;
    $x['ultimo'] = $hechos[$x['id']]['ultimo'] ?? null;
  }
  unset($x);
  icc_json(['personas' => $personas, 'pasos' => count($ruta)]);
}

$ficheroId = (int)($body['fichero_id'] ?? 0);
$existeFichero = function (int $id) use ($db): bool {
  $st = $db->prepare('SELECT 1 FROM ficheros WHERE id = ?');
  $st->execute([$id]);
  return (bool)$st->fetch();
};

if ($metodo === 'POST' && $accion === 'hecho') {
  if (!$existeFichero($ficheroId)) icc_json(['error' => 'Archivo no encontrado'], 404);
  if (!empty($body['hecho'])) {
    $db->prepare('INSERT IGNORE INTO ficheros_progreso (usuario_id, fichero_id) VALUES (?, ?)')->execute([$miId, $ficheroId]);
  } else {
    $db->prepare('DELETE FROM ficheros_progreso WHERE usuario_id = ? AND fichero_id = ?')->execute([$miId, $ficheroId]);
  }
  icc_json(['ok' => true]);
}

// El navegador ya abre el PDF para la miniatura: si el servidor no supo contar
// sus paginas (PDF comprimido), las comunica el. Solo se guarda una vez.
if ($metodo === 'POST' && $accion === 'paginas') {
  $n = (int)($body['paginas'] ?? 0);
  if ($n >= 1 && $n <= 3000) {
    $db->prepare("UPDATE ficheros SET paginas = ? WHERE id = ? AND (paginas IS NULL OR paginas = 0) AND LOWER(nombre_archivo) LIKE '%.pdf'")->execute([$n, $ficheroId]);
  }
  icc_json(['ok' => true]);
}

if ($metodo === 'POST' && $accion === 'vista') {
  $db->prepare('UPDATE ficheros SET vistas = vistas + 1 WHERE id = ?')->execute([$ficheroId]);
  icc_json(['ok' => true]);
}

if (!$gestiona) icc_json(['error' => 'Solo Administración organiza la biblioteca'], 403);

if ($metodo === 'PUT' && $accion === 'meta') {
  $id = (int)($_GET['id'] ?? 0);
  if (!$existeFichero($id)) icc_json(['error' => 'Archivo no encontrado'], 404);
  $titulo = trim(preg_replace('/\s+/u', ' ', (string)($body['titulo'] ?? '')));
  $descripcion = trim(preg_replace('/\s+/u', ' ', (string)($body['descripcion'] ?? '')));
  $categoria = (string)($body['categoria'] ?? '');
  if ($categoria !== '' && !in_array($categoria, BIB_CATEGORIAS, true)) icc_json(['error' => 'Categoría no válida'], 400);
  $duracion = isset($body['duracion_min']) && $body['duracion_min'] !== '' && $body['duracion_min'] !== null ? max(1, min(600, (int)$body['duracion_min'])) : null;
  $division = (string)($body['division'] ?? '');
  if ($division !== '' && !in_array($division, BIB_DIVISIONES, true)) icc_json(['error' => 'División no válida'], 400);
  $db->prepare('UPDATE ficheros SET division = ? WHERE id = ?')->execute([$division !== '' ? $division : null, $id]);
  $db->prepare('UPDATE ficheros SET titulo = ?, descripcion = ?, categoria = ?, duracion_min = ? WHERE id = ?')->execute([
    $titulo !== '' ? mb_substr($titulo, 0, 200) : null,
    $descripcion !== '' ? mb_substr($descripcion, 0, 400) : null,
    $categoria !== '' ? $categoria : null,
    $duracion,
    $id,
  ]);
  icc_json(['ok' => true]);
}

if ($metodo === 'POST' && $accion === 'ruta') {
  $ids = array_values(array_unique(array_map('intval', is_array($body['ids'] ?? null) ? $body['ids'] : [])));
  if (count($ids) > 20) icc_json(['error' => 'La ruta puede tener como mucho 20 pasos'], 400);
  $db->beginTransaction();
  $db->exec('UPDATE ficheros SET ruta_paso = NULL WHERE ruta_paso IS NOT NULL');
  $st = $db->prepare('UPDATE ficheros SET ruta_paso = ? WHERE id = ?');
  foreach ($ids as $i => $id) $st->execute([$i + 1, $id]);
  $db->commit();
  icc_json(['ok' => true, 'pasos' => count($ids)]);
}

icc_json(['error' => 'Acción no válida'], 404);
