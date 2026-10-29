import {
    ApiConnectorType,
    assertUnreachable,
    type ExternalConnectionApiSource,
} from '@lightdash/common';

export type GoogleConnector =
    | ApiConnectorType.SEARCH_CONSOLE
    | ApiConnectorType.GA4;

export const GOOGLE_SOURCES: {
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
) => {
    const params = new URLSearchParams({ connector, name: name.trim() });
    if (connectionUuid) params.set('connectionUuid', connectionUuid);
    return `/api/v1/ee/projects/${projectUuid}/live-sources/google/oauth/start?${params.toString()}`;
};

/** What a source reads: a PostHog project, a Search Console site or a GA4 property. */
export const getApiSourceTarget = (apiSource: ExternalConnectionApiSource) => {
    switch (apiSource.connector) {
        case ApiConnectorType.POSTHOG:
            return `Project ${apiSource.projectId}`;
        case ApiConnectorType.SEARCH_CONSOLE:
            return apiSource.siteUrl;
        case ApiConnectorType.GA4:
            return `Property ${apiSource.propertyId}`;
        default:
            return assertUnreachable(apiSource, 'Unknown connector');
    }
};
