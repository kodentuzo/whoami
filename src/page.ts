import { type Check, type EnvLine, escapeHtml as e } from './report.ts'

export interface Report {
  app: { name?: string; release?: string; url?: string }
  checks: Check[]
  request: { method: string; url: string; host?: string; headers: [string, string][] }
  env: EnvLine[]
}

const ICON = { ok: '✓', warn: '!', fail: '✗', off: '–' } as const

export function renderPage(report: Report, notice?: { ok: boolean; text: string }): string {
  const title = report.app.name ? `whoami · ${report.app.name}` : 'whoami'
  const checks = report.checks
    .map(
      (check) => `<tr class="${check.status}"${check.name === 'Analytics' ? ' id="analytics"' : ''}>
  <td class="icon">${ICON[check.status]}</td><th>${e(check.name)}</th><td class="detail">${e(check.detail)}</td>
</tr>`,
    )
    .join('\n')
  const env = report.env
    .map(
      (line) =>
        `<tr><th>${e(line.name)}</th><td>${
          line.set
            ? line.value === undefined
              ? '<em>set (hidden)</em>'
              : `<code>${e(line.value)}</code>`
            : line.optional
              ? '<em>not set</em>'
              : '<strong>missing</strong>'
        }</td></tr>`,
    )
    .join('\n')
  const headers = report.request.headers
    .map(([name, value]) => `<tr><th>${e(name)}</th><td><code>${e(value)}</code></td></tr>`)
    .join('\n')
  const mailOn = report.checks.some((check) => check.name === 'Mail' && check.status === 'ok')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(title)}</title>
<link rel="stylesheet" href="/app.css">
<script defer src="/app.js"></script>
</head>
<body>
<main>
<h1>${e(title)}</h1>
<p class="lead">Checks what Spotcraft gives this app.${
    report.app.release ? ` Release <code>${e(report.app.release)}</code>.` : ''
  } <a href="https://github.com/vindotski/whoami#what-each-check-means">What each check means</a></p>
${notice ? `<p class="notice ${notice.ok ? 'ok' : 'fail'}" role="status">${e(notice.text)}</p>` : ''}
<table class="checks">
${checks}
</table>
<form method="post" action="/mail">
<button type="submit"${mailOn ? '' : ' disabled'}>Send a test email</button>
</form>
<h2>Platform environment</h2>
<table>
${env}
</table>
<h2>This request</h2>
<p><code>${e(report.request.method)} ${e(report.request.url)}</code></p>
<table>
${headers}
</table>
<p class="foot">JSON: <code>curl -H 'Accept: application/json' ${e(report.app.url ?? '')}/</code></p>
</main>
</body>
</html>`
}

export const CSS = `:root { color-scheme: light dark; --ok: #1a7f37; --warn: #9a6700; --fail: #cf222e; --muted: #6e7781; }
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
h1 { margin: 0 0 .25rem; font-size: 1.6rem; }
h2 { margin-top: 2rem; font-size: 1.1rem; }
.lead, .foot { color: var(--muted); }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { text-align: left; vertical-align: top; padding: .35rem .5rem; border-bottom: 1px solid #8884; overflow-wrap: anywhere; }
th { width: 30%; font-weight: 600; }
.checks th { width: 9rem; }
.icon { width: 1.5rem; font-weight: 700; }
.ok .icon { color: var(--ok); } .warn .icon { color: var(--warn); } .fail .icon { color: var(--fail); } .off .icon { color: var(--muted); }
.notice { padding: .6rem .8rem; border-radius: .4rem; border: 1px solid; }
.notice.ok { border-color: var(--ok); } .notice.fail { border-color: var(--fail); }
button { margin-top: 1rem; font: inherit; padding: .45rem .9rem; border-radius: .4rem; border: 1px solid #8888; background: none; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .5; }
code { font-size: .9em; }
`

// Runs in the browser. Analytics the way an app on Spotcraft does it: read the instance's
// settings, then load the same-origin tracker when the mode allows it.
export const CLIENT_JS = `(async () => {
  const row = document.getElementById('analytics')
  if (!row) return
  const set = (status, text) => {
    row.className = status
    row.querySelector('.icon').textContent = { ok: '✓', warn: '!', fail: '✗', off: '–' }[status]
    row.querySelector('.detail').textContent = text
  }
  let config
  try {
    const response = await fetch('/_spotcraft/config.json', { cache: 'no-store' })
    if (!response.ok) return set('off', 'No /_spotcraft/config.json: not served by Spotcraft.')
    config = (await response.json()).analytics
  } catch {
    return set('fail', 'Could not read /_spotcraft/config.json.')
  }
  if (!config || !config.enabled) return set('off', 'Analytics are off for this app.')
  if (config.mode === 'server') return set('ok', 'Server mode: requests are counted, no tracker runs.')
  const load = () => {
    const script = document.createElement('script')
    script.defer = true
    script.src = '/_spotcraft/s.js'
    // Spotcraft before 0.15 served Umami's tracker, which needed its website id.
    if (config.websiteId) script.dataset.websiteId = config.websiteId
    script.onload = () => {
      // One test event, the way an app sends its own (Spotless's spotless.track).
      const track = window.spotless ? window.spotless.track : window.umami && window.umami.track
      if (track) track('whoami-check', { mode: config.mode })
      set('ok', 'Tracker loaded from /_spotcraft/s.js; this visit and a test event "whoami-check" count (' + config.mode + ').')
    }
    script.onerror = () => set('fail', 'Could not load /_spotcraft/s.js.')
    document.head.append(script)
  }
  if (config.mode === 'opt-in') {
    set('warn', 'Opt-in mode: nothing is counted until the visitor agrees.')
    const button = document.createElement('button')
    button.textContent = 'Count this visit'
    button.onclick = () => { button.remove(); load() }
    row.querySelector('.detail').append(' ', button)
    return
  }
  load()
})()
`
