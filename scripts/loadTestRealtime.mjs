/**
 * Wrapper: runs backend/scripts/loadTestRealtime.js with cwd = backend (for node_modules).
 * Usage (repo root): node scripts/loadTestRealtime.mjs
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.join(__dirname, '..', 'backend')
const script = path.join(backendRoot, 'scripts', 'loadTestRealtime.js')

const child = spawn(process.execPath, [script], {
  cwd: backendRoot,
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code) => process.exit(code ?? 1))
