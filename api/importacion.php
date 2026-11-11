<?php
/**
 * LABS COMMAND CENTER 360™ · Importación de contactos
 *
 * - Desde el panel: Contactos → Importar CSV (rpc importa_contactos).
 * - Al desplegar: si existe api/importacion-pendiente.php (devuelve las filas
 *   del CSV), se importa una sola vez la primera vez que alguien entra y el
 *   archivo se borra. Así se cargan contactos sin tocar phpMyAdmin.
 *
 * Acepta las columnas de la exportación de GoHighLevel / LeadConnector
 * ("Contact Id", "First Name", "Last Name", "Phone", "Email", "Business Name",
 * "Created", "Last Activity", "Tags") y sus equivalentes en español.
 * No duplica: reconoce el contacto por su id de origen, su correo o su teléfono.
 */
defined('LABS') || exit;

/** Etiqueta legible a partir de las de GoHighLevel ("[sistema]cita_agendada" → "Cita agendada"). */
function labs_etiqueta_limpia($t)
{
    $t = trim((string) $t);
    $mapa = array(
        'contacto_nuevo' => 'Contacto nuevo', 'cita_agendada' => 'Cita agendada',
        'cita_confirmada_por_usuario' => 'Cita confirmada', 'contacto_en_seguimiento' => 'En seguimiento',
        'caso_en_revision' => 'Soporte: caso en revisión', '_contactos_de_prueba' => 'Prueba',
        'contactos_de_prueba' => 'Prueba', 'contactado_por_ia' => 'Contactado por IA',
        'asistio a la asesoria gratuita' => 'Asistió a la asesoría gratuita',
    );
    $base = mb_strtolower(trim(preg_replace('/^\[[^\]]*\]\s*/u', '', $t)));
    if (isset($mapa[$base])) {
        return $mapa[$base];
    }
    $base = trim(str_replace('_', ' ', $base));
    return $base === '' ? '' : mb_strtoupper(mb_substr($base, 0, 1)) . mb_substr($base, 1);
}

/** Estado del embudo deducido de las etiquetas de origen. */
function labs_estado_por_etiquetas($etq)
{
    $t = mb_strtolower(implode(' ', $etq));
    if (strpos($t, 'asistió') !== false || strpos($t, 'cita') !== false) {
        return 'Cualificado';
    }
    if (strpos($t, 'seguimiento') !== false || strpos($t, 'contactado') !== false || strpos($t, 'soporte') !== false) {
        return 'Contactado';
    }
    return 'Nuevo';
}

/** Fecha de la exportación (ISO con zona, o "Oct 29 2026 06:59 PM" en hora de Madrid) → UTC para MySQL. */
function labs_fecha_importada($v)
{
    $v = trim((string) $v);
    if ($v === '') {
        return null;
    }
    try {
        $d = new DateTime($v, new DateTimeZone('Europe/Madrid'));
    } catch (Exception $e) {
        $d = DateTime::createFromFormat('M d Y h:i A', $v, new DateTimeZone('Europe/Madrid'));
        if (!$d) {
            return null;
        }
    }
    $d->setTimezone(new DateTimeZone('UTC'));
    if ((int) $d->format('Y') < 2000 || (int) $d->format('Y') > 2100) {
        return null;
    }
    return $d->format('Y-m-d H:i:s.u');
}

/** "+34600000000" → ['+34', '600000000']. */
function labs_telefono_partido($tel)
{
    $tel = preg_replace('/[^\d+]/', '', (string) $tel);
    if ($tel === '') {
        return array('+34', '');
    }
    if ($tel[0] !== '+') {
        if (strpos($tel, '0034') === 0) {
            $tel = '+' . substr($tel, 2);
        } else {
            return array('+34', $tel);
        }
    }
    foreach (array('+34', '+351', '+33', '+44', '+49', '+39', '+1', '+52', '+54', '+57', '+58', '+51', '+56', '+593', '+86', '+212') as $p) {
        if (strpos($tel, $p) === 0) {
            return array($p, substr($tel, strlen($p)));
        }
    }
    return array(substr($tel, 0, 3), substr($tel, 3));
}

/** Texto comparable: minúsculas, sin tildes ni signos. */
function labs_norma_texto($t)
{
    $t = mb_strtolower(trim((string) $t));
    $t = strtr($t, array('á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', 'à' => 'a', 'è' => 'e', 'ò' => 'o', 'ç' => 'c'));
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $t));
}

