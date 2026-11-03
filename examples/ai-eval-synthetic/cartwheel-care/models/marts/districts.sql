with districts as (
    select * from {{ ref('stg_districts') }}
),
served as (
    select
        district_id,
        count(distinct student_id) as students_served,
        count(distinct school_id) as schools_with_referrals
    from {{ ref('stg_referrals') }}
    group by district_id
)
select
    districts.district_id,
    districts.district_name,
    districts.state,
    districts.funding_model,
    districts.partnership_start_date,
    districts.enrollment,
    districts.clinical_program_director,
    coalesce(served.students_served, 0) as students_referred,
    coalesce(served.schools_with_referrals, 0) as schools_with_referrals,
    cast((extract(year from cast('{{ var("as_of_date") }}' as date)) - extract(year from districts.partnership_start_date)) * 12
        + extract(month from cast('{{ var("as_of_date") }}' as date)) - extract(month from districts.partnership_start_date) as integer) as partnership_months
from districts
left join served using (district_id)
