/**
 * Properties Mixpanel's SDKs set on every event, so every project has them.
 * Custom properties differ per project and are not offered yet.
 */
export const MIXPANEL_PROPERTIES = {
    country: [
        'mp_country_code',
        'Country',
        'Country code of the user, as Mixpanel resolves it from the IP address.',
    ],
    region: ['$region', 'Region', 'Region or state of the user.'],
    city: ['$city', 'City', 'City of the user.'],
    browser: ['$browser', 'Browser', 'Browser, such as Chrome or Safari.'],
    os: ['$os', 'OS', 'Operating system, such as Mac OS X, iOS or Android.'],
    device: ['$device', 'Device', 'Device, such as iPhone or Android.'],
    library: [
        'mp_lib',
        'Library',
        'Mixpanel library that sent the event, such as web, iphone or python.',
    ],
    referring_domain: [
        '$referring_domain',
        'Referring domain',
        'Domain of the page that linked to the current page.',
    ],
    utm_source: [
        'utm_source',
        'UTM source',
        'utm_source of the URL the user landed on.',
    ],
    utm_medium: [
        'utm_medium',
        'UTM medium',
        'utm_medium of the URL the user landed on.',
    ],
    utm_campaign: [
        'utm_campaign',
        'UTM campaign',
        'utm_campaign of the URL the user landed on.',
    ],
} as const satisfies Record<string, readonly [string, string, string]>;

export type MixpanelProperty = keyof typeof MIXPANEL_PROPERTIES;

export const isMixpanelProperty = (
    apiName: string,
): apiName is MixpanelProperty => Object.hasOwn(MIXPANEL_PROPERTIES, apiName);

/** The property's name in Mixpanel, as an expression reads it. */
export const getMixpanelPropertyName = (property: MixpanelProperty) =>
    MIXPANEL_PROPERTIES[property][0];

/** Periods after the start a retention query reads, per unit. */
export const MIXPANEL_MAX_RETENTION_PERIODS = {
    day: 90,
    week: 52,
    month: 24,
} as const;