/**
 * ¿El contacto existente $c es la misma empresa que la fila nueva?
 * 2 = mismo nombre exacto · 1 = compatible (sin empresa, o una contiene a la otra) · 0 = otra empresa.
 */
function labs_misma_empresa($c, $nombre, $empresa)
{
    $n = labs_norma_texto($nombre);
    $e = labs_norma_texto($empresa);
    if ($n !== '' && labs_norma_texto($c['nombre']) === $n) {
        return 2;
    }
    $ce = labs_norma_texto($c['empresa']);
    if ($ce === '' || $e === '') {
        return 1;
    }
    return ($ce === $e || strpos($ce, $e) !== false || strpos($e, $ce) !== false) ? 1 : 0;
}

/** Toma un valor de la fila por cualquiera de sus nombres de columna. */
function labs_col($fila, $nombres)
{
    foreach ($nombres as $n) {
        foreach ($fila as $k => $v) {
            if (mb_strtolower(trim((string) $k)) === $n) {
                return trim((string) $v);
            }
        }
    }
    return '';
}

/**
 * Importa filas (arrays asociativos con las cabeceras del CSV).
 * Devuelve ['creados' => n, 'actualizados' => n, 'omitidos' => n, 'errores' => [...]].
 */
function labs_importa_contactos($filas, $gestor_id, $origen = 'Importación CSV', $autor = null)
{
    $res = array('creados' => 0, 'actualizados' => 0, 'omitidos' => 0, 'errores' => array());
    $ahora = labs_ahora();
    $nuevos = array();
    foreach ($filas as $i => $f) {
        if (!is_array($f)) {
            $res['omitidos']++;
            continue;
        }
        $ref = mb_substr(labs_col($f, array('contact id', 'id', 'id contacto', 'ref_externa')), 0, 64);
        $nom = labs_col($f, array('first name', 'nombre'));
        $ape = labs_col($f, array('last name', 'apellidos', 'apellido'));
        $email = mb_strtolower(labs_col($f, array('email', 'correo', 'correo electrónico', 'e-mail')));
        $empresa = labs_col($f, array('business name', 'company name', 'empresa', 'company'));
        list($prefijo, $tel) = labs_telefono_partido(labs_col($f, array('phone', 'teléfono', 'telefono', 'móvil', 'movil')));
        $creado = labs_fecha_importada(labs_col($f, array('created', 'creado', 'fecha alta', 'date created')));
        $actividad = labs_fecha_importada(labs_col($f, array('last activity', 'última actividad', 'ultima actividad')));
        $tags_raw = labs_col($f, array('tags', 'etiquetas'));
        // Listas de empresas (p. ej. de Google Places): dirección y localidad.
        $direccion = labs_col($f, array('dirección', 'direccion', 'address', 'domicilio'));
        $localidad = labs_col($f, array('localidad', 'ciudad', 'municipio', 'city', 'población', 'poblacion'));
        $sector = labs_col($f, array('sector', 'categoría', 'categoria', 'actividad', 'tipo de negocio'));
        if ($localidad !== '') {
            $tags_raw = trim($tags_raw . ', ' . $localidad, ', ');
        }
        if ($sector === '' && function_exists('labs_ventas_sector_de')) {
            $sector = labs_ventas_sector_de($nom . ' ' . $ape . ' ' . labs_col($f, array('business name', 'company name', 'empresa', 'company')) . ' ' . $tags_raw);
        }
        if ($empresa === '' && $direccion !== '' && $ape === '') {
            // Lista de negocios (nombre + dirección): el nombre es también la empresa.
            $empresa = $nom;
        }
        $espec = trim(($direccion !== '' ? 'Dirección: ' . $direccion . ($localidad !== '' ? ', ' . $localidad : '') : ($localidad !== '' ? 'Localidad: ' . $localidad : '')));
        $etq = array();
        foreach (preg_split('/\s*,\s*/', $tags_raw) as $t) {
            $l = labs_etiqueta_limpia($t);
            if ($l !== '' && !in_array($l, $etq, true)) {
                $etq[] = $l;
            }
        }
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $email = '';
        }
        $nombre = trim(preg_replace('/\s+/u', ' ', $nom . ' ' . $ape));
        if (mb_strlen($nombre) < 2) {
            $nombre = $empresa !== '' ? $empresa : ($email !== '' ? $email : ($tel !== '' ? $prefijo . ' ' . $tel : ''));
        }
        if ($nombre === '' || ($email === '' && $tel === '' && $empresa === '' && mb_strlen($nom . $ape) < 2)) {
            $res['omitidos']++;
            continue;
        }
        $nombre = mb_substr($nombre, 0, 120);

        // ¿Ya existe? Por id de origen, después por correo y por teléfono.
        $ya = null;
        if ($ref !== '') {
            $ya = labs_fila('SELECT * FROM contactos WHERE ref_externa = ? FOR UPDATE', array($ref));
        }
        if (!$ya && $email !== '') {
            $ya = labs_fila('SELECT * FROM contactos WHERE email = ? LIMIT 1 FOR UPDATE', array($email));
        }
        if (!$ya && $tel !== '') {
            // Mismo teléfono: es el mismo contacto salvo que sea otra empresa (dos oficinas con centralita común).
            foreach (labs_q('SELECT * FROM contactos WHERE telefono = ? AND prefijo = ? ORDER BY id FOR UPDATE', array($tel, $prefijo))->fetchAll() as $cand) {
                if (in_array((int) $cand['id'], $nuevos, true) && labs_misma_empresa($cand, $nombre, $empresa) !== 2) {
                    continue;
                }
                if (labs_misma_empresa($cand, $nombre, $empresa)) {
                    $ya = $cand;
                    break;
                }
            }
        }
        if (!$ya && $email === '' && $tel === '' && $empresa !== '') {
            // Sin correo ni teléfono: la misma empresa con el mismo nombre es el mismo contacto.
            $ya = labs_fila('SELECT * FROM contactos WHERE nombre = ? AND (empresa = ? OR empresa = \'\') LIMIT 1 FOR UPDATE', array($nombre, mb_substr($empresa, 0, 200)));
        }

        if ($ya) {
            // Solo completa lo que falta y suma etiquetas: nunca pisa lo que el equipo ya ha escrito.
            $etq_prev = array_filter(array_map('trim', explode(',', (string) $ya['etiquetas'])));
            $todas = array_values(array_unique(array_merge($etq_prev, $etq)));
            $set = array('empresa' => $ya['empresa'] !== '' ? $ya['empresa'] : mb_substr($empresa, 0, 200),
                'email' => $ya['email'] !== '' ? $ya['email'] : $email,
                'telefono' => $ya['telefono'] !== '' ? $ya['telefono'] : $tel,
                'prefijo' => $ya['telefono'] !== '' ? $ya['prefijo'] : $prefijo,
                'etiquetas' => mb_substr(implode(', ', $todas), 0, 500),
                'especificaciones' => trim((string) $ya['especificaciones']) !== '' ? $ya['especificaciones'] : $espec,
                'sector' => (string) ($ya['sector'] ?? '') !== '' ? $ya['sector'] : mb_substr($sector, 0, 60),
                'ref_externa' => $ya['ref_externa'] ?: ($ref !== '' ? $ref : null),
                'ultima_actividad' => ($actividad && (!$ya['ultima_actividad'] || $actividad > $ya['ultima_actividad'])) ? $actividad : $ya['ultima_actividad']);
            $cambia = false;
            foreach ($set as $k => $v) {
                if ((string) $v !== (string) ($ya[$k] ?? (string) $v)) {
                    $cambia = true;
                }
            }
            if ($cambia) {
                labs_q('UPDATE contactos SET empresa = ?, email = ?, telefono = ?, prefijo = ?, etiquetas = ?, especificaciones = ?, ref_externa = ?, ultima_actividad = ?, actualizado = ?' .
                    (array_key_exists('sector', $ya) ? ', sector = ?' : '') . ' WHERE id = ?',
                    array_merge(array($set['empresa'], $set['email'], $set['telefono'], $set['prefijo'], $set['etiquetas'], $set['especificaciones'], $set['ref_externa'], $set['ultima_actividad'], $ahora),
                        array_key_exists('sector', $ya) ? array($set['sector']) : array(), array($ya['id'])));
                labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array(
                    $ya['id'], $autor, 'evento', 'Ficha completada con ' . $origen . ($espec !== '' ? ' · ' . $espec : '') . '.', $ahora));
                $res['actualizados']++;
            } else {
                $res['omitidos']++;
            }
            continue;
        }

        $est = labs_estado_por_etiquetas($etq);
        $tiene_fase = labs_columna_existe(labs_db(), 'contactos', 'fase');
        $tiene_sector = labs_columna_existe(labs_db(), 'contactos', 'sector');
        labs_q('INSERT INTO contactos (tipo, nombre, empresa, email, prefijo, telefono, origen, estado, especificaciones, gestor_id,
                  etiquetas, ref_externa, ultima_actividad, creado, actualizado' . ($tiene_fase ? ', fase, fase_desde' : '') . ($tiene_sector ? ', sector' : '') . ')
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?' . ($tiene_fase ? ',?,?' : '') . ($tiene_sector ? ',?' : '') . ')', array_merge(array(
            'lead', $nombre, mb_substr($empresa, 0, 200), $email, $prefijo, mb_substr($tel, 0, 40), mb_substr($origen, 0, 120),
            $est, mb_substr($espec, 0, 2000), $gestor_id, mb_substr(implode(', ', $etq), 0, 500), $ref !== '' ? $ref : null,
            $actividad, $creado ?: $ahora, $actividad ?: ($creado ?: $ahora)),
            $tiene_fase ? array(function_exists('labs_fase_de_estado') ? labs_fase_de_estado($est) : 'lead', $ahora) : array(),
            $tiene_sector ? array(mb_substr($sector, 0, 60)) : array()));
        $id = (int) labs_db()->lastInsertId();
        $nuevos[] = $id;
        labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array(
            $id, $autor, 'evento', 'Importado desde ' . $origen . '.' . ($tags_raw !== '' ? ' Etiquetas de origen: ' . mb_substr($tags_raw, 0, 400) . '.' : ''),
            $creado ?: $ahora));
        $res['creados']++;
    }
    return $res;
}

