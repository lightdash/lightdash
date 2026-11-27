/**
 * Amplitude's built-in user properties, which every project has. Custom
 * properties (`gp:` names) differ per project and are not offered yet.
 */
export const AMPLITUDE_USER_PROPERTIES = [
    'country',
    'region',
    'city',
    'platform',
    'os',
    'device_type',
    'language',
    'version',
] as const;

export type AmplitudeUserProperty = (typeof AMPLITUDE_USER_PROPERTIES)[number];

/** Dimensions that group by one user property; Amplitude groups by one at a time. */
export const isAmplitudeUserProperty = (
    apiName: string,
): apiName is AmplitudeUserProperty =>
    (AMPLITUDE_USER_PROPERTIES as readonly string[]).includes(apiName);

/** Day, week and month as Amplitude's `i` interval. */
export const AMPLITUDE_INTERVALS = { date: 1, week: 7, month: 30 } as const;
