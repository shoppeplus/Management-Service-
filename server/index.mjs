import { resolve } from 'node:path'
import { openDatabase } from './database.mjs'
import { createInventory } from './inventory.mjs'
import { createBusiness } from './business.mjs'
import { createIntegrationSettings } from './integration-settings.mjs'
import { createInventoryServer } from './http.mjs'

const db = openDatabase(resolve(process.env.INVENTORY_DB_PATH || 'var/inventory.sqlite'))
const port = Number(process.env.INVENTORY_PORT || 3002)
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('INVENTORY_PORT không hợp lệ.')
const inventory = createInventory(db)
const integrationSettings = createIntegrationSettings(db)
const business = createBusiness(db, {
  inventory,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramTokenForActor: (actor) => integrationSettings.credentialsFor(actor, 'telegram').botToken,
})
const server = createInventoryServer({
  db,
  inventory,
  businessService: business,
  integrationSettingsService: integrationSettings,
  allowedOrigins: (
    process.env.INVENTORY_ALLOWED_ORIGINS ||
    'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  secureCookies: process.env.NODE_ENV === 'production',
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
})
server.listen(port, process.env.INVENTORY_HOST || '127.0.0.1', () => {
  console.log(`Inventory API: http://${process.env.INVENTORY_HOST || '127.0.0.1'}:${port}/api/v1`)
})
const stop = async () => {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
