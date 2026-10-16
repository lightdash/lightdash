select
    calendar.calendar_date as order_date,
    ((extract(doy from calendar.calendar_date)::integer * 7) % 23) + 1 as order_count,
    (((extract(doy from calendar.calendar_date)::integer * 7) % 23) + 1) * 19.5 as revenue
from {{ ref('shared_dimensions', 'dim_calendar') }} as calendar
