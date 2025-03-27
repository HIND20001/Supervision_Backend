const express = require("express")
const router = express.Router()
const { getParkingStatistics } = require("../queries/statistics")
const logger = require("../utils/logger")

// Ajouter cette route à routes/statistics.js
router.get("/parking", async (req, res) => {
  try {
    const { deviceId, zoneId, startDate, endDate } = req.query

    if (!deviceId) {
      return res.status(400).json({ error: "Le paramètre deviceId est requis" })
    }

    const statistics = await getParkingStatistics(deviceId, zoneId, startDate, endDate)

    // Formater la réponse
    const formattedStats = statistics.map((stat) => ({
      deviceId: stat.device_id,
      zoneId: stat.zone_id,
      timestamp: stat.timestamp,
      period: stat.period,
      parkingStats: stat.parking_stats,
    }))

    res.json(formattedStats)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des statistiques de stationnement: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

