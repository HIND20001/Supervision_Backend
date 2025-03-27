import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import logger from "../../utils/logger.js"

// Obtenir le chemin du répertoire actuel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Chemin vers le fichier de configuration des dispositifs
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, "../../config")
const DEVICES_CONFIG_FILE = path.join(CONFIG_DIR, "devices.json")

// Fonction pour charger la configuration des dispositifs
function loadDeviceConfigurations() {
  try {
    if (!fs.existsSync(DEVICES_CONFIG_FILE)) {
      logger.warn(`Fichier de configuration des dispositifs non trouvé: ${DEVICES_CONFIG_FILE}`)
      return []
    }

    const configData = fs.readFileSync(DEVICES_CONFIG_FILE, "utf8")
    const devices = JSON.parse(configData)
    logger.info(`Configuration des dispositifs chargée: ${devices.length} dispositifs trouvés`)
    return devices
  } catch (error) {
    logger.error(`Erreur lors du chargement de la configuration des dispositifs: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    return []
  }
}

// Fonction pour obtenir toutes les configurations de dispositifs
export function getAllDeviceConfigurations() {
  return loadDeviceConfigurations()
}

// Fonction pour obtenir la configuration d'un dispositif spécifique
export function getDeviceConfiguration(deviceId) {
  const devices = loadDeviceConfigurations()
  return devices.find((device) => device.deviceId === deviceId)
}

