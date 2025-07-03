
select
    t.user_id,
    t.event_id as event_id,
    t.event_name as event_name,
    t.event_timestamp as timestamp
from 
    {{ ref('tracks_raw') }} t

-- the below cleans synthetically created data
-- left join {{ ref('users_raw') }} u on t.user_id = u.user_id
-- where u.first_logged_in_at < t.event_timestamp