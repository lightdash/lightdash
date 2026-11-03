select
    episode_id,
    referral_id,
    student_id,
    school_id,
    district_id,
    clinician_id,
    program,
    presenting_concern,
    tier,
    started_on,
    ended_on,
    status,
    discharge_reason,
    planned_sessions
from {{ ref('raw_care_episodes') }}
