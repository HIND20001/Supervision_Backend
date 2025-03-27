import { storeAlertResolutionImage } from "../storage/storageService.js"
import { getKafkaProducer } from "../kafka/kafkaProducer.js" // Import Kafka producer
import { sendAlertToClients } from "../websocket/websocketService.js" // Import WebSocket sender
import logger from "../../utils/logger.js" // Import logger

// Mock activeAlerts for demonstration purposes.  In a real application, this would likely be stored in a database or cache.
const activeAlerts = new Map()

// Fonction pour clôturer une alerte avec une image de résolution
export async function closeAlertWithImage(alertId, closeData, imageBuffer) {
  try {
    // Vérifier si l'alerte existe
    if (!activeAlerts.has(alertId)) {
      throw new Error(`Alerte non trouvée: ${alertId}`)
    }

    // Récupérer l'alerte
    const alert = activeAlerts.get(alertId)

    // Stocker l'image de résolution si fournie
    let resolutionImagePath = null
    if (imageBuffer) {
      resolutionImagePath = await storeAlertResolutionImage(alertId, imageBuffer)
    }

    // Mettre à jour les données de clôture
    const closedAlert = {
      ...alert,
      ...closeData,
      status: "resolved",
      updatedAt: new Date().toISOString(),
      resolutionImagePath,
    }

    // Supprimer l'alerte des alertes actives
    activeAlerts.delete(alertId)

    // Publier la clôture sur Kafka
    const producer = getKafkaProducer()
    await producer.send({
      topic: "alerts",
      messages: [
        {
          key: alert.deviceId,
          value: JSON.stringify(closedAlert),
        },
      ],
    })

    // Envoyer la clôture aux clients connectés via WebSocket
    sendAlertToClients(alert.deviceId, closedAlert)

    logger.info(`Alerte clôturée avec image: ${alertId}`)

    return closedAlert
  } catch (error) {
    logger.error(`Erreur lors de la clôture de l'alerte avec image: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    throw error
  }
}

