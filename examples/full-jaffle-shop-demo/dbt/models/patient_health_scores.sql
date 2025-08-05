with patients as (
    select * from {{ ref('stg_patients') }}
),

visits as (
    select * from {{ ref('stg_health_visits') }}
),

conditions as (
    select * from {{ ref('stg_health_conditions') }}
),

latest_vitals as (
    select distinct on (patient_id)
        patient_id,
        blood_pressure_systolic,
        blood_pressure_diastolic,
        blood_pressure_category,
        bmi,
        bmi_category,
        glucose_level,
        measurement_date
    from {{ ref('stg_health_vitals') }}
    order by patient_id, measurement_date desc
),

patient_conditions as (
    select
        patient_id,
        count(*) as total_conditions,
        count(case when chronic then 1 end) as chronic_conditions,
        count(case when severity = 'Severe' then 1 end) as severe_conditions,
        count(case when managed then 1 end) as managed_conditions,
        string_agg(distinct condition_category, ', ') as condition_categories
    from conditions
    group by patient_id
),

patient_visits as (
    select
        patient_id,
        count(*) as total_visits,
        count(case when visit_type = 'Emergency' then 1 end) as emergency_visits,
        count(case when visit_type = 'Chronic Management' then 1 end) as chronic_management_visits,
        count(case when follow_up_required then 1 end) as visits_requiring_followup,
        max(visit_date) as last_visit_date,
        avg(visit_cost) as avg_visit_cost,
        sum(visit_cost) as total_visit_cost
    from visits
    group by patient_id
),

health_scores as (
    select
        p.patient_id,
        p.full_name,
        p.age,
        p.health_plan,
        p.risk_category,
        p.primary_care_provider,
        
        -- Visit metrics
        coalesce(pv.total_visits, 0) as total_visits,
        coalesce(pv.emergency_visits, 0) as emergency_visits,
        coalesce(pv.chronic_management_visits, 0) as chronic_management_visits,
        pv.last_visit_date,
        current_date - pv.last_visit_date as days_since_last_visit,
        
        -- Condition metrics
        coalesce(pc.total_conditions, 0) as total_conditions,
        coalesce(pc.chronic_conditions, 0) as chronic_conditions,
        coalesce(pc.severe_conditions, 0) as severe_conditions,
        pc.condition_categories,
        
        -- Vital metrics
        lv.blood_pressure_category,
        lv.bmi_category,
        lv.glucose_level,
        
        -- Risk scoring (0-100, higher is worse)
        least(100, greatest(0,
            -- Base score from risk category
            case p.risk_category
                when 'Low' then 20
                when 'Medium' then 50
                when 'High' then 80
            end +
            -- Adjust for conditions
            (coalesce(pc.chronic_conditions, 0) * 5) +
            (coalesce(pc.severe_conditions, 0) * 10) +
            -- Adjust for emergency visits
            (coalesce(pv.emergency_visits, 0) * 8) +
            -- Adjust for vitals
            case lv.blood_pressure_category
                when 'Normal' then 0
                when 'Elevated' then 5
                when 'Stage 1 Hypertension' then 10
                when 'Stage 2 Hypertension' then 15
                else 0
            end +
            case lv.bmi_category
                when 'Normal' then 0
                when 'Underweight' then 5
                when 'Overweight' then 5
                when 'Obese' then 10
                else 0
            end
        )) as health_risk_score,
        
        -- Engagement score (0-100, higher is better)
        least(100, greatest(0,
            -- Base engagement
            50 +
            -- Regular visits (not too many, not too few)
            case 
                when pv.total_visits between 2 and 6 then 20
                when pv.total_visits between 7 and 12 then 10
                else 0
            end +
            -- Managed conditions
            case 
                when pc.chronic_conditions > 0 
                then (pc.managed_conditions::numeric / pc.chronic_conditions * 30)
                else 30
            end -
            -- Penalty for missed follow-ups (days since last visit if follow-up required)
            case 
                when pv.visits_requiring_followup > 0 and (current_date - pv.last_visit_date) > 60 
                then 20
                else 0
            end
        )) as engagement_score,
        
        -- Cost metrics
        pv.total_visit_cost,
        pv.avg_visit_cost
        
    from patients p
    left join patient_visits pv on p.patient_id = pv.patient_id
    left join patient_conditions pc on p.patient_id = pc.patient_id
    left join latest_vitals lv on p.patient_id = lv.patient_id
)

select * from health_scores