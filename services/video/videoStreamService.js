import path from "path"
import { fileURLToPath } from "url"
import logger from "../../utils/logger.js"

// Obtenir le chemin du répertoire actuel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Map pour stocker les dernières frames par dispositif
const lastFrames = new Map()

// Fonction pour initialiser le service de flux vidéo
export function setupVideoStreamService() {
  logger.info("Service de flux vidéo initialisé")

  // Nettoyer les frames anciennes toutes les 5 minutes
  setInterval(() => {
    const currentTime = Date.now()
    for (const [deviceId, frameData] of lastFrames.entries()) {
      if (currentTime - frameData.timestamp > 300000) {
        // 5 minutes
        lastFrames.delete(deviceId)
        logger.debug(`Frame ancienne supprimée pour le dispositif ${deviceId}`)
      }
    }
  }, 300000)
}

// Fonction pour stocker la dernière frame d'un dispositif
export function storeLastFrame(deviceId, frameData, imageBuffer) {
  lastFrames.set(deviceId, {
    frameId: frameData.frameId,
    timestamp: Date.now(),
    imageBuffer,
  })
}

// Fonction pour récupérer la dernière frame d'un dispositif
export function getLastFrame(deviceId) {
  return lastFrames.get(deviceId)
}

// Fonction pour générer un flux MJPEG
export function createMJPEGStream(req, res) {
  const deviceId = req.params.deviceId

  // Vérifier si le dispositif existe
  if (!lastFrames.has(deviceId)) {
    res.status(404).send("Dispositif non trouvé ou aucune frame disponible")
    return
  }

  // Configurer les en-têtes pour un flux MJPEG
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    Pragma: "no-cache",
  })

  // Fonction pour envoyer une frame
  const sendFrame = (frameBuffer) => {
    if (!res.writableEnded) {
      res.write("--frame\r\n" + "Content-Type: image/jpeg\r\n" + "Content-Length: " + frameBuffer.length + "\r\n\r\n")
      res.write(frameBuffer)
      res.write("\r\n")
    }
  }

  // Envoyer la dernière frame disponible immédiatement
  const lastFrame = lastFrames.get(deviceId)
  if (lastFrame && lastFrame.imageBuffer) {
    sendFrame(lastFrame.imageBuffer)
  }

  // Créer un identifiant pour ce client
  const clientId = Date.now().toString()

  // Stocker la fonction de callback pour ce client
  if (!streamClients.has(deviceId)) {
    streamClients.set(deviceId, new Map())
  }
  streamClients.get(deviceId).set(clientId, sendFrame)

  // Gérer la déconnexion du client
  req.on("close", () => {
    if (streamClients.has(deviceId)) {
      streamClients.get(deviceId).delete(clientId)
      if (streamClients.get(deviceId).size === 0) {
        streamClients.delete(deviceId)
      }
    }
    logger.debug(`Client MJPEG déconnecté: ${clientId} pour le dispositif ${deviceId}`)
  })

  logger.info(`Flux MJPEG démarré pour le dispositif ${deviceId}, client ${clientId}`)
}

// Map pour stocker les clients de flux par dispositif
const streamClients = new Map()

// Fonction pour diffuser une nouvelle frame à tous les clients connectés
export function broadcastFrame(deviceId, imageBuffer) {
  if (streamClients.has(deviceId)) {
    const clients = streamClients.get(deviceId)
    for (const sendFrame of clients.values()) {
      try {
        sendFrame(imageBuffer)
      } catch (error) {
        logger.error(`Erreur lors de l'envoi de la frame au client: ${error.message}`)
      }
    }
    logger.debug(`Frame diffusée à ${clients.size} clients pour le dispositif ${deviceId}`)
  }
}

