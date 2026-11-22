import pg from 'pg'

// The app's role has its own schema as its search_path, so these unqualified names land in
// app_<slug>: that schema is what Spotcraft backs up and restores.
const CREATE = `CREATE TABLE IF NOT EXISTS visits (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now()
)`

export function connect(url: string): pg.Pool {
  // A few connections are plenty; the role may have at most 20.
  return new pg.Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 5_000 })
}

export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(CREATE)
}

export interface DatabaseInfo {
  user: string
  schema: string | null
  migrated: boolean
  visits?: number
}

// Who the app is in Postgres, whether the migration ran, and (when `count` is set) one more
// visit recorded and the total.
export async function inspect(pool: pg.Pool, count: boolean): Promise<DatabaseInfo> {
  const who = await pool.query<{ user: string; schema: string | null; migrated: boolean }>(
    `SELECT current_user AS user, current_schema() AS schema,
            to_regclass('visits') IS NOT NULL AS migrated`,
  )
  const info: DatabaseInfo = who.rows[0] ?? { user: '?', schema: null, migrated: false }
  if (!info.migrated) return info
  if (count) await pool.query('INSERT INTO visits DEFAULT VALUES')
  const total = await pool.query<{ n: string }>('SELECT count(*) AS n FROM visits')
  return { ...info, visits: Number(total.rows[0]?.n ?? 0) }
}
