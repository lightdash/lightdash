with assessments as (
    select * from {{ ref('stg_outcome_assessments') }}
),
intake as (
    select episode_id, score as intake_score
    from assessments
    where assessment_point = 'Intake'
),
episodes as (
    select episode_id, program, presenting_concern, clinician_id, school_id, district_id
    from {{ ref('stg_care_episodes') }}
)
select
    assessments.assessment_id,
    assessments.episode_id,
    assessments.student_id,
    episodes.school_id,
    episodes.district_id,
    episodes.clinician_id,
    episodes.program,
    episodes.presenting_concern,
    assessments.administered_on,
    assessments.instrument,
    assessments.assessment_point,
    assessments.sequence,
    assessments.score,
    assessments.max_score,
    assessments.clinical_cutoff,
    intake.intake_score,
    cast(assessments.score as double precision) / nullif(assessments.max_score, 0) as score_pct_of_max,
    assessments.score >= assessments.clinical_cutoff as is_above_clinical_cutoff,
    intake.intake_score - assessments.score as improvement_from_intake,
    cast(intake.intake_score - assessments.score as double precision) / nullif(intake.intake_score, 0) as improvement_pct_from_intake
from assessments
left join intake using (episode_id)
left join episodes using (episode_id)
