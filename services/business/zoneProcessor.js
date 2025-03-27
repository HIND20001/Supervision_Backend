import logger from "../../utils/logger.js"
import { pool } from "../../config/db.js"
import { v4 as uuidv4 } from "uuid"
import { getKafkaProducer } from "../kafka/kafkaProducer.js"
import { sendAlertToClients } from "../websocket/websocketService.js"
import { updateZoneStatistics } from "../statistics/statisticsService.js"
import { storeAlertImage } from "../storage/storageService.js"

// Map pour stocker les alertes actives
const activeAlerts = new Map()

// Map pour stocker les véhicules stationnés par zone
const parkedVehicles = new Map()

// Map pour stocker l'historique des détections par zone (pour la tolérance)
const detectionHistory = new Map()

// Nombre de frames à conserver pour la tolérance
const FRAME_TOLERANCE = 5

// Pourcentage minimum de chevauchement pour considérer qu'un objet est dans une zone
const OVERLAP_THRESHOLD = 0.5 // 50%

// Intervalle de nettoyage des véhicules (en millisecondes)
const VEHICLE_CLEANUP_INTERVAL = 60000 // 1 minute

// Délai avant de considérer qu'un véhicule n'est plus présent (en millisecondes)
const VEHICLE_ABSENCE_THRESHOLD = 30000 // 30 secondes

// Initialiser le nettoyage périodique des véhicules
setInterval(cleanupParkedVehicles, VEHICLE_CLEANUP_INTERVAL)

