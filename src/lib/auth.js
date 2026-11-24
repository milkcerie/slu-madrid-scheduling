// Accounts for the demo. Stored in the browser (localStorage) until the backend/database exists.
// Passwords are never stored: only a salted SHA-256 hash (SRS NFR: security).
const USERS = 'slu-sched-users'
const MAX_TRIES = 5
const LOCK_MS = 5 * 60 * 1000

const load = () => JSON.parse(localStorage.getItem(USERS) || '{}')
const save = (u) => localStorage.setItem(USERS, JSON.stringify(u))

async function hash(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function register({ name, email, password, role }) {
  email = email.trim().toLowerCase()
  if (!name.trim()) throw new Error('Enter your name.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.')
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  const users = load()
  if (users[email]) throw new Error('An account with this email already exists. Log in instead.')
  const salt = crypto.getRandomValues(new Uint32Array(4)).join('-')
  users[email] = { name: name.trim(), email, role, salt, hash: await hash(password, salt), fails: 0, lockedUntil: 0 }
  save(users)
  return publicUser(users[email])
}

export async function login(email, password) {
  email = email.trim().toLowerCase()
  const users = load()
  const u = users[email]
  if (u && u.lockedUntil > Date.now()) {
    const min = Math.ceil((u.lockedUntil - Date.now()) / 60000)
    throw new Error(`Too many failed attempts. This account is locked for ${min} more minute${min > 1 ? 's' : ''}.`)
  }
  if (!u || (await hash(password, u.salt)) !== u.hash) {
    if (u) {
      u.fails += 1
      if (u.fails >= MAX_TRIES) { u.lockedUntil = Date.now() + LOCK_MS; u.fails = 0 }
      save(users)
      const left = u.lockedUntil > Date.now() ? 0 : MAX_TRIES - u.fails
      throw new Error(left ? `Wrong email or password. ${left} attempt${left > 1 ? 's' : ''} left before the account is locked.`
        : 'Too many failed attempts. This account is locked for 5 minutes.')
    }
    throw new Error('Wrong email or password.')
  }
  u.fails = 0
  save(users)
  return publicUser(u)
}

const publicUser = ({ name, email, role }) => ({ name, email, role })
