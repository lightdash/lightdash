import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import {
    setLiveSourceReturnTo,
    type LiveSourceReturnTo,
} from './postHogConnection';

export type GoogleConnector =
    | ApiConnectorType.SEARCH_CONSOLE
    | ApiConnectorType.GA4
    | ApiConnectorType.GOOGLE_ADS
    | ApiConnectorType.YOUTUBE_ANALYTICS;

const GOOGLE_SOURCES: {
    connector: GoogleConnector;
    label: string;
    defaultName: string;
}[] = [
    {
        connector: ApiConnectorType.SEARCH_CONSOLE,
        label: 'Google Search Console',
        defaultName: 'Search Console',
    },
    {
        connector: ApiConnectorType.GA4,
        label: 'Google Analytics 4',
        defaultName: 'Google Analytics',
    },
    {
        connector: ApiConnectorType.GOOGLE_ADS,
        label: 'Google Ads',
        defaultName: 'Google Ads',
    },
    {
        connector: ApiConnectorType.YOUTUBE_ANALYTICS,
        label: 'YouTube Analytics',
        defaultName: 'YouTube Analytics',
    },
];

export const isGoogleConnector = (
    connector: ApiConnectorType,
): connector is GoogleConnector =>
    LIVE_INTEGRATION_CATALOG[connector].setup === 'google';

export const getGoogleSource = (connector: GoogleConnector) => {
    const source = GOOGLE_SOURCES.find(
        (candidate) => candidate.connector === connector,
    );
    if (!source) throw new Error(`Unknown Google source ${connector}`);
    return source;
};

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
