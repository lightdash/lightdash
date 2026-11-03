with terms as (
    select * from {{ ref('stg_student_terms') }}
),
episodes as (
    select student_id, started_on, ended_on
    from {{ ref('stg_care_episodes') }}
),
care_status as (
    select
        terms.student_term_id,
        count(*) filter (where episodes.started_on <= terms.term_end_date
            and coalesce(episodes.ended_on, cast('{{ var("as_of_date") }}' as date)) >= terms.term_start_date) as overlapping_episodes,
        count(*) filter (where coalesce(episodes.ended_on, cast('{{ var("as_of_date") }}' as date)) < terms.term_start_date) as prior_episodes
    from terms
    left join episodes using (student_id)
    group by terms.student_term_id
)
select
    terms.student_term_id,
    terms.student_id,
    terms.school_id,
    terms.district_id,
    terms.term,
    terms.school_year,
    terms.term_start_date,
    terms.term_end_date,
    terms.days_enrolled,
    terms.days_absent,
    terms.suspensions,
    terms.office_referrals,
    cast(terms.days_absent as double precision) / nullif(terms.days_enrolled, 0) as absence_rate,
    cast(terms.days_absent as double precision) / nullif(terms.days_enrolled, 0) >= 0.1 as is_chronically_absent,
    terms.suspensions > 0 as was_suspended,
    case
        when care_status.overlapping_episodes > 0 then 'In Care'
        when care_status.prior_episodes > 0 then 'After Care'
        else 'Before Care'
    end as care_status_in_term
from terms
left join care_status using (student_term_id)
