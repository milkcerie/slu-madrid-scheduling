import { useEffect, useMemo, useState } from 'react'
import shield from './assets/shield.svg'
import { buildDataset } from './lib/clean.js'
import { DEFAULT_RULES, evaluate } from './lib/scheduler.js'
import Login from './screens/Login.jsx'
import ImportData from './screens/ImportData.jsx'
import Rules from './screens/Rules.jsx'
import Generate from './screens/Generate.jsx'
import Timetable from './screens/Timetable.jsx'
import EditClass from './screens/EditClass.jsx'
import ExportScreen from './screens/ExportScreen.jsx'

const STORE = 'slu-sched-store'
const EMPTY = { inputs: {}, files: {}, rules: DEFAULT_RULES, schedule: null, savedAt: null, exported: false, rulesSeen: false }

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem('slu-sched-session') || 'null'))
  const [store, setStore] = useState(() => ({ ...EMPTY, ...JSON.parse(localStorage.getItem(STORE) || '{}') }))
  const [step, setStep] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(store)) }, [store])
  useEffect(() => { sessionStorage.setItem('slu-sched-session', JSON.stringify(user)) }, [user])
  const update = (patch) => setStore((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))

  const data = useMemo(() => buildDataset(store.inputs), [store.inputs])
  const evaluation = useMemo(() => (store.schedule ? evaluate(data, store.schedule) : null), [data, store.schedule])
  const isDirector = user?.role === 'Director'

  const loaded = ['courses', 'availability', 'registrations', 'classrooms'].every((k) => store.files[k])
  const steps = isDirector ? [
    { id: 'import', label: 'Import data', done: loaded },
    { id: 'rules', label: 'Time slots and rules', done: loaded && store.rulesSeen, locked: !loaded },
    { id: 'generate', label: 'Generate schedule', done: !!store.schedule, locked: !loaded },
    { id: 'review', label: 'Review and edit', done: !!store.schedule && evaluation?.hardConflicts === 0, locked: !store.schedule },
    { id: 'export', label: 'Export to Excel', done: store.exported, locked: !store.schedule },
  ] : [
    { id: 'review', label: 'Timetable', locked: !store.schedule },
    { id: 'export', label: 'Export to Excel', locked: !store.schedule },
  ]
  const current = step || (isDirector ? (store.schedule ? 'review' : 'import') : 'review')

  if (!user) return (<><TopBar status="Spring term" /><Login onLogin={(u) => { setUser(u); setStep(null) }} /></>)

  const go = (id) => { setStep(id); if (id !== 'edit') setSelected(null) }
  const openClass = (id) => { setSelected(id); setStep('edit') }
  const status = store.schedule ? `Spring term · ${store.schedule.edited ? 'edited' : 'generated'} ${ago(store.schedule.editedAt || store.schedule.generatedAt)} · saved in this browser` : 'Spring term · no schedule yet'

  const props = { data, store, update, evaluation, go, openClass, user, isDirector }
  return (
    <>
      <TopBar status={status} user={user} onLogout={() => { setUser(null); setStep(null) }} />
      <div className="layout">
        <aside className="sidebar">
          <div className="label">{isDirector ? 'WORKFLOW' : 'INSTRUCTOR VIEW'}</div>
          {steps.map((s, i) => {
            const active = current === s.id || (current === 'edit' && s.id === 'review')
            return (
              <button key={s.id} className={`step ${active ? 'active' : ''} ${s.done && !active ? 'done' : ''}`} disabled={s.locked} onClick={() => go(s.id)}>
                <span className="dot">{s.done && !active ? '✓' : i + 1}</span>{s.label}
              </button>
            )
          })}
          <div className="logo"><img src={shield} alt="" /><div className="w1">SAINT LOUIS</div><div className="w2">UNIVERSITY</div></div>
        </aside>
        <main className="main">
          {current === 'import' && <ImportData {...props} />}
          {current === 'rules' && <Rules {...props} />}
          {current === 'generate' && <Generate {...props} />}
          {current === 'review' && (store.schedule ? <Timetable {...props} /> : <Empty isDirector={isDirector} go={go} />)}
          {current === 'edit' && <EditClass {...props} selected={selected} setSelected={setSelected} />}
          {current === 'export' && <ExportScreen {...props} />}
        </main>
      </div>
    </>
  )
}

function TopBar({ status, user, onLogout }) {
  return (
    <div className="topbar">
      <span>Saint Louis University Course Scheduling Application</span>
      <span className="right">
        {status}
        {user && <><span className="user">{user.name} · {user.role}</span><button onClick={onLogout}>Log out</button></>}
      </span>
    </div>
  )
}

function Empty({ isDirector, go }) {
  return (
    <div>
      <h1>Timetable</h1>
      <p className="sub">No schedule has been generated yet.</p>
      {isDirector ? <button className="btn primary" onClick={() => go('import')}>Start by importing data</button>
        : <div className="note">The program director has not published a schedule yet. Check back later.</div>}
    </div>
  )
}

export function ago(t) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t).toLocaleDateString()
}
