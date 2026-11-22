import assert from 'node:assert/strict'
import { test } from 'node:test'
import { envReport, escapeHtml, Limiter, legalSummary, maskHeaders } from '../src/report.ts'

test('envReport shows safe values and hides secrets', () => {
  const lines = envReport({
    APP_NAME: 'whoami',
    APP_SECRET: 'super-secret',
    DATABASE_URL: 'postgres://app:pw@db/apps',
    SMTP_URL: 'smtp://whoami:token@mail:2525',
  })
  const byName = Object.fromEntries(lines.map((line) => [line.name, line]))
  assert.equal(byName.APP_NAME?.value, 'whoami')
  for (const name of ['APP_SECRET', 'DATABASE_URL', 'SMTP_URL']) {
    assert.equal(byName[name]?.set, true)
    assert.equal(byName[name]?.value, undefined, `${name} must not be shown`)
  }
  assert.equal(byName.PORT?.set, false)
  assert.ok(!JSON.stringify(lines).includes('super-secret'))
  assert.ok(!JSON.stringify(lines).includes('token'))
})

test('maskHeaders hides credentials and sorts', () => {
  const headers = maskHeaders({
    host: 'whoami.vin.ski',
    cookie: 'session=abc',
    authorization: 'Bearer abc',
    'x-hook-token': 'abc',
    accept: ['text/html', 'application/json'],
  })
  assert.deepEqual(headers, [
    ['accept', 'text/html, application/json'],
    ['authorization', '(hidden)'],
    ['cookie', '(hidden)'],
    ['host', 'whoami.vin.ski'],
    ['x-hook-token', '(hidden)'],
  ])
})

test('legalSummary reads processors and reports bad input', () => {
  assert.equal(legalSummary(undefined), undefined)
  assert.equal(legalSummary('{'), 'LEGAL_FACTS is not valid JSON')
  assert.equal(legalSummary('{}'), 'LEGAL_FACTS has no "processing" list')
  assert.deepEqual(
    legalSummary(
      JSON.stringify({
        version: 1,
        updated: '2026-11-22',
        controller: null,
        processing: [
          { id: 'hosting', processor: { name: 'Hetzner Online GmbH', country: 'DE' } },
          { id: 'accounts' },
        ],
      }),
    ),
    {
      controller: false,
      updated: '2026-11-22',
      processing: [{ id: 'hosting', processor: 'Hetzner Online GmbH (DE)' }, { id: 'accounts' }],
    },
  )
})

test('Limiter allows one per interval', () => {
  const limiter = new Limiter(60_000)
  assert.equal(limiter.take(1_000), 0)
  assert.equal(limiter.take(31_000), 30)
  assert.equal(limiter.take(61_000), 0)
})

test('escapeHtml escapes markup', () => {
  assert.equal(
    escapeHtml(`<a href="x">'&'</a>`),
    '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
  )
})
