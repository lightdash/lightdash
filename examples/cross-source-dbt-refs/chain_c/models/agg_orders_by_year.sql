with calendar as (
    select calendar_date, calendar_year
    from {{ ref('shared_dimensions', 'dim_calendar') }}
)
select
    calendar.calendar_year,
    sum(orders.order_count) as order_count,
    sum(orders.revenue) as revenue
from {{ ref('analytics', 'fct_orders') }} as orders
join calendar on orders.order_date = calendar.calendar_date
group by calendar.calendar_year
