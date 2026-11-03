select
    referral_id,
    student_id,
    school_id,
    district_id,
    care_coordinator_id,
    referred_at,
    referral_source,
    referral_reason,
    tier,
    urgency,
    first_outreach_at,
    consent_signed_on,
    intake_completed_on,
    status,
    is_re_referral
from {{ ref('raw_referrals') }}
