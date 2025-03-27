import logger from "../../utils/logger.js"
import { getKafkaConsumer } from "../../config/kafka.js"
import { getDeviceConfiguration } from "../config/configService.js"

// Fonction pour configurer le processeur d'alertes
export function setupAlertProcessor() {
  // Configurer le consommateur Kafka pour les alertes
  const consumer = getKafkaConsumer("alert-processor-group")

  // S'abonner aux topics nécessaires
  consumer.subscribe({ topics: ["alerts", "inferences"] })

  // Démarrer la consommation
  consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        // Traiter le message selon le topic
        if (topic === "alerts") {
          await processAlertMessage(message)
        } else if (topic === "inferences") {
          await processInferenceMessage(message)
        }
      } catch (error) {
        logger.error(`Erreur lors du traitement du message Kafka: ${error.message}`)
        logger.error(`Stack trace: ${error.stack}`)
      }
    },
  })

  logger.info("Processeur d'alertes configuré")
}

// Fonction pour traiter un message d'alerte
async function processAlertMessage(message) {
  try {
    // Décoder le message
    const alertData = JSON.parse(message.value.toString())

    logger.info(`Message d'alerte reçu: ${alertData.id}`)

    // Traiter selon le statut de l'alerte
    switch (alertData.status) {
      case "active":
        // Alerte nouvellement créée ou mise à jour
        logger.info(`Alerte active: ${alertData.id}`)
        break
      case "resolved":
        // Alerte résolue
        logger.info(`Alerte résolue: ${alertData.id}`)
        break
      default:
        logger.warn(`Statut d'alerte non reconnu: ${alertData.status}`)
    }
  } catch (error) {
    logger.error(`Erreur lors du traitement du message d'alerte: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour traiter un message d'inférence
async function processInferenceMessage(message) {
  try {
    // Décoder le message
    const inferenceData = JSON.parse(message.value.toString())

    logger.debug(`Message d'inférence reçu: ${inferenceData.inferenceId}`)

    // Récupérer la configuration du dispositif
    const deviceConfig = getDeviceConfiguration(inferenceData.deviceId)

    if (!deviceConfig) {
      logger.warn(`Configuration non trouvée pour le dispositif ${inferenceData.deviceId}`)
      return
    }

    // Traiter les règles spécifiques qui ne sont pas gérées par le processeur de zone
    // Par exemple, des règles globales ou des alertes basées sur plusieurs inférences
  } catch (error) {
    logger.error(`Erreur lors du traitement du message d'inférence: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

