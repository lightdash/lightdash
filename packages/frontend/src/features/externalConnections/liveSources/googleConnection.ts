import {
    LIVE_INTEGRATION_CATALOG,
    type ApiConnectorType,
} from '@lightdash/common';
import {
    setLiveSourceReturnTo,
    type LiveSourceReturnTo,
} from './postHogConnection';

export type GoogleConnector =
    | ApiConnectorType.SEARCH_CONSOLE
    | ApiConnectorType.GA4
    | ApiConnectorType.GOOGLE_ADS
    | ApiConnectorType.YOUTUBE_ANALYTICS;

export const isGoogleConnector = (
    connector: ApiConnectorType,
): connector is GoogleConnector =>
    LIVE_INTEGRATION_CATALOG[connector].setup === 'google';

/** The catalog entry of a Google source. */
export const getGoogleSource = (connector: GoogleConnector) =>
    LIVE_INTEGRATION_CATALOG[connector];

/** Opens Google's consent screen; reconnecting keeps the source's uuid. */
export const getGoogleSignInUrl = (
    projectUuid: string,
    connector: GoogleConnector,
    name: string,
    connectionUuid: string | null,
    returnTo: LiveSourceReturnTo,
    explorePrefix?: string,
) => {
    const params = new URLSearchParams({ connector, name: name.trim() });
    if (connectionUuid) params.set('connectionUuid', connectionUuid);
    if (explorePrefix) params.set('explorePrefix', explorePrefix);
    setLiveSourceReturnTo(params, returnTo);
    return `/api/v1/ee/projects/${projectUuid}/live-sources/google/oauth/start?${params.toString()}`;
};
