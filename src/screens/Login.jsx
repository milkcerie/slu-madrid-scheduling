import { useState } from 'react'
import { login, register } from '../lib/auth.js'

export default function Login({ onLogin }) {
  const [mode, setMode] = useState(null) // null | 'login' | 'register'
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', role: 'Director' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      if (mode === 'register') {
        if (f.password !== f.confirm) throw new Error('Passwords do not match.')
        onLogin(await register(f))
      } else onLogin(await login(f.email, f.password))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <h1>Login/Register</h1>
      <div className="muted">Welcome to the Saint Louis University scheduling application.</div>
      <div className="card login-box">
        {!mode && (
          <>
            <button className="choice" onClick={() => setMode('login')}><b>Log in</b><span>Returning user</span></button>
            <button className="choice" onClick={() => setMode('register')}><b>Register</b><span>First time user</span></button>
          </>
        )}
        {mode && (
          <form onSubmit={submit} style={{ maxWidth: 420, margin: '0 auto' }}>
            <div className="tabs2 seg" style={{ display: 'flex' }}>
              <button type="button" className={mode === 'login' ? 'on' : ''} style={{ flex: 1 }} onClick={() => { setMode('login'); setError('') }}>Log in</button>
              <button type="button" className={mode === 'register' ? 'on' : ''} style={{ flex: 1 }} onClick={() => { setMode('register'); setError('') }}>Register</button>
            </div>
            {error && <div className="error-box" role="alert">{error}</div>}
            {mode === 'register' && <label className="field">Full name<input value={f.name} onChange={set('name')} autoFocus /></label>}
            <label className="field">Email<input type="email" value={f.email} onChange={set('email')} autoFocus={mode === 'login'} /></label>
            <label className="field">Password<input type="password" value={f.password} onChange={set('password')} /></label>
            {mode === 'register' && (
              <>
                <label className="field">Confirm password<input type="password" value={f.confirm} onChange={set('confirm')} /></label>
                <label className="field">Role
                  <select value={f.role} onChange={set('role')}>
                    <option value="Director">Program Director (imports data, builds the schedule)</option>
                    <option value="Instructor">Instructor (views and exports the schedule)</option>
                  </select>
                </label>
              </>
            )}
            <button className="btn primary" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
              {mode === 'login' ? 'Log in' : 'Create account'}
            </button>
            <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
              {mode === 'login' ? 'Accounts lock for 5 minutes after 5 wrong passwords.' : 'At least 8 characters. Your password is stored only as a salted hash.'}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
