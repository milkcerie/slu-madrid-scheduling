"""Clean the 'Sample Enrollement Record.xlsx' workbook into scheduler-ready tables.

Usage:  python clean_enrollment.py "Sample Enrollement Record.xlsx" Cleaned_Enrollment_Data.xlsx

Output sheets:
  Courses       one row per course: code, title, credits, instructor, taught in Spanish, enrolled
  Students      one row per student with their course count + total credits
  Enrollments   long format: one row per (student, course)
  Periods       the 7 standard periods (P1..P7) with start/end times
  Availability  one row per (course, option, day, period) the instructor can teach
  Issues        everything the script fixed, assumed or could not resolve
"""
import re
import sys
from collections import Counter, defaultdict

import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

#'keys'/standardized language for organizing and homogenizing data

DAYS = ["M", "T", "W", "Th"]
DAY_WORDS = {"M": ["M"], "W": ["W"], "T": ["T"], "TH": ["Th"], "MONDAYS": ["M"],
             "TUESDAYS": ["T"], "WEDNESDAYS": ["W"], "THURSDAYS": ["Th"]}
ORDINAL = {"1ST": 1, "FIRST": 1, "2ND": 2, "SECOND": 2, "3RD": 3, "THIRD": 3,
           "4TH": 4, "FOURTH": 4, "5TH": 5, "FIFTH": 5}
ROMAN = re.compile(r"\((i{1,3}|iv|v|vi{0,3})\)", re.I)
CODE = re.compile(r"^\s*([A-Z0-9]+\s+\d{3,5}[A-Z]?)\s*[:\-]?\s*(.*)$", re.I)

issues = []


def issue(severity, area, item, problem, action):
    issues.append((severity, area, item, problem, action))


def mins(t):
    h, m = t.strip().split(":")
    return int(h) * 60 + int(m)


def fmt(m):
    return f"{m // 60}:{m % 60:02d}"


def clean_text(s):
    return re.sub(r"\s+", " ", str(s)).strip() if s is not None else ""


def split_course(raw):
    """'MADR 1004 Intermediate Spanish (Ii)' -> ('MADR 1004', 'Intermediate Spanish (II)', spanish?)"""
    s = clean_text(raw)
    m = CODE.match(s)
    if not m:
        return None, s, False
    code = re.sub(r"\s+", " ", m.group(1).upper())
    title = m.group(2).strip(" :")
    spanish = bool(re.search(r"\(esp\)", title, re.I))
    title = re.sub(r"\s*\(esp\)", "", title, flags=re.I).strip()
    title = ROMAN.sub(lambda r: "(" + r.group(1).upper() + ")", title)
    return code, title, spanish


def title_case(t):
    small = {"and", "of", "the", "in", "at", "to", "for", "&", "through", "on"}
    words = t.lower().split()
    out = [w if (i and w in small) else w[:1].upper() + w[1:] for i, w in enumerate(words)]
    return ROMAN.sub(lambda r: "(" + r.group(1).upper() + ")", " ".join(out))


# ---------------------------------------------------------------- periods
def read_periods(ws):
    periods = []
    for row in ws.iter_rows(min_row=3, values_only=True):
        v = clean_text(row[0])
        if not v:
            continue
        a, b = [x.strip() for x in v.split("-")]
        periods.append((f"P{len(periods) + 1}", mins(a), mins(b)))
    lens = {e - s for _, s, e in periods}
    if len(lens) == 1:
        issue("Info", "Periods", "All", f"{len(periods)} standard periods of {lens.pop()} min, days {'/'.join(DAYS)} only (no Friday)",
              "Stored as P1..P7")
    return periods


