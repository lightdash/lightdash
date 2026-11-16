select
    order_id,
    customer_id,
    order_date,
    status,
    amount
from {{ ref('orders') }}
