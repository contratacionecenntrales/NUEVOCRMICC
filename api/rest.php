<?php
/**
 * LABS COMMAND CENTER 360™ · Lectura y escritura de tablas
 *
 * Entiende el mismo lenguaje de consultas que el panel usaba con Supabase
 * (select=, order=, limit=, columna=eq.valor, or=(...)), para que el panel no
 * tenga que cambiar, y aplica en cada operación las reglas de esquema.php.
 */
defined('LABS') || exit;

/* ---------------------------------------------------------------------------
   CONVERSIÓN DE TIPOS · de MySQL al panel y del panel a MySQL
   ------------------------------------------------------------------------- */
function labs_sale($tipo, $v)
{
    if ($v === null) {
        return null;
    }
    switch ($tipo) {
        case 'i':
            return (int) $v;
        case 'n':
            return 0 + $v;
        case 'b':
            return (bool) (int) $v;
        case 'j':
            $d = json_decode($v, true);
            return json_last_error() === JSON_ERROR_NONE ? labs_json_objeto($d) : null;
        case 's':
            $d = DateTime::createFromFormat('Y-m-d H:i:s.u', strlen($v) === 19 ? $v . '.000000' : $v, new DateTimeZone('UTC'));
            return $d ? $d->format('Y-m-d\TH:i:s.uP') : $v;
        default:
            return (string) $v;
    }
}

/** Un objeto JSON vacío tiene que salir como {} y no como []. */
function labs_json_objeto($d)
{
    if (is_array($d)) {
        if ($d === array()) {
            return new stdClass();
        }
        $lista = array_keys($d) === range(0, count($d) - 1);
        foreach ($d as $k => $x) {
            if (is_array($x)) {
                $d[$k] = $x === array() ? array() : labs_json_objeto($x);
            }
        }
        return $lista ? $d : (object) $d;
    }
    return $d;
}

function labs_entra($tabla, $col, $tipo, $v)
{
    if ($v === null) {
        return null;
    }
    $mal = function () use ($tabla, $col) {
        throw new ErrorApi('Valor no válido para «' . $col . '».', 400, '22P02');
    };
    switch ($tipo) {
        case 'i':
            if (is_bool($v) || !is_numeric($v) || (float) $v != (int) $v) {
                $mal();
            }
            return (int) $v;
        case 'n':
            if (is_bool($v) || !is_numeric($v)) {
                $mal();
            }
            return 0 + $v;
        case 'b':
            if (is_bool($v)) {
                return $v;
            }
            if ($v === 'true' || $v === 1 || $v === '1') {
                return true;
            }
            if ($v === 'false' || $v === 0 || $v === '0') {
                return false;
            }
            $mal();
            // no llega
        case 'j':
            if (is_string($v)) {
                json_decode($v);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    $mal();
                }
                return json_decode($v, true);
            }
            return json_decode(json_encode($v), true);
        case 's':
            if (!is_string($v)) {
                $mal();
            }
            try {
                $d = new DateTime($v);
            } catch (Exception $e) {
                $mal();
            }
            $d->setTimezone(new DateTimeZone('UTC'));
            return $d->format('Y-m-d H:i:s.u');
        case 'd':
            if (!is_string($v) || !preg_match('/^\d{4}-\d{2}-\d{2}/', $v)) {
                $mal();
            }
            return substr($v, 0, 10);
        case 'u':
            if (!is_string($v) || ($v !== '' && !labs_es_uuid($v))) {
                $mal();
            }
            return $v === '' ? null : strtolower($v);
        default:
            if (is_array($v) || is_object($v)) {
                $mal();
            }
            return is_bool($v) ? ($v ? 'true' : 'false') : (string) $v;
    }
}

