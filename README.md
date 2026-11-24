# SLU Madrid Course Scheduling Application

React front end for the CSCI team project. It follows Mira's Figma mockup and runs on the real sample enrollment workbook.

## Run it

```bash
npm install
npm run dev        # open http://localhost:5173
```

On the Login screen, register a **Program Director** account. Then click **Load sample data** on the Import screen, or upload `public/sample/Sample Enrollement Record.xlsx` plus `public/sample/Classrooms (sample).xlsx`.

## Screens (workflow sidebar)

| Step | Screen | What it does |
|---|---|---|
| – | Login / Register | Accounts for Director (full access) or Instructor (read-only: Timetable + Export). Passwords are salted SHA-256 hashes, and an account locks for 5 min after 5 failed tries. |
| 1 | Import data | Four file cards: Courses, Instructor availability, Student registrations, Classrooms. A validation report lists errors, warnings and info. |
| 2 | Time slots and rules | The 7 × 80-min periods (Mon–Thu), max group size (splits into M1/M2), and 5-credit Spanish as a double period. |
| 3 | Generate schedule | Runs the engine and shows the scheduled / conflicts / student clashes / unscheduled counts. |
| 4 | Review and edit | Timetable by day / instructor / room / student. Click a class to open **Edit class & resolve conflicts**: alternatives plus a manual pick, a live constraint checklist, Apply, Lock, a conflict report and Regenerate (locked classes stay put). |
| 5 | Export to Excel | Full workbook (Schedule, Weekly grid, Student timetables, Conflicts) or one instructor / room / student timetable. |

## Code layout

- `src/lib/clean.js`: reads the Excel files and cleans and validates them (same rules as `data-cleaning/`)
- `src/lib/scheduler.js`: **placeholder engine**. It places the most-constrained course first, greedily, then runs a repair pass. Mira's real engine replaces `generate()` and keeps the same input and output shape.
- `src/lib/auth.js`: register, login and lockout
- `src/lib/exportXlsx.js`: Excel export (SheetJS)
- `src/screens/*`: one file per screen

## Not final yet

- Data is stored in the browser's `localStorage`, standing in for the SQLite database (Sharav's part).
- `Classrooms (sample).xlsx` is made up, because the director hasn't given us room data.
- Open questions for the director are in `data-cleaning/Data_Cleaning_Rules.md`.

## Data cleaning

`data-cleaning/clean_enrollment.py` turns the sample workbook into `Cleaned_Enrollment_Data.xlsx` (Issues / Courses / Students / Enrollments / Periods / Availability).

```bash
pip install openpyxl
python data-cleaning/clean_enrollment.py "public/sample/Sample Enrollement Record.xlsx" out.xlsx
```
