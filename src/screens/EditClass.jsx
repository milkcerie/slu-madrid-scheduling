import { useMemo, useState } from 'react'
import { checkPlacement, fmtWhen, occupancy, rankOptions, sameTime, timeCandidates } from '../lib/scheduler.js'

export default function EditClass({ data, store, update, evaluation, go, selected, setSelected }) {
  const sch = store.schedule
  const { sections, placements } = sch
  const sel = sections.find((s) => s.id === selected) || sections.find((s) => s.id === evaluation.conflicts[0]?.sections[0]) || sections[0]
  const current = placements[sel.id]
  const [choice, setChoice] = useState(0)
  const [manual, setManual] = useState({ time: '', room: '' })
  const [done, setDone] = useState('')

  const course = data.courses.find((c) => c.code === sel.code)
  const allTimes = useMemo(() => timeCandidates(course, data.periods, store.rules), [course, data.periods, store.rules])

  // option list: current assignment, then the engine's best alternatives
  const options = useMemo(() => {
    const ranked = rankOptions(sel, data, sections, placements, store.rules)
    const list = current ? [{ cand: current, tag: 'Current assignment' }] : []
    for (const r of ranked) {
      if (list.length >= 4) break
      if (current && sameTime(r.cand, current) && r.cand.meetings[0].room === current.meetings[0].room) continue
      const tag = current && sameTime(r.cand, current) ? 'Alternative room' : r.chk.studentsFree ? 'Alternative slot' : `Alternative slot · ${r.chk.clashStudents.length} student clash`
      list.push({ cand: r.cand, tag })
    }
    return list
  }, [sel, data, sections, placements, store.rules, current])

  const manualCand = manual.time !== '' ? {
    ...allTimes[+manual.time],
    meetings: allTimes[+manual.time].meetings.map((m) => ({ ...m, room: m.offsite ? null : manual.room || current?.meetings[0]?.room || data.classrooms[0]?.id })),
  } : null
  const chosen = choice === 'manual' ? manualCand : options[choice]?.cand
  const occ = useMemo(() => occupancy(sections, placements), [sections, placements])
  const chk = chosen ? checkPlacement(sel, chosen, occ, data) : null
  const isCurrent = chosen && current && chosen === current

  function pick(id) { setSelected(id); setChoice(0); setManual({ time: '', room: '' }); setDone('') }
  function apply() {
    const placementsNew = { ...placements, [sel.id]: { meetings: chosen.meetings, locked: current?.locked || false } }
    const unscheduled = { ...sch.unscheduled }; delete unscheduled[sel.id]
    update({ schedule: { ...sch, placements: placementsNew, unscheduled, edited: true, editedAt: Date.now() }, exported: false })
    setChoice(0); setManual({ time: '', room: '' }); setDone(`${sel.id} moved to ${fmtWhen(chosen, data.periods)}.`)
  }
  function toggleLock() {
    update({ schedule: { ...sch, placements: { ...placements, [sel.id]: { ...current, locked: !current.locked } }, edited: true, editedAt: Date.now() } })
  }

  const failed = chk ? [!chk.instructorAvailable, !chk.instructorFree, !chk.roomFree, !chk.roomFits, !chk.hasRoom].filter(Boolean).length : 0
  const name = (id) => sections.find((s) => s.id === id)
  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>Edit class &amp; resolve conflicts</h1>
          <p className="sub">Pick a new slot and room. Every constraint is re-checked immediately.</p>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => go('review')}>Back to timetable</button>
      </div>
      <div className="edit">
        <div className="card panel">
          <div className="row" style={{ fontSize: 12, fontWeight: 600, color: '#3a4252', letterSpacing: '.04em' }}>
            SELECTED CLASS <span className="spacer" />
            <select className="inline" value={sel.id} onChange={(e) => pick(e.target.value)} style={{ fontSize: 13, fontWeight: 400 }}>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.id}{placements[s.id] ? '' : ' (unscheduled)'}</option>)}
            </select>
          </div>
          <h2 style={{ fontSize: 21, marginTop: 6 }}>{sel.code}{sel.group && ` · Group ${sel.group}`} <span className="muted" style={{ fontWeight: 400, fontSize: 16 }}>{sel.title}</span></h2>
          <div className="muted" style={{ marginBottom: 16 }}>{sel.instructor || 'No instructor'} · {sel.size} students{current?.locked ? ' · locked' : ''}</div>

          {!current && <div className="note" style={{ marginBottom: 10 }}>Not scheduled: {sch.unscheduled[sel.id] || 'no valid slot found.'}</div>}
          {options.map((o, i) => (
            <button key={i} className={`opt ${choice === i ? 'on' : ''}`} onClick={() => setChoice(i)}>
              <span className="when">{fmtWhen(o.cand, data.periods)}</span>
              <span>{[...new Set(o.cand.meetings.map((m) => (m.offsite ? 'Museum (off-site)' : m.room)))].join(' + ')}</span>
              <span className="tag">{o.tag}</span>
            </button>
          ))}
          <div className={`opt ${choice === 'manual' ? 'on' : ''}`} onClick={() => setChoice('manual')} style={{ cursor: 'default' }}>
            <span style={{ fontWeight: 600, width: 120 }}>Pick manually</span>
            <select className="inline" value={manual.time} onChange={(e) => { setManual({ ...manual, time: e.target.value }); setChoice('manual') }}>
              <option value="">Time…</option>
              {allTimes.map((t, i) => <option key={i} value={i}>{fmtWhen(t, data.periods)}</option>)}
            </select>
            <select className="inline" value={manual.room} onChange={(e) => { setManual({ ...manual, room: e.target.value }); setChoice('manual') }}>
              <option value="">Room…</option>
              {data.classrooms.map((r) => <option key={r.id} value={r.id}>{r.id} ({r.capacity})</option>)}
            </select>
          </div>
          {allTimes.length === 0 && <div className="note">No time slots match this instructor’s availability.</div>}

          {chk && (
            <ul className="checks">
              <Check ok={chk.instructorAvailable} label="Inside the instructor’s availability" why="Outside availability" />
              <Check ok={chk.studentsFree} soft label="Registered students are free" why={`${chk.clashStudents.length} student${chk.clashStudents.length > 1 ? 's' : ''} also in ${chk.clashWith.join(', ')}`} />
              <Check ok={chk.roomFree && chk.hasRoom} label="Room is free at this time" why={chk.hasRoom ? `Used by ${chk.roomBusy.join(', ')}` : 'No room chosen'} />
              <Check ok={chk.roomFits} label="Room can seat the whole group" why={chk.tooSmall.join(', ')} />
              <Check ok={chk.instructorFree} label="Instructor has no other class" why={`Teaching ${chk.instBusy.join(', ')}`} />
              <Check ok label="Inside campus hours" />
            </ul>
          )}
          {chk && (
            <div className={`applybar ${failed ? '' : chk.studentsFree ? 'ok' : 'soft'}`}>
              <span>{isCurrent ? (failed ? `${failed} constraint${failed > 1 ? 's' : ''} failed for the current slot. Choose another option.` : 'This is the current assignment.')
                : failed ? `${failed} constraint${failed > 1 ? 's' : ''} failed. Choose another option.`
                  : chk.studentsFree ? 'All constraints pass.' : 'Allowed, but some students will have a clash.'}</span>
              <button className="btn" disabled={!!failed || isCurrent} onClick={apply}>Apply change</button>
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            {current && <label style={{ fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={!!current.locked} onChange={toggleLock} /> Lock this class (regenerating won’t move it)</label>}
            <span className="spacer" />{done && <span style={{ color: 'var(--green)', fontSize: 14 }}>✓ {done}</span>}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
            <h2>Conflict report</h2>
            <div className="muted" style={{ fontSize: 14 }}>What blocks each course, in plain language</div>
          </div>
          <div className="conflist">
            {evaluation.conflicts.length === 0 && <div className="conf">No conflicts. 🎉</div>}
            {evaluation.conflicts.map((c, i) => (
              <div key={i} className={`conf ${c.sections.includes(sel.id) ? 'on' : ''}`} onClick={() => pick(c.sections[0])}>
                <div className="row"><span className={`badge ${c.type.split(' ')[0]}`}>{c.type}</span><b>{c.sections.map((id) => name(id)?.id).join(' and ')}</b></div>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
          <div className="row" style={{ padding: 16, marginTop: 'auto', borderTop: '1px solid var(--line)' }}>
            <button className="btn" onClick={() => go('generate')}>Regenerate schedule</button>
            <span className="spacer" />
            <button className="btn dark" onClick={() => go('export')}>Export to Excel (.xlsx)</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Check({ ok, soft, label, why }) {
  return (
    <li>
      <span className={`ck ${ok ? '' : soft ? 'w' : 'x'}`}>{ok ? '✓' : soft ? '!' : '✕'}</span>
      {label}
      {!ok && <span className={`why ${soft ? 'soft' : ''}`}>{why}</span>}
    </li>
  )
}
