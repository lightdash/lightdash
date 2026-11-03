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
    employment_type
from {{ ref('raw_care_team') }}
