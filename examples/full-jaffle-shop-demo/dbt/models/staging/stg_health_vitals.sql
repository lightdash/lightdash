with source as (
    select * from {{ ref('raw_health_vitals') }}
),

vitals as (
    select
        vital_id,
        patient_id,
        visit_id,
        measurement_date::date as measurement_date,
        blood_pressure_systolic,
        blood_pressure_diastolic,
        heart_rate,
        temperature,
        weight_kg,
        height_cm,
        bmi,
        oxygen_saturation,
        glucose_level,
        -- BP categories
        case
            when blood_pressure_systolic < 120 and blood_pressure_diastolic < 80 then 'Normal'
            when blood_pressure_systolic between 120 and 129 and blood_pressure_diastolic < 80 then 'Elevated'
            when blood_pressure_systolic between 130 and 139 or blood_pressure_diastolic between 80 and 89 then 'Stage 1 Hypertension'
            when blood_pressure_systolic >= 140 or blood_pressure_diastolic >= 90 then 'Stage 2 Hypertension'
            else 'Unknown'
        end as blood_pressure_category,
        -- BMI categories
        case
            when bmi < 18.5 then 'Underweight'
            when bmi between 18.5 and 24.9 then 'Normal'
            when bmi between 25 and 29.9 then 'Overweight'
            when bmi >= 30 then 'Obese'
            else 'Unknown'
        end as bmi_category
    from source
)

select * from vitals