import type { IncomingMessage, ServerResponse } from 'node:http'
import type pg from 'pg'
import { inspect } from './db.ts'
import { CLIENT_JS, CSS, type Report, renderPage } from './page.ts'
import { type Check, envReport, Limiter, legalSummary, maskHeaders } from './report.ts'

type Env = Record<string, string | undefined>

export interface Deps {
  env: Env
  pool?: pg.Pool
  sendMail: (message: { from: string; to: string; subject: string; text: string }) => Promise<void>
  fetch?: typeof fetch
  limiter?: Limiter
  log?: (level: 'info' | 'error', msg: string, extra?: Record<string, unknown>) => void
}

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
  'Cache-Control': 'no-store',
}

export function createApp(deps: Deps) {
  const { env } = deps
  const limiter = deps.limiter ?? new Limiter()
  const fetchFn = deps.fetch ?? fetch
  const log = deps.log ?? (() => {})

  async function databaseCheck(count: boolean): Promise<Check> {
    if (!deps.pool) return { name: 'Database', status: 'fail', detail: 'DATABASE_URL is not set.' }
    try {
      const info = await inspect(deps.pool, count)
      const who = `As ${info.user}, schema ${info.schema ?? '(none)'}.`
      if (!info.migrated) {
        return {
          name: 'Database',
          status: 'fail',
          detail: `${who} The visits table is missing: the migration didn't run.`,
        }
      }
      return {
        name: 'Database',
        status: 'ok',
        detail: `${who} Migrated; ${info.visits} visits recorded.`,
      }
    } catch (error) {
      return { name: 'Database', status: 'fail', detail: (error as Error).message }
    }
  }

  function mailCheck(): Check {
    if (!env.SMTP_URL || !env.MAIL_FROM) {
      return {
        name: 'Mail',
        status: 'off',
        detail: 'No SMTP_URL: the instance has no mail provider set (MAIL_SMTP_URL).',
      }
    }
    if (!env.WHOAMI_MAIL_TO) {
      return {
        name: 'Mail',
        status: 'warn',
        detail: `Relay set, sending as ${env.MAIL_FROM}. Set WHOAMI_MAIL_TO in the app's env to send a test.`,
      }
    }
    return {
      name: 'Mail',
      status: 'ok',
      detail: `Relay set. A test goes from ${env.MAIL_FROM} to ${env.WHOAMI_MAIL_TO}.`,
    }
  }

  async function accountsCheck(): Promise<Check> {
    if (!env.AUTH_JWKS_URL) {
      return { name: 'Accounts', status: 'off', detail: 'No AUTH_JWKS_URL: no user pool.' }
    }
    try {
      const response = await fetchFn(env.AUTH_JWKS_URL, { signal: AbortSignal.timeout(3_000) })
      if (!response.ok) {
        return {
          name: 'Accounts',
          status: 'fail',
          detail: `The pool's keys answered ${response.status}.`,
        }
      }
      const body = (await response.json()) as { keys?: unknown[] }
      return {
        name: 'Accounts',
        status: 'ok',
        detail: `The pool's keys are reachable (${body.keys?.length ?? 0} keys), issuer ${env.AUTH_ISSUER ?? '?'}.`,
      }
    } catch (error) {
      return {
        name: 'Accounts',
        status: 'fail',
        detail: `The pool's keys: ${(error as Error).message}`,
      }
    }
  }

  function legalCheck(): Check {
    const summary = legalSummary(env.LEGAL_FACTS)
    if (summary === undefined) {
      return { name: 'Legal facts', status: 'off', detail: 'No LEGAL_FACTS.' }
    }
    if (typeof summary === 'string') return { name: 'Legal facts', status: 'fail', detail: summary }
    const processors = summary.processing
      .map((item) => (item.processor ? `${item.id}: ${item.processor}` : item.id))
      .join('; ')
    return {
      name: 'Legal facts',
      status: summary.controller ? 'ok' : 'warn',
      detail: `${summary.controller ? '' : 'No controller yet (dashboard Settings). '}${processors}`,
    }
  }

  async function report(request: IncomingMessage, count: boolean): Promise<Report> {
    const proto = header(request, 'x-forwarded-proto')
    const env_ = envReport(env)
    const missing = env_.filter((line) => !line.set && !line.optional).map((line) => line.name)
    const checks: Check[] = [
      proto === 'https'
        ? { name: 'HTTPS', status: 'ok', detail: `Reached over HTTPS as ${request.headers.host}.` }
        : {
            name: 'HTTPS',
            status: 'warn',
            detail: `Reached over ${proto ?? 'plain HTTP, with no proxy in front'}.`,
          },
      missing.length
        ? { name: 'Environment', status: 'fail', detail: `Missing: ${missing.join(', ')}.` }
        : {
            name: 'Environment',
            status: 'ok',
            detail: 'Every variable Spotcraft must set is set.',
          },
      await databaseCheck(count),
      mailCheck(),
      await accountsCheck(),
      legalCheck(),
      { name: 'Analytics', status: 'off', detail: 'Checked in the browser (needs JavaScript).' },
    ]
    return {
      app: {
        ...(env.APP_NAME ? { name: env.APP_NAME } : {}),
        ...(env.APP_RELEASE ? { release: env.APP_RELEASE } : {}),
        ...(env.PUBLIC_URL ? { url: env.PUBLIC_URL } : {}),
      },
      checks,
      request: {
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        ...(request.headers.host ? { host: request.headers.host } : {}),
        headers: maskHeaders(request.headers),
      },
      env: env_,
    }
  }

  async function sendTest(request: IncomingMessage): Promise<{ ok: boolean; text: string }> {
    // Only from this app's own page: a form on another site can't make it send.
    const origin = header(request, 'origin')
    if (origin && new URL(origin).host !== request.headers.host) {
      return { ok: false, text: 'Refused: the request came from another site.' }
    }
    const mail = mailCheck()
    if (mail.status !== 'ok') return { ok: false, text: mail.detail }
    const wait = limiter.take()
    if (wait > 0) return { ok: false, text: `One test a minute: try again in ${wait} s.` }
    const to = env.WHOAMI_MAIL_TO as string
    try {
      await deps.sendMail({
        from: env.MAIL_FROM as string,
        to,
        subject: `Test from ${env.APP_NAME ?? 'whoami'} on Spotcraft`,
        text: `This test email went from ${env.PUBLIC_URL ?? 'the whoami app'} through the instance's mail relay and its provider.\n\nSent ${new Date().toISOString()}. Check its headers for SPF, DKIM and DMARC.\n`,
      })
      log('info', 'test email sent', { to })
      return { ok: true, text: `Sent to ${to}. Check the inbox, and the spam folder.` }
    } catch (error) {
      log('error', 'test email failed', { error: (error as Error).message })
      return { ok: false, text: `Not sent: ${(error as Error).message}` }
    }
  }

  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://local').pathname
    try {
      if (path === '/health') return send(response, 200, 'text/plain', 'ok\n')
      if (path === '/app.css') return send(response, 200, 'text/css', CSS)
      if (path === '/app.js') return send(response, 200, 'text/javascript', CLIENT_JS)
      if (path === '/mail' && request.method === 'POST') {
        request.resume()
        const notice = await sendTest(request)
        return send(
          response,
          notice.ok ? 200 : 400,
          'text/html',
          renderPage(await report(request, false), notice),
        )
      }
      if (path === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
        const json = (header(request, 'accept') ?? '').includes('application/json')
        const result = await report(request, !json && request.method === 'GET')
        return json
          ? send(response, 200, 'application/json', `${JSON.stringify(result, null, 2)}\n`)
          : send(response, 200, 'text/html', renderPage(result))
      }
      return send(response, 404, 'text/plain', 'Not found\n')
    } catch (error) {
      log('error', 'request failed', { error: (error as Error).message })
      return send(response, 500, 'text/plain', 'Something went wrong\n')
    }
  }
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function send(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': `${type}; charset=utf-8`,
    'Content-Length': Buffer.byteLength(body),
  })
  response.end(body)
}
