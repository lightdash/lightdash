with students as (
    select * from {{ ref('stg_students') }}
),
referrals as (
    select student_id, count(*) as referral_count
    from {{ ref('stg_referrals') }}
    group by student_id
),
episodes as (
    select
        student_id,
        count(*) as episode_count,
        min(started_on) as first_episode_started_on,
        count(*) filter (where status = 'Active') as active_episode_count
    from {{ ref('stg_care_episodes') }}
    group by student_id
)
select
    students.student_id,
    students.school_id,
    students.district_id,
    students.grade_at_referral,
    case
        when students.grade_at_referral in ('K', '1', '2', '3', '4', '5') then 'Elementary'
        when students.grade_at_referral in ('6', '7', '8') then 'Middle'
        else 'High'
    end as grade_band,
    students.gender,
    students.primary_home_language,
    students.primary_home_language != 'English' as is_multilingual_household,
    students.coverage_type,
    students.has_iep_or_504,
    students.first_referral_date,
    coalesce(referrals.referral_count, 0) as referral_count,
    coalesce(episodes.episode_count, 0) as episode_count,
    coalesce(episodes.active_episode_count, 0) > 0 as is_in_active_care,
    episodes.first_episode_started_on,
    episodes.episode_count is not null as received_care
from students
left join referrals using (student_id)
left join episodes using (student_id)
