import type {
    AiReviewLinearRouting,
    LinearInstallation,
    LinearProject,
    LinearTeam,
} from '@lightdash/common'; // pragma: allowlist secret

export const LINEAR_PREVIEW_QUERY_PARAM = 'linearPreview';

export const LINEAR_SETTINGS_PREVIEW = {
    installation: {
        organizationUuid: '00000000-0000-0000-0000-000000000001',
        organizationName: 'Acme',
        organizationUrlKey: 'acme',
        requiresReconnect: false,
    } satisfies LinearInstallation,
    routing: {
        organizationUuid: '00000000-0000-0000-0000-000000000001',
        applyToAllProjects: true,
        projectUuids: [],
        enabled: true,
        linearTeamId: 'team-1',
        linearProjectId: 'linear-project-1',
    } satisfies AiReviewLinearRouting,
    teams: [
        { id: 'team-1', name: 'Product', key: 'PRD' },
        { id: 'team-2', name: 'Data', key: 'DAT' },
    ] satisfies LinearTeam[],
    projects: [
        { id: 'linear-project-1', name: 'Fix data with AI' },
        { id: 'linear-project-2', name: 'Semantic layer' },
    ] satisfies LinearProject[],
};

export const isLinearSettingsPreviewEnabled = (): boolean =>
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get(
        LINEAR_PREVIEW_QUERY_PARAM,
    ) === 'connected';

export const buildLinearAppSetupUrl = (siteUrl: string): string => {
    const callbackUrl = new URL('/api/v1/linear/oauth/callback', siteUrl).href;
    const params = new URLSearchParams({
        distribution: 'private',
        'display.description':
            'Creates issues from Lightdash AI agent review findings.',
        'developer.name': 'Lightdash',
        'oauth.client_name': 'Lightdash AI reviews',
        'oauth.client_uri': siteUrl,
        'oauth.redirect_uris': callbackUrl,
        'oauth.grant_types': 'authorization_code',
    });
    return `https://linear.app/settings/api/applications/new?${params.toString()}`;
};
