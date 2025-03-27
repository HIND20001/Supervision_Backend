import dgram from "dgram"
import { v4 as uuidv4 } from "uuid"
import logger from "../../utils/logger.js"
import { getKafkaProducer } from "../../config/kafka.js"
import { sendFrameToClients, sendInferenceToClients } from "../websocket/websocketService.js"
import { setupFragmentCleaner } from "../system/fragmentCleaner.js"
import { getDeviceConfiguration } from "../../config/devices.js"
import { processZoneRules } from "../business/zoneProcessor.js"
import { storeFrame, storeInference } from "../storage/storageService.js"

// Map pour stocker les fragments d'images
export const frameFragments = new Map()

// Declare storeLastFrame and broadcastFrame
let storeLastFrame
let broadcastFrame

export function setupUDPServer() {
  const server = dgram.createSocket("udp4")
  const UDP_PORT = process.env.UDP_PORT || 8001

  // Configurer le nettoyage des fragments
  if (typeof setupFragmentCleaner === "function") {
    setupFragmentCleaner(frameFragments)
  } else {
    logger.warn(
      "La fonction setupFragmentCleaner n'est pas disponible, le nettoyage des fragments ne sera pas effectué",
    )
  }

  server.on("error", (err) => {
    logger.error(`Erreur du serveur UDP: ${err.message}`)
    logger.error(`Stack trace: ${err.stack}`)
    server.close()
  })

  server.on("listening", () => {
    const address = server.address()
    logger.info(`Serveur UDP en écoute sur ${address.address}:${address.port}`)
  })

  server.on("message", async (msg, rinfo) => {
    try {
      logger.info(`Paquet UDP reçu de ${rinfo.address}:${rinfo.port}, taille: ${msg.length} octets`)

      // Log des premiers octets pour le débogage
      const firstBytes = msg.slice(0, Math.min(16, msg.length))
      logger.debug(`Premiers octets du paquet: ${firstBytes.toString("hex")}`)

      // Vérifier si c'est un paquet d'inférence
      if (isInferencePacket(msg)) {
        logger.info(`Paquet d'inférence identifié de ${rinfo.address}:${rinfo.port}`)
        await processInferencePacket(msg, rinfo)
        return
      }

      // Vérifier si c'est un paquet de frame fragmenté
      if (isFragmentedFramePacket(msg)) {
        logger.debug(`Paquet de frame fragmenté identifié de ${rinfo.address}:${rinfo.port}`)
        await processFragmentedFramePacket(msg, rinfo)
        return
      }

      // Si ce n'est ni une inférence ni un fragment, traiter comme une image complète
      logger.debug(`Paquet d'image complète identifié de ${rinfo.address}:${rinfo.port}`)
      await processCompleteImage(msg, rinfo)
    } catch (error) {
      logger.error(`Erreur lors du traitement du paquet de ${rinfo.address}:${rinfo.port}: ${error.message}`)
      logger.error(`Stack trace: ${error.stack}`)
    }
  })

  // Démarrer le serveur UDP
  server.bind(Number(UDP_PORT))
  logger.info(`Serveur UDP configuré pour écouter sur le port ${UDP_PORT}`)

  return server
}

// Fonction pour déterminer si un paquet est un paquet d'inférence
function isInferencePacket(msg) {
  // Les paquets d'inférence ont une taille minimale et une structure spécifique
  if (msg.length < 10) return false

  try {
    // Lire le nombre de détections
    const numDetections = msg.readUInt32LE(6)
    logger.debug(`Vérification paquet d'inférence: numDetections=${numDetections}`)

    // Vérifier si la taille du paquet correspond à la structure attendue
    const expectedSize = 10 + numDetections * 40
    const isInference = Math.abs(msg.length - expectedSize) <= 8
    logger.debug(`Taille attendue: ${expectedSize}, taille réelle: ${msg.length}, est une inférence: ${isInference}`)
    return isInference
  } catch (e) {
    logger.warn(`Erreur lors de la vérification du paquet d'inférence: ${e.message}`)
    return false
  }
}

