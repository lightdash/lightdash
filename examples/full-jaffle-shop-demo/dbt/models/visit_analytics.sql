with visits as (
    select * from {{ ref('stg_health_visits') }}
),

patients as (
    select * from {{ ref('stg_patients') }}
),

vitals as (
    select * from {{ ref('stg_health_vitals') }}
),

conditions as (
    select * from {{ ref('stg_health_conditions') }}
),

visit_conditions as (
    -- Get conditions active at time of visit
    select
        v.visit_id,
        count(distinct c.condition_id) as active_conditions,
        count(distinct case when c.chronic then c.condition_id end) as active_chronic_conditions,
        string_agg(distinct c.condition_category, ', ') as condition_categories
    from visits v
    left join conditions c 
        on v.patient_id = c.patient_id 
        and c.diagnosis_date <= v.visit_date
    group by v.visit_id
),

visit_metrics as (
    select
        v.visit_id,
        v.patient_id,
        v.visit_date,
        v.visit_type,
        v.provider,
        v.chief_complaint,
        v.duration_minutes,
        v.follow_up_required,
        v.visit_cost,
        
        -- Patient info
        p.full_name as patient_name,
        p.age as patient_age,
        p.health_plan,
        p.risk_category,
        
        -- Visit timing
        extract(year from v.visit_date) as visit_year,
        extract(quarter from v.visit_date) as visit_quarter,
        extract(month from v.visit_date) as visit_month,
        to_char(v.visit_date, 'Day') as visit_day_of_week,
        
        -- Vital signs from visit
        vit.blood_pressure_systolic,
        vit.blood_pressure_diastolic,
        vit.blood_pressure_category,
        vit.heart_rate,
        vit.temperature,
        vit.bmi,
        vit.bmi_category,
        vit.oxygen_saturation,
        vit.glucose_level,
        
        -- Conditions at visit time
        vc.active_conditions,
        vc.active_chronic_conditions,
        vc.condition_categories,
        
        -- Visit patterns
        lag(v.visit_date) over (partition by v.patient_id order by v.visit_date) as previous_visit_date,
        v.visit_date - lag(v.visit_date) over (partition by v.patient_id order by v.visit_date) as days_since_last_visit,
        
        -- Cost analysis
        case v.visit_type
            when 'Emergency' then 'High Cost'
            when 'Chronic Management' then 'Medium Cost'
            when 'Annual Checkup' then 'Low Cost'
            when 'Wellness Visit' then 'Low Cost'
            when 'Telemedicine' then 'Low Cost'
            else 'Medium Cost'
        end as visit_cost_category,
        
        -- Efficiency metrics
        v.visit_cost / nullif(v.duration_minutes, 0) as cost_per_minute,
        case 
            when v.visit_type = 'Telemedicine' then 'Virtual'
            else 'In-Person'
        end as visit_modality
        
    from visits v
    join patients p on v.patient_id = p.patient_id
    left join vitals vit on v.visit_id = vit.visit_id
    left join visit_conditions vc on v.visit_id = vc.visit_id
)

select * from visit_metrics