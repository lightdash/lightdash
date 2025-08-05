with source as (
    select * from {{ ref('raw_health_visits') }}
),

visits as (
    select
        visit_id,
        patient_id,
        visit_date::date as visit_date,
        visit_type,
        provider,
        chief_complaint,
        duration_minutes,
        follow_up_required::boolean as follow_up_required,
        visit_cost::numeric as visit_cost
    from source
)

select * from visits