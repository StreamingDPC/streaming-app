<?php
session_start();
require_once 'db_connect.php';

$user = null;
$error = '';
$success = '';

// Identificación del usuario (por simplicidad usamos Email en este módulo)
if (isset($_POST['identify'])) {
    $email = $_POST['email'];
    $nombre = $_POST['nombre'] ?? '';

    $stmt = $pdo->prepare("SELECT * FROM polla_usuarios WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user && !empty($nombre)) {
        // Crear usuario si no existe
        $stmt = $pdo->prepare("INSERT INTO polla_usuarios (nombre, email) VALUES (?, ?)");
        $stmt->execute([$nombre, $email]);
        $user_id = $pdo->lastInsertId();
        
        $stmt = $pdo->prepare("SELECT * FROM polla_usuarios WHERE id = ?");
        $stmt->execute([$user_id]);
        $user = $stmt->fetch();
    } elseif (!$user) {
        $error = "Usuario no registrado. Por favor ingresa tu nombre para registrarte.";
    }
    
    if ($user) {
        $_SESSION['polla_user_id'] = $user['id'];
    }
}

if (isset($_SESSION['polla_user_id'])) {
    $stmt = $pdo->prepare("SELECT * FROM polla_usuarios WHERE id = ?");
    $stmt->execute([$_SESSION['polla_user_id']]);
    $user = $stmt->fetch();
}

$precio_polla = get_polla_config('precio_polla', '10000');
$nequi = get_polla_config('nequi_numero', '3000000000');

