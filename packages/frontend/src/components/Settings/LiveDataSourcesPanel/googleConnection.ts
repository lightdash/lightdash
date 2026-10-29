import {
    ApiConnectorType,
    assertUnreachable,
    type ExternalConnectionApiSource,
} from '@lightdash/common';

export type GoogleConnector = ApiConnectorType.SEARCH_CONSOLE;

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

/** What a source reads: a PostHog project or a Search Console site. */
export const getApiSourceTarget = (apiSource: ExternalConnectionApiSource) => {
    switch (apiSource.connector) {
        case ApiConnectorType.POSTHOG:
            return `Project ${apiSource.projectId}`;
        case ApiConnectorType.SEARCH_CONSOLE:
            return apiSource.siteUrl;
        default:
            return assertUnreachable(apiSource, 'Unknown connector');
    }
};
