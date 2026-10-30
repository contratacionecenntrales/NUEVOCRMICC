<?php
/**
 * LABS COMMAND CENTER 360™ · Configuración del backend PHP + MySQL (Hostalia)
 *
 * NO edites este archivo con tus datos reales. Los datos de la base de datos
 * van en un archivo aparte, que se busca en este orden:
 *   1. <carpeta privada del hosting>/labs-crm/config.php  ← lo más seguro
 *   2. api/config.local.php                                ← dentro de la web
 * El Centro de Seguridad del panel mueve el 2 al 1 con un botón.
 */
defined('LABS') || exit;

/*
 * Carpeta privada del hosting: está FUERA de la carpeta pública, así que
 * nada de lo que haya dentro se puede pedir desde un navegador, aunque falle
 * el .htaccess o el servidor entregue los archivos con nginx sin leerlo.
 * En Hostalia es la carpeta «private» que está junto a la del dominio.
 */
defined('LABS_DIR_WEB') || define('LABS_DIR_WEB', dirname(__DIR__));
if (!defined('LABS_DIR_PRIVADO')) {
    $p = dirname(LABS_DIR_WEB) . '/private';
    define('LABS_DIR_PRIVADO', (@is_dir($p) && @is_writable($p)) ? $p . '/labs-crm' : '');
    unset($p);
}
defined('LABS_CONFIG_PRIVADA') || define('LABS_CONFIG_PRIVADA', LABS_DIR_PRIVADO !== '' ? LABS_DIR_PRIVADO . '/config.php' : '');

if (LABS_CONFIG_PRIVADA !== '' && @is_file(LABS_CONFIG_PRIVADA)) {
    require LABS_CONFIG_PRIVADA;
    define('LABS_CONFIG_EN', 'privada');
} elseif (is_file(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
    define('LABS_CONFIG_EN', 'web');
} else {
    define('LABS_CONFIG_EN', 'ninguna');
}

// Base de datos MySQL (Hostalia → Bases de datos → MySQL).
defined('LABS_DB_HOST') || define('LABS_DB_HOST', 'localhost');
defined('LABS_DB_PORT') || define('LABS_DB_PORT', 3306);
defined('LABS_DB_NAME') || define('LABS_DB_NAME', 'labs_crm');
defined('LABS_DB_USER') || define('LABS_DB_USER', 'usuario');
defined('LABS_DB_PASS') || define('LABS_DB_PASS', '');

// Carpeta de los archivos subidos (contactos, dosieres...). Si existe la
// carpeta privada del hosting, se usa esa; si no, storage/ dentro de la web,
// cerrada por su .htaccess. La antigua (storage/) se sigue leyendo siempre,
// para no perder nada de lo subido antes.
defined('LABS_STORAGE_WEB') || define('LABS_STORAGE_WEB', LABS_DIR_WEB . '/storage');
defined('LABS_STORAGE_DIR') || define('LABS_STORAGE_DIR', LABS_DIR_PRIVADO !== '' ? LABS_DIR_PRIVADO . '/archivos' : LABS_STORAGE_WEB);

// Clave para api/instalar.php: la pide antes de dejarte poner la contraseña
// de la cuenta raíz. Cámbiala por una cadena larga tuya en la configuración.
defined('LABS_CLAVE_INSTALACION') || define('LABS_CLAVE_INSTALACION', '');

// Sesiones: el acceso se renueva solo cada hora; la sesión se cierra tras
// LABS_INACTIVIDAD_HORAS sin usarse y, pase lo que pase, a los
// LABS_RENOVACION_DIAS días de haber entrado.
defined('LABS_ACCESO_SEGUNDOS') || define('LABS_ACCESO_SEGUNDOS', 3600);
defined('LABS_INACTIVIDAD_HORAS') || define('LABS_INACTIVIDAD_HORAS', 72);
defined('LABS_RENOVACION_DIAS') || define('LABS_RENOVACION_DIAS', 30);

// Tamaño máximo de archivo (en bytes) y de cualquier otra petición.
defined('LABS_MAX_ARCHIVO') || define('LABS_MAX_ARCHIVO', 25 * 1024 * 1024);
// Archivos grandes (presentaciones): se suben por trozos de hasta LABS_MAX_TROZO.
defined('LABS_MAX_GRANDE') || define('LABS_MAX_GRANDE', 300 * 1024 * 1024);
defined('LABS_MAX_TROZO') || define('LABS_MAX_TROZO', 6 * 1024 * 1024);
defined('LABS_MAX_JSON') || define('LABS_MAX_JSON', 2 * 1024 * 1024);

// Correo de la cuenta raíz (Super Administrador).
defined('LABS_RAIZ_EMAIL') || define('LABS_RAIZ_EMAIL', 'jalvarez@labs24k.com');

// Muestra el detalle técnico de los errores del servidor. Solo para pruebas.
defined('LABS_DEPURAR') || define('LABS_DEPURAR', false);
