with technicians as (

    select * from {{ ref('stg_fm_technicians') }}

),

final as (

    select
        *,
        
        -- Calculated fields
        first_name || ' ' || last_name as full_name,
        
        case 
            when years_experience >= 10 then 'Expert'
            when years_experience >= 5 then 'Advanced'
            when years_experience >= 2 then 'Intermediate'
            else 'Junior'
        end as experience_level,
        
        case 
            when utilization_rate >= 0.85 then 'High'
            when utilization_rate >= 0.70 then 'Medium'
            else 'Low'
        end as utilization_category,
        
        billable_hours_ytd + non_billable_hours_ytd as total_hours_ytd,
        
        case 
            when total_work_orders > 0 
            then completed_work_orders::float / total_work_orders 
            else 0 
        end as completion_rate

    from technicians

)

select * from final

