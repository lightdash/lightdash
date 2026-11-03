#!/usr/bin/env python3
"""
Generate Cartwheel Care seed CSVs: school-partnered pediatric mental health care.

Source systems modeled:
  - Partnership records: districts and schools with enrollment and partnership start dates
  - Portal referrals: school staff refer students; care coordinators reach families within 24h,
    collect consent, and schedule a virtual intake
  - Clinical EHR: care episodes by program, scheduled appointments with attendance status,
    measurement-based care assessments (PHQ-A, GAD-7, SCARED, SDQ)
  - District SIS extracts: per-term attendance and suspensions for referred students

Run from projects/cartwheel-care:  python3 generate_seeds.py   then  dbt build
"""

import csv
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from faker import Faker

SEED = 20261016
random.seed(SEED)
fake = Faker()
Faker.seed(SEED)

AS_OF = date(2026, 10, 16)
WINDOW_START = date(2024, 8, 1)
PROJECT_DIR = Path(__file__).resolve().parent
SEED_DIR = PROJECT_DIR / "seeds"


def weighted(choices):
    names = [c[0] for c in choices]
    weights = [c[1] for c in choices]
    return random.choices(names, weights=weights, k=1)[0]


def jitter(n, pct=0.06):
    return max(1, round(n * random.uniform(1 - pct, 1 + pct)))


def business_day(d):
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def school_year(d):
    return d.year if d.month >= 8 else d.year - 1


def is_summer(d):
    return (d.month == 6 and d.day > 20) or d.month == 7 or (d.month == 8 and d.day < 20)


# ---------------------------------------------------------------------------
# Districts and schools
# ---------------------------------------------------------------------------
DISTRICT_SPECS = [
    # name, state, funding_model, partnership_start, school counts (elem, middle, high)
    ("Harborview Public Schools", "MA", "District Contract", date(2024, 8, 12), (6, 2, 1)),
    ("Millbrook Regional School District", "MA", "District Contract", date(2024, 8, 19), (4, 1, 1)),
    ("Stonefield Public Schools", "MA", "State Program", date(2024, 8, 26), (7, 3, 2)),
    ("Cedar Falls City Schools", "OH", "District Contract", date(2024, 8, 12), (5, 2, 1)),
    ("Riverbend Local Schools", "OH", "State Program", date(2024, 9, 3), (3, 1, 1)),
    ("Northgate Public Schools", "CT", "District Contract", date(2024, 8, 26), (4, 2, 1)),
    ("Ashford Hills School District", "NY", "District Contract", date(2024, 9, 9), (3, 1, 1)),
    ("Lakeside Union School District", "IL", "District Contract", date(2024, 9, 16), (5, 2, 2)),
    ("Pembroke Township Schools", "RI", "State Program", date(2024, 10, 1), (3, 1, 1)),
    ("Westbury Charter Network", "NY", "District Contract", date(2025, 1, 13), (6, 3, 2)),
    ("Oak Hollow Community Schools", "OH", "State Program", date(2025, 8, 18), (4, 2, 1)),
    ("Bayport Public Schools", "MA", "District Contract", date(2025, 8, 25), (5, 2, 1)),
    ("Granite Ridge Regional", "MA", "District Contract", date(2025, 9, 2), (2, 1, 1)),
    ("Summit Valley School District", "CT", "State Program", date(2025, 9, 8), (4, 1, 1)),
    ("Prairie Grove Consolidated", "IL", "District Contract", date(2025, 9, 15), (3, 2, 1)),
    ("Fairmont City Schools", "OH", "District Contract", date(2026, 1, 12), (4, 1, 1)),
    ("Maple Crossing Public Schools", "MA", "State Program", date(2026, 8, 24), (5, 2, 1)),
    ("Eastport School Department", "RI", "State Program", date(2026, 9, 1), (3, 1, 1)),
    ("Hollis Park Unified", "IL", "District Contract", date(2026, 9, 8), (4, 2, 1)),
]

