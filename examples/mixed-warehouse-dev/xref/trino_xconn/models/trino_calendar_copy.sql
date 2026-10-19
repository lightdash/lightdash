select calendar_date from {{ ref('pg_shared', 'pg_calendar') }}