// Fonction pour déterminer si un paquet est un fragment de frame
function isFragmentedFramePacket(msg) {
  // Les paquets fragmentés ont un en-tête de 8 octets
  if (msg.length < 8) return false

  try {
    // Vérifier la structure de l'en-tête
    const frameId = msg.readUInt32LE(0)
    const totalChunks = msg.readUInt16LE(4)
    const chunkIndex = msg.readUInt16LE(6)
    logger.debug(
      `Vérification paquet fragmenté: frameId=${frameId}, totalChunks=${totalChunks}, chunkIndex=${chunkIndex}`,
    )

    // Un paquet fragmenté valide a au moins 1 fragment et l'index est inférieur au total
    return totalChunks > 0 && chunkIndex < totalChunks
  } catch (e) {
    logger.warn(`Erreur lors de la vérification du paquet fragmenté: ${e.message}`)
    return false
  }
}

// Fonction pour traiter les paquets d'inférence
async function processInferencePacket(msg, rinfo) {
  try {
    // Lire l'en-tête
    const frameId = msg.readUInt32LE(0)
    const inferenceId = msg.readUInt16LE(4)
    const numDetections = msg.readUInt32LE(6)

    logger.info(
      `Inférence reçue: deviceId=${rinfo.address}, frameId=${frameId}, inferenceId=${inferenceId}, détections=${numDetections}`,
    )

    // Si aucune détection, pas besoin de continuer
    if (numDetections === 0) {
      logger.info(`Aucune détection dans l'inférence ${inferenceId}, traitement terminé`)
      return
    }

    // Extraire les détections
    const detections = []
    let offset = 10 // Position après l'en-tête

    for (let i = 0; i < numDetections; i++) {
      try {
        const classId = msg.readUInt32LE(offset)
        offset += 4

        const confidence = msg.readFloatLE(offset)
        offset += 4

        const xMin = msg.readFloatLE(offset)
        offset += 4

        const yMin = msg.readFloatLE(offset)
        offset += 4

        const xMax = msg.readFloatLE(offset)
        offset += 4

        const yMax = msg.readFloatLE(offset)
        offset += 4

        const inferenceTime = msg.readBigUInt64LE(offset)
        offset += 8

        const timestamp = msg.readBigUInt64LE(offset)
        offset += 8

        // Convertir l'ID de classe en nom de classe
        const className = getClassName(classId)

        // Créer l'objet de détection
        const detection = {
          classId,
          className,
          confidence,
          bbox: {
            xMin,
            yMin,
            xMax,
            yMax,
            width: xMax - xMin,
            height: yMax - yMin,
          },
          inferenceTime: Number(inferenceTime),
          timestamp: Number(timestamp),
        }

        detections.push(detection)

        logger.info(
          `DÉTECTION: classe=${className} (ID=${classId}), confiance=${confidence.toFixed(2)}, bbox=[xMin=${xMin.toFixed(2)}, yMin=${yMin.toFixed(2)}, xMax=${xMax.toFixed(2)}, yMax=${yMax.toFixed(2)}, width=${detection.bbox.width.toFixed(2)}, height=${detection.bbox.height.toFixed(2)}]`,
        )
      } catch (error) {
        logger.warn(`Erreur lors de la lecture d'une détection: ${error.message}`)
        logger.warn(`Stack trace: ${error.stack}`)
        // Ajuster l'offset pour la prochaine détection
        offset += 40 - ((offset - 10) % 40)
      }
    }

    // Récupérer la configuration du dispositif
    const deviceConfig = getDeviceConfiguration(rinfo.address)
    const location = deviceConfig ? [deviceConfig.location.latitude, deviceConfig.location.longitude] : [0, 0]

    // Créer l'objet inférence à envoyer via WebSocket
    const inferenceUuid = uuidv4()
    logger.info(`Génération d'un UUID pour l'inférence: ${inferenceUuid}`)

    const inferenceObject = {
      inferenceId: inferenceUuid,
      originalInferenceId: inferenceId,
      frameId: frameId.toString(),
      deviceId: rinfo.address,
      timestamp: new Date().toISOString(),
      detections,
      ipAddress: rinfo.address,
      location,
    }

    // Log détaillé de l'objet d'inférence
    logger.debug(`Objet d'inférence complet: ${JSON.stringify(inferenceObject)}`)

    // Traiter les règles de zone pour cette inférence
    if (deviceConfig) {
      await processZoneRules(inferenceObject, deviceConfig)
    }

    // Stocker l'inférence en base de données si la fonction existe
    if (typeof storeInference === "function") {
      await storeInference(inferenceObject)
    } else {
      logger.warn("La fonction storeInference n'est pas disponible, l'inférence ne sera pas stockée en base de données")
    }

    // Envoyer l'inférence aux clients connectés via WebSocket
    sendInferenceToClients(rinfo.address, inferenceObject)
    logger.info(`Inférence envoyée aux clients via WebSocket: ${inferenceUuid}`)

    // Publier un événement Kafka pour l'inférence
    try {
      if (typeof getKafkaProducer === "function") {
        logger.info(`Publication de l'inférence ${inferenceUuid} sur Kafka (topic: inferences)`)
        const producer = getKafkaProducer()
        await producer.send({
          topic: "inferences",
          messages: [
            {
              key: rinfo.address,
              value: JSON.stringify(inferenceObject),
            },
          ],
        })
        logger.info(`Événement Kafka publié avec succès pour l'inférence ${inferenceUuid}`)
      } else {
        logger.warn("La fonction getKafkaProducer n'est pas disponible, l'événement Kafka ne sera pas publié")
      }
    } catch (kafkaError) {
      logger.error(`Erreur lors de la publication Kafka pour l'inférence: ${kafkaError.message}`)
      logger.error(`Stack trace: ${kafkaError.stack}`)
    }
  } catch (error) {
    logger.error(`Erreur lors du traitement du paquet d'inférence: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour traiter les paquets de frame fragmentés
async function processFragmentedFramePacket(msg, rinfo) {
  try {
    // Lire l'en-tête
    const frameId = msg.readUInt32LE(0)
    const totalChunks = msg.readUInt16LE(4)
    const chunkIndex = msg.readUInt16LE(6)

    // Extraire les données d'image (après l'en-tête)
    const imageChunk = msg.slice(8)

    logger.debug(
      `Fragment de frame reçu: deviceId=${rinfo.address}, frameId=${frameId}, fragment=${chunkIndex + 1}/${totalChunks}, taille=${imageChunk.length} octets`,
    )

    // Clé unique pour identifier cette frame fragmentée
    const frameKey = `${rinfo.address}:${frameId}`

    // Récupérer ou créer l'entrée pour cette frame
    if (!frameFragments.has(frameKey)) {
      frameFragments.set(frameKey, {
        chunks: new Array(totalChunks).fill(null),
        receivedChunks: 0,
        totalChunks,
        timestamp: Date.now(),
      })
    }

    const frameData = frameFragments.get(frameKey)

    // Stocker ce fragment
    if (frameData.chunks[chunkIndex] === null) {
      frameData.chunks[chunkIndex] = imageChunk
      frameData.receivedChunks++

      // Vérifier si tous les fragments ont été reçus
      if (frameData.receivedChunks === frameData.totalChunks) {
        // Reconstruire l'image complète
        const completeImage = Buffer.concat(frameData.chunks)

        // Traiter l'image reconstruite
        await processCompleteImage(completeImage, rinfo, frameId)

        // Supprimer les données de fragments
        frameFragments.delete(frameKey)

        logger.info(
          `Frame reconstruite: deviceId=${rinfo.address}, frameId=${frameId}, taille=${completeImage.length} octets`,
        )
      }
    }
  } catch (error) {
    logger.error(`Erreur lors du traitement du fragment de frame: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour traiter une image complète
async function processCompleteImage(msg, rinfo, frameId = null) {
  try {
    // Générer un ID unique pour cette image si non fourni
    if (frameId === null) {
      frameId = Date.now()
    }

    logger.info(`Image complète reçue: deviceId=${rinfo.address}, frameId=${frameId}, taille=${msg.length} octets`)

    // Vérifier si les données sont valides comme image JPEG
    if (msg.length < 2 || msg[0] !== 0xff || msg[1] !== 0xd8) {
      logger.warn(`Données d'image potentiellement invalides reçues de ${rinfo.address}:${rinfo.port}`)
      // Continuer tout de même, car certains formats peuvent être valides même sans l'en-tête JPEG standard
    }

    // Récupérer la configuration du dispositif
    const deviceConfig = getDeviceConfiguration(rinfo.address)
    const location = deviceConfig ? [deviceConfig.location.latitude, deviceConfig.location.longitude] : [0, 0]

    // Créer un objet Base64 pour l'image
    const base64Image = msg.toString("base64")
    const dataUrl = `data:image/jpeg;base64,${base64Image}`

    // Créer l'objet frame à envoyer via WebSocket
    const frameObject = {
      frameId: frameId.toString(),
      deviceId: rinfo.address,
      timestamp: new Date().toISOString(),
      imageDataUrl: dataUrl,
      ipAddress: rinfo.address,
      location,
    }

    // Log détaillé de l'objet frame (sans l'image base64 qui est trop volumineuse)
    const frameObjectLog = { ...frameObject }
    delete frameObjectLog.imageDataUrl
    logger.debug(`Objet frame (sans imageDataUrl): ${JSON.stringify(frameObjectLog)}`)

    // Stocker la dernière frame pour le flux vidéo si la fonction existe
    if (typeof storeLastFrame === "function") {
      storeLastFrame(rinfo.address, frameObject, msg)
    }

    // Diffuser la frame aux clients connectés au flux MJPEG si la fonction existe
    if (typeof broadcastFrame === "function") {
      broadcastFrame(rinfo.address, msg)
    }

    // Stocker la frame en base de données si la fonction existe
    if (typeof storeFrame === "function") {
      await storeFrame(frameObject, msg)
    } else {
      logger.warn("La fonction storeFrame n'est pas disponible, la frame ne sera pas stockée en base de données")
    }

    // Envoyer la frame aux clients connectés via WebSocket
    sendFrameToClients(rinfo.address, frameObject)
    logger.info(`Frame envoyée aux clients via WebSocket: ${frameId}`)

    // Publier un événement Kafka pour la frame
    try {
      if (typeof getKafkaProducer === "function") {
        logger.info(`Publication de la frame ${frameId} sur Kafka (topic: frames)`)
        const producer = getKafkaProducer()
        await producer.send({
          topic: "frames",
          messages: [
            {
              key: rinfo.address,
              value: JSON.stringify({
                frameId: frameId.toString(),
                deviceId: rinfo.address,
                timestamp: new Date().toISOString(),
                imageSize: msg.length,
                ipAddress: rinfo.address,
                location,
                storeImage: false, // Ne stocke pas l'image complète, seulement si c'est une frame d'alerte
              }),
            },
          ],
        })
        logger.info(`Événement Kafka publié avec succès pour la frame ${frameId}`)
      } else {
        logger.warn("La fonction getKafkaProducer n'est pas disponible, l'événement Kafka ne sera pas publié")
      }
    } catch (kafkaError) {
      logger.error(`Erreur lors de la publication Kafka pour la frame: ${kafkaError.message}`)
      logger.error(`Stack trace: ${kafkaError.stack}`)
    }
  } catch (error) {
    logger.error(`Erreur lors du traitement de l'image complète: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour convertir l'ID de classe en nom de classe
function getClassName(classId) {
  // Mapping des IDs de classe vers les noms selon les informations fournies
  const classMap = {
    0: "person",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
    80: "empty garbage",
    81: "full garbage",
    82: "garbage truck",
    83: "taxi",
    // Ajouter d'autres classes selon votre modèle
  }

  return classMap[classId] || `unknown_${classId}`
}