ELEM_NAMES = ["Maple Street", "Lincoln", "Riverside", "Oakwood", "Hillcrest", "Pine Grove", "Washington",
              "Meadowbrook", "Sunset", "Franklin", "Birch Lane", "Cherry Hill", "Glenwood", "Parkside",
              "Spring Valley", "Willow Creek", "Jefferson", "Harmony", "Lakeview", "Forest Hills"]
MIDDLE_NAMES = ["Central", "North", "South", "East", "West", "Memorial", "Heritage", "Pioneer"]
HIGH_NAMES = ["", "North", "South", "Technical", "Early College"]

districts, schools = [], []
school_counter = 0
for i, (name, state, funding, start, counts) in enumerate(DISTRICT_SPECS, start=1):
    district_id = f"D{i:03d}"
    city = name.split(" ")[0]
    used_names = set()
    district_enrollment = 0
    for level, count, pool, lo, hi in [
        ("Elementary", counts[0], ELEM_NAMES, 320, 620),
        ("Middle", counts[1], MIDDLE_NAMES, 480, 920),
        ("High", counts[2], HIGH_NAMES, 850, 1900),
    ]:
        for _ in range(count):
            school_counter += 1
            while True:
                base = random.choice(pool)
                if base not in used_names:
                    used_names.add(base)
                    break
            if level == "High":
                school_name = f"{city} {base} High School".replace("  ", " ")
            else:
                school_name = f"{base} {level} School"
            enrollment = jitter(random.randint(lo, hi), 0.03)
            district_enrollment += enrollment
            schools.append({
                "school_id": f"S{school_counter:04d}",
                "district_id": district_id,
                "school_name": school_name,
                "school_level": level,
                "enrollment": enrollment,
                "is_title_i": random.random() < (0.55 if funding == "State Program" else 0.38),
            })
    districts.append({
        "district_id": district_id,
        "district_name": name,
        "state": state,
        "funding_model": funding,
        "partnership_start_date": start,
        "enrollment": district_enrollment,
        "clinical_program_director": fake.name(),
    })

# ---------------------------------------------------------------------------
# Care team
# ---------------------------------------------------------------------------
LANG_SECOND = [("Spanish", 62), ("Portuguese", 16), ("Haitian Creole", 10), ("Mandarin", 6), ("Arabic", 6)]
STATES = ["MA", "OH", "CT", "NY", "IL", "RI"]

care_team = []
clinician_id = 0


def add_team_member(role, credential, hire, capacity):
    global clinician_id
    clinician_id += 1
    bilingual = random.random() < 0.34
    languages = "English" + (f", {weighted(LANG_SECOND)}" if bilingual else "")
    licensed = random.sample(STATES, k=random.choice([2, 3, 3, 4, 6]))
    care_team.append({
        "care_team_member_id": f"C{clinician_id:03d}",
        "full_name": fake.name(),
        "role": role,
        "credential": credential,
        "languages": languages,
        "is_bilingual": bilingual,
        "licensed_states": ", ".join(sorted(licensed)),
        "hire_date": hire,
        "weekly_session_capacity": capacity,
        "employment_type": weighted([("Full-time", 72), ("Part-time", 28)]),
    })


def hire_date_for_cohort():
    return weighted([
        (date(2024, random.randint(6, 8), random.randint(1, 28)), 45),
        (date(2025, random.randint(1, 8), random.randint(1, 28)), 35),
        (date(2026, random.randint(1, 8), random.randint(1, 28)), 20),
    ])


for _ in range(31):
    add_team_member("Therapist", weighted([("LICSW", 40), ("LMHC", 30), ("LPC", 20), ("LMFT", 10)]),
                    hire_date_for_cohort(), random.choice([22, 24, 26, 28]))
for _ in range(7):
    add_team_member("Psychiatric Nurse Practitioner", "PMHNP-BC", hire_date_for_cohort(), random.choice([30, 34, 38]))
for _ in range(3):
    add_team_member("Child Psychiatrist", "MD", hire_date_for_cohort(), random.choice([20, 24]))
