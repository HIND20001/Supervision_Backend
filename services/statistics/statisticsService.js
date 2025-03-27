import logger from "../../utils/logger.js"

const zoneStatistics = new Map()

// Dans la fonction updateZoneStatistics, ajoutez ces logs détaillés
export function updateZoneStatistics(deviceId, zoneId, detections) {
  try {
    // Clé unique pour cette zone
    const zoneKey = `${deviceId}:${zoneId}`

    // Log détaillé des détections
    logger.info(
      `Mise à jour des statistiques pour la zone ${zoneId} du dispositif ${deviceId}: ${detections.length} détections`,
    )

    // Log des classes détectées
    const classCounts = {}
    for (const detection of detections) {
      classCounts[detection.className] = (classCounts[detection.className] || 0) + 1
    }
    logger.debug(`Classes détectées: ${JSON.stringify(classCounts)}`)

    // Récupérer ou initialiser les statistiques de la zone
    if (!zoneStatistics.has(zoneKey)) {
      zoneStatistics.set(zoneKey, {
        deviceId,
        zoneId,
        counts: {
          person: 0,
          car: 0,
          motorcycle: 0,
          bus: 0,
          truck: 0,
          taxi: 0,
          "empty garbage": 0,
          "full garbage": 0,
          "garbage truck": 0,
        },
        lastUpdate: Date.now(),
        // Ajouter des compteurs pour les durées de stationnement
        parkingDurations: {
          car: [],
          motorcycle: [],
          bus: [],
          truck: [],
          taxi: [],
        },
        // Ajouter des compteurs pour les heures
        hourlyCount: Array(24).fill(0),
      })

      logger.debug(`Nouvelles statistiques initialisées pour la zone ${zoneId} du dispositif ${deviceId}`)
    }

    const stats = zoneStatistics.get(zoneKey)

    // Mettre à jour les compteurs
    for (const detection of detections) {
      if (stats.counts.hasOwnProperty(detection.className)) {
        stats.counts[detection.className]++
      }
    }

    // Mettre à jour le compteur horaire
    const currentHour = new Date().getHours()
    stats.hourlyCount[currentHour]++

    stats.lastUpdate = Date.now()

    // Log des compteurs mis à jour
    logger.debug(`Compteurs mis à jour pour la zone ${zoneId}: ${JSON.stringify(stats.counts)}`)
    logger.debug(`Compteur horaire mis à jour pour l'heure ${currentHour}: ${stats.hourlyCount[currentHour]}`)

    logger.info(`Statistiques mises à jour pour la zone ${zoneId} du dispositif ${deviceId}`)
  } catch (error) {
    logger.error(`Erreur lors de la mise à jour des statistiques de zone: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

// Dans la fonction addParkingDuration, ajoutez ces logs détaillés
export function addParkingDuration(deviceId, zoneId, vehicleType, duration) {
  try {
    // Clé unique pour cette zone
    const zoneKey = `${deviceId}:${zoneId}`

    // Log détaillé de la durée de stationnement
    logger.info(`Ajout d'une durée de stationnement pour ${vehicleType} dans la zone ${zoneId}: ${duration}s`)

    // Vérifier si les statistiques existent pour cette zone
    if (!zoneStatistics.has(zoneKey)) {
      logger.warn(`Aucune statistique trouvée pour la zone ${zoneId} du dispositif ${deviceId}`)
      return
    }

    const stats = zoneStatistics.get(zoneKey)

    // Vérifier si le type de véhicule est valide
    if (stats.parkingDurations.hasOwnProperty(vehicleType)) {
      // Ajouter la durée aux statistiques
      stats.parkingDurations[vehicleType].push(duration)

      // Log des durées de stationnement mises à jour
      const durations = stats.parkingDurations[vehicleType]
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
      logger.debug(
        `Durées de stationnement pour ${vehicleType} dans la zone ${zoneId}: ${durations.length} entrées, moyenne=${avgDuration.toFixed(2)}s`,
      )

      logger.info(`Durée de stationnement ajoutée pour ${vehicleType} dans la zone ${zoneId}: ${duration}s`)
    } else {
      logger.warn(`Type de véhicule non pris en charge: ${vehicleType}`)
    }
  } catch (error) {
    logger.error(`Erreur lors de l'ajout de la durée de stationnement: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)
  }
}

