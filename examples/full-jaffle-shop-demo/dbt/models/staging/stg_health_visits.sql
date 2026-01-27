with source as (
    select * from {{ ref('raw_health_visits') }}
),

visits as (
    select
        visit_id,
        patient_id,
        {{ cast_date('visit_date') }} as visit_date,
        visit_type,
        provider,
        chief_complaint,
        duration_minutes,
        {{ cast_boolean('follow_up_required') }} as follow_up_required,
        {{ cast_numeric('visit_cost') }} as visit_cost
    from source
)

select * from visits
