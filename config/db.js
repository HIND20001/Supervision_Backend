import logger from "../utils/logger.js" // Import logger
import pg from "pg"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

// Obtenir le répertoire actuel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Chemin vers le fichier de configuration des dispositifs
const CONFIG_PATH = process.env.CONFIG_PATH || __dirname
const DEVICES_FILE = path.join(CONFIG_PATH, "devices.json")

// Fonction pour charger les configurations des dispositifs
function loadDeviceConfigurations() {
  try {
    if (!fs.existsSync(DEVICES_FILE)) {
      logger.warn(`Fichier de configuration des dispositifs non trouvé: ${DEVICES_FILE}`)
      return []
    }

    const fileContent = fs.readFileSync(DEVICES_FILE, "utf8")
    const config = JSON.parse(fileContent)

    logger.info(`Configuration des dispositifs chargée depuis ${DEVICES_FILE}`)
    return config
  } catch (error) {
    logger.error(`Erreur lors du chargement de la configuration des dispositifs: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    return []
  }
}

// Fonction pour obtenir toutes les configurations des dispositifs
function getAllDeviceConfigurations() {
  const deviceConfigurations = loadDeviceConfigurations()

  // Si c'est déjà un tableau, le retourner directement
  if (Array.isArray(deviceConfigurations)) {
    return deviceConfigurations
  }

  // Sinon, convertir l'objet en tableau
  return Object.values(deviceConfigurations)
}

// Créer le pool de connexion PostgreSQL
const { Pool } = pg
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "supervision",
  password: process.env.DB_PASSWORD || "postgres",
  port: Number.parseInt(process.env.DB_PORT || "5432"),
})

// Tester la connexion
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    logger.error(`Erreur de connexion à la base de données: ${err.message}`)
  } else {
    logger.info(`Connexion à la base de données établie: ${res.rows[0].now}`)
  }
})

// Fonction pour insérer les dispositifs depuis la configuration
async function insertDevicesFromConfig() {
  try {
    const devices = getAllDeviceConfigurations()

    logger.info(`Insertion de ${devices.length} dispositifs depuis la configuration`)

    for (const device of devices) {
      // Vérifier si le dispositif existe déjà
      const checkQuery = `
        SELECT device_id FROM devices WHERE device_id = $1
      `
      const checkResult = await pool.query(checkQuery, [device.deviceId])

      if (checkResult.rows.length === 0) {
        // Insérer le dispositif
        const insertQuery = `
          INSERT INTO devices (device_id, ip_address, name, latitude, longitude)
          VALUES ($1, $2, $3, $4, $5)
        `
        const insertValues = [
          device.deviceId,
          device.ipAddress || device.deviceId,
          device.name || `Dispositif ${device.deviceId}`,
          device.location?.latitude || null,
          device.location?.longitude || null,
        ]

        await pool.query(insertQuery, insertValues)
        logger.info(`Dispositif inséré dans la base de données: ${device.deviceId}`)
      }

      // Traiter les zones du dispositif
      if (device.zones && Array.isArray(device.zones)) {
        logger.info(`Traitement de ${device.zones.length} zones pour le dispositif ${device.deviceId}`)

        for (const zone of device.zones) {
          // Vérifier si la zone existe déjà
          const checkZoneQuery = `
            SELECT zone_id FROM zones WHERE zone_id = $1 AND device_id = $2
          `
          const checkZoneResult = await pool.query(checkZoneQuery, [zone.id, device.deviceId])

          if (checkZoneResult.rows.length === 0) {
            // Insérer la zone
            const insertZoneQuery = `
              INSERT INTO zones (zone_id, device_id, name, type, geometry, rules)
              VALUES ($1, $2, $3, $4, $5, $6)
            `
            const insertZoneValues = [
              zone.id,
              device.deviceId,
              zone.name || `Zone ${zone.id}`,
              zone.type || "unknown",
              JSON.stringify(zone.geometry || {}),
              JSON.stringify(zone.rules || {}),
            ]

            await pool.query(insertZoneQuery, insertZoneValues)
            logger.info(`Zone insérée dans la base de données: ${zone.id} pour le dispositif ${device.deviceId}`)
          } else {
            // Mettre à jour la zone existante
            const updateZoneQuery = `
              UPDATE zones 
              SET name = $1, type = $2, geometry = $3, rules = $4, updated_at = NOW()
              WHERE zone_id = $5 AND device_id = $6
            `
            const updateZoneValues = [
              zone.name || `Zone ${zone.id}`,
              zone.type || "unknown",
              JSON.stringify(zone.geometry || {}),
              JSON.stringify(zone.rules || {}),
              zone.id,
              device.deviceId,
            ]

            await pool.query(updateZoneQuery, updateZoneValues)
            logger.info(`Zone mise à jour dans la base de données: ${zone.id} pour le dispositif ${device.deviceId}`)
          }
        }
      }
    }

    logger.info("Dispositifs et zones insérés avec succès")
  } catch (error) {
    logger.error(`Erreur lors de l'insertion des dispositifs et zones: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Exporter pool pour qu'il soit accessible aux autres modules
export { pool, insertDevicesFromConfig }

