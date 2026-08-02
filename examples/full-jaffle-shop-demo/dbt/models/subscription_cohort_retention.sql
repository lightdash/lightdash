with subscriptions as (
    select * from {{ ref('subscriptions') }}
),

month_offsets as (
    select 0 as months_since_start
    union all select 1
    union all select 2
    union all select 3
    union all select 4
    union all select 5
    union all select 6
    union all select 7
    union all select 8
    union all select 9
    union all select 10
    union all select 11
),

cohort_grid as (
    select
        subscriptions.subscription_id,
        subscriptions.customer_id,
        subscriptions.plan_name,
        subscriptions.subscription_start as cohort_started_at,
        month_offsets.months_since_start,
        case
            when subscriptions.duration_days >= month_offsets.months_since_start * 30
                then true
            else false
        end as is_retained,
        case
            when subscriptions.duration_days >= month_offsets.months_since_start * 30
                then subscriptions.subscription_id
            else null
        end as retained_subscription_id
    from subscriptions
    cross join month_offsets
)

select * from cohort_grid
