import { useMemo, useState } from 'react'
import { exportSchedule } from '../lib/exportXlsx.js'

export default function ExportScreen({ data, store, update, evaluation, isDirector, user }) {
  const { sections, placements } = store.schedule
  const instructors = useMemo(() => [...new Set(sections.map((s) => s.instructor).filter(Boolean))].sort(), [sections])
  const students = useMemo(() => [...new Set(sections.flatMap((s) => s.students))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [sections])
  const mine = instructors.find((i) => i.toLowerCase() === user.name.toLowerCase())
  const [kind, setKind] = useState('instructor')
  const [who, setWho] = useState(mine || instructors[0])
  const list = kind === 'instructor' ? instructors : kind === 'room' ? data.classrooms.map((r) => r.id) : students

  function full() { exportSchedule(data, store.schedule, evaluation); update({ exported: true }) }
  function one() {
    const filter = kind === 'instructor' ? (s) => s.instructor === who
      : kind === 'room' ? (s) => placements[s.id]?.meetings.some((m) => m.room === who) : (s) => s.students.includes(who)
    exportSchedule(data, store.schedule, evaluation, { only: { name: who, filter } })
  }
  const issues = evaluation.hardConflicts + evaluation.unscheduledCount + evaluation.studentClashes
  const n = (k, w, pl = w + 's') => `${k} ${k !== 1 ? pl : w}`

  return (
    <div>
      <h1>Export to Excel</h1>
      <p className="sub">Download the schedule as an .xlsx file to share with instructors and students.</p>
      {isDirector && issues > 0 && (
        <div className="banner" style={{ marginTop: 0, marginBottom: 18 }}>
          {n(evaluation.hardConflicts, 'conflict')}, {n(evaluation.studentClashes, 'student clash', 'student clashes')} and {n(evaluation.unscheduledCount, 'unscheduled course')} are still open.
          They will be listed on the “Conflicts” sheet.
        </div>
      )}
      <div className="grid2" style={{ alignItems: 'start' }}>
        {isDirector && (
          <div className="card panel">
            <h2>Full schedule</h2>
            <p className="muted" style={{ fontSize: 14 }}>One workbook with four sheets:</p>
            <ul style={{ fontSize: 14, lineHeight: 1.8, marginTop: 0 }}>
              <li><b>Schedule</b>: every class with days, time, room and size</li>
              <li><b>Weekly grid</b>: Monday to Thursday by period</li>
              <li><b>Student timetables</b>: one row per student per class</li>
              <li><b>Conflicts</b>: anything still unresolved</li>
            </ul>
            <button className="btn dark" onClick={full}>Export to Excel (.xlsx)</button>
            {store.exported && <span style={{ color: 'var(--green)', marginLeft: 12, fontSize: 14 }}>✓ Downloaded</span>}
          </div>
        )}
        <div className="card panel">
          <h2>One timetable</h2>
          <p className="muted" style={{ fontSize: 14 }}>Just the classes for one instructor, room or student.</p>
          <div className="row" style={{ marginBottom: 16 }}>
            <select className="inline" value={kind} onChange={(e) => { setKind(e.target.value); setWho(e.target.value === 'instructor' ? instructors[0] : e.target.value === 'room' ? data.classrooms[0]?.id : students[0]) }}>
              <option value="instructor">Instructor</option><option value="room">Room</option><option value="student">Student</option>
            </select>
            <select className="inline" value={who} onChange={(e) => setWho(e.target.value)} style={{ flex: 1 }}>
              {list.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <button className="btn primary" onClick={one}>Export this timetable</button>
        </div>
      </div>
    </div>
  )
}
