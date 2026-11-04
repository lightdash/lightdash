/* oxlint-disable react/only-export-components -- Shared Storybook fixtures and providers. */
import {
    DbtProjectType,
    getSlackFeatureAvailability,
    type SlackSettings,
    FeatureFlags,
    LightdashMode,
    ProjectType,
    WarehouseTypes,
    type HealthState,
    type LightdashUserWithAbilityRules,
    type Organization,
} from '@lightdash/common';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLayoutEffect, useState, type FC, type ReactNode } from 'react';
import {
    createMemoryRouter,
    Outlet,
    RouterProvider,
    useLocation,
} from 'react-router';
import { IntercomProvider } from 'react-use-intercom';
import NavBar from '../../components/NavBar';
import AbilityProvider from '../../providers/Ability/AbilityProvider';
import ActiveJobProvider from '../../providers/ActiveJob/ActiveJobProvider';
import AppProvider from '../../providers/App/AppProvider';
import FullscreenProvider from '../../providers/Fullscreen/FullscreenProvider';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';
import TrackingProvider from '../../providers/Tracking/TrackingProvider';
import mockHealthResponse from '../../testing/__mocks__/api/healthResponse.mock';
import { mockUserResponse } from '../../testing/__mocks__/api/userResponse.mock';

export const ORG_UUID = '5b1f6c2e-8a3d-4f7e-9c21-3e6d8f0a4b17';
export const USER_UUID = 'a7c3e9f1-2b4d-4e6a-8c0f-1d3b5e7f9a20';
export const PROJECT_UUID = 'e2d4f6a8-1c3e-4a5b-9d7f-0b2c4e6a8d13';
export const RUN_UUID = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

const NOW = new Date('2026-11-02T10:30:00Z');
export const minutesAgo = (minutes: number) =>
    new Date(NOW.getTime() - minutes * 60_000).toISOString();
export const minutesFromNow = (minutes: number) =>
    new Date(Date.now() + minutes * 60_000).toISOString();

export const storyHealth = (
    overrides: Partial<HealthState> = {},
): HealthState => {
    const base = mockHealthResponse();
    return {
        ...base,
        mode: LightdashMode.CLOUD_BETA,
        license: { hasLicenseKey: true, valid: true },
        hasEmailClient: true,
        hasBrandfetch: true,
        hasGoogleLiveSources: true,
        hasPostHogOAuth: true,
        siteUrl: 'https://acme.example.com',
        externalSources: { ...base.externalSources, engineAvailable: true },
        ...overrides,
    };
};

export const storyUser = (
    overrides: Partial<LightdashUserWithAbilityRules> = {},
): LightdashUserWithAbilityRules =>
    mockUserResponse({
        userUuid: USER_UUID,
        email: 'maya@example.com',
        firstName: 'Maya',
        lastName: 'Okafor',
        organizationUuid: ORG_UUID,
        organizationName: 'Acme Coffee',
        isSetupComplete: true,
        abilityRules: [{ action: 'manage', subject: 'all' }],
        ...overrides,
    });

export const storyOrganization = (
    overrides: Partial<Organization> = {},
): Organization => ({
    organizationUuid: ORG_UUID,
    name: 'Acme Coffee',
    needsProject: false,
    defaultProjectUuid: PROJECT_UUID,
    ...overrides,
});

export const storyProjectSummary = {
    projectUuid: PROJECT_UUID,
    name: 'Acme analytics',
    type: ProjectType.DEFAULT,
    createdByUserUuid: USER_UUID,
    createdByUserName: 'Maya Okafor',
    createdAt: minutesAgo(30),
    upstreamProjectUuid: null,
    warehouseType: WarehouseTypes.POSTGRES,
    expiresAt: null,
    provisioningSource: null,
};

export const storyProject = {
    organizationUuid: ORG_UUID,
    projectUuid: PROJECT_UUID,
    name: 'Acme analytics',
    type: ProjectType.DEFAULT,
    dbtConnection: { type: DbtProjectType.NONE },
    warehouseConnection: {
        type: WarehouseTypes.POSTGRES,
        host: 'db.example.internal',
        port: 5432,
        dbname: 'analytics',
        schema: 'public',
        sslmode: 'require',
    },
    upstreamProjectUuid: null,
    dbtVersion: 'v1.9',
    createdByUserUuid: USER_UUID,
    provisioningSource: null,
};

const ENABLED_FLAGS: string[] = [
    FeatureFlags.NewOnboarding,
    FeatureFlags.CodingAgentOnboarding,
    FeatureFlags.ApiQuerySources,
    FeatureFlags.ExternalSources,
];

export type StubRequest = {
    method: string;
    path: string;
    params: Record<string, string>;
    searchParams: URLSearchParams;
    body: unknown;
};
type StubResult = unknown;
/** Keys are `METHOD /path` after `/api/vN`, with `:param` segments. */
export type StubRoutes = Record<string, StubResult>;

