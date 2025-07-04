
select
    user_id,
    account_id,
    email,
    job_title,
    case when is_marketing_opted_in = 1 then true else false end as is_marketing_opted_in,
    created_at,
    first_logged_in_at,
    -- the below cleans synthetically created data
    case   
        when latest_logged_in_at < first_logged_in_at then first_logged_in_at
        when latest_logged_in_at > '2024-12-31 11:52:45' then '2024-12-31 11:52:45'
        else latest_logged_in_at
    end as latest_logged_in_at
from 
    {{ ref('users_raw') }}