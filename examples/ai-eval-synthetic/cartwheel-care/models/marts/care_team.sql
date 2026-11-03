select
    care_team_member_id,
    full_name,
    role,
    credential,
    languages,
    is_bilingual,
    licensed_states,
    hire_date,
    weekly_session_capacity,
    employment_type,
    case when role = 'Care Coordinator' then 'Care Coordination' else 'Clinical' end as team
from {{ ref('stg_care_team') }}
