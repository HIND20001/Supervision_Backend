import { Server } from "socket.io"
import logger from "../../utils/logger.js"

let io

// Initialiser le service WebSocket
export function initWebSocketService(server) {
  try {
    io = new Server(server, {
      cors: {
        origin: "*", // Permettre toutes les origines en développement
        methods: ["GET", "POST"],
      },
    })

    io.on("connection", (socket) => {
      logger.info(`Nouvelle connexion WebSocket: ${socket.id} depuis ${socket.handshake.address}`)

      // Log des headers de la requête
      logger.debug(`Headers de connexion: ${JSON.stringify(socket.handshake.headers)}`)

      // Gérer l'abonnement aux dispositifs
      socket.on("subscribe", (deviceId) => {
        if (deviceId) {
          socket.join(deviceId)
          logger.info(`Client ${socket.id} abonné au dispositif ${deviceId}`)
        }
      })

      // Gérer le désabonnement
      socket.on("unsubscribe", (deviceId) => {
        if (deviceId) {
          socket.leave(deviceId)
          logger.info(`Client ${socket.id} désabonné du dispositif ${deviceId}`)
        }
      })

      // Écouter les messages du client
      socket.on("message", (data) => {
        logger.info(`Message reçu du client ${socket.id}: ${JSON.stringify(data)}`)
      })

      // Écouter les données d'inférence envoyées par les dispositifs
      socket.on("inference", (data) => {
        logger.info(`Inférence reçue du dispositif ${data.deviceId || "inconnu"}, ID: ${data.inferenceId || "N/A"}`)
        logger.debug(`Données d'inférence complètes: ${JSON.stringify(data)}`)

        // Traiter les détections
        if (data.detections && Array.isArray(data.detections)) {
          logger.info(`Nombre de détections: ${data.detections.length}`)

          // Log détaillé de chaque détection
          data.detections.forEach((detection, index) => {
            logger.debug(
              `Détection ${index + 1}: Classe=${detection.className}, Confiance=${detection.confidence}, BBox=${JSON.stringify(detection.bbox)}`,
            )
          })
        }
      })

      // Écouter les alertes envoyées par les dispositifs
      socket.on("alert", (data) => {
        logger.info(
          `Alerte reçue du dispositif ${data.deviceId || "inconnu"}, Type: ${data.type || "N/A"}, Sous-type: ${data.subType || "N/A"}`,
        )
        logger.debug(`Données d'alerte complètes: ${JSON.stringify(data)}`)
      })

      // Gérer la déconnexion
      socket.on("disconnect", (reason) => {
        logger.info(`Client WebSocket déconnecté: ${socket.id}, raison: ${reason}`)
      })

      // Gérer les erreurs
      socket.on("error", (error) => {
        logger.error(`Erreur WebSocket pour le client ${socket.id}: ${error.message}`)
      })
    })

    logger.info("Service WebSocket initialisé avec succès")
  } catch (error) {
    logger.error(`Erreur lors de l'initialisation du service WebSocket: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Envoyer une frame aux clients abonnés
export function sendFrameToClients(deviceId, frameData) {
  if (!io) {
    logger.warn("Service WebSocket non initialisé")
    return
  }

  try {
    const payload = {
      type: "frame",
      deviceId,
      timestamp: new Date().toISOString(),
      data: frameData,
    }

    // Log détaillé des données envoyées
    logger.debug(
      `Envoi de frame pour le dispositif ${deviceId}: ${JSON.stringify({
        type: "frame",
        deviceId,
        timestamp: payload.timestamp,
        dataSize: frameData ? frameData.length || "N/A" : "null",
      })}`,
    )

    io.to(deviceId).emit("frame", payload)

    // Log du nombre de clients qui ont reçu la frame
    const room = io.sockets.adapter.rooms.get(deviceId)
    const clientCount = room ? room.size : 0
    logger.debug(`Frame envoyée à ${clientCount} client(s) pour le dispositif ${deviceId}`)
  } catch (error) {
    logger.error(`Erreur lors de l'envoi de la frame: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Envoyer une inférence aux clients abonnés
export function sendInferenceToClients(deviceId, inferenceData) {
  if (!io) {
    logger.warn("Service WebSocket non initialisé")
    return
  }

  try {
    const payload = {
      type: "inference",
      deviceId,
      timestamp: new Date().toISOString(),
      data: inferenceData,
    }

    // Log détaillé des données envoyées
    logger.debug(
      `Envoi d'inférence pour le dispositif ${deviceId}: ${JSON.stringify({
        type: "inference",
        deviceId,
        timestamp: payload.timestamp,
        inferenceId: inferenceData.inferenceId || "N/A",
        detectionCount: inferenceData.detections ? inferenceData.detections.length : 0,
      })}`,
    )

    // Log détaillé de chaque détection
    if (inferenceData.detections && Array.isArray(inferenceData.detections)) {
      inferenceData.detections.forEach((detection, index) => {
        logger.debug(
          `Détection ${index + 1} envoyée: Classe=${detection.className}, Confiance=${detection.confidence}, BBox=${JSON.stringify(detection.bbox)}`,
        )
      })
    }

    io.to(deviceId).emit("inference", payload)

    // Log du nombre de clients qui ont reçu l'inférence
    const room = io.sockets.adapter.rooms.get(deviceId)
    const clientCount = room ? room.size : 0
    logger.debug(`Inférence envoyée à ${clientCount} client(s) pour le dispositif ${deviceId}`)
  } catch (error) {
    logger.error(`Erreur lors de l'envoi de l'inférence: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Envoyer une alerte aux clients abonnés
export function sendAlertToClients(deviceId, alertData) {
  if (!io) {
    logger.warn("Service WebSocket non initialisé")
    return
  }

  try {
    // Format de l'alerte envoyée au frontend
    const alertPayload = {
      type: "alert",
      deviceId: alertData.deviceId,
      alertId: alertData.id,
      zoneId: alertData.zoneId,
      zoneName: alertData.zoneName,
      alertType: alertData.type,
      alertSubType: alertData.subType,
      status: alertData.status,
      startTime: alertData.startTime,
      endTime: alertData.endTime,
      duration: alertData.duration,
      imagePath: alertData.imagePath,
      metadata: alertData.metadata,
      timestamp: new Date().toISOString(),
    }

    // Log détaillé de l'alerte envoyée
    logger.debug(
      `Envoi d'alerte pour le dispositif ${deviceId}: ${JSON.stringify({
        type: "alert",
        deviceId: alertData.deviceId,
        alertId: alertData.id,
        zoneId: alertData.zoneId,
        zoneName: alertData.zoneName,
        alertType: alertData.type,
        alertSubType: alertData.subType,
        status: alertData.status,
        timestamp: alertPayload.timestamp,
      })}`,
    )

    // Log détaillé des métadonnées de l'alerte
    logger.debug(`Métadonnées de l'alerte: ${JSON.stringify(alertData.metadata)}`)

    // Envoyer à tous les clients abonnés au dispositif
    io.to(deviceId).emit("alert", alertPayload)

    // Log du nombre de clients qui ont reçu l'alerte pour ce dispositif
    const deviceRoom = io.sockets.adapter.rooms.get(deviceId)
    const deviceClientCount = deviceRoom ? deviceRoom.size : 0
    logger.debug(`Alerte envoyée à ${deviceClientCount} client(s) pour le dispositif ${deviceId}`)

    // Envoyer également sur le canal 'all' pour les clients qui écoutent toutes les alertes
    io.to("all").emit("alert", alertPayload)

    // Log du nombre de clients qui ont reçu l'alerte sur le canal 'all'
    const allRoom = io.sockets.adapter.rooms.get("all")
    const allClientCount = allRoom ? allRoom.size : 0
    logger.debug(`Alerte envoyée à ${allClientCount} client(s) sur le canal 'all'`)

    logger.info(
      `Alerte envoyée aux clients: ${alertData.id}, type=${alertData.type}, sous-type=${alertData.subType}, dispositif=${deviceId}`,
    )
  } catch (error) {
    logger.error(`Erreur lors de l'envoi de l'alerte: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Envoyer des statistiques aux clients abonnés
export function sendStatisticsToClients(deviceId, statsData) {
  if (!io) {
    logger.warn("Service WebSocket non initialisé")
    return
  }

  try {
    const payload = {
      type: "statistics",
      deviceId,
      timestamp: new Date().toISOString(),
      data: statsData,
    }

    // Log détaillé des statistiques envoyées
    logger.debug(
      `Envoi de statistiques pour le dispositif ${deviceId}: ${JSON.stringify({
        type: "statistics",
        deviceId,
        timestamp: payload.timestamp,
        statsType: statsData.type || "N/A",
        period: statsData.period || "N/A",
      })}`,
    )

    // Log détaillé des données de statistiques
    logger.debug(`Données de statistiques complètes: ${JSON.stringify(statsData)}`)

    io.to(deviceId).emit("statistics", payload)

    // Log du nombre de clients qui ont reçu les statistiques
    const room = io.sockets.adapter.rooms.get(deviceId)
    const clientCount = room ? room.size : 0
    logger.debug(`Statistiques envoyées à ${clientCount} client(s) pour le dispositif ${deviceId}`)
  } catch (error) {
    logger.error(`Erreur lors de l'envoi des statistiques: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Obtenir l'instance IO
export function getIO() {
  return io
}

// Obtenir des informations sur les clients connectés
export function getConnectedClients() {
  if (!io) {
    logger.warn("Service WebSocket non initialisé")
    return { count: 0, clients: [] }
  }

  try {
    const clients = []
    let count = 0

    io.sockets.sockets.forEach((socket) => {
      count++
      clients.push({
        id: socket.id,
        address: socket.handshake.address,
        connectedAt: socket.handshake.time,
        rooms: Array.from(socket.rooms),
      })
    })

    return { count, clients }
  } catch (error) {
    logger.error(`Erreur lors de la récupération des clients connectés: ${error.message}`)
    return { count: 0, clients: [] }
  }
}

