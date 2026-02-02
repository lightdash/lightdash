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
        {{ cast_timestamp('request_date') }} as request_date,
        {{ cast_timestamp('scheduled_date') }} as scheduled_date,
        {{ cast_timestamp('started_at') }} as started_at,
        {{ cast_timestamp('completed_at') }} as completed_at,
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
        {{ cast_numeric('labor_hours') }} as labor_hours,
        {{ cast_numeric('labor_cost') }} as labor_cost,
        {{ cast_numeric('materials_cost') }} as materials_cost,
        {{ cast_numeric('total_cost') }} as total_cost,
        {{ cast_integer('parts_used_count') }} as parts_used_count,
        {{ cast_integer('travel_time_minutes') }} as travel_time_minutes,
        {{ cast_integer('response_time_minutes') }} as response_time_minutes,
        {{ cast_numeric('resolution_time_hours') }} as resolution_time_hours,
        {{ cast_boolean('first_time_fix') }} as first_time_fix,
        {{ cast_boolean('repeat_visit') }} as repeat_visit,
        {{ cast_integer('customer_rating') }} as customer_rating,
        customer_feedback,
        technician_notes,
        equipment_id,
        equipment_type,
        failure_type,
        {{ cast_integer('downtime_minutes') }} as downtime_minutes,
        business_impact,
        {{ cast_boolean('sla_met') }} as sla_met,
        {{ cast_integer('sla_response_target_minutes') }} as sla_response_target_minutes,
        {{ cast_numeric('sla_resolution_target_hours') }} as sla_resolution_target_hours,
        {{ cast_boolean('escalated') }} as escalated,
        {{ cast_integer('escalation_level') }} as escalation_level,
        assigned_by,
        approved_by,
        invoice_number,
        invoice_status,
        payment_status,
        weather_condition,
        {{ cast_boolean('after_hours') }} as after_hours,
        {{ cast_boolean('weekend_work') }} as weekend_work,
        {{ cast_boolean('emergency_call') }} as emergency_call,
        {{ cast_boolean('preventive_maintenance') }} as preventive_maintenance,
        {{ cast_boolean('warranty_work') }} as warranty_work,
        {{ cast_boolean('billable') }} as billable,
        {{ cast_boolean('discount_applied') }} as discount_applied,
        {{ cast_numeric('discount_percent') }} as discount_percent,
        created_by,
        {{ cast_timestamp('updated_at') }} as updated_at,
        source_channel,
        {{ cast_integer('parent_work_order_id') }} as parent_work_order_id,
        {{ cast_integer('child_work_orders_count') }} as child_work_orders_count,
        {{ cast_integer('attachments_count') }} as attachments_count,
        {{ cast_boolean('compliance_required') }} as compliance_required,
        {{ cast_boolean('safety_incident') }} as safety_incident

    from source

)

select * from renamed
