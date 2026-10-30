<?php
/**
 * LABS COMMAND CENTER 360™ · Actualizaciones automáticas de la base de datos
 *
 * Cuando una versión nueva necesita tablas o columnas nuevas, se crean aquí
 * solas la primera vez que el servidor arranca. Nadie tiene que volver a
 * importar SQL en phpMyAdmin. Cada paso se puede repetir sin romper nada.
 */
defined('LABS') || exit;

define('LABS_VERSION_ESQUEMA', 5);

function labs_columna_existe(PDO $db, $tabla, $col)
{
    $st = $db->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
    $st->execute(array($tabla, $col));
    return (bool) $st->fetchColumn();
}

function labs_migra(PDO $db)
{
    try {
        $v = (int) $db->query("SELECT valor FROM ajustes WHERE clave = 'version_esquema'")->fetchColumn();
        if ($v >= LABS_VERSION_ESQUEMA) {
            return;
        }
    } catch (PDOException $e) {
        // La tabla ajustes aún no existe.
        $v = 0;
    }
    // Sin las tablas del CRM no hay nada que actualizar (falta importar el SQL).
    $hay = $db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'perfiles'")->fetchColumn();
    if (!(int) $hay) {
        return;
    }
    $opc = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $pasos = array(
        "CREATE TABLE IF NOT EXISTS ajustes (
           clave VARCHAR(60) NOT NULL, valor TEXT NULL, PRIMARY KEY (clave)) $opc",
        // Cada entrada (buena o mala) al panel, para el Centro de Seguridad.
        "CREATE TABLE IF NOT EXISTS registro_accesos (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ts DATETIME(6) NOT NULL,
           usuario_id CHAR(36) NULL, email VARCHAR(190) NULL, ip VARCHAR(64) NULL,
           agente VARCHAR(255) NULL, resultado VARCHAR(20) NOT NULL, detalle VARCHAR(255) NULL,
           PRIMARY KEY (id), KEY registro_accesos_ts_idx (ts), KEY registro_accesos_ip_idx (ip, ts)) $opc",
        // Bloqueos temporales por IP o por cuenta.
        "CREATE TABLE IF NOT EXISTS bloqueos (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, tipo VARCHAR(10) NOT NULL, valor VARCHAR(190) NOT NULL,
           hasta DATETIME(6) NOT NULL, motivo VARCHAR(255) NOT NULL DEFAULT '', creado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), UNIQUE KEY bloqueos_uq (tipo, valor)) $opc",
        // Contadores para frenar peticiones repetidas (firma pública, avisos...).
        "CREATE TABLE IF NOT EXISTS frenos (
           clave VARCHAR(160) NOT NULL, ventana DATETIME(6) NOT NULL, contador INT NOT NULL DEFAULT 0,
           PRIMARY KEY (clave)) $opc",
        // Doble factor (código de 6 cifras de Google Authenticator y similares).
        "CREATE TABLE IF NOT EXISTS cuentas_2fa (
           usuario_id CHAR(36) NOT NULL, secreto VARCHAR(64) NOT NULL, activo TINYINT(1) NOT NULL DEFAULT 0,
           ultimo_paso BIGINT NOT NULL DEFAULT 0, recuperacion TEXT NULL,
           creado DATETIME(6) NOT NULL, activado DATETIME(6) NULL,
           PRIMARY KEY (usuario_id),
           CONSTRAINT cuentas_2fa_fk FOREIGN KEY (usuario_id) REFERENCES cuentas(id) ON DELETE CASCADE) $opc",
        // --- RGPD (versión 3) ---------------------------------------------
        // Registro de brechas de seguridad (art. 33.5 RGPD: se documentan todas).
        "CREATE TABLE IF NOT EXISTS incidentes (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, codigo VARCHAR(30) NOT NULL,
           detectado DATETIME(6) NOT NULL, inicio DATETIME(6) NULL, resuelto DATETIME(6) NULL,
           titulo VARCHAR(200) NOT NULL, descripcion TEXT NOT NULL,
           origen VARCHAR(20) NOT NULL DEFAULT 'manual', tipo VARCHAR(30) NOT NULL DEFAULT 'confidencialidad',
           medio VARCHAR(60) NOT NULL DEFAULT '', categorias_datos TEXT NULL, categorias_interesados TEXT NULL,
           num_interesados INT NULL, num_registros INT NULL, consecuencias TEXT NULL, medidas TEXT NULL,
           riesgo VARCHAR(10) NOT NULL DEFAULT 'pendiente', estado VARCHAR(30) NOT NULL DEFAULT 'abierto',
           notificado_aepd DATETIME(6) NULL, registro_aepd VARCHAR(60) NULL, comunicado_afectados DATETIME(6) NULL,
           decision TEXT NULL, creado_por CHAR(36) NULL, creado DATETIME(6) NOT NULL, actualizado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), UNIQUE KEY incidentes_codigo_uq (codigo)) $opc",
        // Alertas automáticas de posible brecha.
        "CREATE TABLE IF NOT EXISTS alertas (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ts DATETIME(6) NOT NULL,
           tipo VARCHAR(40) NOT NULL, gravedad VARCHAR(10) NOT NULL, titulo VARCHAR(200) NOT NULL,
           detalle TEXT NULL, clave VARCHAR(160) NULL, vista TINYINT(1) NOT NULL DEFAULT 0, incidente_id BIGINT UNSIGNED NULL,
           PRIMARY KEY (id), KEY alertas_ts_idx (ts), UNIQUE KEY alertas_clave_uq (clave)) $opc",
        // Solicitudes de derechos (acceso, supresión...): plazo de un mes (art. 12.3).
        "CREATE TABLE IF NOT EXISTS solicitudes_rgpd (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, codigo VARCHAR(30) NOT NULL, tipo VARCHAR(20) NOT NULL,
           persona VARCHAR(200) NOT NULL, contacto VARCHAR(190) NOT NULL DEFAULT '', recibida DATETIME(6) NOT NULL,
           vence DATETIME(6) NOT NULL, estado VARCHAR(20) NOT NULL DEFAULT 'abierta', notas TEXT NULL,
           respuesta TEXT NULL, resuelta DATETIME(6) NULL, creado_por CHAR(36) NULL, creado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), UNIQUE KEY solicitudes_codigo_uq (codigo)) $opc",
    );
    foreach ($pasos as $sql) {
        $db->exec($sql);
    }
    // Columnas nuevas en tablas que ya existían.
    $columnas = array(
        array('tokens_sesion', 'ultimo_uso', 'ALTER TABLE tokens_sesion ADD COLUMN ultimo_uso DATETIME(6) NULL'),
        array('bitacora', 'seq', 'ALTER TABLE bitacora ADD COLUMN seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ADD UNIQUE KEY bitacora_seq_uq (seq)'),
        array('bitacora', 'cadena', 'ALTER TABLE bitacora ADD COLUMN cadena CHAR(64) NULL'),
        // Bloqueo de datos (art. 32 LOPDGDD): el contrato se conserva por obligación legal pero queda apartado.
        array('contratos', 'bloqueado', 'ALTER TABLE contratos ADD COLUMN bloqueado TINYINT(1) NOT NULL DEFAULT 0'),
        // --- Fichas de contacto (versión 4) ---------------------------------
        array('contactos', 'etiquetas', "ALTER TABLE contactos ADD COLUMN etiquetas VARCHAR(500) NOT NULL DEFAULT ''"),
        array('contactos', 'ref_externa', 'ALTER TABLE contactos ADD COLUMN ref_externa VARCHAR(64) NULL, ADD UNIQUE KEY contactos_ref_uq (ref_externa)'),
        array('contactos', 'ultima_actividad', 'ALTER TABLE contactos ADD COLUMN ultima_actividad DATETIME(6) NULL'),
        array('contactos', 'proximo_contacto', 'ALTER TABLE contactos ADD COLUMN proximo_contacto DATETIME(6) NULL'),
        // --- Cargo visible del usuario (versión 5): «Coordinador», etc. ------
        array('perfiles', 'cargo', "ALTER TABLE perfiles ADD COLUMN cargo VARCHAR(60) NOT NULL DEFAULT ''"),
    );
    foreach ($columnas as $c) {
        if (!labs_columna_existe($db, $c[0], $c[1])) {
            try {
                $db->exec($c[2]);
            } catch (PDOException $e) {
                // 1060: otra petición la creó a la vez. Cualquier otro error se muestra.
                if ((int) ($e->errorInfo[1] ?? 0) !== 1060) {
                    throw $e;
                }
            }
        }
    }
    if ($v < 5) {
        labs_migra_traspasa_raiz($db);
    }
    $db->prepare("INSERT INTO ajustes (clave, valor) VALUES ('version_esquema', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)")
        ->execute(array((string) LABS_VERSION_ESQUEMA));
}

