import { createServer } from 'node:http'
import { createTransport } from 'nodemailer'
import { createApp } from './app.ts'
import { connect } from './db.ts'

// JSON lines on stdout, as Spotcraft's dashboard reads them.
function log(level: 'info' | 'error', msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level, msg, time: new Date().toISOString(), ...extra }))
}

const env = process.env
const pool = env.DATABASE_URL ? connect(env.DATABASE_URL) : undefined
// The relay inside the instance speaks plain SMTP on its private network.
const transport = env.SMTP_URL ? createTransport(env.SMTP_URL) : undefined

const handle = createApp({
  env,
  ...(pool ? { pool } : {}),
  log,
  sendMail: async (message) => {
    if (!transport) throw new Error('SMTP_URL is not set')
    await transport.sendMail(message)
  },
})

const server = createServer((request, response) => void handle(request, response))
const port = Number(env.PORT ?? 3000)
server.listen(port, () => log('info', 'listening', { port }))

// Spotcraft gives an app 30 seconds after SIGTERM.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log('info', 'stopping', { signal })
    server.close(() => void pool?.end().finally(() => process.exit(0)))
    server.closeIdleConnections()
    setTimeout(() => process.exit(0), 10_000).unref()
  })
}
