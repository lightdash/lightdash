with work_orders as (

    select * from {{ ref('stg_fm_work_orders') }}

),

buildings as (

    select * from {{ ref('stg_fm_buildings') }}

),

technicians as (

    select * from {{ ref('stg_fm_technicians') }}

),

contracts as (

    select * from {{ ref('stg_fm_service_contracts') }}

),

final as (

    select
        work_orders.*,
        buildings.building_name,
        buildings.building_type,
        buildings.address_city,
        buildings.address_state,
        buildings.region,
        technicians.first_name || ' ' || technicians.last_name as technician_name,
        technicians.primary_trade as technician_primary_trade,
        technicians.seniority_level as technician_seniority,
        contracts.contract_type,
        contracts.service_level,
        
        -- Calculated fields
        case 
            when work_orders.completed_at is not null 
            then extract(epoch from (work_orders.completed_at - work_orders.request_date))/3600
            else null 
        end as total_duration_hours,
        
        case 
            when work_orders.sla_met then 1 
            else 0 
        end as sla_met_binary,
        
        work_orders.labor_cost + work_orders.materials_cost as calculated_total_cost

    from work_orders

    left join buildings on work_orders.building_id = buildings.building_id
    left join technicians on work_orders.technician_id = technicians.technician_id
    left join contracts on work_orders.contract_id = contracts.contract_id

)

select * from final

