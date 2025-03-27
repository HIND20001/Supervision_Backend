-- Création des tables pour le système de surveillance urbaine

-- Table des dispositifs
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    ip_address VARCHAR(50) NOT NULL,
    latitude FLOAT,
    longitude FLOAT,
    status VARCHAR(20) DEFAULT 'offline',
    last_activity TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des frames
CREATE TABLE IF NOT EXISTS frames (
    id SERIAL PRIMARY KEY,
    frame_id VARCHAR(50) NOT NULL,
    device_id VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    image_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Table des inférences
CREATE TABLE IF NOT EXISTS inferences (
    id SERIAL PRIMARY KEY,
    inference_id VARCHAR(50) NOT NULL,
    frame_id VARCHAR(50) NOT NULL,
    device_id VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Table des détections
CREATE TABLE IF NOT EXISTS detections (
    id SERIAL PRIMARY KEY,
    inference_id INTEGER NOT NULL,
    class_id INTEGER NOT NULL,
    class_name VARCHAR(50) NOT NULL,
    confidence FLOAT NOT NULL,
    x_min FLOAT NOT NULL,
    y_min FLOAT NOT NULL,
    x_max FLOAT NOT NULL,
    y_max FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inference_id) REFERENCES inferences(id)
);

-- Table des zones
CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    zone_id VARCHAR(50) NOT NULL,
    device_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    geometry JSON NOT NULL,
    rules JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Table des alertes
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    alert_id VARCHAR(50) NOT NULL,
    device_id VARCHAR(50) NOT NULL,
    zone_id VARCHAR(50),
    zone_name VARCHAR(100),
    type VARCHAR(50) NOT NULL,
    sub_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration INTEGER,
    image_path VARCHAR(255),
    resolution_image_path VARCHAR(255),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Table des statistiques
CREATE TABLE IF NOT EXISTS statistics (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    zone_id VARCHAR(50),
    type VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    hour INTEGER,
    count INTEGER NOT NULL,
    avg_duration FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_frames_device_id ON frames(device_id);
CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp);
CREATE INDEX IF NOT EXISTS idx_inferences_device_id ON inferences(device_id);
CREATE INDEX IF NOT EXISTS idx_inferences_timestamp ON inferences(timestamp);
CREATE INDEX IF NOT EXISTS idx_detections_inference_id ON detections(inference_id);
CREATE INDEX IF NOT EXISTS idx_detections_class_id ON detections(class_id);
CREATE INDEX IF NOT EXISTS idx_alerts_device_id ON alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_start_time ON alerts(start_time);
CREATE INDEX IF NOT EXISTS idx_statistics_device_id ON statistics(device_id);
CREATE INDEX IF NOT EXISTS idx_statistics_type ON statistics(type);
CREATE INDEX IF NOT EXISTS idx_statistics_date ON statistics(date);

