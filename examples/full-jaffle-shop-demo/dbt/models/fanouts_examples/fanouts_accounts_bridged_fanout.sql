select
    account_id,
    account_name,
    industry,
    segment
from 
    {{ ref('accounts_raw') }}
