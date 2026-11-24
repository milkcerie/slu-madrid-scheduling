// Reads the director's Excel files and turns them into clean, consistent data.
// Same rules as the team's data-cleaning note (Data_Cleaning_Rules.md).
import * as XLSX from 'xlsx'

export const DAYS = ['M', 'T', 'W', 'Th']
export const DAY_NAMES = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', Th: 'Thursday' }

const ROMAN = /\((i{1,3}|iv|v|vi{0,3})\)/gi
const CODE = /^\s*([A-Z0-9]+\s+\d{3,5}[A-Z]?)\s*[:-]?\s*(.*)$/i
const ORD = { '1ST': 1, FIRST: 1, '2ND': 2, SECOND: 2, '3RD': 3, THIRD: 3, '4TH': 4, FOURTH: 4, '5TH': 5, FIFTH: 5 }

export const toMin = (t) => { const [h, m] = String(t).trim().split(':'); return +h * 60 + +m }
export const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const txt = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim())
const fixRoman = (s) => s.replace(ROMAN, (_, r) => `(${r.toUpperCase()})`)

export function splitCourse(raw) {
  const s = txt(raw)
  const m = s.match(CODE)
  if (!m) return { code: null, title: s, spanish: false }
  let title = m[2].replace(/^[:\s]+|[:\s]+$/g, '')
  const spanish = /\(esp\)/i.test(title)
  title = fixRoman(title.replace(/\s*\(esp\)/i, '').trim())
  return { code: m[1].toUpperCase().replace(/\s+/g, ' '), title, spanish }
}

function titleCase(t) {
  const small = new Set(['and', 'of', 'the', 'in', 'at', 'to', 'for', '&', 'through', 'on'])
  return fixRoman(t.toLowerCase().split(' ').map((w, i) => (i && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' '))
}

export const DEFAULT_PERIODS = [
  ['09:30', '10:50'], ['11:00', '12:20'], ['12:30', '13:50'], ['14:00', '15:20'],
  ['15:30', '16:50'], ['17:00', '18:20'], ['18:30', '19:50'],
].map(([s, e], i) => ({ id: `P${i + 1}`, start: toMin(s), end: toMin(e) }))

// ---------- availability text -> slots ----------
function parseDays(text) {
  const up = text.toUpperCase()
  const days = new Set()
  for (const w of up.match(/\b(MONDAYS?|TUESDAYS?|WEDNESDAYS?|THURSDAYS?)\b/g) || [])
    days.add({ M: 'M', T: w.startsWith('TH') ? 'Th' : 'T', W: 'W' }[w[0]])
  if (!days.size) {
    const m = up.match(/\b([MTW]H?(?:\/[MTW]H?)+)\b/)
    if (m) for (const p of m[1].split('/')) days.add(p === 'TH' ? 'Th' : p)
  }
  return DAYS.filter((d) => days.has(d))
}

export function parseAvailability(text, periods) {
  const up = text.toUpperCase()
  const notes = []
  let days = parseDays(text)
  if (!days.length) { days = [...DAYS]; notes.push('no day given, so any day') }
  const all = periods.map((p) => p.id)
  const ords = (up.match(/\b(1ST|FIRST|2ND|SECOND|3RD|THIRD|4TH|FOURTH|5TH|FIFTH)\b/g) || []).map((w) => ORD[w])
  const rng = up.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
  const after = up.match(/AFTER\s+(\d{1,2}:\d{2})/)
  let chosen, preferred = [], custom = null, warn = null
  if (up.includes('PREFER')) { chosen = all; preferred = ords.map((n) => `P${n}`) }
  else if (ords.length) chosen = ords.map((n) => `P${n}`)
  else if (rng) {
    const a = toMin(rng[1]), b = toMin(rng[2])
    chosen = periods.filter((p) => p.start >= a && p.end <= b).map((p) => p.id)
    const exact = periods.some((p) => p.start === a) && periods.some((p) => p.end === b)
    if (!chosen.length) { custom = { start: a, end: b }; warn = `“${text}” is outside every standard period. Kept as a fixed ${fmt(a)}–${fmt(b)} meeting.` }
    else if (!exact) warn = `“${text}” is not on the period grid. Used ${chosen.join(', ')}.`
  } else if (after) chosen = periods.filter((p) => p.start >= toMin(after[1])).map((p) => p.id)
  else if (up.includes('ANY')) chosen = all
  else { chosen = all; warn = `Could not read “${text}”. Treated as any time.` }
  const double = up.includes('IN A ROW')
  const offsite = up.includes('MUSEUM')
  if (offsite) notes.push('off-site (museum), no classroom needed')
  if (double) notes.push('two periods back to back')
  return { text, days, periods: chosen || [], preferred, custom, double, offsite, notes, warn }
}

// ---------- workbook readers ----------
const rows = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })
const findSheet = (wb, re) => wb.SheetNames.find((n) => re.test(n))

