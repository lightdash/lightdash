with source as (
    select * from {{ ref('raw_subscriptions') }}
),

final as (
    select
        id as subscription_id,
        customer_id,
        plan_id,
        start_date::timestamp as subscription_start,
        end_date::timestamp as subscription_end,
        active as is_active,
        
        -- Calculate subscription duration in days
        (end_date::date - start_date::date) as duration_days,
        
        -- Calculate subscription duration in months (approximate)
        round((end_date::date - start_date::date) / 30.0, 1) as duration_months,
        
        -- Check if subscription is current (active and not expired)
        case 
            when active and end_date::date > current_date then 'Current'
            when active and end_date::date <= current_date then 'Expired'
            when not active then 'Cancelled'
            else 'Unknown'
        end as subscription_status,
        
        -- Calculate months remaining (for active subscriptions)
        case 
            when active and end_date::date > current_date 
            then round((end_date::date - current_date) / 30.0, 1)
            else 0
        end as months_remaining,
        
        -- MRR calculations based on plan_id and duration
        case 
            when plan_id = 1 then 9.99   -- free plan
            when plan_id = 2 then 19.99  -- silver plan
            when plan_id = 3 then 39.99  -- gold plan
            when plan_id = 4 then 79.99  -- platinum plan
            when plan_id = 5 then 149.99 -- diamond plan
            else 0
        end as monthly_mrr,
        
        case 
            when plan_id = 1 then 9.99 * 12 / 52   -- weekly equivalent
            when plan_id = 2 then 19.99 * 12 / 52
            when plan_id = 3 then 39.99 * 12 / 52
            when plan_id = 4 then 79.99 * 12 / 52
            when plan_id = 5 then 149.99 * 12 / 52
            else 0
        end as weekly_mrr,
        
        case 
            when plan_id = 1 then 9.99 * 3   -- quarterly equivalent
            when plan_id = 2 then 19.99 * 3
            when plan_id = 3 then 39.99 * 3
            when plan_id = 4 then 79.99 * 3
            when plan_id = 5 then 149.99 * 3
            else 0
        end as quarterly_mrr

    from source
)

select * from final