import { ApiConnectorType } from '@lightdash/common';
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
    description: string;
}[] = [
    {
        connector: ApiConnectorType.SEARCH_CONSOLE,
        label: 'Google Search Console',
        defaultName: 'Search Console',
        description:
            'AI agents read search clicks, impressions, CTR and position for one Search Console site.',
    },
    {
        connector: ApiConnectorType.GA4,
        label: 'Google Analytics 4',
        defaultName: 'Google Analytics',
        description:
            'AI agents run reports on users, sessions, events and revenue for one GA4 property.',
    },
    {
        connector: ApiConnectorType.GOOGLE_ADS,
        label: 'Google Ads',
        defaultName: 'Google Ads',
        description:
            'AI agents read cost, clicks, impressions and conversions for one Google Ads account.',
    },
    {
        connector: ApiConnectorType.YOUTUBE_ANALYTICS,
        label: 'YouTube Analytics',
        defaultName: 'YouTube Analytics',
        description:
            'AI agents read views, watch time and subscribers for one YouTube channel.',
    },
];

export const isGoogleConnector = (
    connector: ApiConnectorType,
): connector is GoogleConnector =>
    GOOGLE_SOURCES.some((source) => source.connector === connector);

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
) => {
    const params = new URLSearchParams({ connector, name: name.trim() });
    if (connectionUuid) params.set('connectionUuid', connectionUuid);
    setLiveSourceReturnTo(params, returnTo);
    return `/api/v1/ee/projects/${projectUuid}/live-sources/google/oauth/start?${params.toString()}`;
};