export async function readWorkbook(file) {
  const buf = await file.arrayBuffer()
  return XLSX.read(buf, { type: 'array' })
}

// Detects what kind of data a workbook holds. One workbook can hold several (like the sample file).
export function detect(wb) {
  const found = {}
  const enr = findSheet(wb, /enrol|registr|student/i)
  const av = findSheet(wb, /availab|teacher|instructor/i)
  const per = findSheet(wb, /period|slot/i)
  const room = findSheet(wb, /room|classroom/i)
  if (enr) { found.registrations = enr; found.courses = enr }
  if (av) found.availability = av
  if (per) found.periods = per
  if (room) found.classrooms = room
  if (!Object.keys(found).length) {
    // single unnamed sheet: guess from header row
    const first = wb.SheetNames[0]
    const head = (rows(wb.Sheets[first])[0] || []).join(' ').toLowerCase()
    if (/room/.test(head)) found.classrooms = first
    else if (/availab/.test(head)) found.availability = first
    else if (/course 1|student/.test(head)) found.registrations = found.courses = first
    else if (/credit|course/.test(head)) found.courses = first
  }
  return found
}

export function readPeriods(ws) {
  const out = []
  for (const r of rows(ws)) {
    const v = txt(r[0])
    const m = v.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)
    if (m) out.push({ id: `P${out.length + 1}`, start: toMin(m[1]), end: toMin(m[2]) })
  }
  return out.length ? out : null
}

export function readCourses(ws) {
  const r = rows(ws)
  const head = r.findIndex((x) => x.some((c) => /course list/i.test(txt(c))))
  const col = head >= 0 ? r[head].findIndex((c) => /course list/i.test(txt(c))) : 0
  const out = []
  for (const row of r.slice(head + 1)) {
    const raw = txt(row[col])
    if (!raw) continue
    out.push({ raw, credits: row[col + 1] == null ? null : Number(row[col + 1]) })
  }
  return out
}

export function readRegistrations(ws) {
  const r = rows(ws)
  const head = r.findIndex((x) => x.some((c) => /course 1/i.test(txt(c))))
  const out = []
  for (const row of r.slice(head + 1)) {
    const name = txt(row[0])
    if (!name) continue
    out.push({ name, courses: row.slice(1, 6).map(txt) })
  }
  return out
}

export function readAvailability(ws) {
  const out = []
  for (const row of rows(ws)) {
    const code = txt(row[0])
    if (!code || !/\d/.test(code) || /^notes/i.test(code)) continue
    out.push({ code: code.toUpperCase(), title: titleCase(txt(row[1]).replace(/^[:\s]+/, '')), instructor: txt(row[2]),
      options: [txt(row[3]), txt(row[4])].filter(Boolean) })
  }
  return out
}

export function readClassrooms(ws) {
  const r = rows(ws)
  const head = r.findIndex((x) => x.some((c) => /room/i.test(txt(c))))
  const h = r[head].map((c) => txt(c).toLowerCase())
  const ci = (re) => h.findIndex((c) => re.test(c))
  const iRoom = ci(/room/), iCap = ci(/cap|seat/), iType = ci(/type/), iNotes = ci(/avail|note/)
  return r.slice(head + 1).filter((x) => txt(x[iRoom])).map((x) => ({
    id: txt(x[iRoom]), capacity: Number(x[iCap]) || 0, type: iType >= 0 ? txt(x[iType]) : 'Classroom', notes: iNotes >= 0 ? txt(x[iNotes]) : '',
  }))
}

