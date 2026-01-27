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
    {{ json_extract_string('event_properties', 'product_id') }} as product_id,
    {{ json_extract_string('event_properties', 'product_name') }} as product_name,
    {{ json_extract_string('event_properties', 'product_category') }} as product_category,
    {{ cast_numeric(json_extract_string('event_properties', 'product_price')) }} as product_price,
    {{ cast_integer(json_extract_string('event_properties', 'quantity')) }} as quantity,
    {{ cast_numeric(json_extract_string('event_properties', 'cart_total')) }} as cart_total,
    {{ cast_numeric(json_extract_string('event_properties', 'order_total')) }} as order_total,
    {{ json_extract_string('event_properties', 'payment_method') }} as payment_method,
    {{ json_extract_string('event_properties', 'page_url') }} as page_url

from {{ ref('raw_product_events') }}
