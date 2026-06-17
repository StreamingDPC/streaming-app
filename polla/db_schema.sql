-- Esquema de base de datos para el módulo de Polla Deportiva
CREATE DATABASE IF NOT EXISTS streaming_polla;
USE streaming_polla;

CREATE TABLE IF NOT EXISTS polla_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    key_name VARCHAR(50) UNIQUE,
    value_text TEXT
);

INSERT INTO polla_config (key_name, value_text) VALUES ('precio_polla', '10000') ON DUPLICATE KEY UPDATE value_text='10000';
INSERT INTO polla_config (key_name, value_text) VALUES ('nequi_numero', '3000000000') ON DUPLICATE KEY UPDATE value_text='3000000000';

CREATE TABLE IF NOT EXISTS polla_usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telefono VARCHAR(20),
    pago_confirmado TINYINT(1) DEFAULT 0,
    voto_realizado TINYINT(1) DEFAULT 0,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS polla_partidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipo_a VARCHAR(100) NOT NULL,
    equipo_b VARCHAR(100) NOT NULL,
    fecha_partido DATETIME NOT NULL,
    activo TINYINT(1) DEFAULT 1
);

-- Insertar un partido de prueba si se desea
-- INSERT INTO polla_partidos (equipo_a, equipo_b, fecha_partido) VALUES ('Colombia', 'Brasil', '2024-07-02 20:00:00');

CREATE TABLE IF NOT EXISTS polla_pronosticos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    partido_id INT NOT NULL,
    goles_equipo_a INT NOT NULL,
    goles_equipo_b INT NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES polla_usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (partido_id) REFERENCES polla_partidos(id) ON DELETE CASCADE
);
