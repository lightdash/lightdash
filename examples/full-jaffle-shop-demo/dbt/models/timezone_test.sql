select
    event_id,
    event_timestamp,
    category
from {{ ref('raw_timezone_test') }}
