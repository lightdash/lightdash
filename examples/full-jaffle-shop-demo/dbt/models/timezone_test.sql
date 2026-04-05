select
    event_id,
    event_timestamp,
    event_timestamp_ntz,
    category
from {{ ref('raw_timezone_test') }}
