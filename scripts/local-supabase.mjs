/**
 * Local Supabase-compatible API, for development and visual QA without Docker.
 *
 * Puts a Supabase-shaped surface in front of a plain Postgres + PostgREST:
 *
 *   /rest/v1/*      -> PostgREST, with the caller's `apikey` mapped to a signed
 *                      JWT carrying either the `anon` or `service_role` role,
 *                      so RLS behaves exactly as it does on real Supabase. A
 *                      user's own access token is forwarded as-is, so policies
 *                      that depend on auth.uid() are exercised for real.
 *   /auth/v1/*      -> a minimal GoTrue stand-in over the auth.users table:
 *                      signup, password grant, refresh, logout, get/update
 *                      user, and password recovery.
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

import { createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { Client } from 'pg'
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
const DATABASE_URL =
  process.env.LOCAL_DATABASE_URL ??
  'postgresql://postgres@127.0.0.1:5433/amiriani_dev'

const base64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function mintJwt(role, subject) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const claims = { role, exp: Math.floor(Date.now() / 1000) + 3600 }
  if (subject) {
    claims.sub = subject
    claims.aud = 'authenticated'
  }
  const payload = base64url(JSON.stringify(claims))
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


// ---------------------------------------------------------------------------
// Auth (a minimal GoTrue stand-in)
// ---------------------------------------------------------------------------

const db = new Client({ connectionString: DATABASE_URL })
await db.connect()

/** Local-only password hashing. Real Supabase uses bcrypt and we never see it. */
function hashPassword(password, salt = randomUUID()) {
  const digest = scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${digest}`
}

function verifyPassword(password, stored) {
  if (!stored) return false
  const [salt, digest] = stored.split(':')
  if (!salt || !digest) return false
  const candidate = scryptSync(password, salt, 32).toString('hex')
  const a = Buffer.from(candidate)
  const b = Buffer.from(digest)
  return a.length === b.length && timingSafeEqual(a, b)
}

function decodeJwt(token) {
  try {
    const [header, payload, signature] = token.split('.')
    const expected = createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    if (signature !== expected) return null
    const claims = JSON.parse(Buffer.from(payload, 'base64').toString())
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null
    return claims
  } catch {
    return null
  }
}

function userPayload(row) {
  return {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    user_metadata: row.user_metadata ?? {},
    app_metadata: { provider: 'email' },
    created_at: row.created_at,
  }
}

function sessionPayload(row) {
  return {
    access_token: mintJwt('authenticated', row.id),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    // The harness does not rotate refresh tokens; the id is enough to re-mint.
    refresh_token: `local-refresh-${row.id}`,
    user: userPayload(row),
  }
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    return {}
  }
}

async function handleAuth(req, res, url) {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  const path = url.pathname.replace(/^\/auth\/v1/, '') || '/'
  const bearer = req.headers.authorization?.replace(/^Bearer /, '')

  // --- sign up -------------------------------------------------------------
  if (path === '/signup' && req.method === 'POST') {
    const { email, password, data } = await readJson(req)
    if (!email || !password) return send(400, { error: 'invalid_request' })

    const existing = await db.query('select * from auth.users where email = $1', [email])
    if (existing.rows.length > 0) {
      // GoTrue does not reveal that the address is taken.
      return send(200, { user: userPayload(existing.rows[0]), session: null })
    }

    const inserted = await db.query(
      `insert into auth.users (email, password_hash, user_metadata, email_confirmed_at)
       values ($1, $2, $3, now()) returning *`,
      [email, hashPassword(password), JSON.stringify(data ?? {})],
    )
    const row = inserted.rows[0]
    return send(200, { user: userPayload(row), session: sessionPayload(row) })
  }

  // --- password / refresh grant -------------------------------------------
  if (path === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type')
    const body = await readJson(req)

    if (grant === 'refresh_token') {
      const id = String(body.refresh_token ?? '').replace('local-refresh-', '')
      const found = await db.query('select * from auth.users where id = $1', [id])
      if (found.rows.length === 0) {
        return send(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' })
      }
      return send(200, sessionPayload(found.rows[0]))
    }

    const found = await db.query('select * from auth.users where email = $1', [body.email])
    const row = found.rows[0]
    if (!row || !verifyPassword(String(body.password ?? ''), row.password_hash)) {
      return send(400, {
        error: 'invalid_grant',
        error_description: 'Invalid login credentials',
      })
    }
    return send(200, sessionPayload(row))
  }

  // --- current user --------------------------------------------------------
  if (path === '/user' && req.method === 'GET') {
    const claims = bearer ? decodeJwt(bearer) : null
    if (!claims?.sub) return send(401, { message: 'invalid claim: missing sub claim' })
    const found = await db.query('select * from auth.users where id = $1', [claims.sub])
    if (found.rows.length === 0) return send(404, { message: 'User not found' })
    return send(200, userPayload(found.rows[0]))
  }

  // --- update user ---------------------------------------------------------
  if (path === '/user' && (req.method === 'PUT' || req.method === 'PATCH')) {
    const claims = bearer ? decodeJwt(bearer) : null
    if (!claims?.sub) return send(401, { message: 'invalid claim: missing sub claim' })
    const body = await readJson(req)

    const updated = await db.query(
      `update auth.users
          set email = coalesce($2, email),
              password_hash = coalesce($3, password_hash),
              user_metadata = coalesce($4, user_metadata)
        where id = $1
        returning *`,
      [
        claims.sub,
        body.email ?? null,
        body.password ? hashPassword(body.password) : null,
        body.data ? JSON.stringify(body.data) : null,
      ],
    )
    return send(200, userPayload(updated.rows[0]))
  }

  // --- password recovery ---------------------------------------------------
  if (path === '/recover' && req.method === 'POST') {
    // Real Supabase emails a link. The harness has no mail transport, so it
    // logs the address and returns the same empty success either way — which is
    // also what stops the endpoint being used to probe for accounts.
    const { email } = await readJson(req)
    console.log(`  [auth] password recovery requested for ${email}`)
    return send(200, {})
  }

  // --- admin: list users --------------------------------------------------
  // Used by scripts/grant-admin.ts. Service-role key only, exactly as GoTrue
  // requires, so the script is exercised the same way it will run in production.
  if (path === '/admin/users' && req.method === 'GET') {
    if (req.headers.apikey !== SERVICE_KEY && bearer !== SERVICE_KEY) {
      return send(403, { message: 'User not allowed' })
    }
    const page = Number(url.searchParams.get('page') ?? 1)
    const perPage = Number(url.searchParams.get('per_page') ?? 50)
    const rows = await db.query(
      'select * from auth.users order by created_at asc limit $1 offset $2',
      [perPage, (page - 1) * perPage],
    )
    return send(200, { users: rows.rows.map(userPayload), aud: 'authenticated' })
  }

  if (path === '/logout' && req.method === 'POST') {
    // Tokens are stateless here; the client discards them.
    res.writeHead(204).end()
    return
  }

  return send(404, { message: `No local auth handler for ${req.method} ${path}` })
}

async function handleRest(req, res, url) {
  const key = req.headers.apikey ?? req.headers.authorization?.replace(/^Bearer /, '')
  const role = roleForKey(key)

  if (!role) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Invalid API key' }))
    return
  }

  /*
   * supabase-js sends the API key as `apikey` and the signed-in user's access
   * token as `Authorization`. When that token is one we issued, forward it
   * untouched so PostgREST sees the real `sub` claim and auth.uid() resolves —
   * which is what makes the RLS policies testable as an actual customer.
   */
  const bearer = req.headers.authorization?.replace(/^Bearer /, '')
  const userClaims =
    bearer && bearer !== ANON_KEY && bearer !== SERVICE_KEY ? decodeJwt(bearer) : null

  const target = POSTGREST + url.pathname.replace(/^\/rest\/v1/, '') + url.search

  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    // Hop-by-hop and auth headers are replaced below.
    if (['host', 'connection', 'apikey', 'authorization', 'content-length'].includes(name)) {
      continue
    }
    if (typeof value === 'string') headers.set(name, value)
  }
  headers.set(
    'Authorization',
    `Bearer ${userClaims?.sub ? bearer : mintJwt(role)}`,
  )

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

/*
 * CORS.
 *
 * The browser calls this origin directly for auth, exactly as it would call a
 * real Supabase project — which serves permissive CORS headers of its own. The
 * harness has to do the same or every browser-side auth call fails preflight.
 * Development only; nothing here runs in production.
 */
function applyCors(req, res) {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, x-client-info, apikey, content-type, prefer, range, x-supabase-api-version',
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD')
  res.setHeader('Access-Control-Expose-Headers', 'content-range, content-length')
  res.setHeader('Access-Control-Max-Age', '86400')
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  applyCors(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  try {
    if (url.pathname.startsWith('/rest/v1')) return await handleRest(req, res, url)
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url)
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
  console.log(`  auth    -> ${DATABASE_URL.replace(/:[^:@/]*@/, ':***@')}`)
  console.log(`  storage -> ${STORAGE_ROOT}`)
})
