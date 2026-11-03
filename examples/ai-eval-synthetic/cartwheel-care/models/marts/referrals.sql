with referrals as (
    select * from {{ ref('stg_referrals') }}
),
episodes as (
    select referral_id, episode_id, program
    from {{ ref('stg_care_episodes') }}
)
select
    referrals.referral_id,
    referrals.student_id,
    referrals.school_id,
    referrals.district_id,
    referrals.care_coordinator_id,
    episodes.episode_id,
    referrals.referred_at,
    cast(referrals.referred_at as date) as referred_on,
    {{ school_year('referrals.referred_at') }} as school_year,
    referrals.referral_source,
    referrals.referral_reason,
    referrals.tier,
    referrals.urgency,
    referrals.status,
    referrals.is_re_referral,
    referrals.first_outreach_at,
    referrals.consent_signed_on,
    referrals.intake_completed_on,
    episodes.program,
    trunc(extract(epoch from referrals.first_outreach_at - referrals.referred_at) / 60) / 60.0 as hours_to_first_outreach,
    trunc(extract(epoch from referrals.first_outreach_at - referrals.referred_at) / 3600) < 24 as outreach_within_24h,
    referrals.consent_signed_on - cast(referrals.referred_at as date) as days_to_consent,
    referrals.intake_completed_on - cast(referrals.referred_at as date) as days_to_intake,
    referrals.consent_signed_on is not null as is_consented,
    referrals.status = 'Intake Completed' as is_converted_to_care,
    referrals.status in ('Declined by Family', 'Unable to Reach', 'Referred Out') as is_closed_without_care,
    referrals.status in ('In Outreach', 'Intake Scheduled') as is_open
from referrals
left join episodes using (referral_id)
