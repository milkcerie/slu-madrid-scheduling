// PLACEHOLDER scheduling engine so the UI can be demoed with the real sample data.
// Greedy "most constrained first" placement + a repair pass. Mira's engine (FR-07..14) replaces this.
import { DAYS } from './clean.js'

export const DEFAULT_RULES = {
  maxGroupSize: 25,      // split a course into M1/M2 groups above this
  longUsesTwoPeriods: true, // 5-credit Spanish courses take two periods back to back
  avoidLate: true,       // small penalty for the last period
}

const key = (d, p) => `${d}|${p}`

// ---------- sections ----------
export function buildSections(data, rules) {
  const rooms = data.classrooms
  const maxRoom = rooms.length ? Math.max(...rooms.map((r) => r.capacity)) : Infinity
  const out = []
  for (const c of data.courses) {
    if (!c.enrolled) continue
    const limit = Math.min(rules.maxGroupSize || Infinity, maxRoom)
    const groups = Math.max(1, Math.ceil(c.enrolled / limit))
    for (let g = 0; g < groups; g++) {
      const students = c.students.filter((_, i) => i % groups === g)
      out.push({ id: groups > 1 ? `${c.code}·M${g + 1}` : c.code, code: c.code, group: groups > 1 ? `M${g + 1}` : '',
        title: c.title, instructor: c.instructor, students, size: students.length, long: !!c.long && rules.longUsesTwoPeriods,
        spanish: c.spanish })
    }
  }
  return out
}

// ---------- candidate time patterns for one course ----------
function meetingsFor(option, periods, span, day) {
  const res = []
  if (option.custom) {
    const covered = periods.filter((p) => p.start < option.custom.end && p.end > option.custom.start).map((p) => p.id)
    return [{ day, periods: covered, custom: option.custom, offsite: option.offsite }]
  }
  const ids = periods.map((p) => p.id)
  for (let i = 0; i + span <= ids.length; i++) {
    const block = ids.slice(i, i + span)
    if (!option.periods.includes(block[0])) continue
    if (option.double && !option.periods.includes(block[1])) continue
    res.push({ day, periods: block, offsite: option.offsite })
  }
  return res
}

export function timeCandidates(course, periods, rules) {
  const anyTime = { days: [...DAYS], periods: periods.map((p) => p.id), preferred: [] }
  const opts = course.options.length ? course.options : [anyTime]
  const longSpan = course.long && rules.longUsesTwoPeriods ? 2 : 1
  const cands = []
  // two single-day options on different days = two weekly meetings (e.g. classroom Tue + museum Thu)
  if (opts.length === 2 && opts.every((o) => o.days.length === 1) && opts[0].days[0] !== opts[1].days[0]) {
    const a = meetingsFor(opts[0], periods, opts[0].double ? 2 : longSpan, opts[0].days[0])
    const b = meetingsFor(opts[1], periods, opts[1].double ? 2 : longSpan, opts[1].days[0])
    for (const x of a) for (const y of b) cands.push({ meetings: [x, y], option: 0, preferred: false })
    return cands
  }
  opts.forEach((o, oi) => {
    const span = o.double ? 2 : longSpan
    if (o.days.length === 1) {
      for (const m of meetingsFor(o, periods, span, o.days[0])) cands.push({ meetings: [m], option: oi, preferred: o.preferred?.includes(m.periods[0]) })
      return
    }
    let pats = [['M', 'W'], ['T', 'Th']].filter((p) => p.every((d) => o.days.includes(d)))
    if (!pats.length) pats = [o.days]
    for (const pat of pats) {
      const first = meetingsFor(o, periods, span, pat[0])
      for (const m of first)
        cands.push({ meetings: pat.map((d) => ({ ...m, day: d })), option: oi, preferred: !!o.preferred?.includes(m.periods[0]) })
    }
  })
  return cands
}

