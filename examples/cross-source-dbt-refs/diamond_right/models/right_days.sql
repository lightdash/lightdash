select calendar_date, calendar_year
from {{ ref('shared_dimensions', 'dim_calendar') }}
