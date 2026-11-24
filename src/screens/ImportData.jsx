import { useRef, useState } from 'react'
import { detect, readAvailability, readClassrooms, readCourses, readPeriods, readRegistrations, readWorkbook } from '../lib/clean.js'
import { Icon } from './icons.jsx'

const CARDS = [
  { id: 'courses', title: 'Courses', icon: 'table', desc: 'courses.xlsx · course ID, name, credits' },
  { id: 'availability', title: 'Instructor availability', icon: 'person', desc: 'availability.xlsx · entered by hand from emails' },
  { id: 'registrations', title: 'Student registrations', icon: 'cap', desc: 'registrations.xlsx · students enrolled per course' },
  { id: 'classrooms', title: 'Classrooms', icon: 'room', desc: 'Room #, seating capacity, availability schedule' },
]
const READERS = { courses: readCourses, availability: readAvailability, registrations: readRegistrations, classrooms: readClassrooms }

export default function ImportData({ data, store, update, go }) {
  const [msg, setMsg] = useState('')
  const [showAll, setShowAll] = useState(false)

  async function load(file, wanted) {
    setMsg('')
    try {
      const wb = await readWorkbook(file)
      const found = detect(wb)
      const kinds = Object.keys(found).filter((k) => READERS[k])
      if (wanted && !kinds.includes(wanted)) throw new Error(`“${file.name}” does not look like a ${CARDS.find((c) => c.id === wanted).title.toLowerCase()} file.`)
      const inputs = {}, files = {}
      for (const k of kinds) {
        inputs[k] = READERS[k](wb.Sheets[found[k]])
        files[k] = { name: file.name, sheet: found[k], rows: inputs[k].length }
      }
      if (found.periods) inputs.periods = readPeriods(wb.Sheets[found.periods])
      update((s) => ({ inputs: { ...s.inputs, ...inputs }, files: { ...s.files, ...files }, rulesSeen: false }))
      if (kinds.length > 1) setMsg(`“${file.name}” has several sheets, so it filled ${kinds.length} cards at once: ${kinds.map((k) => CARDS.find((c) => c.id === k).title.toLowerCase()).join(', ')}${found.periods ? ' (plus the class periods)' : ''}.`)
    } catch (e) { setMsg(e.message) }
  }

  async function loadSample() {
    for (const n of ['Sample Enrollement Record.xlsx', 'Classrooms (sample).xlsx']) {
      const blob = await (await fetch(`${import.meta.env.BASE_URL}sample/${encodeURIComponent(n)}`)).blob()
      await load(new File([blob], n))
    }
    setMsg('Loaded the director’s sample workbook plus a sample classrooms file (room sizes are made up until we get the real list).')
  }

  const issuesFor = (k) => data.issues.filter((i) => i.file === k && i.severity !== 'Info')
  const loaded = CARDS.every((c) => store.files[c.id])
  const errors = data.issues.filter((i) => i.severity === 'Error').length
  const shown = data.issues.filter((i) => showAll || i.severity !== 'Info')

  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>Import data</h1>
          <p className="sub">Load the four Excel files. Each file is checked as soon as it is imported.</p>
        </div>
        <div className="spacer" />
        <button className="btn small" onClick={loadSample}>Load sample data</button>
        {Object.keys(store.files).length > 0 && <button className="btn small" onClick={() => update({ inputs: {}, files: {}, schedule: null })}>Clear all</button>}
      </div>
      {msg && <div className="note" style={{ marginBottom: 16 }}>{msg}</div>}
      <div className="grid2">
        {CARDS.map((c) => <FileCard key={c.id} card={c} file={store.files[c.id]} issues={issuesFor(c.id)} onFile={(f) => load(f, c.id)} />)}
      </div>

      <div className="card report">
        <div className="rhead">
          <h2>Validation report</h2>
          <span className="muted">
            {data.issues.length ? `${shown.length} issue${shown.length !== 1 ? 's' : ''} found` : 'Nothing loaded yet'}
            {data.issues.some((i) => i.severity === 'Info') && <> · <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'hide notes' : 'show notes too'}</button></>}
          </span>
        </div>
        {shown.length > 0 && (
          <div style={{ maxHeight: 330, overflowY: 'auto' }}>
            <table><tbody>
              {shown.map((i, n) => (
                <tr key={n}>
                  <td style={{ width: 110 }}><span className={`badge ${i.severity}`}>{i.severity}</span></td>
                  <td style={{ width: 210 }} className="muted">{CARDS.find((c) => c.id === i.file)?.title || i.file}</td>
                  <td style={{ width: 150 }}><b>{i.item}</b></td>
                  <td>{i.problem}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
      </div>

      <div className="footerbar">
        <span className="muted">
          {!loaded ? 'All four files must be loaded before generating.'
            : errors ? `${errors} error${errors > 1 ? 's' : ''}: the affected courses will be left unscheduled until the data is fixed.`
              : `${data.courses.filter((c) => c.enrolled).length} courses, ${data.students.length} students and ${data.classrooms.length} rooms ready.`}
        </span>
        <button className="btn primary" disabled={!loaded} onClick={() => go('rules')}>Continue to time slots and rules</button>
      </div>
    </div>
  )
}

function FileCard({ card, file, issues, onFile }) {
  const input = useRef()
  const [drag, setDrag] = useState(false)
  const errs = issues.filter((i) => i.severity === 'Error').length
  const warns = issues.length - errs
  const badge = !file ? <span className="badge none">Not loaded</span>
    : errs ? <span className="badge err">{errs} error{errs > 1 ? 's' : ''}</span>
      : warns ? <span className="badge warn">{warns} warning{warns > 1 ? 's' : ''}</span>
        : <span className="badge ok">Valid</span>
  return (
    <div className={`card filecard ${!file ? 'empty' : ''} ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]) }}>
      <div className="head"><span className="icon"><Icon name={card.icon} /></span><h2>{card.title}</h2><span className="spacer" />{badge}</div>
      <div className="desc">{file ? `${file.name} · sheet “${file.sheet}”` : card.desc}</div>
      <div className="foot">
        <span>{file ? `${file.rows} rows read` : 'Drop a file here or browse'}</span>
        <button className={`btn ${file ? '' : 'primary'}`} onClick={() => input.current.click()}>{file ? 'Replace file' : 'Choose file'}</button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = '' }} />
      </div>
    </div>
  )
}
