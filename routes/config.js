import express from "express"
import logger from "../utils/logger.js"
import { pool } from "../config/db.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const router = express.Router()

// Obtenir le répertoire actuel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Chemin vers le fichier de configuration des dispositifs
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, "..")
const DEVICES_FILE = path.join(CONFIG_PATH, "config/devices.json")

// Cache pour les configurations
let deviceConfigurations = null

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
  if (!deviceConfigurations) {
    deviceConfigurations = loadDeviceConfigurations()
  }

  // Si c'est déjà un tableau, le retourner directement
  if (Array.isArray(deviceConfigurations)) {
    return deviceConfigurations
  }

  // Sinon, convertir l'objet en tableau
  return Object.values(deviceConfigurations)
}

// Fonction pour recharger les configurations
function reloadDeviceConfigurations() {
  deviceConfigurations = loadDeviceConfigurations()
  logger.info("Configurations des dispositifs rechargées")
  return deviceConfigurations
}

// Récupérer toutes les configurations
router.get("/", (req, res) => {
  try {
    const configs = getAllDeviceConfigurations()
    res.json(configs)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des configurations: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// Recharger les configurations
router.post("/reload", async (req, res) => {
  try {
    const configs = reloadDeviceConfigurations()
    const devices = Array.isArray(configs) ? configs : Object.values(configs)

    let zonesInserted = 0
    let zonesUpdated = 0

    for (const device of devices) {
      if (device.zones && Array.isArray(device.zones)) {
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
            zonesInserted++
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
            zonesUpdated++
            logger.info(`Zone mise à jour dans la base de données: ${zone.id} pour le dispositif ${device.deviceId}`)
          }
        }
      }
    }

    res.json({
      success: true,
      message: "Configurations rechargées avec succès",
      deviceCount: devices.length,
      zonesInserted,
      zonesUpdated,
    })
  } catch (error) {
    logger.error(`Erreur lors du rechargement des configurations: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

export default router

