import express from "express"
import dgram from "dgram"
import logger from "../utils/logger.js"

const router = express.Router()

// Route pour envoyer un message UDP de test
router.post("/send", (req, res) => {
  try {
    const { host, port, message } = req.body

    if (!host || !port || !message) {
      return res.status(400).json({ error: "Les paramètres host, port et message sont requis" })
    }

    const client = dgram.createSocket("udp4")
    const buffer = Buffer.from(typeof message === "string" ? message : JSON.stringify(message))

    client.send(buffer, 0, buffer.length, port, host, (err) => {
      if (err) {
        logger.error(`Erreur lors de l'envoi du message UDP: ${err.message}`)
        return res.status(500).json({ error: err.message })
      }

      logger.info(`Message UDP envoyé à ${host}:${port}, taille: ${buffer.length} octets`)
      client.close()

      res.json({ success: true, message: `Message UDP envoyé à ${host}:${port}` })
    })
  } catch (error) {
    logger.error(`Erreur lors de l'envoi du message UDP: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

export default router