const defaultRoutes = (): StubRoutes => ({
    'GET /health': storyHealth(),
    'GET /user': storyUser(),
    'GET /org': storyOrganization(),
    'GET /flash': {},
    'GET /org/projects': [storyProjectSummary],
    'GET /projects/:projectUuid': storyProject,
    'GET /projects/:projectUuid/dataCatalog/metrics/has': false,
    'GET /projects/:projectUuid/favorites': [],
    'GET /projects/:projectUuid/validate': [],
    'GET /projects/:projectUuid/user-warehouse-credentials': [],
    'GET /projects/:projectUuid/user-credentials': null,
    'GET /projects/:projectUuid/warehouse-credentials/shared-sign-in': null,
    'GET /notifications': [],
    'GET /github/config': null,
    'GET /slack/': {
        organizationUuid: ORG_UUID,
        slackTeamName: '',
        createdAt: NOW,
        scopes: [],
        notificationChannel: undefined,
        appProfilePhotoUrl: undefined,
        hasRequiredScopes: false,
        features: getSlackFeatureAvailability([], false),
    } satisfies SlackSettings,
    'GET /org/jobs/create-project/active': null,
    'GET /ee/homepage/recommended-action-skips': [],
    'GET /aiAgents/settings': {
        isCopilotEnabled: false,
        isTrial: false,
        aiAgentsVisible: false,
        aiAgentMemoryEnabled: false,
        aiAgentReviewsEnabled: false,
        aiAgentReviewsAvailable: false,
        defaultAiAgentModelConfig: null,
        defaultAiAgentModelOptions: [],
        dataAppCodingAgent: 'claude',
        visibleDataAppModels: [],
    },
    'GET /org/ai-credits/usage': {
        period: { periodStart: minutesAgo(60), periodEnd: minutesFromNow(60) },
        contract: null,
        canShowCredits: false,
        billable: { credits: 0, tokens: 0, calls: 0 },
        selfManaged: { credits: 0, tokens: 0, calls: 0 },
        excluded: { credits: 0, tokens: 0, calls: 0 },
        unpricedTokens: 0,
        byFeature: [],
        byTier: [],
        byChannel: [],
        byKeyOrigin: [],
        activeHolds: [],
    },
    'GET /org/brand': null,
    'GET /org/access': { status: 'active' },
    'GET /user/account': () => {
        const user = storyUser();
        return {
            organization: {
                organizationUuid: ORG_UUID,
                name: user.organizationName,
            },
            authentication: { type: 'session', source: '' },
            user: { ...user, id: user.userUuid, type: 'registered' },
        };
    },
    'GET /feature-flag/:flagId': ({ params }: StubRequest) => ({
        id: params.flagId,
        enabled: ENABLED_FLAGS.includes(params.flagId),
    }),
});

const matchRoute = (pattern: string, path: string) => {
    const names: string[] = [];
    const regex = new RegExp(
        `^${pattern.replace(/:([a-zA-Z]+)/g, (_, name: string) => {
            names.push(name);
            return '([^/]+)';
        })}$`,
    );
    const match = regex.exec(path);
    if (!match) return null;
    return Object.fromEntries(
        names.map((name, index) => [
            name,
            decodeURIComponent(match[index + 1]),
        ]),
    );
};

let activeRoutes: StubRoutes = defaultRoutes();

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const realFetch = window.fetch.bind(window);
const stubFetch: typeof window.fetch = async (input, init) => {
    const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.origin,
    );
    const apiPath = /^\/api\/v\d+(\/.*)$/.exec(url.pathname)?.[1];
    if (!apiPath) return realFetch(input, init);
    const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    let body: unknown = null;
    try {
        body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    } catch {
        body = init?.body ?? null;
    }
    // Later keys win so per-story overrides beat the defaults
    const entries = Object.entries(activeRoutes).reverse();
    for (const [key, result] of entries) {
        const [routeMethod, pattern] = key.split(' ');
        const params =
            routeMethod === method ? matchRoute(pattern, apiPath) : null;
        if (params) {
            const results =
                typeof result === 'function'
                    ? result({
                          method,
                          path: url.pathname,
                          params,
                          searchParams: url.searchParams,
                          body,
                      })
                    : result;
            return json(200, { status: 'ok', results });
        }
    }
    console.warn(`[storyApi] unhandled ${method} ${url.pathname}`);
    return json(404, {
        status: 'error',
        error: {
            statusCode: 404,
            name: 'NotFoundError',
            message: `No story stub for ${method} ${url.pathname}`,
        },
    });
};

/** Routes API calls to the story stubs; the returned function puts the previous fetch back */
export const installStoryFetch = () => {
    const previousFetch = window.fetch;
    window.fetch = stubFetch;
    return () => {
        window.fetch = previousFetch;
    };
};

const RedirectNotice: FC = () => {
    const location = useLocation();
    return <div data-story-redirect>Navigated to {location.pathname}</div>;
};

type OnboardingStoryProps = {
    /** Route pattern the page is mounted at, e.g. `/onboarding/tools/:projectUuid` */
    path: string;
    /** Initial URL */
    url: string;
    element: ReactNode;
    routes?: StubRoutes;
    withNavBar?: boolean;
};

export const OnboardingStory: FC<OnboardingStoryProps> = ({
    path,
    url,
    element,
    routes = {},
    withNavBar = false,
}) => {
    activeRoutes = { ...defaultRoutes(), ...routes };
    // Layout effects run before the queries' passive effects fire their first fetch
    useLayoutEffect(installStoryFetch, []);
    const [queryClient] = useState(() =>
        createQueryClient({
            queries: { retry: false, refetchOnWindowFocus: false },
        }),
    );
    const [router] = useState(() =>
        createMemoryRouter(
            [
                {
                    path: '/',
                    element: (
                        <AppProvider>
                            <FullscreenProvider enabled={false}>
                                <IntercomProvider
                                    appId=""
                                    shouldInitialize={false}
                                >
                                    <TrackingProvider enabled={false}>
                                        <AbilityProvider>
                                            <ActiveJobProvider>
                                                {withNavBar && <NavBar />}
                                                <Outlet />
                                            </ActiveJobProvider>
                                        </AbilityProvider>
                                    </TrackingProvider>
                                </IntercomProvider>
                            </FullscreenProvider>
                        </AppProvider>
                    ),
                    children: [
                        { path, element },
                        { path: '*', element: <RedirectNotice /> },
                    ],
                },
            ],
            { initialEntries: [url] },
        ),
    );
    return (
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );
};
