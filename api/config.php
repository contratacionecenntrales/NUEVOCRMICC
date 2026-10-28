<?php
/**
 * LABS COMMAND CENTER 360™ · Configuración del backend PHP + MySQL (Hostalia)
 *
 * NO edites este archivo con tus datos reales: copia config.local.example.php
 * como config.local.php y pon allí los datos de tu base de datos. Ese archivo
 * no se sube al repositorio y este puede actualizarse sin pisarte nada.
 */
defined('LABS') || exit;

if (is_file(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
}

// Base de datos MySQL (Hostalia → Bases de datos → MySQL).
defined('LABS_DB_HOST') || define('LABS_DB_HOST', 'localhost');
defined('LABS_DB_PORT') || define('LABS_DB_PORT', 3306);
defined('LABS_DB_NAME') || define('LABS_DB_NAME', 'labs_crm');
defined('LABS_DB_USER') || define('LABS_DB_USER', 'usuario');
defined('LABS_DB_PASS') || define('LABS_DB_PASS', '');

// Carpeta donde se guardan los archivos subidos (contactos, dosieres...).
// Por defecto, storage/ junto a index.html, cerrada al público por su .htaccess.
// Si tu hosting tiene una carpeta privada fuera de la web, mejor ponla aquí.
defined('LABS_STORAGE_DIR') || define('LABS_STORAGE_DIR', dirname(__DIR__) . '/storage');

// Clave para api/instalar.php: la pide antes de dejarte poner la contraseña
// de la cuenta raíz. Cámbiala por una cadena larga tuya en config.local.php.
defined('LABS_CLAVE_INSTALACION') || define('LABS_CLAVE_INSTALACION', '');

// Duración de la sesión: el acceso se renueva solo cada hora y la sesión
// caduca si nadie la usa en 30 días.
defined('LABS_ACCESO_SEGUNDOS') || define('LABS_ACCESO_SEGUNDOS', 3600);
defined('LABS_RENOVACION_DIAS') || define('LABS_RENOVACION_DIAS', 30);

// Tamaño máximo de archivo (en bytes). Recuerda que PHP también tiene su
// propio límite (post_max_size / upload_max_filesize).
defined('LABS_MAX_ARCHIVO') || define('LABS_MAX_ARCHIVO', 25 * 1024 * 1024);

// Correo de la cuenta raíz (Super Administrador).
defined('LABS_RAIZ_EMAIL') || define('LABS_RAIZ_EMAIL', 'jalvarez@labs24k.com');

// Muestra el detalle técnico de los errores del servidor. Solo para pruebas.
defined('LABS_DEPURAR') || define('LABS_DEPURAR', false);
