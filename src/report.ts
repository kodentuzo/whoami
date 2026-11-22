// Pure helpers: what the page shows about the environment, the request and the legal facts.
// Nothing here touches the network or the database, so the tests cover it directly.

export type Status = 'ok' | 'warn' | 'fail' | 'off'

export interface Check {
  name: string
  status: Status
  detail: string
}

// The variables Spotcraft sets for every app (docs/contracts.md in kodentuzo/spotcraft).
// `secret` ones are reported as set or missing, never shown.
export const PLATFORM_VARS: { name: string; secret: boolean; optional?: boolean }[] = [
  { name: 'PORT', secret: false },
  { name: 'PUBLIC_URL', secret: false, optional: true },
  { name: 'APP_NAME', secret: false },
  { name: 'APP_RELEASE', secret: false },
  { name: 'APP_SECRET', secret: true },
  { name: 'DATABASE_URL', secret: true },
  { name: 'DATABASE_SCHEMA', secret: false },
  { name: 'AUTH_URL', secret: false, optional: true },
  { name: 'AUTH_ISSUER', secret: false, optional: true },
  { name: 'AUTH_JWKS_URL', secret: false, optional: true },
  { name: 'SMTP_URL', secret: true, optional: true },
  { name: 'MAIL_FROM', secret: false, optional: true },
  { name: 'LEGAL_FACTS', secret: true, optional: true },
]

export interface EnvLine {
  name: string
  set: boolean
  optional: boolean
  value?: string
}

export function envReport(env: Record<string, string | undefined>): EnvLine[] {
  return PLATFORM_VARS.map(({ name, secret, optional = false }) => {
    const value = env[name]
    const set = value !== undefined && value !== ''
    return { name, set, optional, ...(set && !secret ? { value } : {}) }
  })
}

// Header values that carry credentials are replaced, so the page can be shared in a bug report.
const MASKED = /^(cookie|authorization|proxy-authorization)$|token|secret|key/i

export function maskHeaders(
  headers: Record<string, string | string[] | undefined>,
): [string, string][] {
  return Object.entries(headers)
    .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
    .map(([name, value]): [string, string] => [
      name,
      MASKED.test(name) ? '(hidden)' : Array.isArray(value) ? value.join(', ') : value,
    ])
    .sort(([a], [b]) => a.localeCompare(b))
}

export interface LegalSummary {
  controller: boolean
  updated?: string
  processing: { id: string; processor?: string }[]
}

// LEGAL_FACTS, read the way an app's privacy page would. Returns an error message instead of
// throwing, so a broken value shows on the page.
export function legalSummary(raw: string | undefined): LegalSummary | string | undefined {
  if (!raw) return undefined
  try {
    const facts = JSON.parse(raw) as {
      updated?: string
      controller?: unknown
      processing?: { id?: string; processor?: { name?: string; country?: string } }[]
    }
    if (!Array.isArray(facts.processing)) return 'LEGAL_FACTS has no "processing" list'
    return {
      controller: facts.controller != null,
      ...(facts.updated ? { updated: facts.updated } : {}),
      processing: facts.processing.map((item) => ({
        id: item.id ?? '?',
        ...(item.processor?.name
          ? { processor: `${item.processor.name} (${item.processor.country ?? '?'})` }
          : {}),
      })),
    }
  } catch {
    return 'LEGAL_FACTS is not valid JSON'
  }
}

// One test email a minute, for the whole app: the button must not turn into a mail cannon.
export class Limiter {
  #last = Number.NEGATIVE_INFINITY
  readonly #intervalMs: number

  constructor(intervalMs = 60_000) {
    this.#intervalMs = intervalMs
  }

  // Seconds to wait before the next one, or 0 if it may go now (and counts it).
  take(now = Date.now()): number {
    const wait = this.#last + this.#intervalMs - now
    if (wait > 0) return Math.ceil(wait / 1000)
    this.#last = now
    return 0
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
