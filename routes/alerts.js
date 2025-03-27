import express from "express"
import logger from "../utils/logger.js"
import { pool } from "../config/db.js"
import { getActiveAlerts, getActiveAlertsForDevice, getAlert } from "../services/business/zoneProcessor.js"
import { getIO } from "../services/websocket/websocketService.js"

const router = express.Router()

// Récupérer toutes les alertes
router.get("/", async (req, res) => {
  try {
    const { deviceId, status, type, startDate, endDate, limit } = req.query

    // Construire la requête
    let query = `
      SELECT * FROM alerts
      WHERE 1=1
    `

    const values = []
    let paramIndex = 1

    if (deviceId) {
      query += ` AND device_id = $${paramIndex}`
      values.push(deviceId)
      paramIndex++
    }

    if (status) {
      query += ` AND status = $${paramIndex}`
      values.push(status)
      paramIndex++
    }

    if (type) {
      query += ` AND type = $${paramIndex}`
      values.push(type)
      paramIndex++
    }

    if (startDate) {
      query += ` AND start_time >= $${paramIndex}`
      values.push(startDate)
      paramIndex++
    }

    if (endDate) {
      query += ` AND start_time <= $${paramIndex}`
      values.push(endDate)
      paramIndex++
    }

    query += ` ORDER BY start_time DESC`

    if (limit) {
      query += ` LIMIT $${paramIndex}`
      values.push(Number.parseInt(limit))
    }

    const result = await pool.query(query, values)

    // Formater la réponse
    const alerts = result.rows.map((alert) => ({
      id: alert.alert_id,
      deviceId: alert.device_id,
      zoneId: alert.zone_id,
      zoneName: alert.zone_name,
      type: alert.type,
      subType: alert.sub_type,
      status: alert.status,
      startTime: alert.start_time,
      endTime: alert.end_time,
      duration: alert.duration,
      imagePath: alert.image_path,
      resolutionImagePath: alert.resolution_image_path,
      metadata: alert.metadata,
      createdAt: alert.created_at,
      updatedAt: alert.updated_at,
    }))

    res.json(alerts)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des alertes: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// Récupérer les alertes actives
router.get("/active", (req, res) => {
  try {
    const { deviceId } = req.query

    let alerts
    if (deviceId) {
      alerts = getActiveAlertsForDevice(deviceId)
    } else {
      alerts = getActiveAlerts()
    }

    res.json(alerts)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des alertes actives: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// Récupérer une alerte spécifique
router.get("/:alertId", async (req, res) => {
  try {
    const { alertId } = req.params

    // Vérifier d'abord dans les alertes actives en mémoire
    const activeAlert = getAlert(alertId)
    if (activeAlert) {
      return res.json(activeAlert)
    }

    // Sinon, chercher dans la base de données
    const query = `
      SELECT * FROM alerts
      WHERE alert_id = $1
    `

    const result = await pool.query(query, [alertId])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Alerte non trouvée" })
    }

    const alert = result.rows[0]

    // Formater la réponse
    const formattedAlert = {
      id: alert.alert_id,
      deviceId: alert.device_id,
      zoneId: alert.zone_id,
      zoneName: alert.zone_name,
      type: alert.type,
      subType: alert.sub_type,
      status: alert.status,
      startTime: alert.start_time,
      endTime: alert.end_time,
      duration: alert.duration,
      imagePath: alert.image_path,
      resolutionImagePath: alert.resolution_image_path,
      metadata: alert.metadata,
      createdAt: alert.created_at,
      updatedAt: alert.updated_at,
    }

    res.json(formattedAlert)
  } catch (error) {
    logger.error(`Erreur lors de la récupération de l'alerte: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// Résoudre une alerte
router.post("/:alertId/resolve", async (req, res) => {
  try {
    const { alertId } = req.params
    const { resolution, metadata } = req.body

    // Vérifier si l'alerte existe
    const query = `
      SELECT * FROM alerts
      WHERE alert_id = $1 AND status = 'active'
    `

    const result = await pool.query(query, [alertId])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Alerte active non trouvée" })
    }

    const alert = result.rows[0]

    // Calculer la durée
    const startTime = new Date(alert.start_time)
    const endTime = new Date()
    const duration = Math.floor((endTime - startTime) / 1000) // Durée en secondes

    // Mettre à jour l'alerte
    const updateQuery = `
      UPDATE alerts
      SET status = 'resolved', 
          end_time = $1, 
          duration = $2, 
          metadata = jsonb_set(metadata, '{resolution}', $3),
          updated_at = $4
      WHERE alert_id = $5
      RETURNING *
    `

    const resolutionJson = JSON.stringify(resolution || "Résolu manuellement")
    const updateValues = [endTime.toISOString(), duration, resolutionJson, endTime.toISOString(), alertId]

    const updateResult = await pool.query(updateQuery, updateValues)

    if (updateResult.rows.length === 0) {
      return res.status(500).json({ error: "Erreur lors de la résolution de l'alerte" })
    }

    const updatedAlert = updateResult.rows[0]

    // Formater la réponse
    const formattedAlert = {
      id: updatedAlert.alert_id,
      deviceId: updatedAlert.device_id,
      zoneId: updatedAlert.zone_id,
      zoneName: updatedAlert.zone_name,
      type: updatedAlert.type,
      subType: updatedAlert.sub_type,
      status: updatedAlert.status,
      startTime: updatedAlert.start_time,
      endTime: updatedAlert.end_time,
      duration: updatedAlert.duration,
      imagePath: updatedAlert.image_path,
      resolutionImagePath: updatedAlert.resolution_image_path,
      metadata: updatedAlert.metadata,
      createdAt: updatedAlert.created_at,
      updatedAt: updatedAlert.updated_at,
    }

    // Envoyer l'alerte résolue via WebSocket
    const io = getIO()
    if (io) {
      io.to(updatedAlert.device_id).emit("alert", {
        type: "alert",
        deviceId: updatedAlert.device_id,
        alertId: updatedAlert.alert_id,
        zoneId: updatedAlert.zone_id,
        zoneName: updatedAlert.zone_name,
        alertType: updatedAlert.type,
        alertSubType: updatedAlert.sub_type,
        status: "resolved",
        startTime: updatedAlert.start_time,
        endTime: updatedAlert.end_time,
        duration: updatedAlert.duration,
        imagePath: updatedAlert.image_path,
        resolutionImagePath: updatedAlert.resolution_image_path,
        metadata: updatedAlert.metadata,
        timestamp: new Date().toISOString(),
      })
    }

    res.json(formattedAlert)
  } catch (error) {
    logger.error(`Erreur lors de la résolution de l'alerte: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

export default router

