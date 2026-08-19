{% if target.type == 'bigquery' %}
    {{
        config(
            partition_by={
                "field": "event_timestamp",
                "data_type": "timestamp",
                "granularity": "day"
            }
        )
    }}
{% endif %}

select
    event_id,
    event_timestamp,
    event_timestamp_ntz,
    event_timestamp_raw_utc,
    category
from {{ ref('raw_timezone_test') }}
