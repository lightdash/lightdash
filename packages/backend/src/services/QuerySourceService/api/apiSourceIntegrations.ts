import {
    ApiConnectorType,
    assertUnreachable,
    type ExternalConnectionApiSource,
} from '@lightdash/common';
import { type ApiSourceIntegration } from './ApiSourceIntegration';
import { ga4Integration } from './google/ga4Integration';
import { googleAdsIntegration } from './google/googleAdsIntegration';
import { searchConsoleIntegration } from './google/searchConsoleIntegration';
import { youtubeAnalyticsIntegration } from './google/youtubeAnalyticsIntegration';
import { linkedInAdsIntegration } from './linkedin/linkedInAdsIntegration';
import { metaAdsIntegration } from './meta/metaAdsIntegration';
import { postHogIntegration } from './posthog/postHogIntegration';

/** One entry per integration; a missing one fails typecheck. */
const API_SOURCE_INTEGRATIONS: {
    [C in ApiConnectorType]: ApiSourceIntegration<C>;
} = {
    [ApiConnectorType.GA4]: ga4Integration,
    [ApiConnectorType.SEARCH_CONSOLE]: searchConsoleIntegration,
    [ApiConnectorType.POSTHOG]: postHogIntegration,
    [ApiConnectorType.META_ADS]: metaAdsIntegration,
    [ApiConnectorType.GOOGLE_ADS]: googleAdsIntegration,
    [ApiConnectorType.YOUTUBE_ANALYTICS]: youtubeAnalyticsIntegration,
    [ApiConnectorType.LINKEDIN_ADS]: linkedInAdsIntegration,
};

export const getApiSourceIntegration = (
    connector: ApiConnectorType,
): ApiSourceIntegration => {
    if (!Object.hasOwn(API_SOURCE_INTEGRATIONS, connector)) {
        return assertUnreachable(connector as never, 'Unknown api connector');
    }
    // Reached by the source's own connector, so its settings always match
    return API_SOURCE_INTEGRATIONS[
        connector
    ] as unknown as ApiSourceIntegration;
};

/** A stored shape no integration understands reads as null. */
export const parseStoredApiSource = (
    value: unknown,
): ExternalConnectionApiSource | null => {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('connector' in value)
    ) {
        return null;
    }
    const connector = value.connector as ApiConnectorType;
    if (!Object.hasOwn(API_SOURCE_INTEGRATIONS, connector)) {
        return null;
    }
    const parsed =
        getApiSourceIntegration(connector).settingsSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
};
