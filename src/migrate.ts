// Run by Spotcraft before each release, from the image's dev.spotcraft.migrate label.
import { connect, migrate } from './db.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    JSON.stringify({ level: 'error', msg: 'DATABASE_URL is not set', time: new Date() }),
  )
  process.exit(1)
}

const pool = connect(url)
try {
  await migrate(pool)
  console.log(JSON.stringify({ level: 'info', msg: 'migrated', time: new Date() }))
} finally {
  await pool.end()
}