for _ in range(12):
    add_team_member("Care Coordinator", "BA", hire_date_for_cohort(), 0)

therapists = [c for c in care_team if c["role"] == "Therapist"]
prescribers = [c for c in care_team if c["role"] in ("Psychiatric Nurse Practitioner", "Child Psychiatrist")]
coordinators = [c for c in care_team if c["role"] == "Care Coordinator"]


def pick_clinician(pool, state, on_date, needs_language):
    eligible = [c for c in pool if state in c["licensed_states"] and c["hire_date"] <= on_date]
    if not eligible:
        eligible = [c for c in pool if c["hire_date"] <= on_date] or pool
    if needs_language:
        matched = [c for c in eligible if needs_language in c["languages"]]
        if matched and random.random() < 0.8:
            return random.choice(matched)
    return random.choice(eligible)


# ---------------------------------------------------------------------------
# Referrals, students, episodes, appointments, assessments
# ---------------------------------------------------------------------------
SEASONALITY = {1: 1.2, 2: 1.3, 3: 1.2, 4: 1.0, 5: 0.8, 6: 0.3, 7: 0.1, 8: 0.5, 9: 1.4, 10: 1.5, 11: 1.1, 12: 0.8}
ANNUAL_REFERRAL_RATE = {"Elementary": 0.042, "Middle": 0.068, "High": 0.058}
GRADES = {"Elementary": ["K", "1", "2", "3", "4", "5"], "Middle": ["6", "7", "8"], "High": ["9", "10", "11", "12"]}

REFERRAL_SOURCES = [("School Counselor", 36), ("School Social Worker", 22), ("School Psychologist", 8),
                    ("Teacher", 10), ("Administrator", 6), ("School Nurse", 5), ("Parent/Guardian", 13)]
REASONS = [("Anxiety", 28), ("Depression", 18), ("School Avoidance", 12), ("Behavioral Concerns", 14),
           ("Trauma or Grief", 8), ("Peer or Social Difficulties", 8), ("Attention or Focus", 7), ("Family Stress", 5)]
TIER3_REASONS = {"Depression": 0.62, "Trauma or Grief": 0.7, "School Avoidance": 0.55}
PROGRAM_BY_REASON = {
    "School Avoidance": [("School Avoidance Program", 70), ("Individual Therapy", 25), ("Parent Guidance", 5)],
    "Attention or Focus": [("Psychiatry", 50), ("Individual Therapy", 35), ("Parent Guidance", 15)],
    "Behavioral Concerns": [("Individual Therapy", 50), ("Parent Guidance", 25), ("Group Therapy", 15), ("Psychiatry", 10)],
    "Family Stress": [("Individual Therapy", 55), ("Parent Guidance", 35), ("Group Therapy", 10)],
}
DEFAULT_PROGRAM = [("Individual Therapy", 66), ("Group Therapy", 12), ("Psychiatry", 14), ("Parent Guidance", 8)]
PLANNED_SESSIONS = {
    "Individual Therapy": (12, 20), "Group Therapy": (8, 10), "Psychiatry": (6, 14),
    "Parent Guidance": (4, 8), "School Avoidance Program": (10, 16),
}
SESSION_INTERVAL_DAYS = {"Psychiatry": 21}
APPT_TYPE = {
    "Individual Therapy": "Therapy Session", "Group Therapy": "Group Session", "Psychiatry": "Medication Management",
    "Parent Guidance": "Parent Guidance Session", "School Avoidance Program": "Therapy Session",
}
DURATION = {"Intake": 60, "Therapy Session": 45, "Group Session": 60, "Medication Management": 30,
            "Parent Guidance Session": 45}
DISCHARGE_REASONS = [("Goals Met", 55), ("Transitioned to Community Provider", 14), ("Family Disengaged", 15),
                     ("Moved or Left District", 7), ("School Year Ended", 9)]
