#!/usr/bin/env node
/**
 * Launcher. The engine lives with the Peel app so the skill and the app can never
 * disagree about what a score means.
 *
 *   node scripts/peel.mjs <github-url | local-path | file.zip> [options]
 *
 *     --components Button,Card   which to convert
 *     --out <dir>                output directory
 *     --score-only               audit and stop, write nothing
 *     --json                     machine-readable
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? ''
const CANDIDATES = [
  process.env.PEEL_HOME,
  path.join(HOME, 'Downloads', 'peel final'),
  path.join(HOME, 'Downloads', 'peel'),
  path.resolve('.'),
].filter(Boolean)

const app = CANDIDATES.find(
  (d) =>
    fs.existsSync(path.join(d, 'scripts', 'peel.mjs')) &&
    fs.existsSync(path.join(d, 'lib', 'engine', 'extract.ts')),
)

if (!app) {
  console.error('Could not find the Peel app. Set PEEL_HOME to its directory.')
  console.error('Looked in:\n  ' + CANDIDATES.join('\n  '))
  process.exit(1)
}

spawn(process.execPath, [path.join(app, 'scripts', 'peel.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
}).on('exit', (c) => process.exit(c ?? 0))
