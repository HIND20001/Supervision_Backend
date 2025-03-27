import express from "express"
import logger from "../utils/logger.js"
import { getAllDeviceConfigurations } from "../services/config/configService.js"

const router = express.Router()

// Récupérer tous les dispositifs
router.get("/", (req, res) => {
  try {
    const devices = getAllDeviceConfigurations()

    // Formater la réponse
    const formattedDevices = devices.map((device) => ({
      id: device.deviceId,
      name: device.name,
      location: device.location,
      status: "online", // À remplacer par un statut réel
      lastActivity: new Date().toISOString(), // À remplacer par une activité réelle
    }))

    res.json(formattedDevices)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des dispositifs: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// Récupérer un dispositif spécifique
router.get("/:deviceId", (req, res) => {
  try {
    const { deviceId } = req.params
    const device = getAllDeviceConfigurations().find((d) => d.deviceId === deviceId)

    if (!device) {
      return res.status(404).json({ error: "Dispositif non trouvé" })
    }

    // Formater la réponse
    const formattedDevice = {
      id: device.deviceId,
      name: device.name,
      location: device.location,
      status: "online", // À remplacer par un statut réel
      lastActivity: new Date().toISOString(), // À remplacer par une activité réelle
      zoneCount: device.zones ? device.zones.length : 0,
    }

    res.json(formattedDevice)
  } catch (error) {
    logger.error(`Erreur lors de la récupération du dispositif: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

export default router

