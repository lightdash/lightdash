with buildings as (

    select * from {{ ref('stg_fm_buildings') }}

),

final as (

    select
        *,
        
        -- Calculated fields
        address_street || ', ' || address_city || ', ' || address_state as full_address,
        
        case 
            when building_age_years >= 30 then 'Old'
            when building_age_years >= 15 then 'Mature'
            when building_age_years >= 5 then 'Modern'
            else 'New'
        end as age_category,
        
        case 
            when occupancy_rate >= 0.95 then 'Fully Occupied'
            when occupancy_rate >= 0.85 then 'Well Occupied'
            when occupancy_rate >= 0.70 then 'Moderately Occupied'
            else 'Under Occupied'
        end as occupancy_category,
        
        revenue_monthly - total_operating_cost_monthly as net_income_monthly,
        
        case 
            when revenue_monthly > 0 
            then total_operating_cost_monthly / revenue_monthly 
            else null 
        end as operating_expense_ratio,
        
        maintenance_cost_monthly + janitorial_cost_monthly + security_cost_monthly + landscaping_cost_monthly as facility_services_cost

    from buildings

)

select * from final

