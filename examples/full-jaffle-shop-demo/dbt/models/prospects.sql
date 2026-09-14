select
    month as request_month,
    ay_season_year,
    prospect_count
from {{ ref('raw_prospects') }}
