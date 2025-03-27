import pg from "pg"
import logger from "../utils/logger.js"

// Créer un pool de connexions PostgreSQL
export const pool = new pg.Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "supervision",
  password: process.env.DB_PASSWORD || "postgres",
  port: Number.parseInt(process.env.DB_PORT || "5432"),
})

// Fonction pour se connecter à la base de données
export async function connectToDatabase() {
  try {
    // Tester la connexion
    const client = await pool.connect()
    logger.info("Connexion à la base de données établie")
    client.release()

    // Initialiser les tables
    await initializeTables()

    return true
  } catch (error) {
    logger.error(`Erreur de connexion à la base de données: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    throw error
  }
}

// Fonction pour initialiser les tables
async function initializeTables() {
  try {
    // Créer la table des frames
    await pool.query(`
      CREATE TABLE IF NOT EXISTS frames (
        id SERIAL PRIMARY KEY,
        frame_id VARCHAR(255) NOT NULL,
        device_id VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        image_size INTEGER NOT NULL,
        ip_address VARCHAR(255) NOT NULL,
        latitude FLOAT,
        longitude FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Créer la table des inférences
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inferences (
        id SERIAL PRIMARY KEY,
        inference_id VARCHAR(255) NOT NULL,
        device_id VARCHAR(255) NOT NULL,
        frame_id VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        num_detections INTEGER NOT NULL,
        ip_address VARCHAR(255) NOT NULL,
        latitude FLOAT,
        longitude FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Créer la table des détections
    await pool.query(`
      CREATE TABLE IF NOT EXISTS detections (
        id SERIAL PRIMARY KEY,
        inference_id INTEGER REFERENCES inferences(id),
        class_id INTEGER NOT NULL,
        class_name VARCHAR(255) NOT NULL,
        confidence FLOAT NOT NULL,
        x_min FLOAT NOT NULL,
        y_min FLOAT NOT NULL,
        x_max FLOAT NOT NULL,
        y_max FLOAT NOT NULL,
        width FLOAT NOT NULL,
        height FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Créer la table des alertes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        alert_id VARCHAR(255) NOT NULL,
        device_id VARCHAR(255) NOT NULL,
        zone_id VARCHAR(255) NOT NULL,
        zone_name VARCHAR(255) NOT NULL,
        type VARCHAR(255) NOT NULL,
        sub_type VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration INTEGER,
        image_path VARCHAR(255),
        resolution_image_path VARCHAR(255),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Créer la table des statistiques
    await pool.query(`
      CREATE TABLE IF NOT EXISTS statistics (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        zone_id VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        period VARCHAR(50) NOT NULL,
        counts JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Créer la table des dispositifs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        ip_address VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        latitude FLOAT,
        longitude FLOAT,
        config JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Créer la table des zones
    await pool.query(`
      CREATE TABLE IF NOT EXISTS zones (
        id SERIAL PRIMARY KEY,
        zone_id VARCHAR(255) NOT NULL,
        device_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        geometry JSONB NOT NULL,
        rules JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    logger.info("Tables initialisées avec succès")
  } catch (error) {
    logger.error(`Erreur lors de l'initialisation des tables: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    throw error
  }
}

