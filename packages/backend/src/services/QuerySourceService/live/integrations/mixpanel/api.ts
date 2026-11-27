import { z } from 'zod';
import { toLiveHttpError, type LiveHttpResponse } from '../../sdk';

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

// Mixpanel's Query API errors are JSON with an `error` string next to a
// `request` echo, `status` and `error_code`, or plain text.
const errorSchema = z.union([
    z.string(),
    z.object({ error: z.string() }).transform(({ error }) => error),
    z.object({ message: z.string() }).transform(({ message }) => message),
]);

const MAX_DETAIL_LENGTH = 300;

const getDetail = (body: unknown) => {
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) return '';
    const message = parsed.data
        .trim()
        .replace(/[.!]+$/, '')
        .slice(0, MAX_DETAIL_LENGTH);
    // An HTML error page says nothing useful
    return message && !message.startsWith('<') ? `: ${message}` : '';
};

/** Turns a Query API error into an error that says what to change. */
export const toMixpanelError = (response: LiveHttpResponse): Error => {
    const detail = getDetail(response.body);
    return toLiveHttpError(response, {
        rateLimited: (retryAfterSeconds) =>
            `Mixpanel rate limit reached${detail}. Mixpanel allows 60 queries an hour and 5 at once per project, shared with its other clients; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'later this hour'
            }, or rely on cached results.`,
        connection: {
            401: `Mixpanel rejected the service account${detail}. Check its username and secret in Mixpanel's organization settings and add this live data source again.`,
            // The Query API needs a Growth or Enterprise plan; other plans get 402
            402: `Mixpanel refused the query because of the project's plan${detail}. The Query API needs a Growth or Enterprise plan; upgrade the project in Mixpanel, then try again.`,
            403: `Mixpanel denied access${detail}. Check that the service account belongs to the project, and that the source's project ID and data region (US, EU or India) are the project's.`,
        },
        rejected: `Mixpanel rejected the request${detail}.`,
        failed: `Mixpanel returned ${response.status}${detail}.`,
    });
};
