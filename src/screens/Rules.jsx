import { useEffect } from 'react'
import { DAYS, DAY_NAMES, fmt } from '../lib/clean.js'

export default function Rules({ data, store, update, go }) {
  const r = store.rules
  const set = (k, v) => update((s) => ({ rules: { ...s.rules, [k]: v } }))
  useEffect(() => { if (!store.rulesSeen) update({ rulesSeen: true }) }, [store.rulesSeen, update])
  const maxRoom = Math.max(0, ...data.classrooms.map((x) => x.capacity))
  const willSplit = data.courses.filter((c) => c.enrolled > Math.min(r.maxGroupSize || Infinity, maxRoom))

  return (
    <div>
      <h1>Time slots and rules</h1>
      <p className="sub">These are the slots and rules the scheduler uses. The time slots come from the “Class Periods” sheet.</p>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card panel">
          <h2 style={{ marginBottom: 14 }}>Standard class periods</h2>
          <table className="plain" style={{ width: '100%' }}>
            <thead><tr><th>Period</th><th>Time</th><th>Length</th></tr></thead>
            <tbody>{data.periods.map((p) => <tr key={p.id}><td>{p.id}</td><td>{fmt(p.start)} – {fmt(p.end)}</td><td>{p.end - p.start} min</td></tr>)}</tbody>
          </table>
          <p className="muted" style={{ fontSize: 14, marginBottom: 0 }}>
            Teaching days: {DAYS.map((d) => DAY_NAMES[d]).join(', ')}. Classes meet twice a week on the same period
            (Mon/Wed or Tue/Thu) unless the instructor’s availability says otherwise.
          </p>
        </div>
        <div className="card panel">
          <h2 style={{ marginBottom: 14 }}>Rules</h2>
          <label className="field">Maximum students per group
            <input type="number" min="5" max="60" value={r.maxGroupSize} onChange={(e) => set('maxGroupSize', Number(e.target.value) || 0)} />
          </label>
          <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
            Bigger courses are split into groups M1, M2… Largest room seats {maxRoom || '?'}.{' '}
            {willSplit.length ? `Will split: ${willSplit.map((c) => `${c.code} (${c.enrolled})`).join(', ')}.` : 'No course needs splitting.'}
          </p>
          <Check on={r.longUsesTwoPeriods} set={(v) => set('longUsesTwoPeriods', v)}
            label="5-credit Spanish courses use two periods back to back" hint="The sample data says they meet 30 minutes longer than other classes (open question for the director)." />
          <Check on={r.avoidLate} set={(v) => set('avoidLate', v)} label="Avoid the last period (18:30) when possible" />
          <h2 style={{ margin: '18px 0 8px' }}>Always enforced</h2>
          <ul className="muted" style={{ fontSize: 14, paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
            <li>Instructor is only scheduled inside their availability</li>
            <li>An instructor never teaches two classes at once</li>
            <li>A room is never double-booked, and it must seat the whole group</li>
            <li>Off-site meetings (Prado museum) don’t need a room</li>
            <li>Students’ classes should not overlap (minimised, then reported)</li>
          </ul>
        </div>
      </div>
      <div className="footerbar">
        <button className="btn" onClick={() => go('import')}>Back to import</button>
        <button className="btn primary" onClick={() => go('generate')}>Continue to generate</button>
      </div>
    </div>
  )
}

function Check({ on, set, label, hint }) {
  return (
    <label style={{ display: 'flex', gap: 10, marginBottom: 12, cursor: 'pointer', fontSize: 14 }}>
      <input type="checkbox" checked={!!on} onChange={(e) => set(e.target.checked)} style={{ marginTop: 3 }} />
      <span>{label}{hint && <div className="muted" style={{ fontSize: 13 }}>{hint}</div>}</span>
    </label>
  )
}
