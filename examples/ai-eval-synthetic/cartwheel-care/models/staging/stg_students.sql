select
    student_id,
    school_id,
    district_id,
    grade_at_referral,
    gender,
    primary_home_language,
    coverage_type,
    has_iep_or_504,
    first_referral_date
from {{ ref('raw_students') }}