# ---------------------------------------------------------------- availability parser
def parse_days(text):
    up = text.upper()
    days = []
    m = re.search(r"\b([MTWH/]+(?:/TH)?)\b", up)
    for tok in re.findall(r"\b(MONDAYS|TUESDAYS|WEDNESDAYS|THURSDAYS)\b", up):
        days += DAY_WORDS[tok]
    if not days and m:
        for part in m.group(1).split("/"):
            days += DAY_WORDS.get(part, [])
    return [d for d in DAYS if d in days]


def parse_option(text, periods, course): 
    """Return (days, period_ids, preferred_ids, notes) for one free-text availability option."""
    up = text.upper()
    days = parse_days(text)
    notes = []
    if not days:
        days = DAYS[:]
        notes.append("no day given -> any day")
    pids = [p for p, _, _ in periods]
    pref = []

    ords = [ORDINAL[w] for w in re.findall(r"\b(1ST|FIRST|2ND|SECOND|3RD|THIRD|4TH|FOURTH|5TH|FIFTH)\b", up)]
    rng = re.search(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", up)
    after = re.search(r"AFTER\s+(\d{1,2}:\d{2})", up)

    if "PREFER" in up:
        pref = [f"P{n}" for n in ords]
        chosen = pids                     # "any time ..., prefers second period"
    elif ords:
        chosen = [f"P{n}" for n in ords]
    elif rng:
        a, b = mins(rng.group(1)), mins(rng.group(2))
        chosen = [p for p, s, e in periods if s >= a and e <= b]
        exact = any(s == a for _, s, _ in periods) and any(e == b for _, _, e in periods)
        if not exact and chosen:
            notes.append(f"{fmt(a)}-{fmt(b)} does not line up with the standard periods; kept only periods fully inside it")
            issue("Warning", "Availability", course, f"'{text}' is not on the standard period grid",
                  f"Mapped to {', '.join(chosen) or 'nothing'}; confirm with the director")
    elif after:
        a = mins(after.group(1))
        chosen = [p for p, s, _ in periods if s >= a]
    elif "ANY" in up:
        chosen = pids
    else:
        chosen = pids
        notes.append("could not read a time -> any period")
        issue("Warning", "Availability", course, f"Could not parse '{text}'", "Treated as any period")

    if "IN A ROW" in up:
        notes.append("needs back-to-back periods (double block)")
        issue("Warning", "Availability", course, f"'{text}' asks for two consecutive periods",
              "Engine must schedule a double block; flagged as a hard constraint")
    if "MUSEUM" in up:
        notes.append("off-site (museum), no classroom needed")
    if not chosen and rng:
        chosen = [f"{rng.group(1)}-{rng.group(2)}"]   # keep the off-grid time as a custom slot
        issue("Warning", "Availability", course, f"'{text}' is outside every standard period",
              f"Kept as custom slot {chosen[0]}; engine treats it as fixed")
    elif not chosen:
        issue("Error", "Availability", course, f"'{text}' maps to no standard period", "Needs a manual decision")
    return days, chosen, pref, notes


# ---------------------------------------------------------------- main
def main(src, dst):
    wb = openpyxl.load_workbook(src, data_only=False)
    fe, cp, ta = wb["Final Enrollment"], wb["Class Periods"], wb["Teacher Availability"]
    periods = read_periods(cp)

    # course list + credits (Final Enrollment cols I/J)
    catalog = {}
    for r in range(3, fe.max_row + 1):
        raw, cred = fe.cell(r, 9).value, fe.cell(r, 10).value
        if not raw:
            continue
        code, title, spanish = split_course(raw)
        if code is None:
            code = "UNCODED-" + re.sub(r"\W+", "-", title.upper())
            issue("Warning", "Courses", raw, "Course has no course code", f"Gave it placeholder code {code}")
        catalog[code] = {"code": code, "title": title, "credits": cred, "spanish": spanish,
                         "instructor": "", "options": []}
    formula = fe.cell(3, 11).value
    if isinstance(formula, str) and "$" not in formula:
        issue("Info", "Courses", "Enrollment Auto-Count", f"Uses {formula} with a relative, hard-coded range",
              "Ignored; enrollment is recomputed from the Enrollments table")

    # checks for teacher availability for each course
    for row in ta.iter_rows(min_row=2, values_only=True):
        code_raw = clean_text(row[0])
        if not code_raw or code_raw.lower().startswith("notes"):
            if code_raw.lower().startswith("notes"):
                issue("Info", "Courses", "Note", code_raw, "Spanish courses: flagged as needing longer meetings (see Courses.long_meeting)")
            continue
        code = code_raw.upper()
        title = title_case(clean_text(row[1]).lstrip(": ").strip())
        if code not in catalog:
            issue("Warning", "Courses", code, "In Teacher Availability but not in the course list", "Added; credits unknown")
        c = catalog.setdefault(code, {"code": code, "title": title, "credits": None, "spanish": False,
                                      "instructor": "", "options": []})
        if c["title"].upper() != title.upper():
            issue("Info", "Courses", code, f"Title differs between sheets ('{c['title']}' vs '{title}')", "Kept course-list title")
        c["instructor"] = clean_text(row[2])
        opts = [clean_text(v) for v in row[3:5] if clean_text(v)]
        c["options"] = opts
        if not opts:
            issue("Warning", "Availability", code, "No availability given",
                  "Assumed available any period M-Th; ask the director")

    # students / enrollments, manage the course sizes and data/other class issues
    students, enroll = [], []
    for r in range(3, fe.max_row + 1):
        name = clean_text(fe.cell(r, 1).value)
        if not name:
            continue
        raw_courses = [fe.cell(r, c).value for c in range(2, 7)]
        if any(not raw_courses[i] and any(raw_courses[i + 1:]) for i in range(5)):
            issue("Info", "Students", name, "Empty course column between filled ones", "Courses compacted")
        codes = []
        for v in raw_courses:
            if not clean_text(v):
                continue
            code, title, spanish = split_course(v)
            if ROMAN.search(str(v)) and ROMAN.search(str(v)).group(1) != ROMAN.search(str(v)).group(1).upper():
                issue("Info", "Enrollments", name, f"'{v}' has wrong case in roman numeral", f"Normalised to '{title}'")
            if code not in catalog:
                catalog[code] = {"code": code, "title": title, "credits": None, "spanish": spanish,
                                 "instructor": "", "options": []}
                issue("Error", "Courses", code, f"'{v}' (taken by {name}) is not in the course list or teacher sheet",
                      "Added with no instructor/credits; cannot be scheduled until the director confirms it")
            if code in codes:
                issue("Warning", "Enrollments", name, f"Enrolled twice in {code}", "Duplicate removed")
                continue
            codes.append(code)
            enroll.append((name, code))
        if not codes:
            issue("Warning", "Students", name, "Student has no courses", "Kept in Students, no enrollments")
        students.append([name, len(codes)])

    counts = Counter(c for _, c in enroll)
    for s in students:
        creds = [catalog[c]["credits"] for n, c in enroll if n == s[0]]
        s.append(sum(x for x in creds if x) if all(creds) else None)
        if s[1] == 5:
            issue("Info", "Students", s[0], f"Takes 5 courses ({str(s[2]) + ' credits' if s[2] else 'credits unknown'})", "Kept; check the credit cap")

    # catalog-level checks
    for code, c in catalog.items():
        c["enrolled"] = counts.get(code, 0)
        if c["enrolled"] and not c["instructor"]:
            issue("Error", "Courses", code, f"{c['enrolled']} student(s) enrolled but no instructor",
                  "scheduled=Blocked until the director assigns an instructor")
        if c["enrolled"] == 0:
            issue("Warning", "Courses", code, "No students enrolled" + ("" if c["instructor"] else " and no instructor"),
                  "Excluded from scheduling (scheduled=No)")
    per_instr = defaultdict(list)
    for c in catalog.values():
        if c["instructor"] and c["enrolled"]:
            per_instr[c["instructor"]].append(c["code"])
    for who, cs in per_instr.items():
        if len(cs) > 1:
            issue("Info", "Instructors", who, f"Teaches {len(cs)} courses: {', '.join(cs)}",
                  "Engine must not put these in the same period")

    # availability rows
    avail = []
    for code, c in catalog.items():
        if not c["enrolled"] or not c["instructor"]:
            continue
        opts = c["options"] or ["(none given)"]
        for i, text in enumerate(opts, 1):
            if text == "(none given)":
                days, ps, pref, notes = DAYS, [p for p, _, _ in periods], [], ["assumed: no availability given"]
            else:
                days, ps, pref, notes = parse_option(text, periods, code)
            for d in days:
                for p in ps:
                    avail.append([code, c["instructor"], i, text, d, p, "Yes" if p in pref else "", "; ".join(notes)])
        if len(c["options"]) == 2 and "MUSEUM" in " ".join(c["options"]).upper():
            issue("Warning", "Availability", code, "The two 'OR' options look like two required meetings (classroom Tue + museum Thu)",
                  "Kept as option 1 / option 2; confirm whether both are required")

    # spanish 5-credit length
    for c in catalog.values():
        if c["credits"] == 5 and c["enrolled"]:
            issue("Warning", "Courses", c["code"], "5-credit Spanish course meets 30 min longer than a standard 80-min period",
                  "Flagged long=Yes; the engine must reserve extra time (open question)")

    write(dst, catalog, students, enroll, periods, avail)
    print(f"{len(catalog)} courses, {len(students)} students, {len(enroll)} enrollments, "
          f"{len(avail)} availability slots, {len(issues)} issues -> {dst}")


def write(dst, catalog, students, enroll, periods, avail):
    out = openpyxl.Workbook()
    out.remove(out.active)
    sev = {"Error": 0, "Warning": 1, "Info": 2}
    sheets = {
        "Courses": (["code", "title", "credits", "instructor", "taught_in_spanish", "enrolled", "long_meeting", "scheduled"],
                    [[c["code"], c["title"], c["credits"], c["instructor"] or None, "Yes" if c["spanish"] else "No",
                      c["enrolled"], "Yes" if c["credits"] == 5 else "No", ("Yes" if c["instructor"] else "Blocked") if c["enrolled"] else "No"]
                     for c in sorted(catalog.values(), key=lambda c: c["code"])]),
        "Students": (["student", "num_courses", "total_credits"],
                     sorted(students, key=lambda s: int(re.sub(r"\D", "", s[0]) or 0))),
        "Enrollments": (["student", "course_code"], enroll),
        "Periods": (["period", "start", "end", "minutes"], [[p, fmt(s), fmt(e), e - s] for p, s, e in periods]),
        "Availability": (["course_code", "instructor", "option", "option_text", "day", "period", "preferred", "notes"], avail),
        "Issues": (["severity", "area", "item", "problem", "action_taken"],
                   sorted(issues, key=lambda i: (sev[i[0]], i[1], str(i[2])))),
    }
    hdr = PatternFill("solid", fgColor="003DA5")
    for name, (cols, rows) in sheets.items():
        ws = out.create_sheet(name)
        ws.append(cols)
        for r in rows:
            ws.append(list(r))
        for cell in ws[1]:
            cell.font, cell.fill = Font(bold=True, color="FFFFFF"), hdr
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for i, col in enumerate(cols, 1):
            width = max([len(str(col))] + [len(str(r[i - 1])) for r in rows if r[i - 1] is not None])
            ws.column_dimensions[get_column_letter(i)].width = min(width + 2, 70)
    out.move_sheet("Issues", offset=-5)
    out.save(dst)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Sample Enrollement Record.xlsx",
         sys.argv[2] if len(sys.argv) > 2 else "Cleaned_Enrollment_Data.xlsx")
