select
    appointment_id,
    episode_id,
    student_id,
    school_id,
    district_id,
    clinician_id,
    scheduled_at,
    appointment_type,
    program,
    modality,
    status,
    duration_minutes,
    is_during_school_day
from {{ ref('raw_appointments') }}