/**
 * Versión 5: el Super Administrador (cuenta raíz) pasa a ser LABS_RAIZ_EMAIL
 * (admin@labs24k.com). La raíz anterior (Juan) sigue siendo administrador con
 * todos los permisos, con el cargo «Coordinador» y por debajo de la nueva raíz.
 * Las contraseñas no se tocan. Si la cuenta nueva no existe, no se cambia nada.
 */
function labs_migra_traspasa_raiz(PDO $db)
{
    $st = $db->prepare('SELECT id, email FROM perfiles WHERE LOWER(email) = ?');
    $st->execute(array(mb_strtolower(LABS_RAIZ_EMAIL)));
    $nueva = $st->fetch();
    $vieja = $db->query('SELECT id, email FROM perfiles WHERE raiz = 1')->fetch();
    if (!$nueva || ($vieja && $vieja['id'] === $nueva['id'])) {
        return;
    }
    $ahora = gmdate('Y-m-d H:i:s.000000');
    $db->prepare('UPDATE perfiles SET raiz = 0 WHERE raiz = 1')->execute();
    $db->prepare("UPDATE perfiles SET raiz = 1, rol = 'admin', estado = 'Activo', superior_id = NULL, cargo = '', actualizado = ? WHERE id = ?")
        ->execute(array($ahora, $nueva['id']));
    if ($vieja) {
        $db->prepare("UPDATE perfiles SET rol = 'admin', estado = 'Activo', superior_id = ?, cargo = 'Coordinador', actualizado = ? WHERE id = ?")
            ->execute(array($nueva['id'], $ahora, $vieja['id']));
    }
    // Permisos completos de administración para las dos (la raíz los fija también al entrar).
    if (function_exists('labs_permisos_de_rol')) {
        $p = json_encode(labs_permisos_de_rol('admin'));
        $db->prepare("UPDATE perfiles SET permisos = ? WHERE id IN (?, ?)")->execute(array($p, $nueva['id'], $vieja ? $vieja['id'] : $nueva['id']));
    }
    $db->prepare("INSERT INTO ajustes (clave, valor) VALUES ('raiz_traspaso', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)")
        ->execute(array(json_encode(array('de' => $vieja ? $vieja['email'] : null, 'a' => $nueva['email'], 'cuando' => $ahora))));
}
