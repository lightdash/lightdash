with source as (
    select * from {{ ref('raw_health_conditions') }}
),

conditions as (
    select
        condition_id,
        patient_id,
        diagnosis_date::date as diagnosis_date,
        icd10_code,
        condition_name,
        severity,
        chronic::boolean as chronic,
        managed::boolean as managed,
        -- Extract condition categories from ICD10 codes
        case
            when icd10_code like 'E%' then 'Endocrine/Metabolic'
            when icd10_code like 'I%' then 'Cardiovascular'
            when icd10_code like 'J%' then 'Respiratory'
            when icd10_code like 'M%' then 'Musculoskeletal'
            when icd10_code like 'F%' then 'Mental Health'
            when icd10_code like 'K%' then 'Digestive'
            when icd10_code like 'N%' then 'Genitourinary'
            when icd10_code like 'G%' then 'Nervous System'
            when icd10_code like 'D%' then 'Blood/Immune'
            when icd10_code like 'L%' then 'Skin'
            else 'Other'
        end as condition_category
    from source
)

select * from conditions