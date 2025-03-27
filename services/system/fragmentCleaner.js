import logger from "../../utils/logger.js"

// Fonction pour configurer le nettoyage des fragments
export function setupFragmentCleaner(frameFragments) {
  const FRAGMENT_CLEANUP_INTERVAL = Number.parseInt(process.env.FRAGMENT_CLEANUP_INTERVAL || "60000")
  const FRAGMENT_EXPIRATION = Number.parseInt(process.env.FRAGMENT_EXPIRATION || "30000")

  logger.info(
    `Configuration du nettoyage des fragments: intervalle=${FRAGMENT_CLEANUP_INTERVAL}ms, expiration=${FRAGMENT_EXPIRATION}ms`,
  )

  // Nettoyer les fragments expirés à intervalles réguliers
  setInterval(() => {
    try {
      const now = Date.now()
      let expiredCount = 0

      for (const [key, data] of frameFragments.entries()) {
        if (now - data.timestamp > FRAGMENT_EXPIRATION) {
          frameFragments.delete(key)
          expiredCount++
        }
      }

      if (expiredCount > 0) {
        logger.debug(`Nettoyage des fragments: ${expiredCount} fragments expirés supprimés`)
      }
    } catch (error) {
      logger.error(`Erreur lors du nettoyage des fragments: ${error.message}`)
    }
  }, FRAGMENT_CLEANUP_INTERVAL)

  logger.info("Nettoyage des fragments configuré avec succès")
}

