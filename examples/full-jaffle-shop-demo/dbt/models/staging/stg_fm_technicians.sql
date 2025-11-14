with source as (

    {#-
    Normally we would select from the table here, but we are using seeds to load
    our data in this project
    #}
    select * from {{ ref('raw_technicians') }}

),

renamed as (

    select
        technician_id,
        employee_id,
        first_name,
        last_name,
        email,
        phone,
        hire_date::date as hire_date,
        employment_status,
        employment_type,
        department,
        job_title,
        seniority_level,
        supervisor_id::integer as supervisor_id,
        base_salary::numeric as base_salary,
        hourly_rate::numeric as hourly_rate,
        overtime_rate::numeric as overtime_rate,
        primary_trade,
        secondary_trade,
        specialization,
        certification_hvac::boolean as certification_hvac,
        certification_electrical::boolean as certification_electrical,
        certification_plumbing::boolean as certification_plumbing,
        certification_fire_safety::boolean as certification_fire_safety,
        certification_elevator::boolean as certification_elevator,
        license_number,
        license_expiry::date as license_expiry,
        background_check_date::date as background_check_date,
        drug_test_date::date as drug_test_date,
        home_address_city,
        home_address_state,
        assigned_territory,
        service_area_radius_miles::integer as service_area_radius_miles,
        current_location_lat::numeric as current_location_lat,
        current_location_lon::numeric as current_location_lon,
        availability_status,
        shift_start::time as shift_start,
        shift_end::time as shift_end,
        on_call_today::boolean as on_call_today,
        weekend_availability::boolean as weekend_availability,
        after_hours_availability::boolean as after_hours_availability,
        average_rating::numeric as average_rating,
        total_ratings::integer as total_ratings,
        total_work_orders::integer as total_work_orders,
        completed_work_orders::integer as completed_work_orders,
        in_progress_work_orders::integer as in_progress_work_orders,
        cancelled_work_orders::integer as cancelled_work_orders,
        average_resolution_time_hours::numeric as average_resolution_time_hours,
        first_time_fix_rate::numeric as first_time_fix_rate,
        customer_satisfaction_score::numeric as customer_satisfaction_score,
        response_time_avg_minutes::integer as response_time_avg_minutes,
        utilization_rate::numeric as utilization_rate,
        billable_hours_ytd::numeric as billable_hours_ytd,
        non_billable_hours_ytd::numeric as non_billable_hours_ytd,
        overtime_hours_ytd::numeric as overtime_hours_ytd,
        sick_days_ytd::integer as sick_days_ytd,
        vacation_days_ytd::integer as vacation_days_ytd,
        training_hours_ytd::integer as training_hours_ytd,
        skills_hvac_level,
        skills_electrical_level,
        skills_plumbing_level,
        skills_carpentry_level,
        skills_painting_level,
        skills_roofing_level,
        tools_assigned_count::integer as tools_assigned_count,
        vehicle_assigned::boolean as vehicle_assigned,
        vehicle_number,
        vehicle_type,
        vehicle_mileage::integer as vehicle_mileage,
        last_safety_training::date as last_safety_training,
        last_technical_training::date as last_technical_training,
        performance_score::integer as performance_score,
        productivity_score::integer as productivity_score,
        quality_score::integer as quality_score,
        attendance_score::integer as attendance_score,
        years_experience::integer as years_experience,
        total_certifications::integer as total_certifications,
        languages_spoken,
        emergency_contact_name,
        emergency_contact_phone,
        uniform_size,
        equipment_issued

    from source

)

select * from renamed