// Fonction pour traiter les règles de zone
export async function processZoneRules(inferenceData, deviceConfig) {
  try {
    if (!deviceConfig.zones || deviceConfig.zones.length === 0) {
      return
    }

    logger.debug(`Traitement des règles de zone pour l'inférence ${inferenceData.inferenceId}`)

    // Traiter chaque zone
    for (const zone of deviceConfig.zones) {
      try {
        switch (zone.type) {
          case "parking":
            await processParkingZone(inferenceData, zone, deviceConfig)
            break
          case "garbage":
          case "trash":
            await processGarbageZone(inferenceData, zone, deviceConfig)
            break
          case "crowd":
            await processCrowdZone(inferenceData, zone, deviceConfig)
            break
          default:
            logger.warn(`Type de zone non pris en charge: ${zone.type}`)
        }
      } catch (zoneError) {
        logger.error(`Erreur lors du traitement de la zone ${zone.id}: ${zoneError.message}`)
      }
    }
  } catch (error) {
    logger.error(`Erreur lors du traitement des règles de zone: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour traiter une zone de stationnement
async function processParkingZone(inferenceData, zone, deviceConfig) {
  try {
    logger.debug(`Traitement de la zone de stationnement ${zone.id}`)

    // Filtrer les détections pour ne garder que les véhicules dans la zone
    const vehiclesInZone = inferenceData.detections.filter(
      (detection) =>
        isInZone(detection, zone.geometry, deviceConfig.deviceId, zone.id) &&
        ["car", "truck", "bus", "motorcycle", "taxi"].includes(detection.className) &&
        detection.confidence > (zone.rules?.minConfidence || 0.6),
    )

    // Clé unique pour cette zone
    const zoneKey = `${deviceConfig.deviceId}:${zone.id}`

    // Mettre à jour les statistiques de la zone
    updateZoneStatistics(deviceConfig.deviceId, zone.id, vehiclesInZone)

    // Mettre à jour les véhicules stationnés
    updateParkedVehicles(zoneKey, vehiclesInZone, inferenceData.timestamp)

    // Vérifier les règles de stationnement
    if (zone.rules && zone.rules.maxDuration) {
      const maxDuration = zone.rules.maxDuration * 1000 // Convertir en millisecondes
      const currentTime = new Date(inferenceData.timestamp).getTime()

      // Vérifier si des véhicules dépassent la durée maximale
      if (parkedVehicles.has(zoneKey)) {
        const zoneVehicles = parkedVehicles.get(zoneKey)

        for (const [vehicleId, vehicleData] of zoneVehicles.entries()) {
          const parkingDuration = currentTime - vehicleData.arrivalTime

          // Si le véhicule dépasse la durée maximale et qu'il n'y a pas déjà une alerte active
          if (parkingDuration > maxDuration && !hasActiveAlertForVehicle(zoneKey, vehicleId)) {
            // Créer une alerte
            await createAlert(
              deviceConfig.deviceId,
              zone.id,
              zone.name,
              "parking_violation",
              "exceeded_duration",
              {
                vehicleId,
                vehicleType: vehicleData.type,
                parkingDuration,
                maxDuration,
                location: inferenceData.location,
              },
              inferenceData.imageBuffer,
            )

            // Marquer ce véhicule comme ayant une alerte active
            vehicleData.hasAlert = true
          }
        }
      }
    }

    // Vérifier les règles d'heures autorisées
    if (zone.rules && zone.rules.allowedHours) {
      const { start, end } = zone.rules.allowedHours
      const currentHour = new Date(inferenceData.timestamp).getHours()

      // Si l'heure actuelle est en dehors des heures autorisées et qu'il y a des véhicules
      if ((currentHour < start || currentHour >= end) && vehiclesInZone.length > 0) {
        // Vérifier s'il n'y a pas déjà une alerte active pour cette règle
        const alertKey = `${zoneKey}:hours_violation`

        if (!hasActiveAlertForKey(alertKey)) {
          // Créer une alerte
          const alertId = await createAlert(
            deviceConfig.deviceId,
            zone.id,
            zone.name,
            "parking_violation",
            "hours_violation",
            {
              currentHour,
              allowedStart: start,
              allowedEnd: end,
              vehicleCount: vehiclesInZone.length,
              location: inferenceData.location,
            },
            inferenceData.imageBuffer,
          )

          // Marquer cette règle comme ayant une alerte active
          setActiveAlertForKey(alertKey, alertId)
        }
      } else {
        // Si l'heure est dans la plage autorisée ou qu'il n'y a pas de véhicules,
        // résoudre l'alerte si elle existe
        const alertKey = `${zoneKey}:hours_violation`
        if (hasActiveAlertForKey(alertKey)) {
          // Résoudre l'alerte
          await resolveAlertForKey(alertKey, {
            resolution: "La violation des heures de stationnement a été résolue",
            currentHour,
            vehicleCount: vehiclesInZone.length,
          })
        }
      }
    }

    logger.debug(`Zone de stationnement ${zone.id} traitée: ${vehiclesInZone.length} véhicules détectés`)
  } catch (error) {
    logger.error(`Erreur lors du traitement de la zone de stationnement ${zone.id}: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour traiter une zone de poubelle
async function processGarbageZone(inferenceData, zone, deviceConfig) {
  try {
    logger.debug(`Traitement de la zone de poubelle ${zone.id}`)

    // Filtrer les détections pour ne garder que les poubelles dans la zone
    const garbageInZone = inferenceData.detections.filter(
      (detection) =>
        isInZone(detection, zone.geometry, deviceConfig.deviceId, zone.id) &&
        ["empty garbage", "full garbage", "garbage truck"].includes(detection.className) &&
        detection.confidence > (zone.rules?.minConfidence || 0.6),
    )

    // Clé unique pour cette zone
    const zoneKey = `${deviceConfig.deviceId}:${zone.id}`

    // Mettre à jour les statistiques de la zone
    updateZoneStatistics(deviceConfig.deviceId, zone.id, garbageInZone)

    // Compter les poubelles pleines et vides
    const fullGarbage = garbageInZone.filter((g) => g.className === "full garbage")
    const emptyGarbage = garbageInZone.filter((g) => g.className === "empty garbage")
    const garbageTrucks = garbageInZone.filter((g) => g.className === "garbage truck")

    // Calculer le ratio de poubelles pleines
    const totalGarbage = fullGarbage.length + emptyGarbage.length
    const fullRatio = totalGarbage > 0 ? fullGarbage.length / totalGarbage : 0

    // Vérifier le seuil d'alerte pour les poubelles pleines
    if (zone.rules && zone.rules.fullThreshold && fullRatio >= zone.rules.fullThreshold) {
      // Vérifier s'il n'y a pas déjà une alerte active pour cette règle
      const alertKey = `${zoneKey}:full_garbage`

      if (!hasActiveAlertForKey(alertKey)) {
        // Créer une alerte
        const alertId = await createAlert(
          deviceConfig.deviceId,
          zone.id,
          zone.name,
          "trash_alert",
          "full_garbage",
          {
            fullCount: fullGarbage.length,
            emptyCount: emptyGarbage.length,
            fullRatio,
            threshold: zone.rules.fullThreshold,
            location: inferenceData.location,
          },
          inferenceData.imageBuffer,
        )

        // Marquer cette règle comme ayant une alerte active
        setActiveAlertForKey(alertKey, alertId)
      }
    } else {
      // Si le ratio est en dessous du seuil, résoudre l'alerte si elle existe
      const alertKey = `${zoneKey}:full_garbage`
      if (hasActiveAlertForKey(alertKey)) {
        // Résoudre l'alerte
        await resolveAlertForKey(alertKey, {
          resolution: "Le niveau de remplissage des poubelles est revenu à la normale",
          fullCount: fullGarbage.length,
          emptyCount: emptyGarbage.length,
          fullRatio,
        })
      }
    }

    // Détecter la présence d'un camion poubelle
    if (garbageTrucks.length > 0) {
      logger.info(`Camion poubelle détecté dans la zone ${zone.id}`)

      // Vérifier s'il n'y a pas déjà une alerte active pour cette règle
      const alertKey = `${zoneKey}:garbage_truck`

      if (!hasActiveAlertForKey(alertKey)) {
        // Créer une notification (alerte informative)
        const alertId = await createAlert(
          deviceConfig.deviceId,
          zone.id,
          zone.name,
          "trash_alert",
          "garbage_truck_present",
          {
            truckCount: garbageTrucks.length,
            location: inferenceData.location,
          },
          inferenceData.imageBuffer,
        )

        // Marquer cette règle comme ayant une alerte active
        setActiveAlertForKey(alertKey, alertId)
      }
    } else {
      // Si le camion n'est plus présent, résoudre l'alerte si elle existe
      const alertKey = `${zoneKey}:garbage_truck`
      if (hasActiveAlertForKey(alertKey)) {
        // Résoudre l'alerte
        await resolveAlertForKey(alertKey, {
          resolution: "Le camion poubelle a quitté la zone",
        })
      }
    }

    logger.debug(
      `Zone de poubelle ${zone.id} traitée: ${fullGarbage.length} poubelles pleines, ${emptyGarbage.length} poubelles vides`,
    )
  } catch (error) {
    logger.error(`Erreur lors du traitement de la zone de poubelle ${zone.id}: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour traiter une zone de foule
async function processCrowdZone(inferenceData, zone, deviceConfig) {
  try {
    logger.debug(`Traitement de la zone de foule ${zone.id}`)

    // Filtrer les détections pour ne garder que les personnes dans la zone
    const peopleInZone = inferenceData.detections.filter(
      (detection) =>
        isInZone(detection, zone.geometry, deviceConfig.deviceId, zone.id) &&
        detection.className === "person" &&
        detection.confidence > (zone.rules?.minConfidence || 0.6),
    )

    // Clé unique pour cette zone
    const zoneKey = `${deviceConfig.deviceId}:${zone.id}`

    // Mettre à jour les statistiques de la zone
    updateZoneStatistics(deviceConfig.deviceId, zone.id, peopleInZone)

    // Vérifier le seuil de foule
    if (zone.rules && zone.rules.crowdThreshold && peopleInZone.length >= zone.rules.crowdThreshold) {
      // Vérifier s'il n'y a pas déjà une alerte active pour cette règle
      const alertKey = `${zoneKey}:crowd_threshold`

      if (!hasActiveAlertForKey(alertKey)) {
        // Créer une alerte
        const alertId = await createAlert(
          deviceConfig.deviceId,
          zone.id,
          zone.name,
          "crowd_alert",
          "exceeded_threshold",
          {
            peopleCount: peopleInZone.length,
            threshold: zone.rules.crowdThreshold,
            location: inferenceData.location,
          },
          inferenceData.imageBuffer,
        )

        // Marquer cette règle comme ayant une alerte active
        setActiveAlertForKey(alertKey, alertId)
      }
    } else {
      // Si le nombre de personnes est en dessous du seuil, résoudre l'alerte si elle existe
      const alertKey = `${zoneKey}:crowd_threshold`
      if (hasActiveAlertForKey(alertKey)) {
        // Résoudre l'alerte
        await resolveAlertForKey(alertKey, {
          resolution: "Le niveau de foule est revenu à la normale",
          peopleCount: peopleInZone.length,
        })
      }
    }

    // Vérifier la densité de foule
    if (zone.rules && zone.rules.densityThreshold) {
      // Calculer la surface de la zone
      const zoneArea = calculateZoneArea(zone.geometry)

      // Calculer la densité (personnes par mètre carré)
      const density = peopleInZone.length / zoneArea

      if (density >= zone.rules.densityThreshold) {
        // Vérifier s'il n'y a pas déjà une alerte active pour cette règle
        const alertKey = `${zoneKey}:crowd_density`

        if (!hasActiveAlertForKey(alertKey)) {
          // Créer une alerte
          const alertId = await createAlert(
            deviceConfig.deviceId,
            zone.id,
            zone.name,
            "crowd_alert",
            "high_density",
            {
              peopleCount: peopleInZone.length,
              zoneArea,
              density,
              threshold: zone.rules.densityThreshold,
              location: inferenceData.location,
            },
            inferenceData.imageBuffer,
          )

          // Marquer cette règle comme ayant une alerte active
          setActiveAlertForKey(alertKey, alertId)
        }
      } else {
        // Si la densité est en dessous du seuil, résoudre l'alerte si elle existe
        const alertKey = `${zoneKey}:crowd_density`
        if (hasActiveAlertForKey(alertKey)) {
          // Résoudre l'alerte
          await resolveAlertForKey(alertKey, {
            resolution: "La densité de foule est revenue à la normale",
            peopleCount: peopleInZone.length,
            density,
          })
        }
      }
    }

    // NOUVELLE FONCTIONNALITÉ: Vérifier le nombre maximum de personnes
    if (zone.rules && zone.rules.maxPeople && peopleInZone.length > zone.rules.maxPeople) {
      // Vérifier s'il n'y a pas déjà une alerte active pour cette règle
      const alertKey = `${zoneKey}:max_people_exceeded`

      if (!hasActiveAlertForKey(alertKey)) {
        // Créer une alerte
        const alertId = await createAlert(
          deviceConfig.deviceId,
          zone.id,
          zone.name,
          "crowd_alert",
          "max_people_exceeded",
          {
            peopleCount: peopleInZone.length,
            maxPeople: zone.rules.maxPeople,
            exceededBy: peopleInZone.length - zone.rules.maxPeople,
            location: inferenceData.location,
          },
          inferenceData.imageBuffer,
        )

        // Marquer cette règle comme ayant une alerte active
        setActiveAlertForKey(alertKey, alertId)

        logger.warn(
          `Alerte: Nombre maximum de personnes dépassé dans la zone ${zone.id}. Détecté: ${peopleInZone.length}, Maximum: ${zone.rules.maxPeople}`,
        )
      }
    } else if (zone.rules && zone.rules.maxPeople) {
      // Si le nombre de personnes est en dessous du maximum, résoudre l'alerte si elle existe
      const alertKey = `${zoneKey}:max_people_exceeded`
      if (hasActiveAlertForKey(alertKey)) {
        // Résoudre l'alerte
        await resolveAlertForKey(alertKey, {
          resolution: "Le nombre de personnes est revenu sous la limite maximale",
          peopleCount: peopleInZone.length,
          maxPeople: zone.rules.maxPeople,
        })

        logger.info(
          `Résolution d'alerte: Le nombre de personnes est revenu sous la limite maximale dans la zone ${zone.id}. Détecté: ${peopleInZone.length}, Maximum: ${zone.rules.maxPeople}`,
        )
      }
    }

    logger.debug(`Zone de foule ${zone.id} traitée: ${peopleInZone.length} personnes détectées`)
  } catch (error) {
    logger.error(`Erreur lors du traitement de la zone de foule ${zone.id}: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour déterminer si un objet est dans une zone avec tolérance et calcul de chevauchement
function isInZone(detection, zoneGeometry, deviceId, zoneId) {
  // Convertir les coordonnées de pixels en coordonnées normalisées (0-1)
  const FRAME_WIDTH = 640
  const FRAME_HEIGHT = 640

  // Convertir les coordonnées de la boîte englobante
  const normalizedBbox = {
    xMin: detection.bbox.xMin / FRAME_WIDTH,
    yMin: detection.bbox.yMin / FRAME_HEIGHT,
    xMax: detection.bbox.xMax / FRAME_WIDTH,
    yMax: detection.bbox.yMax / FRAME_HEIGHT,
  }

  // Clé unique pour cette détection dans cette zone
  const detectionKey = `${deviceId}:${zoneId}:${detection.className}:${Math.round(normalizedBbox.xMin * 100)}:${Math.round(normalizedBbox.yMin * 100)}`

  // Calculer le centre normalisé de la boîte englobante
  const centerX = (normalizedBbox.xMin + normalizedBbox.xMax) / 2
  const centerY = (normalizedBbox.yMin + normalizedBbox.yMax) / 2

  // Log pour le débogage
  logger.debug(`Vérification de zone: Objet à [${centerX.toFixed(4)}, ${centerY.toFixed(4)}] (normalisé)`)

  // Vérifier si l'objet est dans la zone
  let isInside = false
  let overlapPercentage = 0

  // Si la zone est définie par xMin, yMin, xMax, yMax
  if ("xMin" in zoneGeometry && "yMin" in zoneGeometry && "xMax" in zoneGeometry && "yMax" in zoneGeometry) {
    // Calculer le chevauchement
    const overlapXMin = Math.max(normalizedBbox.xMin, zoneGeometry.xMin)
    const overlapYMin = Math.max(normalizedBbox.yMin, zoneGeometry.yMin)
    const overlapXMax = Math.min(normalizedBbox.xMax, zoneGeometry.xMax)
    const overlapYMax = Math.min(normalizedBbox.yMax, zoneGeometry.yMax)

    // Si il y a un chevauchement
    if (overlapXMin < overlapXMax && overlapYMin < overlapYMax) {
      // Calculer l'aire du chevauchement
      const overlapArea = (overlapXMax - overlapXMin) * (overlapYMax - overlapYMin)
      // Calculer l'aire de la boîte englobante
      const bboxArea = (normalizedBbox.xMax - normalizedBbox.xMin) * (normalizedBbox.yMax - normalizedBbox.yMin)
      // Calculer le pourcentage de chevauchement
      overlapPercentage = overlapArea / bboxArea

      // Vérifier si le pourcentage de chevauchement est suffisant
      isInside = overlapPercentage >= OVERLAP_THRESHOLD
    }

    logger.debug(
      `Zone rectangulaire: [${zoneGeometry.xMin}, ${zoneGeometry.yMin}, ${zoneGeometry.xMax}, ${zoneGeometry.yMax}], Chevauchement: ${(overlapPercentage * 100).toFixed(2)}%, Objet à l'intérieur: ${isInside}`,
    )
  }
  // Si la zone est définie par un polygone
  else if (zoneGeometry.type === "polygon" && Array.isArray(zoneGeometry.coordinates)) {
    // Pour les polygones, on utilise une approche simplifiée basée sur le centre
    // Une approche plus précise nécessiterait de calculer l'intersection entre le polygone et le rectangle
    isInside = isPointInPolygon(centerX, centerY, zoneGeometry.coordinates)
    overlapPercentage = isInside ? 1 : 0 // Simplification

    logger.debug(`Zone polygone: ${JSON.stringify(zoneGeometry.coordinates)}, Objet à l'intérieur: ${isInside}`)
  } else {
    // Par défaut, considérer que l'objet n'est pas dans la zone
    logger.debug(`Type de zone non reconnu, objet considéré comme étant en dehors`)
    return false
  }

  // Gestion de la tolérance
  // Initialiser l'historique de détection si nécessaire
  if (!detectionHistory.has(deviceId)) {
    detectionHistory.set(deviceId, new Map())
  }
  const deviceHistory = detectionHistory.get(deviceId)

  if (!deviceHistory.has(zoneId)) {
    deviceHistory.set(zoneId, new Map())
  }
  const zoneHistory = deviceHistory.get(zoneId)

  // Si l'objet est dans la zone, mettre à jour son historique
  if (isInside) {
    zoneHistory.set(detectionKey, {
      lastSeen: Date.now(),
      frameCount: FRAME_TOLERANCE, // Réinitialiser le compteur
    })
    return true
  }
  // Sinon, vérifier s'il était dans la zone récemment
  else if (zoneHistory.has(detectionKey)) {
    const history = zoneHistory.get(detectionKey)
    // Si le compteur est encore positif, considérer que l'objet est toujours dans la zone
    if (history.frameCount > 0) {
      // Décrémenter le compteur
      history.frameCount--
      logger.debug(`Tolérance appliquée pour ${detectionKey}, frames restantes: ${history.frameCount}`)
      return true
    }
    // Sinon, supprimer l'historique
    else {
      zoneHistory.delete(detectionKey)
    }
  }

  return false
}

// Fonction pour vérifier si un point est dans un polygone
function isPointInPolygon(x, y, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1]
    const xj = polygon[j][0],
      yj = polygon[j][1]

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Fonction pour calculer la surface d'une zone
function calculateZoneArea(zoneGeometry) {
  // Si la zone est définie par xMin, yMin, xMax, yMax
  if ("xMin" in zoneGeometry && "yMin" in zoneGeometry && "xMax" in zoneGeometry && "yMax" in zoneGeometry) {
    return (zoneGeometry.xMax - zoneGeometry.xMin) * (zoneGeometry.yMax - zoneGeometry.yMin)
  }

  // Si la zone est définie par un polygone
  if (zoneGeometry.type === "polygon" && Array.isArray(zoneGeometry.coordinates)) {
    // Calculer l'aire du polygone
    let area = 0
    const points = zoneGeometry.coordinates
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      area += points[i][0] * points[j][1]
      area -= points[j][0] * points[i][1]
    }
    return Math.abs(area) / 2
  }

  // Par défaut, retourner 1 pour éviter les divisions par zéro
  return 1
}

