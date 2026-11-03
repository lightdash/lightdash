with episodes as (
    select * from {{ ref('stg_care_episodes') }}
),
appointments as (
    select
        episode_id,
        count(*) as appointments_scheduled,
        count(*) filter (where status = 'Completed') as sessions_completed,
        count(*) filter (where status = 'No Show') as no_shows,
        count(*) filter (where status like 'Cancelled%') as cancellations,
        sum(case when status = 'Completed' then duration_minutes else 0 end) / 60.0 as care_hours_delivered,
        max(case when status = 'Completed' then cast(scheduled_at as date) end) as last_attended_on
    from {{ ref('stg_appointments') }}
    group by episode_id
),
assessments as (
    select
        episode_id,
        min(instrument) as instrument,
        min(clinical_cutoff) as clinical_cutoff,
        max(case when assessment_point = 'Intake' then score end) as intake_score,
        max(case when assessment_point = 'Discharge' then score end) as discharge_score,
        (array_agg(score order by sequence desc))[1] as latest_score,
        count(*) as assessment_count
    from {{ ref('stg_outcome_assessments') }}
    group by episode_id
)
select
    episodes.episode_id,
    episodes.referral_id,
    episodes.student_id,
    episodes.school_id,
    episodes.district_id,
    episodes.clinician_id,
    episodes.program,
    episodes.presenting_concern,
    episodes.tier,
    episodes.status,
    episodes.discharge_reason,
    episodes.started_on,
    episodes.ended_on,
    {{ school_year('episodes.started_on') }} as school_year,
    episodes.planned_sessions,
    coalesce(episodes.ended_on, cast('{{ var("as_of_date") }}' as date)) - episodes.started_on as episode_length_days,
    coalesce(appointments.appointments_scheduled, 0) as appointments_scheduled,
    coalesce(appointments.sessions_completed, 0) as sessions_completed,
    coalesce(appointments.no_shows, 0) as no_shows,
    coalesce(appointments.cancellations, 0) as cancellations,
    coalesce(appointments.care_hours_delivered, 0) as care_hours_delivered,
    appointments.last_attended_on,
    assessments.instrument,
    assessments.clinical_cutoff,
    assessments.intake_score,
    assessments.latest_score,
    assessments.discharge_score,
    coalesce(assessments.assessment_count, 0) as assessment_count,
    cast(assessments.intake_score - assessments.latest_score as double precision) / nullif(assessments.intake_score, 0) as symptom_reduction_pct,
    assessments.intake_score >= assessments.clinical_cutoff as above_cutoff_at_intake,
    assessments.latest_score < assessments.clinical_cutoff as below_cutoff_at_latest,
    assessments.intake_score >= assessments.clinical_cutoff
        and assessments.latest_score < assessments.clinical_cutoff as moved_below_clinical_cutoff,
    episodes.status = 'Discharged'
        and cast(assessments.intake_score - assessments.discharge_score as double precision) / nullif(assessments.intake_score, 0) >= 0.3 as achieved_reliable_improvement,
    episodes.discharge_reason = 'Goals Met' as completed_with_goals_met
from episodes
left join appointments using (episode_id)
left join assessments using (episode_id)
