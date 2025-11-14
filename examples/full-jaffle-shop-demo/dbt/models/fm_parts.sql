with parts as (

    select * from {{ ref('stg_fm_parts') }}

),

final as (

    select
        *,
        
        -- Calculated fields
        case 
            when stock_quantity <= reorder_point then 'Low Stock'
            when stock_quantity >= max_stock_level then 'Overstock'
            else 'Adequate'
        end as inventory_status,
        
        case 
            when critical_part then 'Critical'
            when stock_quantity <= min_stock_level then 'High Priority'
            else 'Standard'
        end as priority_level,
        
        retail_price - unit_cost as profit_margin_per_unit,
        
        case 
            when total_quantity_used_ytd > 0 
            then (stock_quantity::float / average_monthly_usage) 
            else null 
        end as months_of_supply,
        
        case 
            when inventory_turnover_ratio >= 12 then 'Fast Moving'
            when inventory_turnover_ratio >= 6 then 'Medium Moving'
            when inventory_turnover_ratio >= 2 then 'Slow Moving'
            else 'Very Slow'
        end as turnover_category

    from parts

)

select * from final

