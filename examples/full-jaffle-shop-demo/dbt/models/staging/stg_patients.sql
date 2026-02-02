with source as (
    select * from {{ ref('raw_patients') }}
),

patients as (
    select
        patient_id,
        first_name,
        last_name,
        first_name || ' ' || last_name as full_name,
        date_of_birth,
        {{ age_years('date_of_birth') }} as age,
        email,
        phone,
        {{ cast_date('registration_date') }} as registration_date,
        health_plan,
        risk_category,
        primary_care_provider
    from source
)

select * from patients
