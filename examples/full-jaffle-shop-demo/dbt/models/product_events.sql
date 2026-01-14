select
    event_id,
    user_id,
    session_id,
    event_name,
    event_timestamp,
    device_type,
    browser,
    referrer,
    event_properties,

    -- Extracted properties for common use cases
    event_properties::json->>'product_id' as product_id,
    event_properties::json->>'product_name' as product_name,
    event_properties::json->>'product_category' as product_category,
    (event_properties::json->>'product_price')::numeric as product_price,
    (event_properties::json->>'quantity')::integer as quantity,
    (event_properties::json->>'cart_total')::numeric as cart_total,
    (event_properties::json->>'order_total')::numeric as order_total,
    event_properties::json->>'payment_method' as payment_method,
    event_properties::json->>'page_url' as page_url

from {{ ref('raw_product_events') }}
