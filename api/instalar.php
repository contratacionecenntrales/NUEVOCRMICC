<?php
/**
 * LABS COMMAND CENTER 360™ · Puesta en marcha
 *
 * Comprueba la instalación y deja poner la contraseña de la cuenta raíz
 * (jalvarez@labs24k.com) UNA sola vez: en cuanto la cuenta tiene contraseña,
 * esta página ya no deja cambiar nada. Pide la clave de instalación que
 * escribiste en api/config.local.php, para que nadie se adelante.
 */
define('LABS', true);
require __DIR__ . '/config.php';
require __DIR__ . '/nucleo.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

function h($s)
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

$pasos = array();
$raiz = null;
$error = '';
$hecho = false;
$bd_ok = false;

try {
    labs_db();
    $bd_ok = true;
    $pasos[] = array(true, 'Conexión con MySQL', 'Base de datos «' . LABS_DB_NAME . '» en ' . LABS_DB_HOST . '.');
} catch (ErrorApi $e) {
    $pasos[] = array(false, 'Conexión con MySQL', 'No conecta. Revisa los datos de api/config.local.php.' .
        (LABS_DEPURAR && $e->pista ? ' (' . $e->pista . ')' : ''));
}

if ($bd_ok) {
    $tablas = labs_fila("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE()
                         AND table_name IN ('perfiles','cuentas','tokens_sesion','contactos','contratos','tickets')");
    $tablas_ok = (int) $tablas['n'] === 6;
    $pasos[] = array($tablas_ok, 'Tablas del CRM', $tablas_ok ? 'Creadas.' : 'Faltan tablas: importa sql/base-de-datos.sql en phpMyAdmin.');
    if ($tablas_ok) {
        $raiz = labs_fila('SELECT p.id, p.email, p.nombre, p.apellidos, c.clave_hash FROM perfiles p JOIN cuentas c ON c.id = p.id WHERE p.raiz = 1');
        $pasos[] = array((bool) $raiz, 'Cuenta raíz', $raiz ? $raiz['email'] : 'No existe: vuelve a importar sql/base-de-datos.sql.');
    }
}

$dir = rtrim(LABS_STORAGE_DIR, '/');
$alm_ok = (is_dir($dir) || @mkdir($dir, 0750, true)) && is_writable($dir);
$pasos[] = array($alm_ok, 'Carpeta de archivos', $alm_ok ? 'Se puede escribir en ella.' : 'No se puede escribir en ' . $dir . '. Dale permisos de escritura.');

$clave_ok = strlen(LABS_CLAVE_INSTALACION) >= 12 && LABS_CLAVE_INSTALACION !== 'cambia-esto-por-una-clave-larga-y-tuya';
$puede = $raiz && !$raiz['clave_hash'] && $clave_ok;

if ($puede && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $clave_inst = (string) ($_POST['instalacion'] ?? '');
    $p1 = (string) ($_POST['clave'] ?? '');
    $p2 = (string) ($_POST['clave2'] ?? '');
    if (!hash_equals(LABS_CLAVE_INSTALACION, $clave_inst)) {
        sleep(2);
        $error = 'La clave de instalación no coincide con la de api/config.local.php.';
    } elseif ($p1 !== $p2) {
        $error = 'Las dos contraseñas no coinciden.';
    } elseif ($f = labs_revisa_clave($p1, array('email' => $raiz['email'], 'nombre' => $raiz['nombre'], 'apellidos' => $raiz['apellidos']))) {
        $error = 'La contraseña necesita ' . implode(', ', $f) . '.';
    } else {
        $db = labs_db();
        $db->beginTransaction();
        labs_q('UPDATE cuentas SET clave_hash = ?, actualizado = ? WHERE id = ? AND clave_hash IS NULL',
            array(password_hash($p1, PASSWORD_DEFAULT), labs_ahora(), $raiz['id']));
        labs_q('UPDATE perfiles SET debe_cambiar = 0, api_token = COALESCE(api_token, ?) WHERE id = ?', array(labs_token_api(), $raiz['id']));
        labs_sincroniza_raiz();
        labs_anota('Instalación completada', 'Contraseña de la cuenta raíz establecida desde api/instalar.php.', $raiz, null);
        $db->commit();
        $hecho = true;
        $puede = false;
    }
}
?><!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Puesta en marcha · Labs Command Center 360</title>
<style>
  :root{--bg:#070b14;--card:#0f1626;--line:#1f2a40;--txt:#e6ebf5;--mut:#8a96ad;--acc:#4f8cff;--ok:#22c55e;--ko:#ef4444}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:40px 16px}
  .card{max-width:560px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px}
  h1{font-size:20px;margin:0 0 4px} .mut{color:var(--mut);font-size:13px}
  .paso{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)} .paso:last-child{border:0}
  .dot{flex:0 0 10px;height:10px;border-radius:50%;margin-top:6px}
  label{display:block;font-size:13px;color:var(--mut);margin:14px 0 6px}
  input{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:#0a101d;color:var(--txt);font-size:15px}
  button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:var(--acc);color:#fff;font-weight:600;font-size:15px;cursor:pointer}
  .aviso{margin-top:16px;padding:12px 14px;border-radius:10px;font-size:14px}
  .ko{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4)} .okb{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4)}
  a{color:var(--acc)}
</style>
</head>
<body>
<div class="card">
  <h1>Puesta en marcha</h1>
  <div class="mut">Labs Command Center 360 · base de datos MySQL en Hostalia</div>

  <div style="margin-top:18px">
  <?php foreach ($pasos as $p): ?>
    <div class="paso"><span class="dot" style="background:<?= $p[0] ? 'var(--ok)' : 'var(--ko)' ?>"></span>
      <div><strong><?= h($p[1]) ?></strong><div class="mut"><?= h($p[2]) ?></div></div></div>
  <?php endforeach; ?>
  </div>

  <?php if ($hecho): ?>
    <div class="aviso okb">Listo. La cuenta <strong><?= h($raiz['email']) ?></strong> ya tiene contraseña.
      <a href="../index.html">Entra en el panel</a>. Esta página ya no permite cambiar nada.</div>
  <?php elseif ($raiz && $raiz['clave_hash']): ?>
    <div class="aviso okb">La instalación está completa: la cuenta raíz ya tiene contraseña.
      <a href="../index.html">Ir al panel</a>. Puedes borrar este archivo (api/instalar.php) si quieres.</div>
  <?php elseif ($raiz && !$clave_ok): ?>
    <div class="aviso ko">Antes de seguir, pon una <strong>clave de instalación</strong> propia (12 caracteres o más) en
      <code>LABS_CLAVE_INSTALACION</code> dentro de <code>api/config.local.php</code> y recarga esta página.</div>
  <?php elseif ($puede): ?>
    <?php if ($error): ?><div class="aviso ko"><?= h($error) ?></div><?php endif; ?>
    <form method="post" autocomplete="off">
      <label for="instalacion">Clave de instalación (la de api/config.local.php)</label>
      <input id="instalacion" name="instalacion" type="password" required>
      <label for="clave">Contraseña nueva para <?= h($raiz['email']) ?></label>
      <input id="clave" name="clave" type="password" required minlength="10" autocomplete="new-password">
      <label for="clave2">Repítela</label>
      <input id="clave2" name="clave2" type="password" required minlength="10" autocomplete="new-password">
      <div class="mut" style="margin-top:8px">Mínimo 10 caracteres, con mayúscula, minúscula, número y símbolo, y sin tu nombre ni tu correo.</div>
      <button type="submit">Guardar contraseña de la cuenta raíz</button>
    </form>
  <?php endif; ?>
</div>
</body>
</html>
