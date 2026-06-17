<?php
/**
 * Configuración de conexión a la Base de Datos
 */
$host = 'localhost';
$db   = 'streaming_polla';
$user = 'root'; // Cambiar por el usuario de DB real
$pass = '';     // Cambiar por la contraseña de DB real
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    die("Error de conexión: " . $e->getMessage());
}

/**
 * Función para obtener configuración del sistema
 */
function get_polla_config($key, $default = '') {
    global $pdo;
    $stmt = $pdo->prepare("SELECT value_text FROM polla_config WHERE key_name = ?");
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    return $row ? $row['value_text'] : $default;
}
?>
