export enum TimeZone {
    'UTC' = 'UTC', // A special value which we use to make skip tz behavior
    // 'Local' = 'Local', // TODO: decide what to do with local option UX
    'Pacific/Pago_Pago' = 'Pacific/Pago_Pago',
    'Pacific/Honolulu' = 'Pacific/Honolulu',
    'Pacific/Marquesas' = 'Pacific/Marquesas',
    'America/Anchorage' = 'America/Anchorage',
    'America/Los_Angeles' = 'America/Los_Angeles',
    'America/Denver' = 'America/Denver',
    'America/Chicago' = 'America/Chicago',
    'America/New_York' = 'America/New_York',
    'America/Santo_Domingo' = 'America/Santo_Domingo',
    'America/St_Johns' = 'America/St_Johns',
    'America/Buenos_Aires' = 'America/Buenos_Aires',
    'America/Noronha' = 'America/Noronha',
    'Atlantic/Cape_Verde' = 'Atlantic/Cape_Verde',
    'Europe/Paris' = 'Europe/Paris',
    'Europe/Athens' = 'Europe/Athens',
    'Europe/Moscow' = 'Europe/Moscow',
    'Europe/London' = 'Europe/London',
    'Asia/Dubai' = 'Asia/Dubai',
    'Asia/Karachi' = 'Asia/Karachi',
    'Asia/Kolkata' = 'Asia/Kolkata',
    'Asia/Kathmandu' = 'Asia/Kathmandu',
    'Asia/Dhaka' = 'Asia/Dhaka',
    'Asia/Bangkok' = 'Asia/Bangkok',
    'Asia/Shanghai' = 'Asia/Shanghai',
    'Australia/Eucla' = 'Australia/Eucla',
    'Asia/Tokyo' = 'Asia/Tokyo',
    'Australia/Brisbane' = 'Australia/Brisbane',
    'Australia/Sydney' = 'Australia/Sydney',
    'Pacific/Noumea' = 'Pacific/Noumea',
    'Pacific/Auckland' = 'Pacific/Auckland',
    'Pacific/Apia' = 'Pacific/Apia',
    'Pacific/Kiritimati' = 'Pacific/Kiritimati',
}

export const isTimeZone = (timezone: string): timezone is TimeZone =>
    Object.values(TimeZone).includes(timezone as TimeZone);

/**
 * Sentinel values for a query's timezone setting. Anything that is not one of
 * these keywords is treated as an override IANA zone.
 */
export const PROJECT_TIMEZONE_SETTING = 'project_timezone';
export const USER_TIMEZONE_SETTING = 'user_timezone';

/**
 * A query/saved-chart timezone setting: the project-default keyword, the
 * per-user keyword, or an override IANA zone. The `string` arm keeps the union
 * from collapsing while still accepting any valid zone (resolved/profile/project
 * zones aren't limited to the TimeZone dropdown set).
 */
export type TimezoneSetting =
    | typeof PROJECT_TIMEZONE_SETTING
    | typeof USER_TIMEZONE_SETTING
    | TimeZone;

/**
 * Narrows an untrusted timezone string into a persisted TimezoneSetting. Keeps
 * the keywords and any supported TimeZone; anything else (an unsupported zone)
 * falls back to the project default rather than storing an arbitrary string.
 */
export function toTimezoneSetting(value: string | undefined): TimezoneSetting {
    if (!value || value === PROJECT_TIMEZONE_SETTING) {
        return PROJECT_TIMEZONE_SETTING;
    }
    if (value === USER_TIMEZONE_SETTING) {
        return USER_TIMEZONE_SETTING;
    }
    return isTimeZone(value) ? value : PROJECT_TIMEZONE_SETTING;
}
