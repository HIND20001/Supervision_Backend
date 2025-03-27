import express from "express"
import http from "http"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"
import logger from "./utils/logger.js"
import { initWebSocketService } from "./services/websocket/websocketService.js"
import { setupUDPServer } from "./services/udp/udpService.js"
import { pool, insertDevicesFromConfig } from "./config/db.js"
import configRoutes from "./routes/config.js"
import websocketRoutes from "./routes/websocket.js"

// Obtenir le répertoire actuel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Créer le dossier logs s'il n'existe pas
const logsDir = path.join(__dirname, "logs")
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Créer le dossier config s'il n'existe pas
const configDir = path.join(__dirname, "config")
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true })
}

// Initialiser l'application Express
const app = express()
const server = http.createServer(app)

// Configurer les middlewares
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Configurer les routes
app.use("/api/config", configRoutes)
app.use("/api/websocket", websocketRoutes)

// Route de test
app.get("/", (req, res) => {
  res.send("Système de supervision vidéo - API")
})

// Initialiser le service WebSocket
initWebSocketService(server)

// Initialiser le service UDP
setupUDPServer()

// Insérer les dispositifs depuis la configuration
insertDevicesFromConfig().catch((err) => {
  logger.error(`Erreur lors de l'insertion des dispositifs: ${err.message}`)
})

// Démarrer le serveur
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  logger.info(`Serveur démarré sur le port ${PORT}`)
})

// Gérer l'arrêt propre du serveur
process.on("SIGINT", () => {
  logger.info("Arrêt du serveur...")
  server.close(() => {
    logger.info("Serveur arrêté")
    pool.end(() => {
      logger.info("Connexion à la base de données fermée")
      process.exit(0)
    })
  })
})

export default app

