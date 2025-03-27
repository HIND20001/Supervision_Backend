import winston from "winston"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"

// Obtenir le répertoire actuel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Créer le dossier logs s'il n'existe pas
const logsDir = path.join(__dirname, "../logs")
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Configurer les niveaux de log
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  verbose: 5,
}

// Déterminer le niveau de log en fonction de l'environnement
const level = () => {
  const env = process.env.NODE_ENV || "development"
  const logLevel = process.env.LOG_LEVEL || (env === "development" ? "debug" : "info")
  return logLevel
}

// Définir les couleurs pour chaque niveau de log
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "blue",
  verbose: "cyan",
}

// Ajouter les couleurs à winston
winston.addColors(colors)

// Format personnalisé pour les logs
const format = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
)

// Définir les transports pour les logs
const transports = [
  // Logs dans la console
  new winston.transports.Console(),

  // Logs d'erreur dans un fichier
  new winston.transports.File({
    filename: path.join(logsDir, "error.log"),
    level: "error",
  }),

  // Logs de debug dans un fichier
  new winston.transports.File({
    filename: path.join(logsDir, "debug.log"),
    level: "debug",
  }),

  // Tous les logs dans un fichier
  new winston.transports.File({
    filename: path.join(logsDir, "all.log"),
  }),
]

// Créer le logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
})

// Ajouter une méthode pour logger les objets JSON
logger.logObject = function (level, message, object) {
  if (object) {
    this[level](`${message}: ${JSON.stringify(object, null, 2)}`)
  } else {
    this[level](message)
  }
}

export default logger

