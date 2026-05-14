select
    event_id,
    event_timestamp,
    event_timestamp_ntz,
    event_timestamp_raw_utc,
    category
from {{ ref('raw_timezone_test') }}