OUTCOME_FACTOR = {
    "Goals Met": (0.32, 0.58), "Transitioned to Community Provider": (0.6, 0.85), "Family Disengaged": (0.82, 1.05),
    "Moved or Left District": (0.7, 0.95), "School Year Ended": (0.55, 0.8),
}
INSTRUMENTS = {
    "PHQ-A": (27, 10, (11, 22)), "GAD-7": (21, 10, (10, 19)), "SCARED": (82, 25, (26, 58)), "SDQ": (40, 17, (17, 32)),
}


def instrument_for(reason, grade):
    young = grade in ("K", "1", "2", "3", "4", "5", "6")
    if reason in ("Anxiety", "School Avoidance"):
        return "SCARED" if young else "GAD-7"
    if reason in ("Depression", "Trauma or Grief"):
        return "SDQ" if young and random.random() < 0.6 else "PHQ-A"
    return "SDQ"


students, referrals, episodes, appointments, assessments = [], [], [], [], []
students_by_school = {s["school_id"]: [] for s in schools}
student_seq = referral_seq = episode_seq = appt_seq = assess_seq = 0
district_by_id = {d["district_id"]: d for d in districts}


def new_student(school):
    global student_seq
    student_seq += 1
    language = weighted([("English", 73), ("Spanish", 17), ("Portuguese", 4), ("Haitian Creole", 3), ("Other", 3)])
    student = {
        "student_id": f"ST{student_seq:06d}",
        "school_id": school["school_id"],
        "district_id": school["district_id"],
        "grade_at_referral": random.choice(GRADES[school["school_level"]]),
        "gender": weighted([("Female", 49), ("Male", 46), ("Non-binary", 3), ("Not reported", 2)]),
        "primary_home_language": language,
        "coverage_type": weighted([("Medicaid", 46), ("Commercial In-Network", 42), ("Uninsured", 12)]),
        "has_iep_or_504": random.random() < 0.27,
        "first_referral_date": None,
    }
    students.append(student)
    students_by_school[school["school_id"]].append(student)
    return student


