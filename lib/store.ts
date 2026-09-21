/**
 * Persistence. SQLite via Node's built-in driver — no native build step.
 *
 * The database holds metadata only. The actual source trees and generated output
 * live on disk under data/workspaces/<id>/, because they are file trees and
 * pretending otherwise makes every later step harder.
 */
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const DATA = path.join(process.cwd(), 'data')
export const WORKSPACES = path.join(DATA, 'workspaces')

fs.mkdirSync(WORKSPACES, { recursive: true })

let _db: DatabaseSync | null = null

export function db(): DatabaseSync {
  if (_db) return _db
  const d = new DatabaseSync(path.join(DATA, 'peel.db'))
  d.exec(`
    CREATE TABLE IF NOT EXISTS systems (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      source       TEXT NOT NULL,       -- 'github' | 'upload' | 'sample'
      origin       TEXT,                -- repo url, or the uploaded filename
      created_at   TEXT NOT NULL,
      facts_json   TEXT,
      before_json  TEXT,
      after_json   TEXT,
      converted    INTEGER DEFAULT 0,
      selected     TEXT                 -- JSON array of converted component names
    );
  `)
  _db = d
  return d
}

export interface SystemRow {
  id: string
  name: string
  source: string
  origin: string | null
  created_at: string
  facts_json: string | null
  before_json: string | null
  after_json: string | null
  converted: number
  selected: string | null
}

export const workspaceDir = (id: string) => path.join(WORKSPACES, id)
export const sourceDir = (id: string) => path.join(workspaceDir(id), 'source')
export const outputDir = (id: string) => path.join(workspaceDir(id), 'agent-ready')

export function createSystem(row: {
  id: string; name: string; source: string; origin?: string
}) {
  db()
    .prepare('INSERT INTO systems (id, name, source, origin, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(row.id, row.name, row.source, row.origin ?? null, new Date().toISOString())
}

export function listSystems(): SystemRow[] {
  return db().prepare('SELECT * FROM systems ORDER BY created_at DESC').all() as unknown as SystemRow[]
}

export function getSystem(id: string): SystemRow | null {
  return (db().prepare('SELECT * FROM systems WHERE id = ?').get(id) as unknown as SystemRow) ?? null
}

export function saveAudit(id: string, factsJson: string, beforeJson: string) {
  db().prepare('UPDATE systems SET facts_json = ?, before_json = ? WHERE id = ?').run(factsJson, beforeJson, id)
}

export function saveConversion(id: string, afterJson: string, selected: string[]) {
  db()
    .prepare('UPDATE systems SET after_json = ?, converted = 1, selected = ? WHERE id = ?')
    .run(afterJson, JSON.stringify(selected), id)
}

export function deleteSystem(id: string) {
  db().prepare('DELETE FROM systems WHERE id = ?').run(id)
  fs.rmSync(workspaceDir(id), { recursive: true, force: true })
}

/** Write a generated file tree to disk, creating directories as needed. */
export function writeTree(root: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, body, 'utf8')
  }
}

export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
