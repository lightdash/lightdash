select customer_id, true as is_downstream
from {{ ref('same_name_a', 'customers') }}
