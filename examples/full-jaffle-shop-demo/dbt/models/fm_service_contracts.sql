with contracts as (

    select * from {{ ref('stg_fm_service_contracts') }}

),

buildings as (

    select * from {{ ref('stg_fm_buildings') }}

),

final as (

    select
        contracts.*,
        buildings.building_name,
        buildings.building_type,
        buildings.address_city,
        buildings.total_square_feet,
        
        -- Calculated fields
        -- Athena/Trino: use DATE_ADD instead of date + interval
        case
            when contracts.end_date < current_date then 'Expired'
            {% if target.type == 'trino' or target.type == 'athena' %}
            when contracts.end_date <= DATE_ADD('day', 90, current_date) then 'Expiring Soon'
            when contracts.end_date <= DATE_ADD('day', 180, current_date) then 'Renewal Period'
            {% else %}
            when contracts.end_date <= current_date + interval '90 days' then 'Expiring Soon'
            when contracts.end_date <= current_date + interval '180 days' then 'Renewal Period'
            {% endif %}
            else 'Active'
        end as contract_lifecycle_stage,
        
        case 
            when renewal_probability = 'High' then 1.0
            when renewal_probability = 'Medium' then 0.5
            else 0.2
        end as renewal_probability_score,
        
        monthly_recurring_revenue * 12 as projected_annual_revenue,
        
        case 
            when contracts.total_work_orders_ytd > 0 
            then {{ cast_float('contracts.completed_work_orders_ytd') }} / contracts.total_work_orders_ytd 
            else 0 
        end as completion_rate,
        
        (response_time_met_percent + resolution_time_met_percent) / 2 as average_sla_performance,
        
        total_amount_invoiced_ytd - total_amount_paid_ytd as outstanding_balance_calculated

    from contracts

    left join buildings on contracts.building_id = buildings.building_id

)

select * from final

