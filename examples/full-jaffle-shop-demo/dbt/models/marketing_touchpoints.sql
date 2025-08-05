with raw_touchpoints as (

    select * from {{ ref('raw_marketing_touchpoints') }}

),

campaigns as (

    select * from {{ ref('campaigns') }}

),

customers as (

    select * from {{ ref('customers') }}

),

touchpoint_metrics as (

    select
        t.touchpoint_id,
        t.customer_id,
        t.campaign_id,
        t.touchpoint_date,
        t.touchpoint_type,
        t.action_taken,
        t.revenue_attributed,
        t.device_type,
        t.session_duration_seconds,
        
        -- Campaign info
        c.campaign_name,
        c.campaign_type,
        c.channel as campaign_channel,
        c.budget as campaign_budget,
        
        -- Customer info
        cust.first_order,
        cust.most_recent_order,
        
        -- Derived fields
        case
            when t.action_taken = 'purchased' then 1
            else 0
        end as is_conversion,
        
        case
            when t.action_taken in ('clicked', 'visited_site', 'purchased', 'enrolled', 'reactivated', 'upgraded', 'downloaded_app') then 1
            else 0
        end as is_engaged,
        
        case
            when t.touchpoint_type like '%email%' then 'Email'
            when t.touchpoint_type like '%social%' then 'Social'
            when t.touchpoint_type like '%ad%' then 'Paid'
            when t.touchpoint_type = 'push_notification' then 'Push'
            when t.touchpoint_type = 'in_app' then 'App'
            else 'Other'
        end as touchpoint_channel,
        
        t.session_duration_seconds / 60.0 as session_duration_minutes,
        
        case
            when t.touchpoint_date < cust.first_order then 'Pre-customer'
            when t.touchpoint_date between cust.first_order and cust.first_order + 30 then 'New customer'
            when t.touchpoint_date > cust.first_order + 30 then 'Existing customer'
            else 'Unknown'
        end as customer_lifecycle_stage,
        
        (t.touchpoint_date - c.start_date) + 1 as days_since_campaign_start

    from raw_touchpoints t
    left join campaigns c on t.campaign_id = c.campaign_id
    left join customers cust on t.customer_id = cust.customer_id

)

select * from touchpoint_metrics