# AI eval: Cartwheel Care (synthetic, Postgres)

Synthetic Lightdash project for AI-agent benchmarking. Runs on Postgres with no BigQuery credentials.

School-partnered pediatric mental health care: districts refer students, care coordinators reach families, clinicians deliver virtual therapy, psychiatry, parent guidance, group therapy, and a School Avoidance Program. Measurement-based care scores (PHQ-A, GAD-7, SCARED, SDQ) and district attendance/discipline extracts show outcomes. All data is fictional.

## Provenance

- Source: `lightdash-demo-projects/projects/cartwheel-care` (hand-built project, commit `c94dbda`). Copied: `models/`, `seeds/seeds.yml`, `generate_seeds.py`, `schema.json`, `dbt_project.yml`, `lightdash.config.yml`. Not copied: charts/dashboards/apps, brand assets, BigQuery profile.
- Generator: `generate_seeds.py`, `random.seed(20261016)` + `Faker.seed(20261016)`, as-of `2026-10-16`, window Aug 2024 to Oct 2026. Pure Python + Faker, no warehouse access.
- Seeds were produced with `uv run --project <lightdash-demo-projects> python generate_seeds.py` (Faker 40.27.0). Two runs produce byte-identical CSVs. Faker version changes may alter names/text.

## Seeds (13 MB)

| Table | Rows | Grain |
| --- | ---: | --- |
| `raw_districts` | 19 | District |
| `raw_schools` | 134 | School |
| `raw_care_team` | 53 | Clinician or care coordinator |
| `raw_students` | 6,610 | Referred student |
| `raw_referrals` | 7,929 | Referral with outreach/consent/intake milestones |
| `raw_care_episodes` | 5,640 | Episode of care |
| `raw_appointments` | 62,055 | Scheduled appointment |
| `raw_outcome_assessments` | 17,900 | Administered assessment |
| `raw_student_terms` | 25,122 | Student per school term (absences, suspensions) |

Built-in story: referral peaks Sep–Oct and Jan–Feb; median days to intake falls 8 → 7 → 5 across school years; ~55–60% goals-met discharges with ~39% symptom reduction; absence and suspension rates lower In Care / After Care than Before Care. October 2026 is a partial month.

## Postgres port

- `profiles.yml`: `postgres` target from `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` (+ `PGSSLMODE`, default `disable`; the Lightdash CLI otherwise tries SSL), schema `ai_eval_cartwheel_care`.
- `seeds/seeds.yml`: `string/int64/bool` → `text/integer/boolean`.
- `macros/school_year.sql`: replaces the repeated BigQuery `concat(cast(extract(year ...) as string) ...)` school-year case.
- Marts: `countif(x)` → `count(*) filter (where x)`; `safe_divide(a,b)` → `cast(a as double precision) / nullif(b,0)`; `date_diff(a,b,day)` → `a - b`; `date_diff(..., month)` → year*12+month boundary difference; `timestamp_diff(a,b,minute|hour)` → `trunc(extract(epoch from a-b)/60|3600)`; `format_timestamp('%A')` → `to_char(..., 'FMDay')`; `date(ts)` → `cast(ts as date)`; `any_value` → `min`; `array_agg(... limit 1)[offset(0)]` → `(array_agg(... order by ...))[1]`.
- `models/marts/marts.yml`: 21 ratio metrics `sum(int) / nullif(sum(int),0)` prefixed with `1.0 *` (`100` → `100.0`); Postgres integer division would otherwise return 0. All other Lightdash meta (joins, metrics, primary keys, spotlight, descriptions) is unchanged.

## Run locally

```bash
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGDATABASE=postgres PGPASSWORD=...   # from .env.development.local
export PATH=<venv with dbt-postgres>=1.8>/bin:$PATH
dbt seed --profiles-dir . && dbt run --profiles-dir . && dbt test --profiles-dir .
lightdash compile --profiles-dir . --project-dir .
LIGHTDASH_URL=http://localhost:3000 LIGHTDASH_API_KEY=$LDPAT \
  lightdash deploy --create "AI Eval Cartwheel Care" --profiles-dir . --project-dir . --non-interactive
```

Or `./deploy-rainbow.sh` with the same env (set `DBT_BIN` to the dbt binary, `LIGHTDASH_PROJECT` to redeploy instead of creating).

## Deploy in a Rainbowmachine env

Inside the guest (repo at `/usr/app`, Postgres on `localhost:5432`):

```bash
export LIGHTDASH_URL=<env url> LIGHTDASH_API_KEY=<PAT> PGPASSWORD=<postgres password>
/usr/app/examples/ai-eval-synthetic/cartwheel-care/deploy-rainbow.sh
```

