import { Kafka } from "kafkajs"
import logger from "../utils/logger.js"

// Créer une instance Kafka
const kafka = new Kafka({
  clientId: "supervision-system",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
})

// Producteur Kafka
let producer = null
let isConnecting = false

// Fonction pour initialiser Kafka
export async function initializeKafka() {
  try {
    // Initialiser le producteur
    producer = kafka.producer()

    try {
      await producer.connect()
      logger.info("Producteur Kafka connecté")
    } catch (error) {
      logger.warn(`Impossible de se connecter au producteur Kafka: ${error.message}`)
      logger.warn("Les fonctionnalités Kafka seront limitées")
    }

    // Créer les topics s'ils n'existent pas
    try {
      const admin = kafka.admin()
      await admin.connect()

      const topics = [
        { topic: "frames", numPartitions: 3, replicationFactor: 1 },
        { topic: "inferences", numPartitions: 3, replicationFactor: 1 },
        { topic: "alerts", numPartitions: 3, replicationFactor: 1 },
        { topic: "statistics", numPartitions: 3, replicationFactor: 1 },
      ]

      await admin.createTopics({
        topics,
        waitForLeaders: true,
      })

      await admin.disconnect()
      logger.info("Topics Kafka créés")
    } catch (error) {
      logger.warn(`Impossible de créer les topics Kafka: ${error.message}`)
    }

    return true
  } catch (error) {
    logger.error(`Erreur lors de l'initialisation de Kafka: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    return false
  }
}

// Fonction pour obtenir le producteur Kafka
export function getKafkaProducer() {
  if (!producer && !isConnecting) {
    isConnecting = true

    // Créer un producteur et tenter de le connecter
    producer = kafka.producer()
    producer
      .connect()
      .then(() => {
        logger.info("Producteur Kafka connecté avec succès")
        isConnecting = false
      })
      .catch((error) => {
        logger.error(`Erreur lors de la connexion du producteur Kafka: ${error.message}`)
        isConnecting = false
      })

    // Retourner un producteur factice pour éviter les erreurs
    return {
      send: async () => {
        // Ne rien faire, juste simuler l'envoi
        return { success: false, error: "Producteur Kafka non connecté" }
      },
    }
  }

  return producer
}

// Fonction pour créer un consommateur Kafka
export function getKafkaConsumer(groupId) {
  return kafka.consumer({ groupId })
}