// ---------- occupancy ----------
export function occupancy(sections, placements) {
  const inst = new Map(), room = new Map(), stud = new Map()
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v) }
  for (const s of sections) {
    const pl = placements[s.id]
    if (!pl) continue
    for (const mt of pl.meetings) for (const p of mt.periods) {
      const k = key(mt.day, p)
      if (s.instructor) push(inst, `${s.instructor}|${k}`, s.id)
      if (mt.room) push(room, `${mt.room}|${k}`, s.id)
      for (const st of s.students) push(stud, `${st}|${k}`, s.id)
    }
  }
  return { inst, room, stud }
}

const slotsOf = (cand) => cand.meetings.flatMap((m) => m.periods.map((p) => key(m.day, p)))

// Checks one placement for one section against everything else. Used by the engine AND the edit screen.
export function checkPlacement(section, cand, occ, data, selfId = section.id) {
  const others = (arr) => (arr || []).filter((x) => x !== selfId)
  const slots = slotsOf(cand)
  const instBusy = section.instructor ? [...new Set(slots.flatMap((k) => others(occ.inst.get(`${section.instructor}|${k}`))))] : []
  const roomBusy = [], tooSmall = []
  for (const m of cand.meetings) {
    if (m.offsite || !m.room) continue
    for (const p of m.periods) roomBusy.push(...others(occ.room.get(`${m.room}|${key(m.day, p)}`)))
    const r = data.classrooms.find((x) => x.id === m.room)
    if (r && r.capacity < section.size) tooSmall.push(`${r.id} seats ${r.capacity}`)
  }
  const clashStudents = new Set(), clashWith = new Set()
  for (const st of section.students) for (const k of slots) {
    const o = others(occ.stud.get(`${st}|${k}`))
    if (o.length) { clashStudents.add(st); o.forEach((x) => clashWith.add(x)) }
  }
  const course = data.courses.find((c) => c.code === section.code)
  const allowed = course && course.options.length
    ? timeCandidates(course, data.periods, { longUsesTwoPeriods: section.long || !course.long }).some((c) => sameTime(c, cand)) : true
  return {
    instructorAvailable: allowed,
    instructorFree: instBusy.length === 0, instBusy,
    roomFree: roomBusy.length === 0, roomBusy: [...new Set(roomBusy)],
    roomFits: tooSmall.length === 0, tooSmall,
    hasRoom: cand.meetings.every((m) => m.offsite || m.room),
    studentsFree: clashStudents.size === 0, clashStudents: [...clashStudents], clashWith: [...clashWith],
    hardOk: allowed && instBusy.length === 0 && roomBusy.length === 0 && tooSmall.length === 0 && cand.meetings.every((m) => m.offsite || m.room),
  }
}

export const sameTime = (a, b) => a.meetings.length === b.meetings.length &&
  a.meetings.every((m, i) => m.day === b.meetings[i].day && m.periods.join() === b.meetings[i].periods.join())

// picks the smallest room that fits and is free for every meeting of the candidate
function pickRoom(section, cand, occ, rooms, prefer) {
  const fits = rooms.filter((r) => r.capacity >= section.size).sort((a, b) => a.capacity - b.capacity)
  if (prefer) { const p = fits.find((r) => r.id === prefer); if (p) fits.unshift(p) }
  for (const r of fits) {
    const free = cand.meetings.every((m) => m.offsite || m.periods.every((p) => !(occ.room.get(`${r.id}|${key(m.day, p)}`) || []).some((x) => x !== section.id)))
    if (free) return r.id
  }
  return null
}

const withRoom = (cand, roomId) => ({ ...cand, meetings: cand.meetings.map((m) => ({ ...m, room: m.offsite ? null : roomId })) })

function cost(section, cand, chk, load, periods, rules) {
  let c = chk.clashStudents.length * 10
  if (cand.preferred) c -= 3
  for (const k of slotsOf(cand)) c += (load.get(k) || 0) * 0.3
  if (rules.avoidLate && cand.meetings.some((m) => m.periods.includes(periods[periods.length - 1].id))) c += 1
  return c
}