// Obtener partidos activos
$stmt = $pdo->query("SELECT * FROM polla_partidos WHERE activo = 1 ORDER BY fecha_partido ASC");
$partidos = $stmt->fetchAll();
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Polla Deportiva - Streaming DPC</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #4cd137;
            --secondary: #3498db;
            --bg: #0a0a0c;
            --card: rgba(255, 255, 255, 0.05);
            --border: rgba(255, 255, 255, 0.1);
        }
        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg);
            color: white;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            width: 100%;
            max-width: 500px;
            background: var(--card);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border);
            border-radius: 24px;
            padding: 40px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        h1 { text-align: center; color: var(--primary); font-weight: 800; }
        .alert {
            padding: 15px;
            border-radius: 12px;
            margin-bottom: 20px;
            font-size: 0.9rem;
            text-align: center;
        }
        .alert-warning { background: rgba(243, 156, 18, 0.2); border: 1px solid #f39c12; color: #f39c12; }
        .alert-info { background: rgba(52, 152, 219, 0.2); border: 1px solid #3498db; color: #3498db; }
        .alert-success { background: rgba(76, 209, 55, 0.2); border: 1px solid #4cd137; color: #4cd137; }
        
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-size: 0.85rem; color: #aaa; }
        input[type="text"], input[type="email"], input[type="number"] {
            width: 100%;
            padding: 12px;
            background: rgba(0,0,0,0.3);
            border: 1px solid var(--border);
            border-radius: 10px;
            color: white;
            box-sizing: border-box;
        }
        .btn {
            width: 100%;
            padding: 15px;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s;
        }
        .btn-primary { background: var(--primary); color: #000; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        
        .partido-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 15px;
        }
        .partido-header { text-align: center; font-size: 0.8rem; color: #888; margin-bottom: 10px; }
        .score-grid {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .team { flex: 1; text-align: center; font-weight: 600; }
        .score-input { width: 60px !important; text-align: center; font-size: 1.2rem; font-weight: 800; }
        
        .user-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .logout { color: #ff6b6b; text-decoration: none; font-size: 0.8rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚽ Polla Deportiva</h1>

        <?php if (!$user): ?>
            <!-- Formulario de Identificación -->
            <form method="POST">
                <p style="text-align:center; color:#ccc;">Identifícate para participar</p>
                <?php if ($error): ?><div class="alert alert-warning"><?= $error ?></div><?php endif; ?>
                <div class="form-group">
                    <label>Tu Correo Electrónico</label>
                    <input type="email" name="email" required placeholder="ejemplo@gmail.com">
                </div>
                <div class="form-group">
                    <label>Tu Nombre (Solo para el registro)</label>
                    <input type="text" name="nombre" placeholder="Tu Nombre Completo">
                </div>
                <button type="submit" name="identify" class="btn btn-primary">Entrar al Módulo</button>
            </form>

        <?php else: ?>
            <div class="user-info">
                <span>Hola, <strong><?= htmlspecialchars($user['nombre']) ?></strong></span>
                <a href="logout.php" class="logout">Cerrar Sesión</a>
            </div>

            <?php if ($user['voto_realizado']): ?>
                <!-- YA VOTÓ: Mostrar sus resultados -->
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> Pronóstico guardado con éxito.<br>
                    No se permiten modificaciones.
                </div>
                <div class="pronosticos-vistos">
                    <?php
                    $stmt = $pdo->prepare("SELECT p.*, m.equipo_a, m.equipo_b FROM polla_pronosticos p JOIN polla_partidos m ON p.partido_id = m.id WHERE p.user_id = ?");
                    $stmt->execute([$user['id']]);
                    $votos = $stmt->fetchAll();
                    foreach($votos as $v): ?>
                        <div class="partido-card">
                            <div class="score-grid">
                                <div class="team"><?= $v['equipo_a'] ?></div>
                                <div style="font-size: 1.5rem; font-weight: 800;">
                                    <?= $v['goles_equipo_a'] ?> - <?= $v['goles_equipo_b'] ?>
                                </div>
                                <div class="team"><?= $v['equipo_b'] ?></div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>

            <?php elseif ($user['pago_confirmado'] == 0): ?>
                <!-- PAGO PENDIENTE -->
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i><strong> Participación Pendiente</strong><br>
                    Para activar tu participación, realiza el pago de <strong>$<?= number_format($precio_polla) ?></strong> por Nequi al <strong><?= $nequi ?></strong> y envía el comprobante al administrador.
                </div>
                <p style="text-align:center; font-size: 0.8rem; color: #888;">El formulario estará disponible una vez se confirme tu pago.</p>
                <div style="opacity: 0.3; pointer-events: none;">
                    <?php foreach($partidos as $p): ?>
                        <div class="partido-card">
                            <div class="score-grid">
                                <div class="team"><?= $p['equipo_a'] ?></div>
                                <input type="number" class="score-input" disabled value="0">
                                <span>-</span>
                                <input type="number" class="score-input" disabled value="0">
                                <div class="team"><?= $p['equipo_b'] ?></div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                    <button class="btn btn-primary" disabled>Guardar Pronóstico</button>
                </div>

            <?php else: ?>
                <!-- ACTIVADO PARA VOTAR -->
                <div class="alert alert-info">
                    ¡Tu pago ha sido confirmado! Ya puedes ingresar tus pronósticos.
                </div>

                <form action="process_vote.php" method="POST">
                    <?php foreach($partidos as $p): ?>
                        <div class="partido-card">
                            <div class="partido-header">
                                <?= date('d M, Y - H:i', strtotime($p['fecha_partido'])) ?>
                            </div>
                            <div class="score-grid">
                                <div class="team"><?= $p['equipo_a'] ?></div>
                                <input type="number" name="goles_a[<?= $p['id'] ?>]" class="score-input" required min="0" value="0">
                                <span>-</span>
                                <input type="number" name="goles_b[<?= $p['id'] ?>]" class="score-input" required min="0" value="0">
                                <div class="team"><?= $p['equipo_b'] ?></div>
                            </div>
                        </div>
                    <?php endforeach; ?>

                    <?php if (count($partidos) > 0): ?>
                        <button type="submit" class="btn btn-primary">Guardar Pronóstico</button>
                    <?php else: ?>
                        <p style="text-align:center;">No hay partidos cargados por el momento.</p>
                    <?php endif; ?>
                </form>
            <?php endif; ?>
        <?php endif; ?>
    </div>
</body>
</html>
