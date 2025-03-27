import express from "express"
import {
  getAllDeviceConfigurations,
  getDeviceConfiguration,
  updateDeviceConfiguration,
  deleteDeviceConfiguration,
} from "../services/config/configService.js"
import { getActiveAlerts, getActiveAlertsForDevice, getAlert } from "../services/alerts/alertService.js"
import { getAlertImage } from "../services/storage/storageService.js"
import { getStatistics } from "../services/statistics/statisticsService.js"
import logger from "../utils/logger.js"

const router = express.Router()

// Routes pour les dispositifs
router.get("/devices", (req, res) => {
  try {
    const devices = getAllDeviceConfigurations()
    res.json(devices)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des dispositifs: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get("/devices/:deviceId", (req, res) => {
  try {
    const device = getDeviceConfiguration(req.params.deviceId)
    if (!device) {
      return res.status(404).json({ error: "Dispositif non trouvé" })
    }
    res.json(device)
  } catch (error) {
    logger.error(`Erreur lors de la récupération du dispositif: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.post("/devices", async (req, res) => {
  try {
    const result = await updateDeviceConfiguration(req.body)
    if (!result) {
      return res.status(400).json({ error: "Erreur lors de la mise à jour du dispositif" })
    }
    res.status(201).json({ success: true })
  } catch (error) {
    logger.error(`Erreur lors de la création du dispositif: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.put("/devices/:deviceId", async (req, res) => {
  try {
    const config = req.body
    config.deviceId = req.params.deviceId
    const result = await updateDeviceConfiguration(config)
    if (!result) {
      return res.status(400).json({ error: "Erreur lors de la mise à jour du dispositif" })
    }
    res.json({ success: true })
  } catch (error) {
    logger.error(`Erreur lors de la mise à jour du dispositif: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.delete("/devices/:deviceId", async (req, res) => {
  try {
    const result = await deleteDeviceConfiguration(req.params.deviceId)
    if (!result) {
      return res.status(404).json({ error: "Dispositif non trouvé" })
    }
    res.json({ success: true })
  } catch (error) {
    logger.error(`Erreur lors de la suppression du dispositif: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// Routes pour les alertes
router.get("/alerts", (req, res) => {
  try {
    const alerts = getActiveAlerts()
    res.json(alerts)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des alertes: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get("/alerts/:alertId", (req, res) => {
  try {
    const alert = getAlert(req.params.alertId)
    if (!alert) {
      return res.status(404).json({ error: "Alerte non trouvée" })
    }
    res.json(alert)
  } catch (error) {
    logger.error(`Erreur lors de la récupération de l'alerte: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get("/devices/:deviceId/alerts", (req, res) => {
  try {
    const alerts = getActiveAlertsForDevice(req.params.deviceId)
    res.json(alerts)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des alertes du dispositif: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get("/alerts/:alertId/image", async (req, res) => {
  try {
    const image = await getAlertImage(req.params.alertId)
    if (!image) {
      return res.status(404).json({ error: "Image non trouvée" })
    }
    res.set("Content-Type", "image/jpeg")
    res.send(image)
  } catch (error) {
    logger.error(`Erreur lors de la récupération de l'image d'alerte: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// Routes pour les statistiques
router.get("/statistics", async (req, res) => {
  try {
    const { deviceId, zoneId, period, startDate, endDate } = req.query

    if (!deviceId) {
      return res.status(400).json({ error: "Le paramètre deviceId est requis" })
    }

    const statistics = await getStatistics(deviceId, zoneId, period, startDate, endDate)
    res.json(statistics)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des statistiques: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

export default router

