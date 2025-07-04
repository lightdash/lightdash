select 
    user_id,
    deal_id,
    role
from 
    {{ ref('user_deals_raw') }}