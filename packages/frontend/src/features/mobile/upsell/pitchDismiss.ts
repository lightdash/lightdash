export const MOBILE_PITCH_DISMISS_REASONS = [
    'no_work_phone',
    'not_needed',
    'already_use',
    'not_now',
    'other',
] as const;

export type MobilePitchDismissReason =
    (typeof MOBILE_PITCH_DISMISS_REASONS)[number];

export const MOBILE_PITCH_DISMISS_STRINGS = {
    action: 'Not interested',
    title: 'Help us improve the app',
    reasons: {
        no_work_phone: "Don't use my phone for work",
        not_needed: "Don't need it",
        already_use: 'Already use it',
        not_now: 'Not now',
        other: 'Other',
    } satisfies Record<MobilePitchDismissReason, string>,
} as const;
