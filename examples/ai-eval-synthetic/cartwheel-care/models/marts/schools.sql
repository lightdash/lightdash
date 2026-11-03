with schools as (
    select * from {{ ref('stg_schools') }}
),
referred as (
    select school_id, count(distinct student_id) as students_referred
    from {{ ref('stg_referrals') }}
    group by school_id
),
served as (
    select school_id, count(distinct student_id) as students_served
    from {{ ref('stg_care_episodes') }}
    group by school_id
)
select
    schools.school_id,
    schools.district_id,
    schools.school_name,
    schools.school_level,
    schools.enrollment,
    schools.is_title_i,
    coalesce(referred.students_referred, 0) as students_referred,
    coalesce(served.students_served, 0) as students_served
from schools
left join referred using (school_id)
left join served using (school_id)
