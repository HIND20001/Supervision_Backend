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

// Créer un producteur
const producer = kafka.producer()

// Variable pour suivre l'état de connexion
let isConnected = false

// Fonction pour initialiser le producteur
async function initProducer() {
  try {
    if (!isConnected) {
      await producer.connect()
      isConnected = true
      logger.info("Producteur Kafka connecté")
    }
  } catch (error) {
    logger.error(`Erreur lors de la connexion du producteur Kafka: ${error.message}`)
    isConnected = false
    throw error
  }
}

// Fonction pour obtenir le producteur Kafka
export function getKafkaProducer() {
  if (!isConnected) {
    initProducer().catch((error) => {
      logger.error(`Échec de l'initialisation du producteur Kafka: ${error.message}`)
    })
  }
  return producer
}

