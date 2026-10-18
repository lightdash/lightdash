select calendar_date from {{ ref('pg_shared', 'pg_calendar') }} where day_of_week < 6
