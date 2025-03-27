import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import logger from "../../utils/logger.js"

// Obtenir le répertoire actuel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Chemin vers le fichier de configuration des dispositifs
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, "../..")
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
export function getAllDeviceConfigurations() {
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

// Fonction pour obtenir la configuration d'un dispositif spécifique
export function getDeviceConfiguration(deviceId) {
  if (!deviceConfigurations) {
    deviceConfigurations = loadDeviceConfigurations()
  }

  // Si c'est un tableau, chercher le dispositif par son ID
  if (Array.isArray(deviceConfigurations)) {
    return deviceConfigurations.find((device) => device.deviceId === deviceId) || null
  }

  // Sinon, accéder directement à la propriété
  return deviceConfigurations[deviceId] || null
}

// Fonction pour recharger les configurations
export function reloadDeviceConfigurations() {
  deviceConfigurations = loadDeviceConfigurations()
  logger.info("Configurations des dispositifs rechargées")
  return deviceConfigurations
}

// Fonction pour sauvegarder les configurations
export function saveDeviceConfigurations(configurations) {
  try {
    // Créer le répertoire de configuration s'il n'existe pas
    const configDir = path.dirname(DEVICES_FILE)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    fs.writeFileSync(DEVICES_FILE, JSON.stringify(configurations, null, 2), "utf8")
    deviceConfigurations = configurations
    logger.info(`Configurations des dispositifs sauvegardées dans ${DEVICES_FILE}`)
    return true
  } catch (error) {
    logger.error(`Erreur lors de la sauvegarde des configurations: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    return false
  }
}

// Fonction pour mettre à jour la configuration d'un dispositif
export function updateDeviceConfiguration(deviceId, config) {
  if (!deviceConfigurations) {
    deviceConfigurations = loadDeviceConfigurations()
  }

  // Si c'est un tableau, mettre à jour le dispositif dans le tableau
  if (Array.isArray(deviceConfigurations)) {
    const index = deviceConfigurations.findIndex((device) => device.deviceId === deviceId)
    if (index >= 0) {
      deviceConfigurations[index] = config
    } else {
      deviceConfigurations.push(config)
    }
  } else {
    // Sinon, mettre à jour la propriété dans l'objet
    deviceConfigurations[deviceId] = config
  }

  saveDeviceConfigurations(deviceConfigurations)
  logger.info(`Configuration du dispositif ${deviceId} mise à jour`)
  return config
}

