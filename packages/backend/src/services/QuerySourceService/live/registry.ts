import {
    ApiConnectorType,
    assertUnreachable,
    ParameterError,
    type ExternalConnectionApiSource,
} from '@lightdash/common';
import { airtableIntegration } from './integrations/airtable';
import { amplitudeIntegration } from './integrations/amplitude';
import { attioIntegration } from './integrations/attio';
import { ga4Integration } from './integrations/ga4';
import { githubIntegration } from './integrations/github';
import { googleAdsIntegration } from './integrations/googleAds';
import { hubspotIntegration } from './integrations/hubspot';
import { hydraIntegration } from './integrations/hydra';
import { linkedInAdsIntegration } from './integrations/linkedInAds';
import { metaAdsIntegration } from './integrations/metaAds';
import { mixpanelIntegration } from './integrations/mixpanel';
import { postHogIntegration } from './integrations/postHog';
import { pylonIntegration } from './integrations/pylon';
import { salesforceIntegration } from './integrations/salesforce';
import { searchConsoleIntegration } from './integrations/searchConsole';
import { sentryIntegration } from './integrations/sentry';
import { supabaseIntegration } from './integrations/supabase';
import { youtubeAnalyticsIntegration } from './integrations/youtubeAnalytics';
import { type LiveIntegration } from './types';

/** One entry per integration; a missing one fails typecheck. */
const LIVE_INTEGRATIONS: {
    [C in ApiConnectorType]: LiveIntegration<C>;
} = {
    [ApiConnectorType.GA4]: ga4Integration,
    [ApiConnectorType.SEARCH_CONSOLE]: searchConsoleIntegration,
    [ApiConnectorType.POSTHOG]: postHogIntegration,
    [ApiConnectorType.META_ADS]: metaAdsIntegration,
    [ApiConnectorType.GOOGLE_ADS]: googleAdsIntegration,
    [ApiConnectorType.YOUTUBE_ANALYTICS]: youtubeAnalyticsIntegration,
    [ApiConnectorType.LINKEDIN_ADS]: linkedInAdsIntegration,
    [ApiConnectorType.GITHUB]: githubIntegration,
    [ApiConnectorType.PYLON]: pylonIntegration,
    [ApiConnectorType.ATTIO]: attioIntegration,
    [ApiConnectorType.HUBSPOT]: hubspotIntegration,
    [ApiConnectorType.SALESFORCE]: salesforceIntegration,
    [ApiConnectorType.AMPLITUDE]: amplitudeIntegration,
    [ApiConnectorType.MIXPANEL]: mixpanelIntegration,
    [ApiConnectorType.SUPABASE]: supabaseIntegration,
    [ApiConnectorType.SENTRY]: sentryIntegration,
    [ApiConnectorType.AIRTABLE]: airtableIntegration,
    [ApiConnectorType.HYDRA]: hydraIntegration,
};

/** Whether the connector is one this server has an integration for. */
export const isLiveIntegrationRegistered = (connector: ApiConnectorType) =>
    Object.hasOwn(LIVE_INTEGRATIONS, connector);

export const getLiveIntegration = (
    connector: ApiConnectorType,
): LiveIntegration => {
    if (!Object.hasOwn(LIVE_INTEGRATIONS, connector)) {
        return assertUnreachable(connector as never, 'Unknown api connector');
    }
    if (!isLiveIntegrationRegistered(connector)) {
        throw new ParameterError(
            `The ${connector} integration isn't available on this server`,
        );
    }
    // Reached by the source's own connector, so its settings always match
    return LIVE_INTEGRATIONS[connector] as unknown as LiveIntegration;
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
    if (!isLiveIntegrationRegistered(connector)) {
        return null;
    }
    const parsed =
        getLiveIntegration(connector).connection.settings.safeParse(value);
    return parsed.success ? parsed.data : null;
};
