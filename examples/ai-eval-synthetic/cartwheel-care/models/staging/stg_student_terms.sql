select
    student_term_id,
    student_id,
    school_id,
    district_id,
    term,
    school_year,
    term_start_date,
    term_end_date,
    days_enrolled,
    days_absent,
    suspensions,
    office_referrals
from {{ ref('raw_student_terms') }}