// All valid options for a section, best first. Used by "Generate" and by the edit screen's suggestions.
export function rankOptions(section, data, sections, placements, rules, { includeInvalid = false } = {}) {
  const course = data.courses.find((c) => c.code === section.code)
  const occ = occupancy(sections, placements)
  const load = new Map()
  for (const s of sections) { const pl = placements[s.id]; if (pl && s.id !== section.id) for (const k of slotsOf(pl)) load.set(k, (load.get(k) || 0) + 1) }
  const out = []
  for (const t of timeCandidates(course, data.periods, rules)) {
    const room = data.classrooms.length ? pickRoom(section, t, occ, data.classrooms, placements[section.id]?.meetings[0]?.room) : 'TBA'
    const cand = withRoom(t, room)
    const chk = checkPlacement(section, cand, occ, data)
    if (!chk.hardOk && !includeInvalid) continue
    out.push({ cand, chk, cost: cost(section, cand, chk, load, data.periods, rules) })
  }
  return out.sort((a, b) => a.cost - b.cost)
}

function whyUnscheduled(section, data) {
  if (!section.instructor) return 'No instructor is assigned to this course.'
  const course = data.courses.find((c) => c.code === section.code)
  if (!data.classrooms.some((r) => r.capacity >= section.size)) return `No classroom can seat ${section.size} students.`
  if (course.options.length) return `${section.instructor}'s available slots are all taken by their other classes or have no free room. Ask for more availability, or move another class.`
  return 'No free time slot with a free room was found.'
}

// ---------- generate ----------
export function generate(data, rules, previous = null) {
  const sections = buildSections(data, rules)
  const placements = {}
  const locked = new Set()
  if (previous) for (const s of sections) {
    const old = previous.placements[s.id]
    if (old?.locked) { placements[s.id] = old; locked.add(s.id) }
  }
  const unscheduled = {}
  const counts = Object.fromEntries(sections.map((s) => [s.id, timeCandidates(data.courses.find((c) => c.code === s.code), data.periods, rules).length]))
  const order = sections.filter((s) => !locked.has(s.id)).sort((a, b) => counts[a.id] - counts[b.id] || b.size - a.size)
  for (const s of order) {
    if (!s.instructor) { unscheduled[s.id] = whyUnscheduled(s, data); continue }
    const best = rankOptions(s, data, sections, placements, rules)[0]
    if (best) placements[s.id] = { meetings: best.cand.meetings, locked: false }
    else unscheduled[s.id] = whyUnscheduled(s, data)
  }
  // repair: move sections that still have student clashes if a better slot exists
  for (let it = 0; it < 4; it++) {
    let moved = false
    for (const s of order) {
      if (!placements[s.id]) continue
      const occ = occupancy(sections, placements)
      const cur = checkPlacement(s, placements[s.id], occ, data)
      if (cur.studentsFree) continue
      const best = rankOptions(s, data, sections, placements, rules)[0]
      if (best && best.chk.clashStudents.length < cur.clashStudents.length) {
        placements[s.id] = { meetings: best.cand.meetings, locked: false }; moved = true
      }
    }
    if (!moved) break
  }
  rebalanceGroups(sections, placements)
  return { sections, placements, unscheduled, generatedAt: Date.now() }
}

// students in split courses go to whichever group clashes least with their other classes
export function rebalanceGroups(sections, placements) {
  const byCode = {}
  for (const s of sections) if (s.group) (byCode[s.code] ||= []).push(s)
  for (const groups of Object.values(byCode)) {
    if (!groups.every((g) => placements[g.id])) continue
    const all = groups.flatMap((g) => g.students)
    const cap = Math.ceil(all.length / groups.length)
    groups.forEach((g) => { g.students = [] })
    const occ = occupancy(sections, placements)
    for (const st of all) {
      const score = (g) => slotsOf(placements[g.id]).filter((k) => (occ.stud.get(`${st}|${k}`) || []).some((x) => !groups.some((gg) => gg.id === x))).length
      const pick = groups.filter((g) => g.students.length < cap).sort((a, b) => score(a) - score(b))[0]
      pick.students.push(st)
    }
    groups.forEach((g) => { g.size = g.students.length })
  }
}

