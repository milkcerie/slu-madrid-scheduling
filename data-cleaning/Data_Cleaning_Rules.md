# Data Cleaning: SLU Madrid Course Scheduling (sample data)

**Input:** `Sample Enrollement Record.xlsx` (sheets: Final Enrollment, Class Periods, Teacher Availability)
**Output:** `Cleaned_Enrollment_Data.xlsx`, produced by `python clean_enrollment.py <input> <output>`
**Result:** 33 courses, 77 students, 307 enrollments, 7 periods, 493 instructor-availability slots, 52 logged issues (2 errors, 27 warnings, 23 info)

## Output tables (what the scheduler reads)
| Sheet | One row per | Key columns |
|---|---|---|
| Issues | problem found | severity, area, item, problem, action_taken |
| Courses | course | code, title, credits, instructor, taught_in_spanish, enrolled, long_meeting, scheduled (Yes / No / Blocked) |
| Students | student | student, num_courses, total_credits |
| Enrollments | student × course | student, course_code |
| Periods | standard period | P1–P7, start, end, minutes |
| Availability | course × option × day × period | course_code, instructor, option (1 = first choice, 2 = "OR"), day, period, preferred, notes |

## Cleaning rules
1. **Course key = course code.** Each course string is split into a code and a title (`MADR 4511W Intro To AI` becomes `MADR 4511W` + `Intro To AI`). All three sheets are joined on the code, never on the title.
2. **Titles are normalised.** The leading `": "` and UPPER CASE are removed from the teacher sheet, and Roman numerals are fixed (`(Ii)` becomes `(II)`). The `(esp)` tag is removed from the title and stored as `taught_in_spanish = Yes`.
3. **Blank cells are dropped.** Gaps between filled course columns are closed up (Student 75), and duplicate enrollments are removed.
4. **Enrollment counts are recomputed** from the Enrollments table. The sheet's `COUNTIF(B3:F79, …)` uses a hard-coded range that breaks when students are added.
5. **Periods** come from the Class Periods sheet: 7 periods of 80 minutes each, M/T/W/Th only. P1 = 9:30–10:50 through P7 = 18:30–19:50.
6. **Free-text availability is turned into (day, period) slots:**
   - `M/W 1st or second period` → M and W, P1–P2
   - `T/TH 9:30-10:50` → T and Th, P1 (exact match to a period)
   - `M/W 9:30-12:20` → every period that fits fully inside the range (P1, P2)
   - `anytime M/W after 12:00` / `M/W after 16:00` → every period that starts at or after that time
   - `any time T/TH, prefers second period` → all T/Th periods, with P2 marked `preferred`
   - `two classes in a row Thursdays after 15:00` → Th P5–P7, flagged as a **double block**
   - Off-grid times (`10:30-13:50`) → only the periods fully inside the range, plus a warning
   - Times with no matching period (`Thursdays museum 16:00-17:20`) → kept as a custom fixed slot, marked off-site (no room needed)
   - **Blank availability** → assumed available any period M–Th, with a warning (14 courses)
7. **Courses with 0 students are not scheduled** (MADR 5448, UMN Global Identity).
8. **A course with students but no instructor is `Blocked`** (UC3M 13205). It is kept, so the student isn't silently dropped.
9. **Instructors with several courses are listed** (for example, Carlos Colón has 3 and Marta López Beriso has 3). The engine must never put two of one instructor's courses in the same period.

## Needs a decision from the director (open questions)
- **UC3M 13205 Financial & Service Mkt** (Student 8) is not in the course list: it has no instructor, no credits and no availability.
- **5-credit Spanish courses** (MADR 1001–1004) "meet 30 minutes more" than other classes. Does that mean 110-minute blocks, or an extra meeting?
- **MADR 3021 Art at the Prado:** is it "Tue classroom OR Thu museum", or both every week?
- **MADR 3301 / 3711** list `T/TH 10:30-13:50`, which isn't on the period grid. Is that P2–P3?
- **14 courses** have no availability at all.
- **Student 24** has no courses. Should they be dropped?
- **7 students** take 5 courses (15+ credits). Is there a credit cap?
- **Room capacities** are not in the data, so section splitting (FR-09/10) can't be checked yet.
