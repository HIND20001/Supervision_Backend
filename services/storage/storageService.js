import path from "path"
import { fileURLToPath } from "url"
import { pool } from "../../config/db.js"
import logger from "../../utils/logger.js"

// Obtenir le chemin du répertoire actuel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Répertoires de stockage
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, "../../storage")
const FRAMES_DIR = path.join(STORAGE_DIR, "frames")
const ALERTS_DIR = path.join(STORAGE_DIR, "alerts")

// Fonction pour stocker une frame
export async function storeFrame(frameData, imageBuffer) {
  try {
    logger.debug(`Stockage des métadonnées de frame: ${frameData.frameId}`)

    // Vérifier si le dispositif existe, sinon l'ajouter
    await ensureDeviceExists(frameData.deviceId)

    // Insérer les métadonnées de la frame dans la base de données
    const query = `
      INSERT INTO frames (frame_id, device_id, timestamp)
      VALUES ($1, $2, $3)
      RETURNING id
    `

    const values = [frameData.frameId, frameData.deviceId, frameData.timestamp]

    await pool.query(query, values)

    logger.debug(`Métadonnées de frame stockées: ${frameData.frameId}`)
    return true
  } catch (error) {
    logger.error(`Erreur lors du stockage de la frame: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    return false
  }
}

// Fonction pour stocker une inférence
export async function storeInference(inferenceData) {
  try {
    logger.debug(`Stockage de l'inférence: ${inferenceData.inferenceId}`)

    // Vérifier si le dispositif existe, sinon l'ajouter
    await ensureDeviceExists(inferenceData.deviceId)

    // Insérer l'inférence dans la base de données
    const query = `
      INSERT INTO inferences (inference_id, frame_id, device_id, timestamp)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `

    const values = [inferenceData.inferenceId, inferenceData.frameId, inferenceData.deviceId, inferenceData.timestamp]

    const result = await pool.query(query, values)
    const inferenceDbId = result.rows[0].id

    // Stocker les détections
    if (inferenceData.detections && inferenceData.detections.length > 0) {
      for (const detection of inferenceData.detections) {
        const detectionQuery = `
          INSERT INTO detections (
            inference_id, class_id, class_name, confidence, 
            x_min, y_min, x_max, y_max
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `

        const detectionValues = [
          inferenceDbId,
          detection.classId,
          detection.className,
          detection.confidence,
          detection.bbox.xMin,
          detection.bbox.yMin,
          detection.bbox.xMax,
          detection.bbox.yMax,
        ]

        await pool.query(detectionQuery, detectionValues)
      }
    }

    logger.debug(`Inférence stockée: ${inferenceData.inferenceId}`)
    return true
  } catch (error) {
    logger.error(`Erreur lors du stockage de l'inférence: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    return false
  }
}

// Fonction pour récupérer une image d'alerte
export async function getAlertImage(alertId, type = "start") {
  try {
    logger.debug(`Récupération de l'image d'alerte (${type}): ${alertId}`)

    // Simuler la récupération d'une image
    return Buffer.from("Image simulée")
  } catch (error) {
    logger.error(`Erreur lors de la récupération de l'image d'alerte: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    return null
  }
}

// Fonction pour stocker une image d'alerte
export async function storeAlertImage(alertId, imageBuffer) {
  try {
    logger.debug(`Stockage de l'image d'alerte: ${alertId}`)

    // Simuler le stockage d'une image
    return `${ALERTS_DIR}/${alertId}.jpg`
  } catch (error) {
    logger.error(`Erreur lors du stockage de l'image d'alerte: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    return null
  }
}

// Fonction pour stocker une image de résolution d'alerte
export async function storeAlertResolutionImage(alertId, imageBuffer) {
  try {
    logger.debug(`Stockage de l'image de résolution d'alerte: ${alertId}`)

    // Simuler le stockage d'une image
    return `${ALERTS_DIR}/${alertId}_resolution.jpg`
  } catch (error) {
    logger.error(`Erreur lors du stockage de l'image de résolution d'alerte: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    return null
  }
}

// Fonction pour s'assurer qu'un dispositif existe dans la base de données
async function ensureDeviceExists(deviceId) {
  try {
    // Vérifier si le dispositif existe déjà
    const checkQuery = `
      SELECT device_id FROM devices WHERE device_id = $1
    `
    const checkResult = await pool.query(checkQuery, [deviceId])

    if (checkResult.rows.length === 0) {
      // Insérer le dispositif
      const insertQuery = `
        INSERT INTO devices (device_id, ip_address, name)
        VALUES ($1, $2, $3)
      `
      const insertValues = [deviceId, deviceId, `Dispositif ${deviceId}`]

      await pool.query(insertQuery, insertValues)
      logger.info(`Dispositif ajouté automatiquement: ${deviceId}`)
    }
  } catch (error) {
    logger.error(`Erreur lors de la vérification/insertion du dispositif: ${error.message}`)
    throw error
  }
}

