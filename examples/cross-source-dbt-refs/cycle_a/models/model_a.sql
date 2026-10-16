select id
from {{ ref('cycle_b', 'model_b') }}
