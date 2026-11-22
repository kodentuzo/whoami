import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import { createApp, type Deps } from '../src/app.ts'
import { Limiter } from '../src/report.ts'

const sent: { to: string; from: string }[] = []
const env: Deps['env'] = {
  APP_NAME: 'whoami',
  APP_SECRET: 'super-secret',
  SMTP_URL: 'smtp://whoami:token@mail:2525',
  MAIL_FROM: 'noreply@vin.ski',
  WHOAMI_MAIL_TO: 'owner@example.com',
}
let server: Server
let base: string

before(async () => {
  const handle = createApp({
    env,
    limiter: new Limiter(60_000),
    sendMail: async (message) => {
      sent.push(message)
    },
  })
  server = createServer((request, response) => void handle(request, response))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => server.close())

test('/health answers 200', async () => {
  const response = await fetch(`${base}/health`)
  assert.equal(response.status, 200)
})

test('/ as JSON reports checks and hides secrets', async () => {
  const response = await fetch(`${base}/`, { headers: { accept: 'application/json' } })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'self'/)
  const body = await response.text()
  assert.ok(!body.includes('super-secret'))
  assert.ok(!body.includes('token@mail'))
  const report = JSON.parse(body) as { checks: { name: string; status: string }[] }
  const status = Object.fromEntries(report.checks.map((check) => [check.name, check.status]))
  assert.equal(status.Database, 'fail')
  assert.equal(status.Mail, 'ok')
  assert.equal(status.Accounts, 'off')
})

test('/mail refuses another site, then sends once a minute', async () => {
  const foreign = await fetch(`${base}/mail`, {
    method: 'POST',
    headers: { origin: 'https://evil.example' },
  })
  assert.equal(foreign.status, 400)
  assert.equal(sent.length, 0)

  const first = await fetch(`${base}/mail`, { method: 'POST' })
  assert.equal(first.status, 200)
  assert.deepEqual(
    sent.map((message) => [message.from, message.to]),
    [['noreply@vin.ski', 'owner@example.com']],
  )

  const second = await fetch(`${base}/mail`, { method: 'POST' })
  assert.equal(second.status, 400)
  assert.match(await second.text(), /One test a minute/)
  assert.equal(sent.length, 1)
})

test('/mail is off without WHOAMI_MAIL_TO', async () => {
  const handle = createApp({ env: { ...env, WHOAMI_MAIL_TO: undefined }, sendMail: async () => {} })
  const other = createServer((request, response) => void handle(request, response))
  await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve))
  try {
    const port = (other.address() as AddressInfo).port
    const response = await fetch(`http://127.0.0.1:${port}/mail`, { method: 'POST' })
    assert.equal(response.status, 400)
    assert.match(await response.text(), /Set WHOAMI_MAIL_TO/)
  } finally {
    other.close()
  }
})
