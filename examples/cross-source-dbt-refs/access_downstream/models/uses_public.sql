select id
from {{ ref('access_upstream', 'public_model') }}
