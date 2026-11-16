select
    customer_id,
    first_name,
    last_name,
    first_order
from {{ ref('customers') }}
