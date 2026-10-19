{{ config(enabled=false) }}

select id
from {{ ref('access_upstream', 'protected_model') }}