// Fonction pour mettre à jour les véhicules stationnés
function updateParkedVehicles(zoneKey, vehicles, timestamp) {
  try {
    if (!parkedVehicles.has(zoneKey)) {
      parkedVehicles.set(zoneKey, new Map())
    }

    const zoneVehicles = parkedVehicles.get(zoneKey)
    const currentTime = new Date(timestamp).getTime()

    // Marquer tous les véhicules comme non vus dans cette frame
    for (const vehicleData of zoneVehicles.values()) {
      vehicleData.seen = false
    }

    // Traiter les véhicules détectés
    for (const vehicle of vehicles) {
      // Générer un ID unique pour ce véhicule
      const vehicleId = generateVehicleId(vehicle)

      if (!zoneVehicles.has(vehicleId)) {
        // Nouveau véhicule
        zoneVehicles.set(vehicleId, {
          arrivalTime: currentTime,
          lastSeen: currentTime,
          type: vehicle.className,
          bbox: { ...vehicle.bbox },
          seen: true,
          hasAlert: false,
        })
      } else {
        // Véhicule existant
        const vehicleData = zoneVehicles.get(vehicleId)
        vehicleData.lastSeen = currentTime
        vehicleData.bbox = { ...vehicle.bbox }
        vehicleData.seen = true
      }
    }

    logger.debug(`Véhicules mis à jour pour la zone ${zoneKey}: ${zoneVehicles.size} véhicules suivis`)
  } catch (error) {
    logger.error(`Erreur lors de la mise à jour des véhicules stationnés: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour nettoyer les véhicules qui ne sont plus présents
function cleanupParkedVehicles() {
  try {
    const currentTime = Date.now()
    let removedCount = 0

    for (const [zoneKey, zoneVehicles] of parkedVehicles.entries()) {
      for (const [vehicleId, vehicleData] of zoneVehicles.entries()) {
        // Si le véhicule n'a pas été vu récemment
        if (!vehicleData.seen && currentTime - vehicleData.lastSeen > VEHICLE_ABSENCE_THRESHOLD) {
          // Supprimer le véhicule
          zoneVehicles.delete(vehicleId)
          removedCount++

          // Si le véhicule avait une alerte active, la résoudre
          if (vehicleData.hasAlert) {
            resolveAlertForVehicle(zoneKey, vehicleId, {
              resolution: "Le véhicule a quitté la zone",
              parkingDuration: vehicleData.lastSeen - vehicleData.arrivalTime,
            }).catch((error) => {
              logger.error(`Erreur lors de la résolution de l'alerte pour le véhicule ${vehicleId}: ${error.message}`)
            })
          }
        }
      }

      // Si la zone n'a plus de véhicules, la supprimer
      if (zoneVehicles.size === 0) {
        parkedVehicles.delete(zoneKey)
      }
    }

    if (removedCount > 0) {
      logger.debug(`Nettoyage des véhicules: ${removedCount} véhicules supprimés`)
    }
  } catch (error) {
    logger.error(`Erreur lors du nettoyage des véhicules stationnés: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour générer un ID unique pour un véhicule
function generateVehicleId(vehicle) {
  // Utiliser la position et la taille pour identifier le véhicule
  const { xMin, yMin, xMax, yMax } = vehicle.bbox
  const centerX = Math.round(((xMin + xMax) / 2) * 100) / 100
  const centerY = Math.round(((yMin + yMax) / 2) * 100) / 100
  const width = Math.round((xMax - xMin) * 100) / 100
  const height = Math.round((yMax - yMin) * 100) / 100

  return `${vehicle.className}_${centerX}_${centerY}_${width}_${height}`
}

// Fonction pour vérifier si une alerte est active pour une clé
function hasActiveAlertForKey(key) {
  return activeAlerts.has(key)
}

// Fonction pour définir une alerte active pour une clé
function setActiveAlertForKey(key, alertId) {
  activeAlerts.set(key, alertId)
}

// Fonction pour résoudre une alerte pour une clé
async function resolveAlertForKey(key, metadata = {}) {
  try {
    if (activeAlerts.has(key)) {
      const alertId = activeAlerts.get(key)
      await closeAlert(alertId, metadata)
      activeAlerts.delete(key)
      logger.info(`Alerte résolue pour la clé ${key}`)
    }
  } catch (error) {
    logger.error(`Erreur lors de la résolution de l'alerte pour la clé ${key}: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Fonction pour vérifier si une alerte est active pour un véhicule
function hasActiveAlertForVehicle(zoneKey, vehicleId) {
  const key = `${zoneKey}:vehicle:${vehicleId}`
  return activeAlerts.has(key)
}

// Fonction pour résoudre une alerte pour un véhicule
async function resolveAlertForVehicle(zoneKey, vehicleId, metadata = {}) {
  const key = `${zoneKey}:vehicle:${vehicleId}`
  await resolveAlertForKey(key, metadata)
}

// Fonction pour créer une alerte
async function createAlert(deviceId, zoneId, zoneName, type, subType, metadata = {}, imageBuffer = null) {
  try {
    const alertId = uuidv4()
    const now = new Date().toISOString()

    // Log détaillé de la création d'alerte
    logger.info(
      `Création d'une alerte: ID=${alertId}, Type=${type}, Sous-type=${subType}, Dispositif=${deviceId}, Zone=${zoneId}`,
    )
    logger.debug(`Métadonnées de l'alerte: ${JSON.stringify(metadata)}`)

    // Stocker l'image de l'alerte si fournie
    let imagePath = null
    if (imageBuffer) {
      imagePath = await storeAlertImage(alertId, imageBuffer)
      logger.debug(`Image d'alerte stockée: ${imagePath}`)
    }

    // Créer l'objet alerte
    const alert = {
      id: alertId,
      deviceId,
      zoneId,
      zoneName,
      type,
      subType,
      status: "active",
      startTime: now,
      endTime: null,
      duration: null,
      imagePath,
      metadata,
      createdAt: now,
      updatedAt: now,
    }

    // Stocker l'alerte dans la map des alertes actives
    activeAlerts.set(alertId, alert)

    // Si c'est une alerte de véhicule, stocker également avec la clé du véhicule
    if (metadata.vehicleId) {
      const vehicleKey = `${deviceId}:${zoneId}:vehicle:${metadata.vehicleId}`
      activeAlerts.set(vehicleKey, alertId)
      logger.debug(`Alerte associée au véhicule: ${vehicleKey}`)
    }

    // Si c'est une alerte de règle, stocker également avec la clé de la règle
    const ruleKey = `${deviceId}:${zoneId}:${subType}`
    activeAlerts.set(ruleKey, alertId)
    logger.debug(`Alerte associée à la règle: ${ruleKey} avec ID ${alertId}`)

    // Insérer l'alerte dans la base de données
    const query = `
      INSERT INTO alerts (
        alert_id, device_id, zone_id, zone_name, type, sub_type, status, start_time, image_path, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `

    const values = [
      alertId,
      deviceId,
      zoneId,
      zoneName,
      type,
      subType,
      "active",
      now,
      imagePath,
      JSON.stringify(metadata),
    ]

    const result = await pool.query(query, values)
    logger.debug(`Alerte insérée dans la base de données: ${result.rows[0].alert_id}`)

    // Publier l'alerte sur Kafka
    const producer = getKafkaProducer()
    await producer.send({
      topic: "alerts",
      messages: [
        {
          key: deviceId,
          value: JSON.stringify(alert),
        },
      ],
    })
    logger.debug(`Alerte publiée sur Kafka: ${alertId}`)

    // Envoyer l'alerte aux clients connectés via WebSocket
    sendAlertToClients(deviceId, alert)

    logger.info(`Alerte créée: ${alertId}, type=${type}, sous-type=${subType}, dispositif=${deviceId}, zone=${zoneId}`)

    return alertId
  } catch (error) {
    logger.error(`Erreur lors de la création de l'alerte: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    throw error
  }
}

// Fonction pour clôturer une alerte
async function closeAlert(alertId, metadata = {}) {
  try {
    // Vérifier si l'alerte existe
    if (!activeAlerts.has(alertId)) {
      throw new Error(`Alerte non trouvée: ${alertId}`)
    }

    // Récupérer l'alerte
    const alert = activeAlerts.get(alertId)

    // Log détaillé de la clôture d'alerte
    logger.info(`Clôture de l'alerte: ${alertId}, type=${alert.type}, sous-type=${alert.subType}`)
    logger.debug(`Métadonnées de résolution: ${JSON.stringify(metadata)}`)

    // Mettre à jour les données de clôture
    const now = new Date().toISOString()
    const startTime = new Date(alert.startTime)
    const endTime = new Date(now)
    const duration = Math.floor((endTime - startTime) / 1000) // Durée en secondes

    const closedAlert = {
      ...alert,
      status: "resolved",
      endTime: now,
      duration,
      metadata: { ...alert.metadata, ...metadata },
      updatedAt: now,
    }

    // Supprimer l'alerte des alertes actives
    activeAlerts.delete(alertId)
    logger.debug(`Alerte supprimée des alertes actives: ${alertId}`)

    // Mettre à jour l'alerte dans la base de données
    const query = `
      UPDATE alerts
      SET status = $1, end_time = $2, duration = $3, metadata = $4, updated_at = $5
      WHERE alert_id = $6
      RETURNING *
    `

    const values = ["resolved", now, duration, JSON.stringify(closedAlert.metadata), now, alertId]

    const result = await pool.query(query, values)
    logger.debug(`Alerte mise à jour dans la base de données: ${result.rows[0].alert_id}`)

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
    logger.debug(`Clôture d'alerte publiée sur Kafka: ${alertId}`)

    // Envoyer la clôture aux clients connectés via WebSocket
    sendAlertToClients(alert.deviceId, closedAlert)

    logger.info(`Alerte clôturée: ${alertId}, durée=${duration}s`)

    return closedAlert
  } catch (error) {
    logger.error(`Erreur lors de la clôture de l'alerte: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
    throw error
  }
}

// Exporter les fonctions utiles
export function getActiveAlerts() {
  return Array.from(activeAlerts.values()).filter((alert) => typeof alert === "object")
}

export function getActiveAlertsForDevice(deviceId) {
  return Array.from(activeAlerts.values()).filter((alert) => typeof alert === "object" && alert.deviceId === deviceId)
}

export function getAlert(alertId) {
  return activeAlerts.get(alertId)
}

