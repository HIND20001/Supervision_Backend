import express from "express"
import logger from "../utils/logger.js"
import { getConnectedClients } from "../services/websocket/websocketService.js"

const router = express.Router()

// Récupérer les clients WebSocket connectés
router.get("/clients", (req, res) => {
  try {
    const clients = getConnectedClients()
    res.json(clients)
  } catch (error) {
    logger.error(`Erreur lors de la récupération des clients WebSocket: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

export default router

