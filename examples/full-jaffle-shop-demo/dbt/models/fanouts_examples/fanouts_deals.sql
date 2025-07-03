
select 
    deal_id,
    account_id,
    stage,
    plan,
    seats,
    amount,
    date(created_date) as created_date
from 
    {{ ref('deals_raw') }}
