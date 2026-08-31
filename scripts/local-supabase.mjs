/**
 * Local Supabase-compatible API, for development and visual QA without Docker.
 *
 * Puts a Supabase-shaped surface in front of a plain Postgres + PostgREST:
 *
 *   /rest/v1/*      -> PostgREST, with the caller's `apikey` mapped to a signed
 *                      JWT carrying either the `anon` or `service_role` role,
 *                      so RLS behaves exactly as it does on real Supabase.
 *   /storage/v1/... -> files served from .local-storage/
 *
 * This is a development convenience only. Production runs against a real
 * Supabase project; nothing here is imported by application code.
 *
 *   node scripts/local-supabase.mjs
 *
 * Environment:
 *   LOCAL_SUPABASE_PORT   default 54321
 *   POSTGREST_URL         default http://127.0.0.1:3001
 *   LOCAL_ANON_KEY        default "local-anon-key"
 *   LOCAL_SERVICE_KEY     default "local-service-key"
 *   LOCAL_JWT_SECRET      must match PostgREST's PGRST_JWT_SECRET
 */

import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve } from 'node:path'

const PORT = Number(process.env.LOCAL_SUPABASE_PORT ?? 54321)
const POSTGREST = process.env.POSTGREST_URL ?? 'http://127.0.0.1:3001'
const ANON_KEY = process.env.LOCAL_ANON_KEY ?? 'local-anon-key'
const SERVICE_KEY = process.env.LOCAL_SERVICE_KEY ?? 'local-service-key'
const JWT_SECRET =
  process.env.LOCAL_JWT_SECRET ?? 'local-development-jwt-secret-at-least-32-chars'
const STORAGE_ROOT = resolve(process.cwd(), '.local-storage')

const base64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function mintJwt(role) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 }),
  )
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${header}.${payload}.${signature}`
}

/** Maps the incoming Supabase key to a Postgres role. */
function roleForKey(key) {
  if (key === SERVICE_KEY) return 'service_role'
  if (key === ANON_KEY) return 'anon'
  return null
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

async function handleStorage(req, res, url) {
  // /storage/v1/object/public/<bucket>/<path>  (read)
  // /storage/v1/object/<bucket>/<path>         (write)
  const parts = url.pathname.split('/').filter(Boolean).slice(2) // drop storage/v1
  if (parts[0] !== 'object') {
    res.writeHead(404).end('not found')
    return
  }

  const isPublicRead = parts[1] === 'public'
  const rest = parts.slice(isPublicRead ? 2 : 1)
  // Contain everything under STORAGE_ROOT; reject any traversal attempt.
  const relative = normalize(rest.join('/')).replace(/^(\.\.[/\\])+/, '')
  const filePath = join(STORAGE_ROOT, relative)
  if (!filePath.startsWith(STORAGE_ROOT)) {
    res.writeHead(400).end('bad path')
    return
  }

  if (req.method === 'GET') {
    try {
      await stat(filePath)
    } catch {
      res.writeHead(404).end('not found')
      return
    }
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    })
    createReadStream(filePath).pipe(res)
    return
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, Buffer.concat(chunks))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ Key: relative }))
    return
  }

  res.writeHead(405).end('method not allowed')
}

async function handleRest(req, res, url) {
  const key = req.headers.apikey ?? req.headers.authorization?.replace(/^Bearer /, '')
  const role = roleForKey(key)

  if (!role) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Invalid API key' }))
    return
  }

  const target = POSTGREST + url.pathname.replace(/^\/rest\/v1/, '') + url.search

  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    // Hop-by-hop and auth headers are replaced below.
    if (['host', 'connection', 'apikey', 'authorization', 'content-length'].includes(name)) {
      continue
    }
    if (typeof value === 'string') headers.set(name, value)
  }
  headers.set('Authorization', `Bearer ${mintJwt(role)}`)

  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    body = Buffer.concat(chunks)
  }

  const upstream = await fetch(target, { method: req.method, headers, body })
  const buffer = Buffer.from(await upstream.arrayBuffer())

  const outHeaders = {}
  upstream.headers.forEach((value, name) => {
    if (name !== 'content-encoding' && name !== 'transfer-encoding') {
      outHeaders[name] = value
    }
  })

  res.writeHead(upstream.status, outHeaders)
  res.end(buffer)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)

  try {
    if (url.pathname.startsWith('/rest/v1')) return await handleRest(req, res, url)
    if (url.pathname.startsWith('/storage/v1')) return await handleStorage(req, res, url)
    if (url.pathname === '/health') {
      res.writeHead(200).end('ok')
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: `No local handler for ${url.pathname}` }))
  } catch (error) {
    console.error('local-supabase error:', error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: String(error) }))
  }
})

await mkdir(STORAGE_ROOT, { recursive: true })
server.listen(PORT, '127.0.0.1', () => {
  console.log(`local supabase  http://127.0.0.1:${PORT}`)
  console.log(`  rest    -> ${POSTGREST}`)
  console.log(`  storage -> ${STORAGE_ROOT}`)
})