// ---------- evaluation: everything the conflict report shows ----------
export function evaluate(data, schedule) {
  const { sections, placements, unscheduled } = schedule
  const occ = occupancy(sections, placements)
  const conflicts = []
  const seen = new Set()
  for (const s of sections) {
    const pl = placements[s.id]
    if (!pl) continue
    const chk = checkPlacement(s, pl, occ, data)
    const when = fmtWhen(pl, data.periods)
    if (!chk.instructorFree) for (const o of chk.instBusy) {
      const k = ['inst', ...[s.id, o].sort()].join('|'); if (seen.has(k)) continue; seen.add(k)
      conflicts.push({ type: 'Conflict', kind: 'instructor', sections: [s.id, o], text: `${s.instructor} is teaching ${s.id} and ${o} at the same time (${when}).` })
    }
    if (!chk.roomFree) for (const o of chk.roomBusy) {
      const k = ['room', ...[s.id, o].sort()].join('|'); if (seen.has(k)) continue; seen.add(k)
      conflicts.push({ type: 'Conflict', kind: 'room', sections: [s.id, o], text: `Both classes were placed in ${pl.meetings[0].room} at the same time (${when}). Move one to a free room or another slot.` })
    }
    if (!chk.roomFits) conflicts.push({ type: 'Conflict', kind: 'capacity', sections: [s.id], text: `${s.size} students, but ${chk.tooSmall.join(', ')}.` })
    if (!chk.instructorAvailable) conflicts.push({ type: 'Conflict', kind: 'availability', sections: [s.id], text: `${when} is outside ${s.instructor}'s availability.` })
    for (const o of chk.clashWith) {
      const k = ['stud', ...[s.id, o].sort()].join('|'); if (seen.has(k)) continue; seen.add(k)
      const other = sections.find((x) => x.id === o)
      const shared = s.students.filter((st) => other.students.includes(st))
      conflicts.push({ type: 'Student clash', kind: 'students', sections: [s.id, o], students: shared,
        text: `${shared.length} student${shared.length > 1 ? 's' : ''} (${shared.slice(0, 3).join(', ')}${shared.length > 3 ? '…' : ''}) registered for both, and they meet at the same time.` })
    }
  }
  for (const [id, why] of Object.entries(unscheduled)) if (!placements[id]) conflicts.push({ type: 'Unscheduled', kind: 'unscheduled', sections: [id], text: why })
  const order = { Conflict: 0, 'Student clash': 1, Unscheduled: 2 }
  conflicts.sort((a, b) => order[a.type] - order[b.type])
  const badIds = new Set(conflicts.filter((c) => c.type === 'Conflict').flatMap((c) => c.sections))
  const clashIds = new Set(conflicts.filter((c) => c.type === 'Student clash').flatMap((c) => c.sections))
  return {
    conflicts, badIds, clashIds,
    scheduled: sections.filter((s) => placements[s.id]).length,
    unscheduledCount: sections.filter((s) => !placements[s.id]).length,
    hardConflicts: conflicts.filter((c) => c.type === 'Conflict').length,
    studentClashes: conflicts.filter((c) => c.type === 'Student clash').length,
  }
}

const DAYS_SHORT = { M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu' }
export function fmtMeeting(m, periods) {
  const ps = m.periods.map((id) => periods.find((p) => p.id === id))
  const start = m.custom ? m.custom.start : ps[0].start, end = m.custom ? m.custom.end : ps[ps.length - 1].end
  const t = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
  return `${DAYS_SHORT[m.day]} · ${t(start)} – ${t(end)}`
}
export function fmtWhen(pl, periods) {
  const ms = pl.meetings
  if (ms.length === 2 && ms[0].periods.join() === ms[1].periods.join() && !ms[0].custom && !ms[1].custom)
    return `${DAYS_SHORT[ms[0].day]}/${DAYS_SHORT[ms[1].day]} · ${fmtMeeting(ms[0], periods).split(' · ')[1]}`
  return ms.map((m) => fmtMeeting(m, periods)).join(' + ')
}
