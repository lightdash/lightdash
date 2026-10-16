{{ config(enabled=false) }}

select id
from {{ ref('access_upstream', 'private_model') }}