/** Valor de PHP listo para guardar en la columna. */
function labs_a_bd($tipo, $v)
{
    if ($v === null) {
        return null;
    }
    if ($tipo === 'j') {
        return json_encode($v === array() ? new stdClass() : $v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    if ($tipo === 'b') {
        return $v ? 1 : 0;
    }
    return $v;
}

/** Fila leída de MySQL → fila con los tipos de PHP (para reglas y disparadores). */
function labs_fila_php($def, $f)
{
    $out = array();
    foreach ($def['cols'] as $c => $d) {
        if (!array_key_exists($c, $f)) {
            continue;
        }
        $v = $f[$c];
        if ($v === null) {
            $out[$c] = null;
        } elseif ($d[0] === 'b') {
            $out[$c] = (bool) (int) $v;
        } elseif ($d[0] === 'j') {
            $out[$c] = json_decode($v, true);
        } elseif ($d[0] === 'i') {
            $out[$c] = (int) $v;
        } elseif ($d[0] === 'n') {
            $out[$c] = 0 + $v;
        } elseif ($d[0] === 's' && strlen($v) === 19) {
            $out[$c] = $v . '.000000';
        } else {
            $out[$c] = (string) $v;
        }
    }
    return $out;
}

/** Fila de PHP → la que ve el panel. */
function labs_fila_salida($def, $f, $cols)
{
    $out = array();
    foreach ($cols as $c) {
        $tipo = $def['cols'][$c][0];
        $v = array_key_exists($c, $f) ? $f[$c] : null;
        if ($v !== null && $tipo === 'j' && !is_string($v)) {
            $v = json_encode($v);
        }
        if ($v !== null && $tipo === 'b' && is_bool($v)) {
            $v = $v ? 1 : 0;
        }
        $out[$c] = labs_sale($tipo, $v);
    }
    return $out;
}

/* ---------------------------------------------------------------------------
   LECTURA DE LA CONSULTA (?select=*&order=...&col=eq.valor)
   ------------------------------------------------------------------------- */
function labs_parse_query($qs)
{
    $pares = array();
    if ($qs === '' || $qs === null) {
        return $pares;
    }
    foreach (explode('&', $qs) as $trozo) {
        if ($trozo === '') {
            continue;
        }
        $p = strpos($trozo, '=');
        $k = rawurldecode($p === false ? $trozo : substr($trozo, 0, $p));
        $v = $p === false ? '' : rawurldecode(substr($trozo, $p + 1));
        $pares[] = array($k, $v);
    }
    return $pares;
}

function labs_col_valida($def, $col)
{
    if (!isset($def['cols'][$col])) {
        throw new ErrorApi('No existe la columna «' . $col . '».', 400, '42703');
    }
    return $col;
}

/** Una condición «col.op.valor» o «col=op.valor» → SQL. */
function labs_condicion($tabla, $def, $col, $expr, &$params)
{
    labs_col_valida($def, $col);
    $negar = false;
    if (strpos($expr, 'not.') === 0) {
        $negar = true;
        $expr = substr($expr, 4);
    }
    $p = strpos($expr, '.');
    if ($p === false) {
        throw new ErrorApi('Filtro no válido: «' . $col . '».', 400, 'PGRST100');
    }
    $op = substr($expr, 0, $p);
    $val = substr($expr, $p + 1);
    $tipo = $def['cols'][$col][0];
    $c = '`' . $col . '`';
    $ops = array('eq' => '=', 'neq' => '<>', 'gt' => '>', 'gte' => '>=', 'lt' => '<', 'lte' => '<=');

    if (isset($ops[$op])) {
        $params[] = labs_a_bd($tipo, labs_entra($tabla, $col, $tipo, $val));
        $sql = $c . ' ' . $ops[$op] . ' ?';
    } elseif ($op === 'like' || $op === 'ilike') {
        $params[] = str_replace('*', '%', $val);
        $sql = $op === 'like' ? $c . ' LIKE BINARY ?' : 'LOWER(' . $c . ') LIKE LOWER(?)';
    } elseif ($op === 'is') {
        $mapa = array('null' => 'IS NULL', 'true' => '= 1', 'false' => '= 0');
        if (!isset($mapa[$val])) {
            throw new ErrorApi('Filtro «is» no válido.', 400, 'PGRST100');
        }
        $sql = $c . ' ' . $mapa[$val];
    } elseif ($op === 'in') {
        if (!preg_match('/^\((.*)\)$/s', $val, $m)) {
            throw new ErrorApi('Filtro «in» no válido.', 400, 'PGRST100');
        }
        $items = $m[1] === '' ? array() : str_getcsv($m[1]);
        if (!$items) {
            $sql = '1=0';
        } else {
            $marcas = array();
            foreach ($items as $it) {
                $params[] = labs_a_bd($tipo, labs_entra($tabla, $col, $tipo, $it));
                $marcas[] = '?';
            }
            $sql = $c . ' IN (' . implode(',', $marcas) . ')';
        }
    } else {
        throw new ErrorApi('Operador no admitido: «' . $op . '».', 400, 'PGRST100');
    }
    return $negar ? 'NOT (' . $sql . ')' : $sql;
}

/** or=(a.eq.1,b.eq.2) → (a = ? OR b = ?) */
function labs_condicion_or($tabla, $def, $val, &$params)
{
    if (!preg_match('/^\((.*)\)$/s', $val, $m)) {
        throw new ErrorApi('Filtro «or» no válido.', 400, 'PGRST100');
    }
    $partes = array();
    $nivel = 0;
    $actual = '';
    foreach (str_split($m[1]) as $ch) {
        if ($ch === '(') {
            $nivel++;
        }
        if ($ch === ')') {
            $nivel--;
        }
        if ($ch === ',' && $nivel === 0) {
            $partes[] = $actual;
            $actual = '';
            continue;
        }
        $actual .= $ch;
    }
    if ($actual !== '') {
        $partes[] = $actual;
    }
    $sql = array();
    foreach ($partes as $parte) {
        $p = strpos($parte, '.');
        if ($p === false) {
            throw new ErrorApi('Filtro «or» no válido.', 400, 'PGRST100');
        }
        $sql[] = labs_condicion($tabla, $def, substr($parte, 0, $p), substr($parte, $p + 1), $params);
    }
    return '(' . implode(' OR ', $sql) . ')';
}

/** Separa la consulta en filtros, columnas, orden y límites. */
function labs_consulta($tabla, $def, $pares)
{
    $r = array('where' => array(), 'params' => array(), 'cols' => array_keys($def['cols']),
        'order' => array(), 'limit' => null, 'offset' => null, 'on_conflict' => null, 'columns' => null);
    foreach ($pares as $par) {
        list($k, $v) = $par;
        if ($k === 'select') {
            if (trim($v) !== '*' && trim($v) !== '') {
                $r['cols'] = array();
                foreach (explode(',', $v) as $c) {
                    $c = trim($c);
                    if ($c === '*') {
                        $r['cols'] = array_merge($r['cols'], array_keys($def['cols']));
                        continue;
                    }
                    $r['cols'][] = labs_col_valida($def, $c);
                }
                $r['cols'] = array_values(array_unique($r['cols']));
            }
        } elseif ($k === 'order') {
            foreach (explode(',', $v) as $o) {
                $t = explode('.', trim($o));
                $c = labs_col_valida($def, $t[0]);
                $dir = (isset($t[1]) && $t[1] === 'desc') ? 'DESC' : 'ASC';
                $nulls = in_array('nullsfirst', $t, true) ? 'first' : (in_array('nullslast', $t, true) ? 'last' : null);
                // Como en Postgres: los vacíos van al final en ASC y al principio en DESC.
                if ($nulls === null) {
                    $nulls = $dir === 'ASC' ? 'last' : 'first';
                }
                $r['order'][] = '(`' . $c . '` IS NULL) ' . ($nulls === 'first' ? 'DESC' : 'ASC') . ', `' . $c . '` ' . $dir;
            }
        } elseif ($k === 'limit') {
            $r['limit'] = max(0, (int) $v);
        } elseif ($k === 'offset') {
            $r['offset'] = max(0, (int) $v);
        } elseif ($k === 'on_conflict') {
            $r['on_conflict'] = labs_col_valida($def, $v);
        } elseif ($k === 'columns') {
            $r['columns'] = $v;
        } elseif ($k === 'or') {
            $r['where'][] = labs_condicion_or($tabla, $def, $v, $r['params']);
        } elseif ($k === 'and') {
            $tmp = labs_condicion_or($tabla, $def, $v, $r['params']);
            $r['where'][] = str_replace(' OR ', ' AND ', $tmp);
        } else {
            $r['where'][] = labs_condicion($tabla, $def, $k, $v, $r['params']);
        }
    }
    return $r;
}

/* ---------------------------------------------------------------------------
   OPERACIONES
   ------------------------------------------------------------------------- */
function labs_tabla($nombre)
{
    $T = labs_tablas();
    if (!isset($T[$nombre])) {
        throw new ErrorApi('No existe la tabla «' . $nombre . '».', 404, '42P01');
    }
    return $T[$nombre];
}

function labs_exige_op($tabla, $def, $op)
{
    if (!in_array($op, $def['ops'], true)) {
        throw new ErrorApi('No tienes permiso para esta operación sobre «' . $tabla . '».', 403, '42501');
    }
}

function labs_regla($def, $nombre)
{
    if (!isset($def[$nombre])) {
        return '1=0';
    }
    return '(' . call_user_func($def[$nombre]) . ')';
}

function labs_desde($tabla, $def)
{
    return isset($def['fuente']) ? $def['fuente'] : '`' . $tabla . '`';
}

/** GET: filas visibles. */
function labs_rest_leer($tabla, $pares)
{
    $def = labs_tabla($tabla);
    labs_exige_op($tabla, $def, 'select');
    $q = labs_consulta($tabla, $def, $pares);
    $where = array_merge(array(labs_regla($def, 'leer')), $q['where']);
    $sql = 'SELECT * FROM ' . labs_desde($tabla, $def) . ' WHERE ' . implode(' AND ', $where);
    if ($q['order']) {
        $sql .= ' ORDER BY ' . implode(', ', $q['order']);
    }
    if ($q['limit'] !== null) {
        $sql .= ' LIMIT ' . (int) $q['limit'];
        if ($q['offset'] !== null) {
            $sql .= ' OFFSET ' . (int) $q['offset'];
        }
    } elseif ($q['offset'] !== null) {
        $sql .= ' LIMIT 18446744073709551615 OFFSET ' . (int) $q['offset'];
    }
    $out = array();
    foreach (labs_q($sql, $q['params'])->fetchAll() as $f) {
        $out[] = labs_fila_salida($def, labs_fila_php($def, $f), $q['cols']);
    }
    return $out;
}

/** Comprueba que el cuerpo solo trae columnas que existen. */
function labs_cuerpo_columnas($tabla, $def, $fila)
{
    if (!is_array($fila) || (array_keys($fila) === range(0, count($fila) - 1) && $fila)) {
        throw new ErrorApi('El cuerpo de la petición no es válido.', 400, 'PGRST102');
    }
    foreach ($fila as $k => $v) {
        if (!isset($def['cols'][$k])) {
            throw new ErrorApi("No existe la columna «" . $k . "» en «" . $tabla . "».", 400, 'PGRST204');
        }
    }
}

function labs_valida($tabla, $def, $f)
{
    if (isset($def['valida'])) {
        $msg = call_user_func($def['valida'], $f);
        if ($msg) {
            labs_falla_check($tabla, $msg);
        }
    }
}

/** Inserta una fila ya comprobada. Devuelve la fila como la guarda MySQL. */
function labs_inserta_fila($tabla, $def, $entrada, $de_servidor = false)
{
    labs_cuerpo_columnas($tabla, $def, $entrada);
    $n = array();
    foreach ($def['cols'] as $c => $d) {
        if (array_key_exists($c, $entrada)) {
            $n[$c] = labs_entra($tabla, $c, $d[0], $entrada[$c]);
        } elseif (array_key_exists(1, $d)) {
            $n[$c] = $d[1] === '@ahora' ? labs_ahora() : ($d[1] === '@hoy' ? labs_hoy() : $d[1]);
        } else {
            $n[$c] = null;
        }
    }
    if ($def['gen'] === 'uuid' && empty($n[$def['pk']])) {
        $n[$def['pk']] = labs_uuid();
    }
    if ($def['gen'] === 'auto') {
        $n[$def['pk']] = null;   // la numeración la pone MySQL
    }
    if (isset($def['antes_crear'])) {
        $fn = $def['antes_crear'];
        $fn($n);
    }
    if (!$de_servidor) {
        if (!isset($def['crear']) || !call_user_func($def['crear'], $n)) {
            throw new ErrorApi('La nueva fila no cumple las reglas de seguridad de «' . $tabla . '».', 403, '42501');
        }
    }
    labs_valida($tabla, $def, $n);

    $cols = array();
    $vals = array();
    foreach ($n as $c => $v) {
        if ($def['gen'] === 'auto' && $c === $def['pk']) {
            continue;
        }
        $cols[] = '`' . $c . '`';
        $vals[] = labs_a_bd($def['cols'][$c][0], $v);
    }
    labs_q('INSERT INTO `' . $tabla . '` (' . implode(',', $cols) . ') VALUES (' . rtrim(str_repeat('?,', count($cols)), ',') . ')', $vals);
    if ($def['gen'] === 'auto') {
        $n[$def['pk']] = (int) labs_db()->lastInsertId();
    }
    $fila = labs_fila_php($def, labs_fila('SELECT * FROM `' . $tabla . '` WHERE `' . $def['pk'] . '` = ?', array($n[$def['pk']])));
    if (isset($def['despues_crear'])) {
        $fn = $def['despues_crear'];
        $fn($fila);
    }
    return $fila;
}

/** Aplica cambios a una fila ya leída. */
function labs_actualiza_fila($tabla, $def, $vieja, $cambios, $de_servidor = false)
{
    $n = $vieja;
    foreach ($cambios as $c => $v) {
        $n[$c] = labs_entra($tabla, $c, $def['cols'][$c][0], $v);
    }
    if (!empty($def['actualizado'])) {
        $n['actualizado'] = labs_ahora();
    }
    if (isset($def['antes_editar'])) {
        $fn = $def['antes_editar'];
        $fn($vieja, $n, array_keys($cambios));
    }
    if (!$de_servidor) {
        $ok = isset($def['editar_ok']) ? call_user_func($def['editar_ok'], $n) : false;
        if (!$ok) {
            throw new ErrorApi('La fila modificada no cumple las reglas de seguridad de «' . $tabla . '».', 403, '42501');
        }
    }
    labs_valida($tabla, $def, $n);

    $sets = array();
    $vals = array();
    foreach ($n as $c => $v) {
        if ($c === $def['pk']) {
            continue;
        }
        $antes = $vieja[$c];
        $igual = $def['cols'][$c][0] === 'j' ? labs_json_igual($antes, $v) : $antes === $v;
        if (!$igual) {
            $sets[] = '`' . $c . '` = ?';
            $vals[] = labs_a_bd($def['cols'][$c][0], $v);
        }
    }
    if ($n[$def['pk']] !== $vieja[$def['pk']]) {
        throw new ErrorApi('La clave de la fila no se puede cambiar.', 400, '42501');
    }
    if ($sets) {
        $vals[] = $vieja[$def['pk']];
        labs_q('UPDATE `' . $tabla . '` SET ' . implode(', ', $sets) . ' WHERE `' . $def['pk'] . '` = ?', $vals);
    }
    $fila = labs_fila_php($def, labs_fila('SELECT * FROM `' . $tabla . '` WHERE `' . $def['pk'] . '` = ?', array($vieja[$def['pk']])));
    if (isset($def['despues_editar'])) {
        $fn = $def['despues_editar'];
        $fn($vieja, $fila);
    }
    return $fila;
}

function labs_borra_fila($tabla, $def, $vieja)
{
    if (isset($def['antes_borrar'])) {
        call_user_func($def['antes_borrar'], $vieja);
    }
    labs_q('DELETE FROM `' . $tabla . '` WHERE `' . $def['pk'] . '` = ?', array($vieja[$def['pk']]));
    if (isset($def['despues_borrar'])) {
        call_user_func($def['despues_borrar'], $vieja);
    }
}

/** Filas visibles para la vista de salida (lo que devuelve return=representation). */
function labs_representa($tabla, $def, $filas, $cols)
{
    $out = array();
    foreach ($filas as $f) {
        $ve = labs_fila('SELECT 1 FROM `' . $tabla . '` WHERE `' . $def['pk'] . '` = ? AND ' . labs_regla($def, 'leer'),
            array($f[$def['pk']]));
        if ($ve) {
            $out[] = labs_fila_salida($def, $f, $cols);
        }
    }
    return $out;
}

function labs_prefer($clave)
{
    $p = (string) labs_cabecera('Prefer');
    return stripos($p, $clave) !== false;
}

/** POST: alta de una o varias filas (con «upsert» si viene on_conflict). */
function labs_rest_crear($tabla, $pares, $cuerpo)
{
    $def = labs_tabla($tabla);
    labs_exige_op($tabla, $def, 'insert');
    $q = labs_consulta($tabla, $def, $pares);
    $filas = (is_array($cuerpo) && $cuerpo && array_keys($cuerpo) === range(0, count($cuerpo) - 1)) ? $cuerpo : array($cuerpo);
    $fusionar = labs_prefer('merge-duplicates');
    $hechas = array();
    foreach ($filas as $entrada) {
        labs_cuerpo_columnas($tabla, $def, $entrada);
        $conflicto = $q['on_conflict'] ?: $def['pk'];
        $existente = null;
        if ($fusionar && array_key_exists($conflicto, $entrada)) {
            $tipo = $def['cols'][$conflicto][0];
            $f = labs_fila('SELECT * FROM `' . $tabla . '` WHERE `' . $conflicto . '` = ? FOR UPDATE',
                array(labs_a_bd($tipo, labs_entra($tabla, $conflicto, $tipo, $entrada[$conflicto]))));
            $existente = $f ? labs_fila_php($def, $f) : null;
        }
        if ($existente) {
            labs_exige_op($tabla, $def, 'update');
            $ve = labs_fila('SELECT 1 FROM `' . $tabla . '` WHERE `' . $def['pk'] . '` = ? AND ' . labs_regla($def, 'editar'),
                array($existente[$def['pk']]));
            if (!$ve) {
                throw new ErrorApi('La fila no cumple las reglas de seguridad de «' . $tabla . '».', 403, '42501');
            }
            $hechas[] = labs_actualiza_fila($tabla, $def, $existente, $entrada);
        } else {
            $hechas[] = labs_inserta_fila($tabla, $def, $entrada);
        }
    }
    if (isset($def['al_final'])) {
        call_user_func($def['al_final']);
    }
    return labs_prefer('return=representation') ? labs_representa($tabla, $def, $hechas, $q['cols']) : null;
}

/** PATCH: cambios en las filas que cumplen el filtro y las reglas. */
function labs_rest_editar($tabla, $pares, $cambios)
{
    $def = labs_tabla($tabla);
    labs_exige_op($tabla, $def, 'update');
    labs_cuerpo_columnas($tabla, $def, $cambios);
    if (isset($def['upd_cols'])) {
        foreach (array_keys($cambios) as $c) {
            if (!in_array($c, $def['upd_cols'], true)) {
                throw new ErrorApi('No tienes permiso para cambiar «' . $c . '» en «' . $tabla . '».', 403, '42501');
            }
        }
    }
    $q = labs_consulta($tabla, $def, $pares);
    $where = array_merge(array(labs_regla($def, 'editar')), $q['where']);
    $viejas = labs_q('SELECT * FROM `' . $tabla . '` WHERE ' . implode(' AND ', $where) . ' FOR UPDATE', $q['params'])->fetchAll();
    $hechas = array();
    foreach ($viejas as $v) {
        $hechas[] = labs_actualiza_fila($tabla, $def, labs_fila_php($def, $v), $cambios);
    }
    if (isset($def['al_final']) && $hechas) {
        call_user_func($def['al_final']);
    }
    return labs_prefer('return=representation') ? labs_representa($tabla, $def, $hechas, $q['cols']) : null;
}

/** DELETE. */
function labs_rest_borrar($tabla, $pares)
{
    $def = labs_tabla($tabla);
    labs_exige_op($tabla, $def, 'delete');
    $q = labs_consulta($tabla, $def, $pares);
    if (!$q['where']) {
        throw new ErrorApi('Para borrar hace falta un filtro.', 400, '21000');
    }
    $where = array_merge(array(labs_regla($def, 'borrar')), $q['where']);
    $viejas = labs_q('SELECT * FROM `' . $tabla . '` WHERE ' . implode(' AND ', $where) . ' FOR UPDATE', $q['params'])->fetchAll();
    $hechas = array();
    foreach ($viejas as $v) {
        $f = labs_fila_php($def, $v);
        labs_borra_fila($tabla, $def, $f);
        $hechas[] = labs_fila_salida($def, $f, $q['cols']);
    }
    if (isset($def['al_final']) && $hechas) {
        call_user_func($def['al_final']);
    }
    return labs_prefer('return=representation') ? $hechas : null;
}
