select id
from {{ ref('cycle_a', 'model_a') }}
