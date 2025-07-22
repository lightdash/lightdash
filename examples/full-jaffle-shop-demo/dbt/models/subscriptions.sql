with source as (
    select * from {{ ref('raw_subscriptions') }}
),

plan_data as (
    select * from {{ ref('plan') }}
),

final as (
    select
        source.id as subscription_id,
        source.customer_id,
        source.plan_id,
        plan_data.plan_name,
        source.start_date::timestamp as subscription_start,
        source.end_date::timestamp as subscription_end,
        source.active as is_active,
        
        -- Calculate subscription duration in days
        (source.end_date::date - source.start_date::date) as duration_days,
        
        -- Calculate subscription duration in months (approximate)
        round((source.end_date::date - source.start_date::date) / 30.0, 1) as duration_months,
        
        -- Check if subscription is current (active and not expired)
        case 
            when source.active and source.end_date::date > current_date then 'Current'
            when source.active and source.end_date::date <= current_date then 'Expired'
            when not source.active then 'Cancelled'
            else 'Unknown'
        end as subscription_status,
        
        -- Calculate months remaining (for active subscriptions)
        case 
            when source.active and source.end_date::date > current_date 
            then round((source.end_date::date - current_date) / 30.0, 1)
            else 0
        end as months_remaining,
        
        -- MRR calculations based on plan_id and duration
        case 
            when source.plan_id = 1 then 9.99   -- free plan
            when source.plan_id = 2 then 19.99  -- silver plan
            when source.plan_id = 3 then 39.99  -- gold plan
            when source.plan_id = 4 then 79.99  -- platinum plan
            when source.plan_id = 5 then 149.99 -- diamond plan
            else 0
        end as monthly_mrr,
        
        case 
            when source.plan_id = 1 then 9.99 * 12 / 52   -- weekly equivalent
            when source.plan_id = 2 then 19.99 * 12 / 52
            when source.plan_id = 3 then 39.99 * 12 / 52
            when source.plan_id = 4 then 79.99 * 12 / 52
            when source.plan_id = 5 then 149.99 * 12 / 52
            else 0
        end as weekly_mrr,
        
        case 
            when source.plan_id = 1 then 9.99 * 3   -- quarterly equivalent
            when source.plan_id = 2 then 19.99 * 3
            when source.plan_id = 3 then 39.99 * 3
            when source.plan_id = 4 then 79.99 * 3
            when source.plan_id = 5 then 149.99 * 3
            else 0
        end as quarterly_mrr

    from source
    left join plan_data on source.plan_id = plan_data.id
)

select * from final