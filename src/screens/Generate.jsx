import { useState } from 'react'
import { evaluate, generate } from '../lib/scheduler.js'

export default function Generate({ data, store, update, go, evaluation }) {
  const [busy, setBusy] = useState(false)
  const locked = store.schedule ? Object.values(store.schedule.placements).filter((p) => p.locked).length : 0

  function run() {
    setBusy(true)
    setTimeout(() => { // let the spinner paint
      const schedule = generate(data, store.rules, store.schedule)
      update({ schedule, exported: false })
      setBusy(false)
    }, 350)
  }
  const ev = store.schedule ? evaluation || evaluate(data, store.schedule) : null

  return (
    <div>
      <div className="row"><h1>Generate schedule</h1><span className="placeholder-tag">Placeholder engine: the real one is in progress</span></div>
      <p className="sub">Places every course in a time slot and room, then reports anything it could not solve.</p>
      <div className="card panel" style={{ maxWidth: 760 }}>
        <div className="kv">
          <span className="muted">Courses to place</span><b>{data.courses.filter((c) => c.enrolled).length}</b>
          <span className="muted">Students</span><b>{data.students.length}</b>
          <span className="muted">Rooms</span><b>{data.classrooms.length}</b>
          <span className="muted">Time slots</span><b>{data.periods.length} periods × 4 days</b>
          {locked > 0 && <><span className="muted">Locked classes</span><b>{locked} (they will not move)</b></>}
        </div>
        <div className="row" style={{ marginTop: 22 }}>
          <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Generating…' : store.schedule ? 'Regenerate schedule' : 'Generate schedule'}</button>
          {store.schedule && <span className="muted">Regenerating replaces every class that is not locked.</span>}
        </div>
      </div>
      {ev && !busy && (
        <>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 20, maxWidth: 1000 }}>
            <Stat n={ev.scheduled} label="classes scheduled" />
            <Stat n={ev.hardConflicts} label="conflicts (room / instructor)" bad={ev.hardConflicts} />
            <Stat n={ev.studentClashes} label="student clashes" warn={ev.studentClashes} />
            <Stat n={ev.unscheduledCount} label="unscheduled" warn={ev.unscheduledCount} />
          </div>
          <div className="row" style={{ marginTop: 22 }}>
            <button className="btn primary" onClick={() => go('review')}>Review timetable</button>
            {ev.conflicts.length > 0 && <button className="btn" onClick={() => go('edit')}>Open conflict report</button>}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ n, label, bad, warn }) {
  return (
    <div className="card stat">
      <div className="n" style={{ color: bad ? 'var(--red)' : warn ? 'var(--amber)' : 'var(--green)' }}>{n}</div>
      <div className="muted">{label}</div>
    </div>
  )
}