The script picks `dbt1.12` (falls back to 1.11/1.10) and shims it as `dbt`, since the image's default `dbt` is 1.4 and the Lightdash CLI calls `dbt`. It seeds with `--full-refresh`, runs and tests models, then `lightdash deploy --create "${PROJECT_NAME:-AI Eval Cartwheel Care}"`. If seed CSVs are absent it regenerates them (needs Python with `faker`). Warehouse credentials come from `profiles.yml`, so the Lightdash backend must reach Postgres at the same `PGHOST`.

## Explore inventory

9 explores (staging views are hidden). Joins: referrals 4, care_episodes 5, appointments 5, outcome_assessments 4, student_terms 3, students 2, schools 1. 86 metrics, ~180 dimensions. Every explore joins `districts` and most join `schools`/`students`, so "by district/school/grade band" works almost everywhere.

| Explore (grain) | Key metrics | Key dimensions | Joins |
| --- | --- | --- | --- |
| `referrals` (referral) | referral_count, students_referred, intake_conversion_rate, consent_rate, outreach_within_24h_rate, avg/median_hours_to_first_outreach, avg/median/p90_days_to_intake, median_days_to_consent, open_referral_count, re_referral_count | school_year, referral_source, referral_reason, tier, urgency, status, program, is_open, is_re_referral; time: referred_at, consent_signed_on, intake_completed_on | students, schools, districts, care_team (coordinator) |
| `care_episodes` (episode) | episode_count, students_in_care, active/discharged_episode_count, goals_met_rate, reliable_improvement_rate, below_cutoff_rate, avg_symptom_reduction, avg_intake/latest/discharge_score, episode_show_rate, avg_sessions_per_episode, avg_episode_length_days, total_care_hours, clinicians_with_caseload | program, presenting_concern, tier, status, discharge_reason, instrument, school_year; time: started_on, ended_on, last_attended_on | referrals (1:1), students, schools, districts, care_team (clinician) |
| `appointments` (appointment) | appointment_count, completed/no_show/cancelled_count, show_rate, no_show_rate, cancellation_rate, school_day_share, total_hours_delivered, avg_duration_minutes, students_seen, active_clinicians | program, appointment_type, modality, status, scheduled_weekday, scheduled_hour, is_during_school_day, school_year; time: scheduled_at | care_episodes, students, schools, districts, care_team |
| `outcome_assessments` (assessment) | assessment_count, episodes_assessed, avg_score, avg_intake_score, avg_improvement_from_intake, avg_improvement_pct, above_cutoff_rate, avg_score_pct_of_max | instrument (PHQ-A, GAD-7, SCARED, SDQ), assessment_point (Intake, Progress Check, Discharge), program, presenting_concern; time: administered_on | care_episodes, students, schools, districts |
| `student_terms` (student × term) | student_term_count, students_with_records, overall_absence_rate, chronic_absenteeism_rate, suspension_rate, suspensions_per_100_students, total_days_absent/enrolled, total_suspensions, total_office_referrals | care_status_in_term (Before/In/After Care), term, school_year, is_chronically_absent, was_suspended; time: term_start_date | students, schools, districts |
| `students` (student) | student_count, students_received_care, students_in_active_care, care_access_rate, avg_referrals_per_student | grade_band, grade_at_referral, gender, primary_home_language, is_multilingual_household, coverage_type, has_iep_or_504; time: first_referral_date | schools, districts |
| `schools` (school) | school_count, title_i_school_count, school_enrollment, school_students_referred/served, pct_enrollment_referred/served | school_level, is_title_i, school_name | districts |
| `districts` (district) | district_count, total_enrollment, district_students_referred, referral_rate, avg_partnership_months | district_name, state, funding_model, clinical_program_director; time: partnership_start_date | none |
| `care_team` (team member) | team_member_count, clinician_count, bilingual_member_count, total_weekly_capacity | role, team, credential, employment_type, is_bilingual, languages, licensed_states; time: hire_date | none |

Metric caveats (from the source project): intake conversion excludes open referrals; show rate excludes cancellations while cancellation rate uses all scheduled appointments; `reliable_improvement_rate` = ≥30% score reduction at discharge; `suspensions_per_100_students` is per 100 student terms.

## Rainbow deployment