def month_iter(start, end):
    d = date(start.year, start.month, 1)
    while d <= end:
        yield d
        d = date(d.year + (d.month // 12), d.month % 12 + 1, 1)


def access_speed_factor(d):
    # Outreach and intake get faster as the operation matures.
    months_in = (d.year - 2024) * 12 + d.month - 8
    return max(0.6, 1.0 - 0.016 * months_in)


def schedule_time(d):
    hour = weighted([(8, 6), (9, 12), (10, 14), (11, 13), (12, 8), (13, 14), (14, 15), (15, 10), (16, 6), (17, 2)])
    return datetime(d.year, d.month, d.day, hour, random.choice([0, 15, 30, 45]))


def build_episode(referral, student, school, intake_date):
    global episode_seq, appt_seq, assess_seq
    episode_seq += 1
    reason = referral["referral_reason"]
    program = weighted(PROGRAM_BY_REASON.get(reason, DEFAULT_PROGRAM))
    state = district_by_id[school["district_id"]]["state"]
    language = None if student["primary_home_language"] in ("English", "Other") else student["primary_home_language"]
    pool = prescribers if program == "Psychiatry" else therapists
    clinician = pick_clinician(pool, state, intake_date, language)
    planned = random.randint(*PLANNED_SESSIONS[program])
    discharge_reason = weighted(DISCHARGE_REASONS)
    if discharge_reason == "Family Disengaged":
        planned = max(3, int(planned * random.uniform(0.3, 0.6)))
    elif discharge_reason == "Moved or Left District":
        planned = max(2, int(planned * random.uniform(0.3, 0.8)))
    interval = SESSION_INTERVAL_DAYS.get(program, 7)
    appt_type = APPT_TYPE[program]
    base_no_show = 0.14 if program == "School Avoidance Program" else 0.08
    if student["coverage_type"] == "Uninsured":
        base_no_show += 0.02

    episode_id = f"E{episode_seq:06d}"
    scheduled_dates = []
    cursor = intake_date
    for k in range(planned + 1):
        if k > 0:
            cursor = cursor + timedelta(days=interval + random.choice([-1, 0, 0, 0, 1]))
            if program != "Psychiatry" and is_summer(cursor):
                if discharge_reason == "School Year Ended" and random.random() < 0.85:
                    discharge_reason = "School Year Ended"
                    break
                cursor = date(cursor.year, 8, 25) + timedelta(days=random.randint(0, 10))
        if cursor > AS_OF:
            break
        scheduled_dates.append(business_day(cursor))
    if discharge_reason == "School Year Ended" and not any(is_summer(d + timedelta(days=interval)) for d in scheduled_dates[-2:]):
        discharge_reason = weighted([("Goals Met", 70), ("Transitioned to Community Provider", 30)])

    truncated = len(scheduled_dates) < planned + 1 and scheduled_dates and scheduled_dates[-1] > AS_OF - timedelta(days=interval + 5)
    status = "Active" if truncated or (cursor > AS_OF and len(scheduled_dates) <= planned) else "Discharged"
    if scheduled_dates and scheduled_dates[-1] >= AS_OF - timedelta(days=interval + 3) and len(scheduled_dates) <= planned:
        status = "Active"

    for k, d in enumerate(scheduled_dates):
        appt_seq += 1
        this_type = "Intake" if k == 0 else appt_type
        if k == 0:
            appt_status = weighted([("Completed", 93), ("No Show", 4), ("Cancelled by Family", 3)])
        elif status == "Discharged" and discharge_reason == "Family Disengaged" and k >= len(scheduled_dates) - 2:
            appt_status = weighted([("No Show", 70), ("Cancelled by Family", 30)])
        else:
            appt_status = weighted([
                ("Completed", int(100 * (1 - base_no_show - 0.09 - 0.02))),
                ("No Show", int(100 * base_no_show)), ("Cancelled by Family", 9), ("Cancelled by Clinician", 2),
            ])
        appointments.append({
            "appointment_id": f"A{appt_seq:07d}",
            "episode_id": episode_id,
            "student_id": student["student_id"],
            "school_id": school["school_id"],
            "district_id": school["district_id"],
            "clinician_id": clinician["care_team_member_id"],
            "scheduled_at": schedule_time(d),
            "appointment_type": this_type,
            "program": program,
            "modality": weighted([("Video", 94), ("Phone", 6)]),
            "status": appt_status,
            "duration_minutes": DURATION[this_type],
            "is_during_school_day": True,
        })
        appointments[-1]["is_during_school_day"] = appointments[-1]["scheduled_at"].hour < 15

    ended_at = None
    if status == "Discharged" and scheduled_dates:
        ended_at = business_day(scheduled_dates[-1] + timedelta(days=random.randint(2, 9)))
        if ended_at > AS_OF:
            status, ended_at = "Active", None

    instrument = instrument_for(reason, student["grade_at_referral"])
    max_score, cutoff, intake_range = INSTRUMENTS[instrument]
    intake_score = random.randint(*intake_range)
    lo, hi = OUTCOME_FACTOR[discharge_reason] if status == "Discharged" else (0.55, 0.9)
    final_factor = random.uniform(lo, hi)
    completed_dates = [a["scheduled_at"].date() for a in appointments if a["episode_id"] == episode_id and a["status"] == "Completed"]
    checkpoints = [i for i in range(0, len(completed_dates), 4)]
    if status == "Discharged" and completed_dates and (len(completed_dates) - 1) not in checkpoints:
        checkpoints.append(len(completed_dates) - 1)
    for idx, pos in enumerate(checkpoints):
        progress = pos / max(1, len(completed_dates) - 1) if status == "Discharged" else pos / max(1, len(completed_dates) + 2)
        factor = 1 - (1 - final_factor) * progress
        score = round(intake_score * factor * random.uniform(0.92, 1.08))
        score = max(0, min(max_score, score))
        if pos == 0:
            point = "Intake"
        elif status == "Discharged" and pos == len(completed_dates) - 1:
            point = "Discharge"
        else:
            point = "Progress Check"
        assess_seq += 1
        assessments.append({
            "assessment_id": f"M{assess_seq:06d}",
            "episode_id": episode_id,
            "student_id": student["student_id"],
            "administered_on": completed_dates[pos],
            "instrument": instrument,
            "assessment_point": point,
            "sequence": idx + 1,
            "score": score,
            "max_score": max_score,
            "clinical_cutoff": cutoff,
        })

    episodes.append({
        "episode_id": episode_id,
        "referral_id": referral["referral_id"],
        "student_id": student["student_id"],
        "school_id": school["school_id"],
        "district_id": school["district_id"],
        "clinician_id": clinician["care_team_member_id"],
        "program": program,
        "presenting_concern": reason,
        "tier": referral["tier"],
        "started_on": intake_date,
        "ended_on": ended_at,
        "status": status,
        "discharge_reason": discharge_reason if status == "Discharged" else None,
        "planned_sessions": planned,
    })


for school in schools:
    district = district_by_id[school["district_id"]]
    start = max(WINDOW_START, district["partnership_start_date"])
    for month in month_iter(start, AS_OF):
        month_end = min(AS_OF, date(month.year + (month.month // 12), month.month % 12 + 1, 1) - timedelta(days=1))
        expected = school["enrollment"] * ANNUAL_REFERRAL_RATE[school["school_level"]] / 12 * SEASONALITY[month.month]
        if school["is_title_i"]:
            expected *= 1.18
        if district["funding_model"] == "State Program":
            expected *= 1.08
        count = max(0, round(random.gauss(expected, max(0.6, expected * 0.3))))
        for _ in range(count):
            day_lo = max(month, start)
            if day_lo > month_end:
                continue
            referred_on = business_day(day_lo + timedelta(days=random.randint(0, (month_end - day_lo).days)))
            if referred_on > AS_OF:
                continue
            existing = students_by_school[school["school_id"]]
            if existing and random.random() < 0.17:
                student = random.choice(existing)
            else:
                student = new_student(school)
            if student["first_referral_date"] is None:
                student["first_referral_date"] = referred_on

            referral_seq += 1
            reason = weighted(REASONS)
            tier = "Tier 3" if random.random() < TIER3_REASONS.get(reason, 0.3) else "Tier 2"
            speed = access_speed_factor(referred_on)
            referred_at = schedule_time(referred_on)
            outreach_hours = random.uniform(1, 22) if random.random() < (0.86 + (1 - speed) * 0.2) else random.uniform(25, 96)
            outreach_at = referred_at + timedelta(hours=outreach_hours * speed)
            coordinator = pick_clinician(coordinators, district["state"], referred_on,
                                         None if student["primary_home_language"] in ("English", "Other") else student["primary_home_language"])
            outcome = weighted([("Intake Completed", 76), ("Declined by Family", 9), ("Unable to Reach", 12), ("Referred Out", 3)])
            consent_on = intake_on = None
            if (AS_OF - referred_on).days < 21 and random.random() < 0.5:
                status = "In Outreach"
            elif outcome == "Intake Completed":
                consent_on = business_day(outreach_at.date() + timedelta(days=int(random.triangular(0, 10, 2) * speed)))
                intake_on = business_day(consent_on + timedelta(days=int(random.triangular(1, 9, 4) * speed)))
                status = "Intake Completed" if intake_on <= AS_OF else "Intake Scheduled"
            else:
                status = outcome
            referrals.append({
                "referral_id": f"R{referral_seq:06d}",
                "student_id": student["student_id"],
                "school_id": school["school_id"],
                "district_id": school["district_id"],
                "care_coordinator_id": coordinator["care_team_member_id"],
                "referred_at": referred_at,
                "referral_source": weighted(REFERRAL_SOURCES),
                "referral_reason": reason,
                "tier": tier,
                "urgency": weighted([("Routine", 85), ("Priority", 15)]),
                "first_outreach_at": outreach_at if outreach_at <= datetime.combine(AS_OF, datetime.max.time()) else None,
                "consent_signed_on": consent_on,
                "intake_completed_on": intake_on if status == "Intake Completed" else None,
                "status": status,
                "is_re_referral": student["first_referral_date"] != referred_on,
            })
            if status == "Intake Completed":
                build_episode(referrals[-1], student, school, intake_on)

# ---------------------------------------------------------------------------
# Student terms (district SIS attendance and discipline extracts)
# ---------------------------------------------------------------------------
TERMS = []
for sy in range(2023, 2027):
    TERMS.append((f"Fall {sy}", date(sy, 8, 28), date(sy, 12, 20), 78))
    if sy < 2026:
        TERMS.append((f"Spring {sy + 1}", date(sy + 1, 1, 3), date(sy + 1, 6, 15), 102))

first_episode = {}
for e in episodes:
    if e["student_id"] not in first_episode or e["started_on"] < first_episode[e["student_id"]]:
        first_episode[e["student_id"]] = e["started_on"]
reason_by_student = {}
for r in referrals:
    reason_by_student.setdefault(r["student_id"], r["referral_reason"])

student_terms = []
for student in students:
    first_ref = student["first_referral_date"]
    care_start = first_episode.get(student["student_id"])
    reason = reason_by_student.get(student["student_id"], "Anxiety")
    base_absence = {
        "School Avoidance": random.uniform(0.17, 0.3), "Depression": random.uniform(0.09, 0.15),
        "Behavioral Concerns": random.uniform(0.07, 0.12),
    }.get(reason, random.uniform(0.045, 0.085))
    base_suspensions = 0.9 if reason == "Behavioral Concerns" else (0.25 if reason in ("Attention or Focus", "Family Stress") else 0.06)
    for term_name, t_start, t_end, days in TERMS:
        if t_start > AS_OF:
            continue
        prior_term_start = t_start - timedelta(days=200)
        if first_ref is None or first_ref > t_end + timedelta(days=200) or t_end < first_ref - timedelta(days=200):
            continue
        if t_end > AS_OF:
            days = max(20, (AS_OF - t_start).days * 5 // 7)
        in_care = care_start is not None and care_start <= t_start + timedelta(days=45)
        absence = base_absence
        suspension_rate = base_suspensions
        if in_care:
            terms_since = max(0, (t_start - care_start).days // 150)
            absence *= random.uniform(0.6, 0.8) if reason == "School Avoidance" else random.uniform(0.72, 0.92)
            absence *= max(0.75, 1 - 0.08 * terms_since)
            suspension_rate *= random.uniform(0.35, 0.6)
        days_absent = min(days, max(0, round(random.gauss(absence * days, 1.6))))
        suspensions = sum(1 for _ in range(3) if random.random() < suspension_rate / 3)
        student_terms.append({
            "student_term_id": f"{student['student_id']}-{term_name.replace(' ', '')}",
            "student_id": student["student_id"],
            "school_id": student["school_id"],
            "district_id": student["district_id"],
            "term": term_name,
            "school_year": f"{t_start.year if t_start.month >= 8 else t_start.year - 1}-{(t_start.year if t_start.month >= 8 else t_start.year - 1) + 1}",
            "term_start_date": t_start,
            "term_end_date": min(t_end, AS_OF),
            "days_enrolled": days,
            "days_absent": days_absent,
            "suspensions": suspensions,
            "office_referrals": suspensions * random.randint(1, 3) + (1 if random.random() < suspension_rate else 0),
        })

# ---------------------------------------------------------------------------
# Write seeds and schema.json
# ---------------------------------------------------------------------------
TABLES = {
    "raw_districts": (districts, {
        "district_id": "string", "district_name": "string", "state": "string", "funding_model": "string",
        "partnership_start_date": "date", "enrollment": "integer", "clinical_program_director": "string"}),
    "raw_schools": (schools, {
        "school_id": "string", "district_id": "string", "school_name": "string", "school_level": "string",
        "enrollment": "integer", "is_title_i": "boolean"}),
    "raw_care_team": (care_team, {
        "care_team_member_id": "string", "full_name": "string", "role": "string", "credential": "string",
        "languages": "string", "is_bilingual": "boolean", "licensed_states": "string", "hire_date": "date",
        "weekly_session_capacity": "integer", "employment_type": "string"}),
    "raw_students": (students, {
        "student_id": "string", "school_id": "string", "district_id": "string", "grade_at_referral": "string",
        "gender": "string", "primary_home_language": "string", "coverage_type": "string", "has_iep_or_504": "boolean",
        "first_referral_date": "date"}),
    "raw_referrals": (referrals, {
        "referral_id": "string", "student_id": "string", "school_id": "string", "district_id": "string",
        "care_coordinator_id": "string", "referred_at": "timestamp", "referral_source": "string",
        "referral_reason": "string", "tier": "string", "urgency": "string", "first_outreach_at": "timestamp",
        "consent_signed_on": "date", "intake_completed_on": "date", "status": "string", "is_re_referral": "boolean"}),
    "raw_care_episodes": (episodes, {
        "episode_id": "string", "referral_id": "string", "student_id": "string", "school_id": "string",
        "district_id": "string", "clinician_id": "string", "program": "string", "presenting_concern": "string",
        "tier": "string", "started_on": "date", "ended_on": "date", "status": "string", "discharge_reason": "string",
        "planned_sessions": "integer"}),
    "raw_appointments": (appointments, {
        "appointment_id": "string", "episode_id": "string", "student_id": "string", "school_id": "string",
        "district_id": "string", "clinician_id": "string", "scheduled_at": "timestamp", "appointment_type": "string",
        "program": "string", "modality": "string", "status": "string", "duration_minutes": "integer",
        "is_during_school_day": "boolean"}),
    "raw_outcome_assessments": (assessments, {
        "assessment_id": "string", "episode_id": "string", "student_id": "string", "administered_on": "date",
        "instrument": "string", "assessment_point": "string", "sequence": "integer", "score": "integer",
        "max_score": "integer", "clinical_cutoff": "integer"}),
    "raw_student_terms": (student_terms, {
        "student_term_id": "string", "student_id": "string", "school_id": "string", "district_id": "string",
        "term": "string", "school_year": "string", "term_start_date": "date", "term_end_date": "date",
        "days_enrolled": "integer", "days_absent": "integer", "suspensions": "integer", "office_referrals": "integer"}),
}

DESCRIPTIONS = {
    "raw_districts": "Partner school districts with funding model and partnership start date.",
    "raw_schools": "Schools within partner districts with level and enrollment.",
    "raw_care_team": "Cartwheel clinicians and care coordinators with credentials, languages, and licensure.",
    "raw_students": "De-identified students referred to Cartwheel, one row per student.",
    "raw_referrals": "Portal referrals from school staff with outreach, consent, and intake milestones.",
    "raw_care_episodes": "Episodes of care by program from intake to discharge.",
    "raw_appointments": "Scheduled virtual appointments with attendance status.",
    "raw_outcome_assessments": "Measurement-based care scores at intake, progress checks, and discharge.",
    "raw_student_terms": "District SIS attendance and discipline per referred student per term.",
}


def fmt(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.isoformat()
    return value


SEED_DIR.mkdir(exist_ok=True)
schema = {"company": "Cartwheel Care", "as_of": AS_OF.isoformat(), "seed": SEED, "tables": []}
for table_name, (rows, columns) in TABLES.items():
    path = SEED_DIR / f"{table_name}.csv"
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(columns))
        writer.writeheader()
        for row in rows:
            writer.writerow({k: fmt(row[k]) for k in columns})
    schema["tables"].append({
        "name": table_name,
        "description": DESCRIPTIONS[table_name],
        "row_count": len(rows),
        "columns": [{"name": name, "type": col_type} for name, col_type in columns.items()],
    })
    print(f"{table_name:28s} {len(rows):>7,d} rows")

(PROJECT_DIR / "schema.json").write_text(json.dumps(schema, indent=2) + "\n")
print(f"\nschema.json written; as of {AS_OF}")
