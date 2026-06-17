<?php
session_start();
require_once 'db_connect.php';

// Aquí deberías tener algún check de sesión de administrador real de Streaming DPC
// Para este módulo, permitiremos el acceso pero el usuario debería integrarlo 
// con su lógica de admin.html

// Acciones de Administración
if (isset($_GET['action'])) {
    $id = $_GET['id'] ?? null;
    
    if ($_GET['action'] == 'confirm_payment' && $id) {
        $stmt = $pdo->prepare("UPDATE polla_usuarios SET pago_confirmado = 1 WHERE id = ?");
        $stmt->execute([$id]);
    }
    
    if ($_GET['action'] == 'delete_user' && $id) {
        $stmt = $pdo->prepare("DELETE FROM polla_usuarios WHERE id = ?");
        $stmt->execute([$id]);
    }

    if ($_GET['action'] == 'add_partido') {
        $eqA = $_POST['equipo_a'];
        $eqB = $_POST['equipo_b'];
        $fecha = $_POST['fecha'];
        $stmt = $pdo->prepare("INSERT INTO polla_partidos (equipo_a, equipo_b, fecha_partido) VALUES (?, ?, ?)");
        $stmt->execute([$eqA, $eqB, $fecha]);
    }

    if ($_GET['action'] == 'update_config') {
        $precio = $_POST['precio'];
        $nequi = $_POST['nequi'];
        
        $stmt = $pdo->prepare("INSERT INTO polla_config (key_name, value_text) VALUES ('precio_polla', ?) ON DUPLICATE KEY UPDATE value_text = ?");
        $stmt->execute([$precio, $precio]);
        
        $stmt = $pdo->prepare("INSERT INTO polla_config (key_name, value_text) VALUES ('nequi_numero', ?) ON DUPLICATE KEY UPDATE value_text = ?");
        $stmt->execute([$nequi, $nequi]);
    }

    header("Location: admin_polla.php");
    exit();
}

// Obtener Usuarios
$stmt = $pdo->query("SELECT * FROM polla_usuarios ORDER BY fecha_registro DESC");
$usuarios = $stmt->fetchAll();

// Obtener Partidos
$stmt = $pdo->query("SELECT * FROM polla_partidos ORDER BY fecha_partido ASC");
$partidos = $stmt->fetchAll();

$precio_polla = get_polla_config('precio_polla', '10000');
$nequi = get_polla_config('nequi_numero', '3000000000');
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Admin Polla - Streaming DPC</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { font-family: 'Outfit', sans-serif; background: #050507; color: white; padding: 40px; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 25px; margin-bottom: 30px; }
        h2 { color: #4cd137; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        th { color: #aaa; font-size: 0.8rem; text-transform: uppercase; }
        .btn-sm { padding: 6px 12px; border-radius: 6px; border: none; font-size: 0.75rem; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn-success { background: #4cd137; color: black; font-weight: bold; }
        .btn-danger { background: #ff4d4d; color: white; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; }
        .badge-pending { background: #f39c12; color: black; }
        .badge-success { background: #4cd137; color: black; }
        input { padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: #111; color: white; margin-right: 10px; }
    </style>
</head>
<body>
    <h1>⚙️ Administración de Polla Deportiva</h1>

    <!-- Configuración -->
    <div class="card">
        <h2>Ajustes Generales</h2>
        <form action="admin_polla.php?action=update_config" method="POST">
            <label>Precio de Participación ($):</label>
            <input type="number" name="precio" value="<?= $precio_polla ?>">
            <label>Número Nequi para Pago:</label>
            <input type="text" name="nequi" value="<?= $nequi ?>">
            <button type="submit" class="btn-sm btn-success">Guardar Cambios</button>
        </form>
    </div>

    <!-- Gestión de Usuarios -->
    <div class="card">
        <h2>Participantes</h2>
        <table>
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Registro</th>
                    <th>Pago</th>
                    <th>Estado Voto</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach($usuarios as $u): ?>
                <tr>
                    <td><?= htmlspecialchars($u['nombre']) ?></td>
                    <td><?= htmlspecialchars($u['email']) ?></td>
                    <td><?= $u['fecha_registro'] ?></td>
                    <td>
                        <?php if($u['pago_confirmado']): ?>
                            <span class="badge badge-success">SÍ - PAGADO</span>
                        <?php else: ?>
                            <span class="badge badge-pending">PENDIENTE</span>
                        <?php endif; ?>
                    </td>
                    <td>
                        <?php if($u['voto_realizado']): ?>
                            <span class="badge badge-success"><i class="fas fa-check"></i> YA VOTÓ</span>
                        <?php else: ?>
                            <span class="badge badge-pending">AÚN NO VOTA</span>
                        <?php endif; ?>
                    </td>
                    <td>
                        <?php if(!$u['pago_confirmado']): ?>
                            <a href="admin_polla.php?action=confirm_payment&id=<?= $u['id'] ?>" class="btn-sm btn-success">Confirmar Pago</a>
                        <?php endif; ?>
                        <a href="admin_polla.php?action=delete_user&id=<?= $u['id'] ?>" class="btn-sm btn-danger" onclick="return confirm('¿Eliminar participante?')">Eliminar</a>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <!-- Gestión de Partidos -->
    <div class="card">
        <h2>Partidos de la Polla</h2>
        <form action="admin_polla.php?action=add_partido" method="POST" style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <input type="text" name="equipo_a" placeholder="Equipo A" required>
            <input type="text" name="equipo_b" placeholder="Equipo B" required>
            <input type="datetime-local" name="fecha" required>
            <button type="submit" class="btn-sm btn-success">Agregar Partido</button>
        </form>
        <table>
            <thead>
                <tr>
                    <th>Local</th>
                    <th>Visitante</th>
                    <th>Fecha / Hora</th>
                    <th>Acción</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach($partidos as $p): ?>
                <tr>
                    <td><?= $p['equipo_a'] ?></td>
                    <td><?= $p['equipo_b'] ?></td>
                    <td><?= $p['fecha_partido'] ?></td>
                    <td><span style="color:#888;">Próximamente: Resultados</span></td>
                </tr>
                <?php endforeach; ?>
                <?php if(empty($partidos)): ?><tr><td colspan="4">No hay partidos creados.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>

</body>
</html>
