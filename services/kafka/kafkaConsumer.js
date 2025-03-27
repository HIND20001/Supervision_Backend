import { Kafka } from "kafkajs"
import logger from "../../utils/logger.js"

// Configuration Kafka
const KAFKA_BROKERS = process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(",") : ["localhost:9092"]

// Créer une instance Kafka
const kafka = new Kafka({
  clientId: "supervision-system",
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
})

// Fonction pour configurer les consommateurs Kafka
export async function setupKafkaConsumers() {
  try {
    logger.info("Initialisation des consommateurs Kafka...")

    // Vérifier si Kafka est disponible
    try {
      const admin = kafka.admin()
      await admin.connect()
      const topics = await admin.listTopics()
      logger.info(`Topics Kafka disponibles: ${topics.join(", ")}`)
      await admin.disconnect()
    } catch (error) {
      logger.warn(`Impossible de se connecter à Kafka: ${error.message}`)
      logger.warn("Les consommateurs Kafka ne seront pas initialisés")
      return
    }

    // Créer un consommateur pour les alertes
    const alertConsumer = kafka.consumer({ groupId: "alerts-group" })
    await alertConsumer.connect()
    await alertConsumer.subscribe({ topic: "alerts", fromBeginning: false })

    // Traiter les messages d'alerte
    await alertConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const alertData = JSON.parse(message.value.toString())
          logger.info(`Message Kafka reçu (topic: ${topic}): ${JSON.stringify(alertData)}`)

          // Traiter l'alerte (à implémenter selon vos besoins)
        } catch (error) {
          logger.error(`Erreur lors du traitement du message Kafka: ${error.message}`)
        }
      },
    })

    logger.info("Consommateurs Kafka initialisés avec succès")
  } catch (error) {
    logger.error(`Erreur lors de l'initialisation des consommateurs Kafka: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    throw error
  }
}

// Exporter la fonction pour obtenir un producteur Kafka
export function getKafkaProducer() {
  return kafka.producer()
}

