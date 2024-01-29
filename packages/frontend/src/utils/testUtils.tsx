import {
    ApiResponse,
    HealthState,
    LightdashMode,
    LightdashUserWithAbilityRules,
    OrganizationMemberRole,
} from '@lightdash/common';
import {
    Queries,
    queries,
    render,
    renderHook,
    RenderHookOptions,
    RenderHookResult,
    RenderOptions,
    RenderResult,
} from '@testing-library/react';
import nock from 'nock';
import { FC, PropsWithChildren, ReactElement } from 'react';
import { BASE_API_URL } from '../api';
import { AppProvider } from '../providers/AppProvider';
import ReactQueryProvider, {
    createQueryClient,
} from '../providers/ReactQueryProvider';

function mockHealthResponse(
    overrides: Partial<HealthState> = {},
): ApiResponse<HealthState> {
    return {
        status: 'ok',
        results: {
            healthy: true,
            mode: LightdashMode.CLOUD_BETA,
            version: '0.0.0',
            localDbtEnabled: true,
            isAuthenticated: true,
            requiresOrgRegistration: false,
            latest: {
                version: '0.0.0',
            },
            rudder: {
                dataPlaneUrl: '',
                writeKey: '',
            },
            sentry: {
                dsn: '',
                release: '',
                environment: '',
            },
            intercom: {
                appId: '',
                apiBase: '',
            },
            siteUrl: 'http://localhost:3000',
            staticIp: '',
            posthog: {
                projectApiKey: '',
                apiHost: '',
            },
            query: {
                maxLimit: 1000000,
                csvCellsLimit: 100,
            },
            pivotTable: {
                maxColumnLimit: 100,
            },
            customVisualizationsEnabled: true,
            hasSlack: false,
            auth: {
                disablePasswordAuthentication: false,
                google: {
                    googleDriveApiKey: '',
                    oauth2ClientId: '',
                    loginPath: '/login/google',
                    enabled: false,
                },
                okta: {
                    loginPath: '/login/okta',
                    enabled: false,
                },
                oneLogin: {
                    loginPath: '/login/oneLogin',
                    enabled: false,
                },
                azuread: {
                    loginPath: '/login/azuread',
                    enabled: false,
                },
            },
            hasEmailClient: false,
            hasHeadlessBrowser: false,
            hasDbtSemanticLayer: false,
            hasGroups: false,
            ...overrides,
        },
    };
}

export function mockUserResponse(
    overrides: Partial<LightdashUserWithAbilityRules> = {},
): ApiResponse<LightdashUserWithAbilityRules> {
    return {
        status: 'ok',
        results: {
            userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
            email: 'demo@lightdash.com',
            firstName: 'David',
            lastName: 'Attenborough',
            organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
            organizationName: 'Jaffle Shop',
            organizationCreatedAt: new Date('2024-01-11T03:46:50.732Z'),
            isTrackingAnonymized: false,
            isMarketingOptedIn: true,
            isSetupComplete: true,
            role: OrganizationMemberRole.ADMIN,
            isActive: true,
            abilityRules: [
                {
                    action: 'view',
                    subject: 'OrganizationMemberProfile',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'view',
                    subject: 'CsvJobResult',
                    conditions: {
                        createdByUserUuid:
                            'b264d83a-9000-426a-85ec-3f9c20f368ce',
                    },
                },
                {
                    action: 'view',
                    subject: 'PinnedItems',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'view',
                    subject: 'Dashboard',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'view',
                    subject: 'Space',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'view',
                    subject: 'SavedChart',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'view',
                    subject: 'Project',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'view',
                    subject: 'Organization',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'ExportCsv',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'create',
                    subject: 'Project',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'create',
                    subject: 'Job',
                },
                {
                    action: 'view',
                    subject: 'Job',
                    conditions: {
                        userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
                    },
                },
                {
                    action: 'view',
                    subject: 'UnderlyingData',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'ChangeCsvResults',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'Explore',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'Dashboard',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'Space',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'SavedChart',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'Job',
                },
                {
                    action: 'manage',
                    subject: 'PinnedItems',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'update',
                    subject: 'Project',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'SqlRunner',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'Validation',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'Project',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'InviteLink',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'Organization',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'view',
                    subject: 'Analytics',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'OrganizationMemberProfile',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'PinnedItems',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
                {
                    action: 'manage',
                    subject: 'Group',
                    conditions: {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                    },
                },
            ],
            ...overrides,
        },
    };
}

const AllTheProviders: FC<PropsWithChildren> = ({ children }) => {
    const queryClient = createQueryClient({
        queries: {
            retry: false,
        },
        mutations: {
            retry: false,
        },
    });

    return (
        <ReactQueryProvider queryClient={queryClient}>
            <AppProvider>{children}</AppProvider>;
        </ReactQueryProvider>
    );
};

function mockAppProviderResponses(
    overrideMockResponses?: Partial<{
        user: Parameters<typeof mockUserResponse>[0];
        health: Parameters<typeof mockHealthResponse>[0];
    }>,
) {
    nock(BASE_API_URL)
        .get('/api/v1/health')
        .reply(200, mockHealthResponse(overrideMockResponses?.health));
    nock(BASE_API_URL)
        .get('/api/v1/user')
        .reply(200, mockUserResponse(overrideMockResponses?.user));
}

export function renderWithProviders<
    Q extends Queries = typeof queries,
    Container extends Element | DocumentFragment = HTMLElement,
    BaseElement extends Element | DocumentFragment = Container,
>(
    ui: ReactElement,
    overrideMockResponses?: Parameters<typeof mockAppProviderResponses>[0],
    options?: Omit<RenderOptions<Q, Container, BaseElement>, 'wrapper'>,
): RenderResult<Q, Container, BaseElement> {
    mockAppProviderResponses(overrideMockResponses);

    return render(ui, { wrapper: AllTheProviders, ...options });
}

export function renderHookWithProviders<
    Result,
    Props,
    Q extends Queries = typeof queries,
    Container extends Element | DocumentFragment = HTMLElement,
    BaseElement extends Element | DocumentFragment = Container,
>(
    hook: (initialProps: Props) => Result,
    overrideMockResponses?: Partial<{
        user: Parameters<typeof mockUserResponse>[0];
        health: Parameters<typeof mockHealthResponse>[0];
    }>,
    options?: RenderHookOptions<Props, Q, Container, BaseElement>,
): RenderHookResult<Result, Props> {
    mockAppProviderResponses(overrideMockResponses);

    return renderHook(hook, { wrapper: AllTheProviders, ...options });
}
