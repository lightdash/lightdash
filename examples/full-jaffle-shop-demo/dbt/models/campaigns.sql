with raw_campaigns as (

    select * from {{ ref('raw_campaigns') }}

),

campaign_metrics as (

    select
        campaign_id,
        campaign_name,
        campaign_type,
        channel,
        start_date,
        end_date,
        budget,
        target_audience,
        status,
        
        -- Derived fields
        end_date - start_date + 1 as campaign_duration_days,
        case
            when channel = 'email' then budget * 0.35
            when channel = 'social' then budget * 0.25
            when channel = 'multi_channel' then budget * 0.45
            when channel = 'online' then budget * 0.30
            when channel = 'push' then budget * 0.20
            else budget * 0.20
        end as estimated_reach_cost,
        
        case
            when campaign_type = 'promotion' then 'Sales'
            when campaign_type = 'product_launch' then 'Product'
            when campaign_type = 'seasonal' then 'Sales'
            when campaign_type = 'retention' then 'Customer Success'
            when campaign_type = 'acquisition' then 'Growth'
            when campaign_type = 'brand_awareness' then 'Marketing'
            when campaign_type = 'research' then 'Product'
            else 'Marketing'
        end as department,
        
        case
            when target_audience in ('all_customers', 'online_shoppers', 'bargain_hunters') then 'Broad'
            when target_audience in ('high_value', 'repeat_customers', 'existing_customers') then 'Loyal'
            when target_audience in ('churned_customers', 'inactive_subscribers') then 'Win-back'
            else 'Targeted'
        end as audience_segment

    from raw_campaigns

)

select * from campaign_metrics