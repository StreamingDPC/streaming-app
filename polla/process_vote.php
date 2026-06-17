<?php
session_start();
require_once 'db_connect.php';

// Seguridad: Verificar que hay un usuario en sesión
if (!isset($_SESSION['polla_user_id'])) {
    header("Location: index.php");
    exit();
}

$user_id = $_SESSION['polla_user_id'];

// Obtener datos actuales del usuario desde la DB (Seguridad extra)
$stmt = $pdo->prepare("SELECT pago_confirmado, voto_realizado FROM polla_usuarios WHERE id = ?");
$stmt->execute([$user_id]);
$user = $stmt->fetch();

if (!$user) {
    die("Usuario no encontrado.");
}

// REGLA DE NEGOCIO: El pago debe estar confirmado y no debe haber votado antes
if ($user['pago_confirmado'] == 0) {
    die("Error: Tu pago no ha sido confirmado. No puedes votar.");
}

if ($user['voto_realizado'] == 1) {
    die("Error: Ya has realizado tu pronóstico anteriormente.");
}

// Procesar los goles enviados
if (isset($_POST['goles_a']) && isset($_POST['goles_b'])) {
    try {
        $pdo->beginTransaction();

        foreach ($_POST['goles_a'] as $partido_id => $goles_a) {
            $goles_b = $_POST['goles_b'][$partido_id];
            
            // Insertar pronóstico
            $stmt = $pdo->prepare("INSERT INTO polla_pronosticos (user_id, partido_id, goles_equipo_a, goles_equipo_b) VALUES (?, ?, ?, ?)");
            $stmt->execute([$user_id, $partido_id, $goles_a, $goles_b]);
        }

        // Marcar que el usuario ya votó
        $stmt = $pdo->prepare("UPDATE polla_usuarios SET voto_realizado = 1 WHERE id = ?");
        $stmt->execute([$user_id]);

        $pdo->commit();
        header("Location: index.php?status=success");
    } catch (Exception $e) {
        $pdo->rollBack();
        die("Error al guardar pronóstico: " . $e->getMessage());
    }
} else {
    header("Location: index.php");
}
?>
