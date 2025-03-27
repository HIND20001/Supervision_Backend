import express from "express"
import logger from "../utils/logger.js"
import { getDeviceConfiguration, getAllDeviceConfigurations } from "../services/config/configService.js"
import { pool } from "../config/db.js"

const router = express.Router()

// Récupérer toutes les zones pour un dispositif
router.get("/", (req, res) => {
  try {
    const { device, category } = req.query

    if (!device) {
      return res.status(400).json({ error: "Le paramètre device est requis" })
    }

    // Récupérer la configuration du dispositif
    const deviceConfig = getDeviceConfiguration(device)

    if (!deviceConfig || !deviceConfig.zones) {
      return res.status(404).json({ error: "Dispositif ou zones non trouvés" })
    }

    // Filtrer les zones par catégorie si spécifiée
    let zones = deviceConfig.zones

    if (category) {
      zones = zones.filter((zone) => zone.type === category)
    }

    // Formater la réponse
    const formattedZones = zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      type: zone.type,
      geometry: zone.geometry,
      rules: zone.rules,
    }))

    res.json(formattedZones)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des zones: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// Nouvelle route pour synchroniser les zones
router.post("/sync", async (req, res) => {
  try {
    const devices = getAllDeviceConfigurations()
    let zonesInserted = 0

    for (const device of devices) {
      if (device.zones && Array.isArray(device.zones)) {
        for (const zone of device.zones) {
          // Vérifier si la zone existe déjà
          const checkZoneQuery = `
          SELECT zone_id FROM zones WHERE zone_id = $1 AND device_id = $2
        `
          const checkZoneResult = await pool.query(checkZoneQuery, [zone.id, device.deviceId])

          if (checkZoneResult.rows.length === 0) {
            // Insérer la zone
            const insertZoneQuery = `
            INSERT INTO zones (zone_id, device_id, name, type, geometry, rules)
            VALUES ($1, $2, $3, $4, $5, $6)
          `
            const insertZoneValues = [
              zone.id,
              device.deviceId,
              zone.name || `Zone ${zone.id}`,
              zone.type || "unknown",
              JSON.stringify(zone.geometry),
              JSON.stringify(zone.rules || {}),
            ]

            await pool.query(insertZoneQuery, insertZoneValues)
            zonesInserted++
            logger.info(`Zone insérée dans la base de données: ${zone.id} pour le dispositif ${device.deviceId}`)
          }
        }
      }
    }

    res.json({ success: true, zonesInserted })
  } catch (error) {
    logger.error(`Erreur lors de la synchronisation des zones: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

export default router