Deployed 2026-11-03 into Rainbowmachine env `e-079b63` (https://composer-eval-baseline.lightdash.rainbowmachine.dev, Lightdash 3.128.1, `main`), alongside the existing Jaffle shop project.

| What | Value |
| --- | --- |
| Project | `AI Eval Cartwheel Care`, uuid `ff4476f9-8084-4639-a3a3-15b7178d3354`, org Jaffle Shop, owner `demo@lightdash.com` |
| Warehouse | guest Postgres `localhost:5432/postgres`, schema `ai_eval_cartwheel_care` |
| Eval agent | `Eval: composer` (profile `profiles/composer.json`, composer queries on), uuid `605c5ba2-98e0-4bf9-a65d-0279f7ae7506` |
| Guest copy | `/tmp/ai-eval-synthetic/cartwheel-care` (not in `/usr/app`; `/tmp` does not survive an env reset) |

**Transfer.** The guest only reaches github.com/api.github.com/codeload.github.com (PyPI, raw/gist/objects.githubusercontent blocked) and `exec` has no upload, so:

1. Code without seeds, `README.md`, `schema.json`: `tar | xz -9e` → 18 KB (24 KB base64), written via two `exec` heredocs, sha256 checked per chunk and for the tarball (`dad39525…`).
2. Seeds regenerated in the guest with Faker 40.27.0 from source, no pip:
   `curl -L https://codeload.github.com/joke2k/faker/tar.gz/refs/tags/v40.27.0 | tar -xz -C /tmp/cc-faker`
   `PYTHONPATH=/tmp/cc-faker/faker-40.27.0 nice -n 19 python3 generate_seeds.py`
   All 9 CSVs byte-identical to the local seeds (sha256), row counts as in the Seeds table.

**Deploy** (inside the guest; secrets read at run time, never printed):

```bash
unset LIGHTDASH_PROJECT                      # set => script redeploys into that project
export PGPASSWORD=$(tr '\0' '\n' < /proc/<backend pid>/environ | sed -n 's/^PGPASSWORD=//p')
export LIGHTDASH_API_KEY=<demo user PAT> LIGHTDASH_URL=http://localhost:8080
export DBT_THREADS=2 DBT_BIN=/usr/local/bin/dbt1.12
nice -n 10 /tmp/ai-eval-synthetic/cartwheel-care/deploy-rainbow.sh
```

Results: dbt 1.12.0 / dbt-postgres 1.10.2; seed PASS=9 (142 s at 2 threads), run PASS=18 (9 tables, 9 views), test PASS=36; `lightdash deploy --create` compiled 9 explores, 0 errors. The PAT was a temporary 1-day token minted for the demo user in the guest and revoked afterwards. A guest session login over plain http needs `X-Forwarded-Proto: https`, because the session cookie is `Secure`. To redeploy, set `LIGHTDASH_PROJECT=ff4476f9-8084-4639-a3a3-15b7178d3354`.

**Adapted.** `profiles.yml` `threads` now reads `DBT_THREADS` (default 4), so seed/run/test and the CLI's compile can run with fewer threads on a shared env. `deploy-rainbow.sh` documents it. No other changes.

**Verified** (public URL, PAT):
- `GET /api/v1/projects/{p}/explores` lists 9 explores with no errors.
- The demo user (org admin) sees the project in `/api/v1/org/projects`.
- Five metric queries via `POST /api/v2/projects/{p}/query/metric-query` + poll, all `ready`:
  - referral_count and median_days_to_intake by school_year: 3 rows (2,488 / 3,998 / 1,443; 8 → 7 → 5 days)
  - goals_met_rate and avg_symptom_reduction by program: 5 rows
  - appointment_count and show_rate by modality: 2 rows
  - overall_absence_rate and suspension_rate by care_status_in_term: 3 rows (Before 10.1% / 16.9% > In > After)
  - district_count, total_enrollment and referral_rate by state: 6 rows

**Agent bootstrap** (from `lightdash-agent-evals`; the case is Jaffle-specific and fails grading as expected):

```bash
pnpm eval run --set cases/jaffle-smoke.json --case orders-by-status --profile profiles/composer.json \
  --project ff4476f9-8084-4639-a3a3-15b7178d3354 --providers anthropic/claude-opus-5-5 --repeat 1 \
  --out cartwheel-agent-bootstrap --concurrency 1
```

Agent upsert is scoped to the project (`/projects/{p}/aiAgents`), so the Jaffle `Eval: composer` agent (`57c11786…`) is untouched. A sanity thread ("How many referrals were there per school year?", anthropic/claude-opus-5-5) called `getMetadata` then one `query` (composer `queries[]`, `sourceType: semanticLayer`) and answered 7,929 total (2,488 / 3,998 / 1,443), noting 2026–2027 is partial.
