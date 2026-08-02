select
    order_id,
    customer_id,
    ordered_at,
    status,
    amount,
    is_food_order
from {{ ref('raw_orders') }}
