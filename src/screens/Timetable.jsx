import { useMemo, useState } from 'react'
import { DAYS, DAY_NAMES, fmt } from '../lib/clean.js'
import { Icon } from './icons.jsx'

const VIEWS = [['day', 'By day'], ['instructor', 'By instructor'], ['room', 'By room'], ['student', 'By student']]

export default function Timetable({ data, store, evaluation, openClass, go, user, isDirector }) {
  const { sections, placements } = store.schedule
  const instructors = useMemo(() => [...new Set(sections.map((s) => s.instructor).filter(Boolean))].sort(), [sections])
  const rooms = data.classrooms.map((r) => r.id)
  const students = useMemo(() => [...new Set(sections.flatMap((s) => s.students))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [sections])
  const mine = !isDirector && instructors.find((i) => i.toLowerCase() === user.name.toLowerCase())
  const [view, setView] = useState(mine ? 'instructor' : 'day')
  const [who, setWho] = useState({ instructor: mine || instructors[0], room: rooms[0], student: students[0] })

  const visible = sections.filter((s) => {
    if (!placements[s.id]) return false
    if (view === 'instructor') return s.instructor === who.instructor
    if (view === 'room') return placements[s.id].meetings.some((m) => m.room === who.room)
    if (view === 'student') return s.students.includes(who.student)
    return true
  })
  const unsched = sections.filter((s) => !placements[s.id])
  const ev = evaluation

  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>Timetable</h1>
          <p className="sub">{isDirector ? 'Click a class to move it to another time slot or room.' : 'Read-only view of the current schedule.'}</p>
        </div>
        <div className="spacer" />
        <div className="chips">
          <span className="badge ok">{ev.scheduled} scheduled</span>
          <span className={`badge ${ev.hardConflicts ? 'err' : 'none'}`}>{ev.hardConflicts} conflict{ev.hardConflicts !== 1 ? 's' : ''}</span>
          <span className={`badge ${ev.studentClashes ? 'Student' : 'none'}`}>{ev.studentClashes} student clash{ev.studentClashes !== 1 ? 'es' : ''}</span>
          <span className={`badge ${ev.unscheduledCount ? 'warn' : 'none'}`}>{ev.unscheduledCount} unscheduled</span>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="seg">{VIEWS.map(([id, l]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{l}</button>)}</div>
        {view !== 'day' && (
          <select className="inline" value={who[view]} onChange={(e) => setWho({ ...who, [view]: e.target.value })}>
            {(view === 'instructor' ? instructors : view === 'room' ? rooms : students).map((x) => <option key={x}>{x}</option>)}
          </select>
        )}
        <div className="spacer" />
        <div className="legend"><span><i />Scheduled</span><span><i className="split" />Split group (M1 / M2)</span><span><i className="clash" />Student clash</span><span><i className="bad" />Conflict</span><span><Icon name="lock" size={13} /> Locked</span></div>
      </div>

      <table className="tt">
        <thead><tr><th>Time slot</th>{DAYS.map((d) => <th key={d}>{DAY_NAMES[d]}</th>)}</tr></thead>
        <tbody>
          {data.periods.map((p) => (
            <tr key={p.id}>
              <td className="time">{fmt(p.start)} – {fmt(p.end)}</td>
              {DAYS.map((d) => (
                <td key={d}>
                  {visible.map((s) => {
                    const m = placements[s.id].meetings.find((x) => x.day === d && x.periods.includes(p.id))
                    if (!m) return null
                    const cont = m.periods[0] !== p.id
                    const bad = ev.badIds.has(s.id), clash = !bad && ev.clashIds.has(s.id)
                    const second = view === 'instructor' ? (m.offsite ? 'Off-site' : m.room) : `${s.instructor || '—'} · ${m.offsite ? 'Museum' : m.room}`
                    return (
                      <button key={s.id} className={`cls ${s.group ? 'split' : ''} ${bad ? 'bad' : ''} ${clash ? 'clash' : ''} ${cont ? 'cont' : ''}`} disabled={!isDirector}
                        title={`${s.code} ${s.title}\n${s.instructor} · ${s.size} students${m.custom ? `\n${fmt(m.custom.start)}–${fmt(m.custom.end)}` : ''}`}
                        onClick={() => isDirector && openClass(s.id)}>
                        <b>{s.code}{s.group && ` · ${s.group}`}</b>{placements[s.id].locked && <> <Icon name="lock" size={11} /></>}
                        {cont ? <div>(continued)</div> : <div>{second}{m.custom ? ` · ${fmt(m.custom.start)}` : ''}</div>}
                      </button>
                    )
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {ev.conflicts.length > 0 ? (
        <div className="banner">
          <Icon name="warn" />
          <span>
            {unsched.length > 0 && <>{unsched.length} course{unsched.length > 1 ? 's' : ''} could not be scheduled: {unsched.map((s) => s.id).join(', ')}. </>}
            {ev.hardConflicts + ev.studentClashes > 0 && <>{ev.hardConflicts + ev.studentClashes} clash{ev.hardConflicts + ev.studentClashes > 1 ? 'es' : ''} to review. </>}
            See which constraints block them.
          </span>
          <span className="spacer" />
          {isDirector && <button className="link" onClick={() => go('edit')}>Open conflict report</button>}
        </div>
      ) : <div className="banner ok">Every course is scheduled with no conflicts.</div>}
    </div>
  )
}
