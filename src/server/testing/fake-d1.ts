import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

type Value = string | number | null

// D1 binds booleans as 0/1; node:sqlite rejects them.
const toSql = (v: unknown): Value => (typeof v === 'boolean' ? Number(v) : (v as Value))

class Stmt {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private params: Value[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params.map(toSql))
  }
  async first<T>(): Promise<T | null> {
    return ((this.db.prepare(this.sql).get(...this.params) as T) ?? null) as T | null
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} }
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params)
    return { results: [], success: true, meta: { changes: Number(r.changes) } }
  }
}

/** Minimal D1 emulation over node:sqlite with the real migrations applied. */
export function createFakeD1(): { d1: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:')
  const dir = fileURLToPath(new URL('../../../migrations/', import.meta.url))
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(dir + f, 'utf8'))
  }
  const d1 = {
    prepare: (sql: string) => new Stmt(sqlite, sql),
    batch: (stmts: Stmt[]) => Promise.all(stmts.map((s) => s.all())),
  }
  return { d1: d1 as unknown as D1Database, sqlite }
}
