<?php
/**
 * LABS COMMAND CENTER 360™ · Actualizaciones automáticas de la base de datos
 *
 * Cuando una versión nueva necesita tablas o columnas nuevas, se crean aquí
 * solas la primera vez que el servidor arranca. Nadie tiene que volver a
 * importar SQL en phpMyAdmin. Cada paso se puede repetir sin romper nada.
 */
defined('LABS') || exit;

define('LABS_VERSION_ESQUEMA', 16);

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
        // --- Next-Gen (versión 6): agenda, configurador IA y movimientos del pipeline ---
        "CREATE TABLE IF NOT EXISTS citas (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, contacto_id BIGINT UNSIGNED NULL, titulo VARCHAR(200) NOT NULL,
           tipo VARCHAR(20) NOT NULL DEFAULT 'demo', inicio DATETIME(6) NOT NULL, fin DATETIME(6) NOT NULL,
           comercial_id CHAR(36) NULL, estado VARCHAR(20) NOT NULL DEFAULT 'programada', sector VARCHAR(80) NOT NULL DEFAULT '',
           lugar VARCHAR(200) NOT NULL DEFAULT '', notas TEXT NOT NULL, resumen TEXT NOT NULL, creado_por CHAR(36) NULL,
           creado DATETIME(6) NOT NULL, actualizado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), KEY citas_inicio_idx (inicio), KEY citas_comercial_idx (comercial_id, inicio), KEY citas_contacto_idx (contacto_id),
           CONSTRAINT citas_contacto_fk FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE SET NULL,
           CONSTRAINT citas_comercial_fk FOREIGN KEY (comercial_id) REFERENCES perfiles(id) ON DELETE SET NULL) $opc",
        "CREATE TABLE IF NOT EXISTS ia_config (
           contacto_id BIGINT UNSIGNED NOT NULL, voz LONGTEXT NOT NULL, whatsapp LONGTEXT NOT NULL, embudo LONGTEXT NOT NULL,
           estado VARCHAR(20) NOT NULL DEFAULT 'borrador', desplegado DATETIME(6) NULL, webhook_token CHAR(32) NULL,
           creado DATETIME(6) NOT NULL, actualizado DATETIME(6) NOT NULL,
           PRIMARY KEY (contacto_id), UNIQUE KEY ia_config_token_uq (webhook_token),
           CONSTRAINT ia_config_contacto_fk FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE CASCADE) $opc",
        "CREATE TABLE IF NOT EXISTS pipeline_movimientos (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, contacto_id BIGINT UNSIGNED NOT NULL, de VARCHAR(20) NOT NULL, a VARCHAR(20) NOT NULL,
           valor DECIMAL(12,2) NOT NULL DEFAULT 0, autor_id CHAR(36) NULL, ts DATETIME(6) NOT NULL,
           PRIMARY KEY (id), KEY pipeline_mov_ts_idx (ts, a), KEY pipeline_mov_contacto_idx (contacto_id),
           CONSTRAINT pipeline_mov_contacto_fk FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE CASCADE) $opc",
        // v12 · Proceso de venta: cada llamada con su resultado, notas y grabación.
        // v15 · Motor de Scraping IA: campañas, empresas extraídas, correos, bajas, tareas y registro en vivo.
        "CREATE TABLE IF NOT EXISTS motor_campanas (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, nombre VARCHAR(120) NOT NULL, sector VARCHAR(60) NOT NULL DEFAULT '',
           ccaa VARCHAR(60) NOT NULL DEFAULT '', comarca VARCHAR(80) NOT NULL DEFAULT '', localidades TEXT NULL,
           estado VARCHAR(20) NOT NULL DEFAULT 'pausada', modo VARCHAR(20) NOT NULL DEFAULT 'aprobacion', creado_por CHAR(36) NULL,
           creado DATETIME(6) NOT NULL, actualizado DATETIME(6) NOT NULL, PRIMARY KEY (id)) $opc",
        "CREATE TABLE IF NOT EXISTS motor_leads (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, campana_id BIGINT UNSIGNED NULL, empresa VARCHAR(200) NOT NULL, sector VARCHAR(60) NOT NULL DEFAULT '',
           ccaa VARCHAR(60) NOT NULL DEFAULT '', comarca VARCHAR(80) NOT NULL DEFAULT '', localidad VARCHAR(80) NOT NULL DEFAULT '', cp VARCHAR(10) NOT NULL DEFAULT '',
           direccion VARCHAR(250) NOT NULL DEFAULT '', web VARCHAR(250) NOT NULL DEFAULT '', dominio VARCHAR(190) NOT NULL DEFAULT '',
           email VARCHAR(190) NOT NULL DEFAULT '', email_tipo VARCHAR(20) NOT NULL DEFAULT '', email_estado VARCHAR(20) NOT NULL DEFAULT 'sin_verificar',
           telefono VARCHAR(40) NOT NULL DEFAULT '', cif VARCHAR(20) NOT NULL DEFAULT '', razon_social VARCHAR(200) NOT NULL DEFAULT '',
           fuente VARCHAR(20) NOT NULL DEFAULT 'manual', place_id VARCHAR(200) NULL, senales TEXT NULL, madurez INT NOT NULL DEFAULT 0, resumen TEXT NULL,
           estado VARCHAR(20) NOT NULL DEFAULT 'nuevo', paso INT NOT NULL DEFAULT 0, contacto_id BIGINT UNSIGNED NULL,
           proximo_envio DATETIME(6) NULL, ultimo_envio DATETIME(6) NULL, creado DATETIME(6) NOT NULL, actualizado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), UNIQUE KEY motor_leads_place_uq (place_id), KEY motor_leads_dom_idx (dominio), KEY motor_leads_email_idx (email),
           KEY motor_leads_estado_idx (estado, proximo_envio), KEY motor_leads_camp_idx (campana_id)) $opc",
        "CREATE TABLE IF NOT EXISTS motor_mensajes (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, lead_id BIGINT UNSIGNED NOT NULL, campana_id BIGINT UNSIGNED NULL, paso INT NOT NULL DEFAULT 1,
           sentido VARCHAR(10) NOT NULL DEFAULT 'salida', asunto VARCHAR(200) NOT NULL DEFAULT '', cuerpo TEXT NOT NULL, estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
           intencion VARCHAR(20) NOT NULL DEFAULT '', error VARCHAR(300) NOT NULL DEFAULT '', con_ia TINYINT(1) NOT NULL DEFAULT 0, message_id VARCHAR(200) NOT NULL DEFAULT '',
           aprobado_por CHAR(36) NULL, enviado DATETIME(6) NULL, creado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), KEY motor_msj_lead_idx (lead_id), KEY motor_msj_estado_idx (estado, sentido), KEY motor_msj_camp_idx (campana_id),
           CONSTRAINT motor_msj_lead_fk FOREIGN KEY (lead_id) REFERENCES motor_leads(id) ON DELETE CASCADE) $opc",
        "CREATE TABLE IF NOT EXISTS motor_bajas (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, valor VARCHAR(190) NOT NULL, motivo VARCHAR(120) NOT NULL DEFAULT '', creado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), UNIQUE KEY motor_bajas_uq (valor)) $opc",
        "CREATE TABLE IF NOT EXISTS motor_tareas (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, parametros TEXT NOT NULL, cola MEDIUMTEXT NULL, estado VARCHAR(20) NOT NULL DEFAULT 'cola',
           total INT NOT NULL DEFAULT 0, hechos INT NOT NULL DEFAULT 0, autor_id CHAR(36) NULL, creado DATETIME(6) NOT NULL, actualizado DATETIME(6) NOT NULL,
           PRIMARY KEY (id)) $opc",
        "CREATE TABLE IF NOT EXISTS motor_log (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, tipo VARCHAR(20) NOT NULL, texto VARCHAR(1000) NOT NULL, lead_id BIGINT UNSIGNED NULL,
           campana_id BIGINT UNSIGNED NULL, ts DATETIME(6) NOT NULL, PRIMARY KEY (id), KEY motor_log_ts_idx (ts)) $opc",
        // v16 · Zona de agentes: turnos de trabajo, acciones (con aprobación), tareas entre agentes y cobros.
        "CREATE TABLE IF NOT EXISTS equipo_turnos (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, agente VARCHAR(20) NOT NULL, modo VARCHAR(10) NOT NULL DEFAULT 'reglas',
           estado VARCHAR(12) NOT NULL DEFAULT 'en_curso', origen VARCHAR(20) NOT NULL DEFAULT 'cron', resumen TEXT NULL, error VARCHAR(500) NOT NULL DEFAULT '',
           iteraciones INT NOT NULL DEFAULT 0, tokens_in INT NOT NULL DEFAULT 0, tokens_out INT NOT NULL DEFAULT 0,
           inicio DATETIME(6) NOT NULL, fin DATETIME(6) NULL, PRIMARY KEY (id), KEY equipo_turnos_ag_idx (agente, inicio)) $opc",
        "CREATE TABLE IF NOT EXISTS equipo_acciones (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, turno_id BIGINT UNSIGNED NULL, agente VARCHAR(20) NOT NULL, herramienta VARCHAR(40) NOT NULL,
           entrada TEXT NULL, resultado TEXT NULL, resumen VARCHAR(400) NOT NULL DEFAULT '', riesgo VARCHAR(10) NOT NULL DEFAULT 'lectura',
           estado VARCHAR(12) NOT NULL DEFAULT 'hecha', contacto_id BIGINT UNSIGNED NULL, decidido_por CHAR(36) NULL, decidido DATETIME(6) NULL,
           motivo VARCHAR(500) NOT NULL DEFAULT '', ts DATETIME(6) NOT NULL,
           PRIMARY KEY (id), KEY equipo_acc_estado_idx (estado, ts), KEY equipo_acc_ag_idx (agente, ts), KEY equipo_acc_cont_idx (contacto_id)) $opc",
        "CREATE TABLE IF NOT EXISTS equipo_tareas (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, de VARCHAR(20) NOT NULL, para VARCHAR(20) NOT NULL, titulo VARCHAR(200) NOT NULL,
           detalle TEXT NULL, prioridad VARCHAR(10) NOT NULL DEFAULT 'media', estado VARCHAR(12) NOT NULL DEFAULT 'pendiente',
           contacto_id BIGINT UNSIGNED NULL, resultado TEXT NULL, creado_por CHAR(36) NULL, creado DATETIME(6) NOT NULL, cerrada DATETIME(6) NULL,
           PRIMARY KEY (id), KEY equipo_tareas_para_idx (para, estado)) $opc",
        "CREATE TABLE IF NOT EXISTS equipo_cobros (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, contacto_id BIGINT UNSIGNED NULL, presupuesto_id BIGINT UNSIGNED NULL,
           concepto VARCHAR(200) NOT NULL, importe DECIMAL(12,2) NOT NULL DEFAULT 0, vence DATE NOT NULL, estado VARCHAR(12) NOT NULL DEFAULT 'pendiente',
           pagado_el DATE NULL, metodo VARCHAR(40) NOT NULL DEFAULT '', recordatorios INT NOT NULL DEFAULT 0, ultimo_recordatorio DATETIME(6) NULL,
           creado_por VARCHAR(40) NOT NULL DEFAULT '', creado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), KEY equipo_cobros_estado_idx (estado, vence), KEY equipo_cobros_presu_idx (presupuesto_id)) $opc",
        "CREATE TABLE IF NOT EXISTS llamadas (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, contacto_id BIGINT UNSIGNED NOT NULL, autor_id CHAR(36) NULL,
           inicio DATETIME(6) NOT NULL, duracion INT NOT NULL DEFAULT 0, con_quien VARCHAR(20) NOT NULL DEFAULT 'nadie',
           resultado VARCHAR(30) NOT NULL DEFAULT 'no_contesta', bant TEXT NULL, notas TEXT NOT NULL, grabacion VARCHAR(500) NOT NULL DEFAULT '',
           informado TINYINT(1) NOT NULL DEFAULT 0, siguiente_tipo VARCHAR(20) NOT NULL DEFAULT '', siguiente_fecha DATETIME(6) NULL,
           siguiente_nota VARCHAR(500) NOT NULL DEFAULT '', perdido TINYINT(1) NOT NULL DEFAULT 0, creado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), KEY llamadas_contacto_idx (contacto_id, inicio), KEY llamadas_autor_idx (autor_id, inicio),
           CONSTRAINT llamadas_contacto_fk FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE CASCADE) $opc",
        // v11 · Papelera: lo borrado se puede recuperar durante 30 días.
        "CREATE TABLE IF NOT EXISTS papelera (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, tipo VARCHAR(20) NOT NULL, ref_id BIGINT NOT NULL, titulo VARCHAR(200) NOT NULL,
           datos LONGTEXT NOT NULL, archivos TEXT NOT NULL, tamano BIGINT NOT NULL DEFAULT 0, borrado_por CHAR(36) NULL,
           borrado DATETIME(6) NOT NULL, expira DATETIME(6) NOT NULL,
           PRIMARY KEY (id), KEY papelera_expira_idx (expira), KEY papelera_tipo_idx (tipo, ref_id)) $opc",
        // v8 · Formación: el avance de cada persona en cada recurso.
        "CREATE TABLE IF NOT EXISTS recursos_progreso (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, recurso_id BIGINT UNSIGNED NOT NULL, usuario_id CHAR(36) NOT NULL,
           avance TINYINT UNSIGNED NOT NULL DEFAULT 0, posicion INT UNSIGNED NOT NULL DEFAULT 0, completado DATETIME(6) NULL,
           actualizado DATETIME(6) NOT NULL,
           PRIMARY KEY (id), UNIQUE KEY recursos_prog_uq (recurso_id, usuario_id), KEY recursos_prog_usuario_idx (usuario_id),
           CONSTRAINT rprog_recurso_fk FOREIGN KEY (recurso_id) REFERENCES recursos(id) ON DELETE CASCADE,
           CONSTRAINT rprog_usuario_fk FOREIGN KEY (usuario_id) REFERENCES perfiles(id) ON DELETE CASCADE) $opc",
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
        // --- Pipeline IA (versión 6) -----------------------------------------
        array('contactos', 'fase', "ALTER TABLE contactos ADD COLUMN fase VARCHAR(20) NOT NULL DEFAULT 'lead', ADD KEY contactos_fase_idx (fase)"),
        array('contactos', 'valor', 'ALTER TABLE contactos ADD COLUMN valor DECIMAL(12,2) NOT NULL DEFAULT 0'),
        array('contactos', 'soluciones', "ALTER TABLE contactos ADD COLUMN soluciones VARCHAR(60) NOT NULL DEFAULT ''"),
        array('contactos', 'fase_desde', 'ALTER TABLE contactos ADD COLUMN fase_desde DATETIME(6) NULL'),
        array('contactos', 'motivo_perdida', "ALTER TABLE contactos ADD COLUMN motivo_perdida VARCHAR(200) NOT NULL DEFAULT ''"),
        // --- Credenciales cifradas por cliente (versión 7) ---------------------
        array('ia_config', 'secretos', 'ALTER TABLE ia_config ADD COLUMN secretos TEXT NULL'),
        // v8 · Centro de Recursos y Formación.
        array('recursos', 'seccion', "ALTER TABLE recursos ADD COLUMN seccion VARCHAR(12) NOT NULL DEFAULT 'dosier'"),
        array('recursos', 'miniatura', 'ALTER TABLE recursos ADD COLUMN miniatura MEDIUMTEXT NULL'),
        array('recursos', 'paginas', 'ALTER TABLE recursos ADD COLUMN paginas INT NULL'),
        array('recursos', 'duracion', 'ALTER TABLE recursos ADD COLUMN duracion INT NULL'),
        array('recursos', 'destacado', 'ALTER TABLE recursos ADD COLUMN destacado TINYINT(1) NOT NULL DEFAULT 0'),
        array('recursos', 'nivel', "ALTER TABLE recursos ADD COLUMN nivel VARCHAR(30) NOT NULL DEFAULT ''"),
        array('recursos', 'etiquetas', "ALTER TABLE recursos ADD COLUMN etiquetas VARCHAR(300) NOT NULL DEFAULT ''"),
        // v10 · Rutas de formación y búsqueda dentro de los documentos.
        array('recursos', 'ruta_formacion', "ALTER TABLE recursos ADD COLUMN ruta_formacion VARCHAR(60) NOT NULL DEFAULT ''"),
        array('recursos', 'orden', 'ALTER TABLE recursos ADD COLUMN orden INT NOT NULL DEFAULT 0'),
        array('recursos', 'texto', 'ALTER TABLE recursos ADD COLUMN texto MEDIUMTEXT NULL'),
        // v12 · Sector y persona que decide en cada contacto, y el siguiente paso.
        array('contactos', 'sector', "ALTER TABLE contactos ADD COLUMN sector VARCHAR(60) NOT NULL DEFAULT '', ADD KEY contactos_sector_idx (sector)"),
        array('contactos', 'decisor_nombre', "ALTER TABLE contactos ADD COLUMN decisor_nombre VARCHAR(120) NOT NULL DEFAULT ''"),
        array('contactos', 'decisor_cargo', "ALTER TABLE contactos ADD COLUMN decisor_cargo VARCHAR(80) NOT NULL DEFAULT ''"),
        array('contactos', 'decisor_telefono', "ALTER TABLE contactos ADD COLUMN decisor_telefono VARCHAR(40) NOT NULL DEFAULT ''"),
        array('contactos', 'decisor_email', "ALTER TABLE contactos ADD COLUMN decisor_email VARCHAR(190) NOT NULL DEFAULT ''"),
        array('contactos', 'proximo_paso', "ALTER TABLE contactos ADD COLUMN proximo_paso VARCHAR(200) NOT NULL DEFAULT ''"),
        // v14 · Web del contacto (para preparar la llamada).
        array('contactos', 'web', "ALTER TABLE contactos ADD COLUMN web VARCHAR(200) NOT NULL DEFAULT ''"),
        // v13 · Cuello de botella y fuga estimada del contacto; presupuestos ligados al contacto.
        array('contactos', 'cuello', "ALTER TABLE contactos ADD COLUMN cuello VARCHAR(20) NOT NULL DEFAULT ''"),
        array('contactos', 'fuga_anual', 'ALTER TABLE contactos ADD COLUMN fuga_anual DECIMAL(12,2) NOT NULL DEFAULT 0'),
        array('presupuestos', 'contacto_id', 'ALTER TABLE presupuestos ADD COLUMN contacto_id BIGINT UNSIGNED NULL, ADD KEY presupuestos_contacto_idx (contacto_id)'),
        array('presupuestos', 'datos', 'ALTER TABLE presupuestos ADD COLUMN datos LONGTEXT NULL'),
        // v9 · Contactos activos / desactivados.
        array('contactos', 'activo', 'ALTER TABLE contactos ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1, ADD KEY contactos_activo_idx (activo)'),
        array('recursos_descargas', 'accion', "ALTER TABLE recursos_descargas ADD COLUMN accion VARCHAR(12) NOT NULL DEFAULT 'descarga'"),
        array('contratos', 'contacto_id', 'ALTER TABLE contratos ADD COLUMN contacto_id BIGINT UNSIGNED NULL, ADD KEY contratos_contacto_idx (contacto_id)'),
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
    if ($v < 12 && function_exists('labs_ventas_sector_de')) {
        // Sector de los contactos que ya había, deducido de la empresa, el nombre y las etiquetas.
        foreach ($db->query("SELECT id, nombre, empresa, etiquetas FROM contactos WHERE sector = ''")->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $s = labs_ventas_sector_de($c['empresa'] . ' ' . $c['nombre'] . ' ' . $c['etiquetas']);
            if ($s !== '') {
                $db->prepare('UPDATE contactos SET sector = ? WHERE id = ?')->execute(array($s, $c['id']));
            }
        }
    }
    if ($v < 6) {
        // Cada contacto entra en el pipeline en la fase que corresponde a su estado.
        $db->exec("UPDATE contactos SET fase = CASE estado WHEN 'Contactado' THEN 'cualificacion' WHEN 'Cualificado' THEN 'demo'
                     WHEN 'Propuesta enviada' THEN 'propuesta' WHEN 'Cliente' THEN 'produccion' WHEN 'Perdido' THEN 'perdido' ELSE 'lead' END,
                     fase_desde = COALESCE(fase_desde, UTC_TIMESTAMP(6))");
        // El SLA empieza a contar al activar el pipeline (no desde la fecha antigua de cada contacto).
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
