select
    left_days.calendar_date,
    left_days.calendar_year as left_year,
    right_days.calendar_year as right_year
from {{ ref('diamond_left', 'left_days') }} as left_days
join {{ ref('diamond_right', 'right_days') }} as right_days
    on left_days.calendar_date = right_days.calendar_date
