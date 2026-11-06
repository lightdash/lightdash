select product_id, product_name
from {{ ref('access_upstream', 'dim_product', v=2) }}
