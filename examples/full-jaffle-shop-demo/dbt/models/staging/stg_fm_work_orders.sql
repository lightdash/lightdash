with source as (

    {#-
    Normally we would select from the table here, but we are using seeds to load
    our data in this project
    #}
    select * from {{ ref('raw_work_orders') }}

),

renamed as (

    select
        work_order_id,
        ticket_number,
        building_id,
        contract_id,
        technician_id,
        customer_id,
        request_date::timestamp as request_date,
        scheduled_date::timestamp as scheduled_date,
        started_at::timestamp as started_at,
        completed_at::timestamp as completed_at,
        category,
        sub_category,
        priority,
        urgency_level,
        status,
        issue_description,
        resolution_notes,
        location_floor,
        location_room,
        location_zone,
        trade_type,
        work_type,
        labor_hours::numeric as labor_hours,
        labor_cost::numeric as labor_cost,
        materials_cost::numeric as materials_cost,
        total_cost::numeric as total_cost,
        parts_used_count::integer as parts_used_count,
        travel_time_minutes::integer as travel_time_minutes,
        response_time_minutes::integer as response_time_minutes,
        resolution_time_hours::numeric as resolution_time_hours,
        first_time_fix::boolean as first_time_fix,
        repeat_visit::boolean as repeat_visit,
        customer_rating::integer as customer_rating,
        customer_feedback,
        technician_notes,
        equipment_id,
        equipment_type,
        failure_type,
        downtime_minutes::integer as downtime_minutes,
        business_impact,
        sla_met::boolean as sla_met,
        sla_response_target_minutes::integer as sla_response_target_minutes,
        sla_resolution_target_hours::numeric as sla_resolution_target_hours,
        escalated::boolean as escalated,
        escalation_level::integer as escalation_level,
        assigned_by,
        approved_by,
        invoice_number,
        invoice_status,
        payment_status,
        weather_condition,
        after_hours::boolean as after_hours,
        weekend_work::boolean as weekend_work,
        emergency_call::boolean as emergency_call,
        preventive_maintenance::boolean as preventive_maintenance,
        warranty_work::boolean as warranty_work,
        billable::boolean as billable,
        discount_applied::boolean as discount_applied,
        discount_percent::numeric as discount_percent,
        created_by,
        updated_at::timestamp as updated_at,
        source_channel,
        parent_work_order_id::integer as parent_work_order_id,
        child_work_orders_count::integer as child_work_orders_count,
        attachments_count::integer as attachments_count,
        compliance_required::boolean as compliance_required,
        safety_incident::boolean as safety_incident

    from source

)

select * from renamed

