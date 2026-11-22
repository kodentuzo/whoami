// Fails when a production dependency is missing from NOTICE, or comes under a license that
// isn't on the allowed list. Run in CI after install: node scripts/check-notice.ts
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
])

const listed = JSON.parse(
  execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { encoding: 'utf8' }),
) as Record<string, { name: string }[]>
const notice = readFileSync('NOTICE', 'utf8')

const problems: string[] = []
for (const [license, packages] of Object.entries(listed)) {
  for (const { name } of packages) {
    if (!ALLOWED.has(license)) problems.push(`${name}: ${license} is not an allowed license`)
    if (
      !new RegExp(`^${name.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s+${license}\\s`, 'm').test(
        notice,
      )
    ) {
      problems.push(`${name} (${license}) is missing from NOTICE`)
    }
  }
}
if (problems.length) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}
console.log('NOTICE lists every production dependency')
