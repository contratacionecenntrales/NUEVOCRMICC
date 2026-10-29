<?php
/**
 * LABS COMMAND CENTER 360™ · Actualizaciones automáticas de la base de datos
 *
 * Cuando una versión nueva necesita tablas o columnas nuevas, se crean aquí
 * solas la primera vez que el servidor arranca. Nadie tiene que volver a
 * importar SQL en phpMyAdmin. Cada paso se puede repetir sin romper nada.
 */
defined('LABS') || exit;

define('LABS_VERSION_ESQUEMA', 2);

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
    );
    foreach ($pasos as $sql) {
        $db->exec($sql);
    }
    // Columnas nuevas en tablas que ya existían.
    $columnas = array(
        array('tokens_sesion', 'ultimo_uso', 'ALTER TABLE tokens_sesion ADD COLUMN ultimo_uso DATETIME(6) NULL'),
        array('bitacora', 'seq', 'ALTER TABLE bitacora ADD COLUMN seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ADD UNIQUE KEY bitacora_seq_uq (seq)'),
        array('bitacora', 'cadena', 'ALTER TABLE bitacora ADD COLUMN cadena CHAR(64) NULL'),
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
    $db->prepare("INSERT INTO ajustes (clave, valor) VALUES ('version_esquema', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)")
        ->execute(array((string) LABS_VERSION_ESQUEMA));
}
