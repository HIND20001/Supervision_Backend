import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import logger from "../utils/logger.js"

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
export function getAllDeviceConfigurations() {
  const deviceConfigurations = loadDeviceConfigurations()

  // Si c'est déjà un tableau, le retourner directement
  if (Array.isArray(deviceConfigurations)) {
    return deviceConfigurations
  }

  // Sinon, convertir l'objet en tableau
  return Object.values(deviceConfigurations)
}

// Fonction pour obtenir la configuration d'un dispositif spécifique
export function getDeviceConfiguration(deviceId) {
  const deviceConfigurations = loadDeviceConfigurations()

  // Si c'est un tableau, chercher le dispositif par son ID
  if (Array.isArray(deviceConfigurations)) {
    return deviceConfigurations.find((device) => device.deviceId === deviceId) || null
  }

  // Sinon, accéder directement à la propriété
  return deviceConfigurations[deviceId] || null
}