/** Importación desde el panel (administración y jefatura). */
function labs_rpc_importa_contactos($arg)
{
    $u = labs_usuario(true);
    if (!labs_puedo('contactos.crea') || !in_array(labs_mi_rol(), array('admin', 'manager'), true)) {
        throw new ErrorApi('Importar contactos lo hace administración o jefatura.', 403, 'ROL_INSUFICIENTE');
    }
    $filas = $arg('p_filas', array());
    if (!is_array($filas) || !$filas) {
        throw new ErrorApi('El archivo no tiene filas.', 400, 'P0001');
    }
    if (count($filas) > 3000) {
        throw new ErrorApi('Como mucho 3000 contactos por importación: divide el archivo.', 400, 'P0001');
    }
    $gestor = $arg('p_gestor') ?: $u['id'];
    if (!labs_fila("SELECT 1 FROM perfiles WHERE id = ? AND estado = 'Activo'", array((string) $gestor))) {
        throw new ErrorApi('La persona a la que se asignan no existe o no está activa.', 400, 'P0001');
    }
    $origen = trim((string) $arg('p_origen', '')) ?: 'Importación CSV';
    $r = labs_importa_contactos($filas, (string) $gestor, $origen, $u['id']);
    labs_anota('Contactos importados', $r['creados'] . ' nuevos, ' . $r['actualizados'] . ' completados, ' . $r['omitidos'] . ' sin cambios (' . $origen . ')');
    return $r;
}

/** Importación incluida en el despliegue: una vez, y el archivo se borra. */
function labs_importacion_pendiente()
{
    $f = __DIR__ . '/importacion-pendiente.php';
    if (!is_file($f)) {
        return;
    }
    $datos = include $f;
    if (!is_array($datos) || empty($datos['filas'])) {
        @unlink($f);
        return;
    }
    labs_q("SELECT GET_LOCK('labs_importacion', 20)");
    $huella = 'importacion.' . substr(hash('sha256', json_encode($datos['filas'])), 0, 16);
    if (!labs_ajuste($huella)) {
        $raiz = labs_fila('SELECT id FROM perfiles WHERE raiz = 1 LIMIT 1');
        $r = labs_importa_contactos($datos['filas'], $raiz ? $raiz['id'] : null, isset($datos['origen']) ? $datos['origen'] : 'Importación CSV');
        labs_pon_ajuste($huella, json_encode($r));
        labs_anota('Contactos importados al desplegar', $r['creados'] . ' nuevos, ' . $r['actualizados'] . ' completados, ' . $r['omitidos'] . ' sin cambios.', null, null);
    }
    @unlink($f);
}
