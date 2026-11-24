import * as XLSX from 'xlsx'
import { DAYS, DAY_NAMES, fmt } from './clean.js'
import { fmtWhen } from './scheduler.js'

// Builds the final Excel workbook (FR: export to Excel).
export function exportSchedule(data, schedule, evaluation, { only } = {}) {
  const { sections, placements } = schedule
  const wb = XLSX.utils.book_new()
  const P = data.periods
  const label = (s) => `${s.id}${s.title ? ' ' + s.title : ''}`
  const pick = only ? sections.filter(only.filter) : sections

  // 1. Master list
  const list = pick.map((s) => {
    const pl = placements[s.id]
    return {
      Course: s.code, Group: s.group || '', Title: s.title, Instructor: s.instructor || '(none)',
      'Days & time': pl ? fmtWhen(pl, P) : 'NOT SCHEDULED', Room: pl ? [...new Set(pl.meetings.map((m) => m.room || 'Off-site'))].join(' / ') : '',
      Students: s.size, Locked: pl?.locked ? 'Yes' : '',
    }
  })
  XLSX.utils.book_append_sheet(wb, withWidths(XLSX.utils.json_to_sheet(list)), 'Schedule')

  // 2. Weekly grid
  const grid = [['Time', ...DAYS.map((d) => DAY_NAMES[d])]]
  for (const p of P) {
    grid.push([`${fmt(p.start)}-${fmt(p.end)}`, ...DAYS.map((d) => pick.filter((s) => placements[s.id]?.meetings.some((m) => m.day === d && m.periods.includes(p.id)))
      .map((s) => `${label(s)} (${placements[s.id].meetings.find((m) => m.day === d).room || 'off-site'})`).join('\n'))])
  }
  XLSX.utils.book_append_sheet(wb, withWidths(XLSX.utils.aoa_to_sheet(grid), 45), 'Weekly grid')

  if (!only) {
    // 3. One row per student per class
    const st = []
    for (const s of sections) for (const name of s.students) {
      const pl = placements[s.id]
      st.push({ Student: name, Course: s.id, Title: s.title, 'Days & time': pl ? fmtWhen(pl, P) : 'NOT SCHEDULED', Room: pl ? pl.meetings[0].room || 'Off-site' : '' })
    }
    st.sort((a, b) => a.Student.localeCompare(b.Student, undefined, { numeric: true }))
    XLSX.utils.book_append_sheet(wb, withWidths(XLSX.utils.json_to_sheet(st)), 'Student timetables')

    // 4. Conflicts
    const c = evaluation.conflicts.map((x) => ({ Type: x.type, Classes: x.sections.join(' & '), Details: x.text }))
    XLSX.utils.book_append_sheet(wb, withWidths(XLSX.utils.json_to_sheet(c.length ? c : [{ Type: 'None', Classes: '', Details: 'No conflicts' }])), 'Conflicts')
  }
  const name = only ? `Timetable - ${only.name}.xlsx` : 'SLU Madrid Schedule.xlsx'
  XLSX.writeFile(wb, name)
}

function withWidths(ws, fixed) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
  const n = Math.max(...rows.map((r) => r.length))
  ws['!cols'] = Array.from({ length: n }, (_, i) => ({ wch: fixed && i ? fixed : Math.min(60, Math.max(8, ...rows.map((r) => String(r[i] ?? '').length + 2))) }))
  return ws
}