// ---------- build the clean dataset + validation report ----------
export function buildDataset({ courses = [], registrations = [], availability = [], classrooms = [], periods }) {
  periods = periods || DEFAULT_PERIODS
  const issues = []
  const add = (severity, file, item, problem) => issues.push({ severity, file, item, problem })
  const cat = new Map()

  for (const c of courses) {
    let { code, title, spanish } = splitCourse(c.raw)
    if (!code) { code = 'NO-CODE ' + title; add('Warning', 'courses', title, 'Course has no course code, so it gets a placeholder code.') }
    cat.set(code, { code, title, credits: c.credits, spanish, instructor: '', options: [], enrolled: 0, students: [] })
  }
  for (const a of availability) {
    if (!cat.has(a.code)) {
      if (courses.length) add('Warning', 'availability', a.code, 'Listed in instructor availability but not in the course list.')
      cat.set(a.code, { code: a.code, title: a.title, credits: null, spanish: false, instructor: '', options: [], enrolled: 0, students: [] })
    }
    const c = cat.get(a.code)
    c.instructor = a.instructor
    c.options = a.options.map((t) => parseAvailability(t, periods))
    for (const o of c.options) if (o.warn) add('Warning', 'availability', a.code, o.warn)
  }

  const students = []
  for (const s of registrations) {
    const codes = []
    s.courses.forEach((raw, i) => {
      if (!raw) return
      const { code, title, spanish } = splitCourse(raw)
      if (!cat.has(code)) {
        cat.set(code, { code, title, credits: null, spanish, instructor: '', options: [], enrolled: 0, students: [] })
        add('Error', 'registrations', code, `${s.name} is registered for “${raw}”, which is not in the course list.`)
      }
      if (codes.includes(code)) { add('Warning', 'registrations', s.name, `Registered twice for ${code}. Duplicate removed.`); return }
      codes.push(code)
    })
    if (s.courses.some((c, i) => !c && s.courses.slice(i + 1).some(Boolean)))
      add('Info', 'registrations', s.name, 'Blank course cell between filled ones. Courses moved together.')
    if (!codes.length) add('Warning', 'registrations', s.name, 'Student has no courses.')
    if (codes.length >= 5) add('Info', 'registrations', s.name, `Takes ${codes.length} courses. Check the credit cap.`)
    for (const c of codes) { cat.get(c).enrolled++; cat.get(c).students.push(s.name) }
    students.push({ name: s.name, courses: codes })
  }

  for (const c of cat.values()) {
    if (c.credits === 5) c.long = true
    if (!c.enrolled) { add('Info', 'courses', c.code, 'No students registered. It will not be scheduled.'); continue }
    if (!c.instructor) add('Error', 'availability', c.code, `${c.enrolled} student(s) registered but no instructor is assigned.`)
    else if (!c.options.length) add('Warning', 'availability', c.code, `${c.instructor} has no available time slots entered. Treated as any time.`)
    if (c.long) add('Info', 'courses', c.code, '5-credit Spanish course meets 30 min longer, so it uses two periods back to back.')
    const opts = c.options
    if (opts.length === 2 && opts.every((o) => o.days.length === 1) && opts[0].days[0] !== opts[1].days[0])
      add('Warning', 'availability', c.code, 'The two options are on different single days, so they are treated as two weekly meetings.')
  }
  if (registrations.length && classrooms.length) {
    const max = Math.max(...classrooms.map((r) => r.capacity))
    for (const c of cat.values()) if (c.enrolled > max) add('Info', 'classrooms', c.code, `${c.enrolled} students, which is more than the largest room (${max}). It will be split into groups.`)
  }
  const order = { Error: 0, Warning: 1, Info: 2 }
  issues.sort((a, b) => order[a.severity] - order[b.severity] || a.item.localeCompare(b.item))
  return { courses: [...cat.values()].sort((a, b) => a.code.localeCompare(b.code)), students, classrooms, periods, issues }
}
