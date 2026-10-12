import {
    type OrganizationAgentIdentityOverview,
    AgentCapability,
    WarehouseTypes,
    type OrganizationAgentIdentitySnowflakeSetup,
    type OrganizationAgentIdentitySnowflakeVerify,
    OrganizationMemberRole,
    type ApiResponse,
    type AgentCapabilityPolicyOverview,
    type AgentSystemRoleMatrix,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { AgentIdentitySettingsPage } from './AgentIdentitySettingsPage';
import {
    agentSettingsIdentityMock,
    agentSettingsMcpMock,
} from './agentSettings.mock';
import { getAgentSettingsAccess } from './agentSettingsAccess';
import { identityLabels, identityWarehouseNames } from './identityLabels';

const mocks = vi.hoisted(() => ({
    enabled: true,
    canManage: true,
    configured: true,
    healthLoading: false,
    healthError: false,
    refetch: vi.fn(),
    toast: vi.fn(),
    errorToast: vi.fn(),
}));
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        health: {
            data: {
                rudder: {},
                auth: { snowflakeAi: { enabled: mocks.configured } },
                siteUrl: 'https://instance.example/',
            },
            isLoading: mocks.healthLoading,
            isError: mocks.healthError,
            refetch: mocks.refetch,
        },
        user: {
            data: {
                organizationUuid: 'org',
                ability: { can: () => mocks.canManage },
            },
        },
    }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../hooks/useQueryError', () => ({ default: () => vi.fn() }));
vi.mock('../../hooks/settings/useSettingsContext', () => ({
    useSettingsContext: () => ({ showMyAgentConnections: true }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastApiError: vi.fn() }),
}));
const matrix = Object.fromEntries(
    Object.values(OrganizationMemberRole).map((role) => [
        role,
        Object.values(AgentCapability),
    ]),
) as AgentSystemRoleMatrix;
const policy: AgentCapabilityPolicyOverview = {
    mode: 'legacy',
    version: 1,
    allowedCapabilities: null,
    allowedGroupUuids: null,
    groupsAvailable: true,
    systemRoleMatrix: matrix,
    defaults: matrix,
};
const api = vi.mocked(lightdashApi);
const renderPage = (
    access = {
        agentsPage: true,
        agentsMcp: true,
        mcpPage: 'link' as 'link' | 'switch' | 'hidden',
    },
    client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    }),
) =>
    render(
        <MantineProvider env="test">
            <MemoryRouter>
                <QueryClientProvider client={client}>
                    <AgentIdentitySettingsPage access={access} />
                </QueryClientProvider>
            </MemoryRouter>
        </MantineProvider>,
    );
const response = (url: string): ApiResponse['results'] =>
    url === '/org/projects'
        ? []
        : url === '/org/agent-identity'
          ? agentSettingsIdentityMock
          : url === '/org/agent-permissions'
            ? policy
            : url.startsWith('/org/groups')
              ? { data: [] }
              : agentSettingsMcpMock();
beforeEach(() => {
    vi.clearAllMocks();
    api.mockImplementation(async ({ url }) => response(url));
});
describe('Agents page loading boundary', () => {
    it.each([
        ['/org/agent-identity', '/org/agent-permissions'],
        ['/org/agent-permissions', '/org/agent-identity'],
    ])(
        'holds one loader when requests arrive %j then %j',
        async (first, second) => {
            const resolve = new Map<
                string,
                (value: ApiResponse['results']) => void
            >();
            api.mockImplementation(
                ({ url }) => new Promise((done) => resolve.set(url, done)),
            );
            const view = renderPage();
            expect([...resolve.keys()]).toEqual(
                expect.arrayContaining([
                    '/org/agent-identity',
                    '/org/projects',
                    '/org/agent-permissions',
                    '/aiAgents/admin/settings',
                ]),
            );
            expect(resolve.has('/org/groups?includeMembers=1')).toBe(false);
            const assertLoading = () => {
                expect(
                    view.container.querySelectorAll('.mantine-Loader-root'),
                ).toHaveLength(1);
                expect(
                    screen.queryByText('Permissions'),
                ).not.toBeInTheDocument();
                expect(screen.queryByText('Identity')).not.toBeInTheDocument();
            };
            assertLoading();
            await act(async () => resolve.get(first)?.(response(first)));
            assertLoading();
            await act(async () => resolve.get(second)?.(response(second)));
            assertLoading();
            await waitFor(() =>
                expect(resolve.has('/org/groups?includeMembers=1')).toBe(true),
            );
            await act(async () =>
                resolve.get('/aiAgents/admin/settings')?.(
                    response('/aiAgents/admin/settings'),
                ),
            );
            assertLoading();
            await act(async () => resolve.get('/org/projects')?.([]));
            assertLoading();
            await act(async () =>
                resolve.get('/org/groups?includeMembers=1')?.({ data: [] }),
            );
            expect(await screen.findByText('Permissions')).toBeInTheDocument();
            expect(screen.getByText('Identity')).toBeInTheDocument();
            expect(
                view.container.querySelectorAll('.mantine-Loader-root'),
            ).toHaveLength(0);
        },
    );
    it('no access to the page: nothing renders, no request', () => {
        const view = renderPage({
            agentsPage: false,
            agentsMcp: false,
            mcpPage: 'switch',
        });
        expect(view.container.querySelector(':scope > :not(style)')).toBeNull();
        expect(api).not.toHaveBeenCalled();
    });
    it('makes no AI admin request without the MCP ability and no group request when unavailable', async () => {
        api.mockImplementation(async ({ url }) =>
            url === '/org/agent-permissions'
                ? { ...policy, groupsAvailable: false }
                : response(url),
        );
        renderPage({ agentsPage: true, agentsMcp: false, mcpPage: 'hidden' });
        await screen.findByText('Permissions');
        expect(api.mock.calls.map(([request]) => request.url)).toEqual([
            '/org/agent-identity',
            '/org/projects',
            '/org/agent-permissions',
        ]);
        expect(
            screen.queryByText('Who can use agents'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('switch', { name: 'Agents over MCP' }),
        ).not.toBeInTheDocument();
    });
    it('has one error state and retries the failed query', async () => {
        api.mockImplementation(async ({ url }) => {
            if (url === '/org/agent-permissions')
                throw { error: { message: 'Unavailable' } };
            return response(url);
        });
        renderPage();
        expect(
            await screen.findByText('Could not load agent settings.'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Identity')).not.toBeInTheDocument();
        api.mockImplementation(async ({ url }) => response(url));
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('Permissions')).toBeInTheDocument();
    });
    it.each([false, true])(
        'keeps a dirty draft while newly enabled groups settle with error=%s',
        async (fail) => {
            const client = new QueryClient({
                defaultOptions: { queries: { retry: false } },
            });
            let groupsResolve: (
                value: ApiResponse['results'],
            ) => void = () => {};
            let groupsReject: (reason: unknown) => void = () => {};
            let currentPolicy = { ...policy, groupsAvailable: false };
            api.mockImplementation(({ url }) => {
                if (url.startsWith('/org/groups'))
                    return new Promise((resolve, reject) => {
                        groupsResolve = resolve;
                        groupsReject = reject;
                    });
                return Promise.resolve(
                    url === '/org/agent-permissions'
                        ? currentPolicy
                        : response(url),
                );
            });
            const view = renderPage(undefined, client);
            await screen.findByText('Permissions');
            fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
            fireEvent.click(
                screen.getByRole('switch', { name: 'Delete content' }),
            );
            const assertDraft = () => {
                expect(
                    view.container.querySelectorAll('.mantine-Loader-root'),
                ).toHaveLength(0);
                expect(
                    screen.getByRole('switch', { name: 'Delete content' }),
                ).not.toBeChecked();
                expect(
                    screen.getByText('2 unsaved changes'),
                ).toBeInTheDocument();
            };
            assertDraft();
            currentPolicy = { ...currentPolicy, groupsAvailable: true };
            await act(async () => {
                await client.invalidateQueries([
                    'ai-access',
                    'org',
                    'org',
                    'agent-permissions',
                ]);
            });
            await waitFor(() =>
                expect(api).toHaveBeenCalledWith(
                    expect.objectContaining({
                        url: '/org/groups?includeMembers=1',
                    }),
                ),
            );
            assertDraft();
            expect(
                screen.queryByText('Who can use agents'),
            ).not.toBeInTheDocument();
            await act(async () => {
                if (fail) groupsReject({ error: { message: 'Unavailable' } });
                else groupsResolve({ data: [] });
            });
            if (fail) {
                await screen.findByText('Could not load agent settings.');
                expect(
                    screen.getByRole('button', { name: 'Review and save' }),
                ).toBeDisabled();
            } else await screen.findByText('Who can use agents');
            assertDraft();
        },
    );
    it.each([
        'verify fails first',
        'verify errors first',
        'setup first',
        'setup errors first',
    ])('shows no loader for an active Snowflake rule: %s', async (order) => {
        const pending = new Map<
            string,
            {
                resolve: (value: ApiResponse['results']) => void;
                reject: (reason: unknown) => void;
            }
        >();
        const setup: OrganizationAgentIdentitySnowflakeSetup = {
            configured: false,
            missingSettings: [],
            integrationSql: 'SELECT 1',
            redirectUri: 'https://example.com/callback',
            client: {
                source: null,
                accountUrl: null,
                clientId: null,
                hasClientSecret: false,
                updatedAt: null,
            },
        };
        const verify: OrganizationAgentIdentitySnowflakeVerify = {
            checkedAt: new Date(),
            passed: false,
            checks: [],
        };
        api.mockImplementation(({ url }) => {
            if (url.includes('/snowflake/'))
                return new Promise((resolve, reject) =>
                    pending.set(url.split('/').at(-1)!, {
                        resolve,
                        reject,
                    }),
                );
            return Promise.resolve(
                url === '/org/agent-identity'
                    ? {
                          ...agentSettingsIdentityMock,
                          rules: [
                              {
                                  warehouseType: WarehouseTypes.SNOWFLAKE,
                                  source: 'agent_sign_in',
                                  projectsMissingAiServiceAccount: null,
                              },
                          ],
                      }
                    : response(url),
            );
        });
        const loaders = () =>
            view.container.querySelectorAll('.mantine-Loader-root');
        const steps = () =>
            screen.queryByRole('button', { name: 'Verify integration' });
        const settleSetup = () =>
            act(async () => {
                if (order === 'setup errors first')
                    pending
                        .get('setup')!
                        .reject({ error: { message: 'Unavailable' } });
                else pending.get('setup')!.resolve(setup);
            });
        const settleVerify = () =>
            act(async () => {
                if (order === 'verify errors first')
                    pending
                        .get('verify')!
                        .reject({ error: { message: 'Unavailable' } });
                else pending.get('verify')!.resolve(verify);
            });
        const view = renderPage();
        await screen.findByText('Permissions');
        await waitFor(() => expect(pending.size).toBe(2));
        expect(
            screen.queryByRole('status', { name: /Snowflake agent sign-in/ }),
        ).not.toBeInTheDocument();
        expect(loaders()).toHaveLength(0);
        expect(steps()).not.toBeInTheDocument();
        if (order.startsWith('setup')) await settleSetup();
        else {
            await settleVerify();
            await screen.findByRole('status', {
                name: 'Snowflake agent sign-in needs attention',
            });
        }
        expect(loaders()).toHaveLength(0);
        expect(steps()).not.toBeInTheDocument();
        if (order.startsWith('setup')) await settleVerify();
        else await settleSetup();
        expect(
            await screen.findByRole('status', {
                name: 'Snowflake agent sign-in needs attention',
            }),
        ).toBeInTheDocument();
        expect(
            await screen.findByText(
                /^Snowflake agent integration needs attention/,
            ),
        ).toBeInTheDocument();
        if (order === 'setup errors first') {
            expect(
                screen.getByRole('button', { name: 'Retry' }),
            ).toBeInTheDocument();
            expect(
                await screen.findByText('Could not load the Snowflake setup.'),
            ).toBeInTheDocument();
        } else
            expect(
                await screen.findByRole('button', {
                    name: 'Verify integration',
                }),
            ).toBeInTheDocument();
        if (order === 'verify errors first')
            expect(screen.getByRole('alert')).toHaveTextContent(
                'Could not verify the Snowflake agent integration.',
            );
        expect(loaders()).toHaveLength(0);
        expect(
            api.mock.calls.filter(([request]) =>
                request.url.endsWith('/verify'),
            ),
        ).toHaveLength(1);
    });
    it('does not request Snowflake setup or verification without an active rule', async () => {
        renderPage();
        await screen.findByText('Permissions');
        expect(
            api.mock.calls.some(([request]) =>
                request.url.includes('/snowflake/'),
            ),
        ).toBe(false);
    });
    it('shows the title, approved subtitle and organization breadcrumb', async () => {
        renderPage();
        await screen.findByText('Permissions');
        expect(screen.getByText('Organization settings')).toBeInTheDocument();
        expect(screen.getAllByText('Agents')).toHaveLength(2);
        expect(
            screen.getByText(
                'Who agents run as, and what they may do. Agents are Ask AI, the Slack agent, MCP clients and the CLI.',
            ),
        ).toBeInTheDocument();
    });
    it('treats a group request failure as a page error, not an empty group list', async () => {
        api.mockImplementation(async ({ url }) => {
            if (url.startsWith('/org/groups'))
                throw { error: { message: 'Unavailable' } };
            return response(url);
        });
        renderPage();
        expect(
            await screen.findByText('Could not load agent settings.'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Permissions')).not.toBeInTheDocument();
        expect(
            screen.queryByText('No groups available'),
        ).not.toBeInTheDocument();
    });
});

const overview = (): OrganizationAgentIdentityOverview => ({
    snowflakeConfigured: true,
    requireVerifiedAgentSessions: false,
    rules: [
        {
            warehouseType: WarehouseTypes.SNOWFLAKE,
            source: 'agent_sign_in',
            projectsMissingAiServiceAccount: null,
        },
        {
            warehouseType: WarehouseTypes.BIGQUERY,
            source: 'ai_service_account',
            projectsMissingAiServiceAccount: null,
        },
    ],
});
let currentOverview = overview();
let projects: { warehouseType?: WarehouseTypes }[] = [];
let missingProjects: { projectUuid: string; name: string }[] = [];
const backendSql = 'CREATE SECURITY INTEGRATION BACKEND_PROVIDED;';
let verification: OrganizationAgentIdentitySnowflakeVerify;
const apiHandler = async ({
    url,
    method,
    body,
}: Parameters<typeof lightdashApi>[0]) => {
    if (
        url === '/org/agent-permissions' ||
        url.startsWith('/org/groups') ||
        url === '/aiAgents/admin/settings'
    )
        return response(url);
    if (url === '/org/projects') return projects;
    if (url.endsWith('/projects-without-ai-service-account'))
        return missingProjects;
    if (url.endsWith('/setup'))
        return {
            redirectUri:
                'https://backend.example/api/v1/oauth/redirect/snowflake-ai',
            integrationSql: backendSql,
            client: {
                source: mocks.configured ? ('organization' as const) : null,
                accountUrl: null,
                clientId: null,
                hasClientSecret: mocks.configured,
                updatedAt: null,
            },
            configured: mocks.configured,
            missingSettings: mocks.configured ? [] : ['Snowflake OAuth client'],
        };
    if (url.endsWith('/verify')) return verification;
    if (method === 'PUT') {
        const rule = currentOverview.rules.find(({ warehouseType }) =>
            url.endsWith(`/${warehouseType}`),
        )!;
        try {
            if (typeof body !== 'string')
                throw new Error('Expected a JSON body');
            rule.source = JSON.parse(body).source;
        } catch {
            throw new Error('Invalid test request');
        }
        return rule;
    }
    return currentOverview;
};
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

const renderIdentityPage = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    renderPage(
        getAgentSettingsAccess({
            agentIdentityEnabled: mocks.enabled,
            canManageOrganization: mocks.canManage,
            canManageOrgAiAgent: true,
            isAiAvailable: true,
        }),
        client,
    );
    return { client };
};
const openSetup = async () => {
    fireEvent.click(
        await screen.findByRole('button', {
            name: /^Snowflake: agents run as/,
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'View setup' }));
};
const changeToMarkedPerson = async (name: string) => {
    fireEvent.click(
        await screen.findByRole('button', {
            name: new RegExp(`^${name}: agents run as`),
        }),
    );
    fireEvent.click(
        screen.getByRole('button', {
            name: identityLabels.marked_person.label,
        }),
    );
};

describe('Agents page identity integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(mocks, {
            enabled: true,
            canManage: true,
            configured: true,
            healthLoading: false,
            healthError: false,
        });
        currentOverview = overview();
        projects = Object.keys(identityWarehouseNames).map((warehouseType) => ({
            warehouseType: warehouseType as WarehouseTypes,
        }));
        missingProjects = [];
        verification = {
            checkedAt: new Date(),
            passed: true,
            checks: [
                {
                    id: 'oauth_client',
                    label: 'OAuth client settings',
                    required: true,
                    status: 'passed',
                    detail: 'All OAuth client settings are set.',
                },
                {
                    id: 'authorize_endpoint',
                    label: 'Authorization endpoint',
                    required: true,
                    status: 'passed',
                    detail: "Snowflake's sign-in page responded.",
                },
                {
                    id: 'agent_session',
                    label: 'Agent session',
                    required: false,
                    status: 'not_checked',
                    detail: 'No one has connected their agent yet.',
                },
            ],
        };
        vi.mocked(lightdashApi).mockImplementation(apiHandler);
    });

    it.each(['flag', 'permission'])(
        'hides ClickHouse controls with no requests for %s',
        (reason) => {
            currentOverview.rules.push({
                warehouseType: WarehouseTypes.CLICKHOUSE,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            });
            mocks.enabled = reason !== 'flag';
            mocks.canManage = reason !== 'permission';
            renderIdentityPage();
            expect(
                screen.queryByRole('button', {
                    name: /^ClickHouse: agents run as/,
                }),
            ).not.toBeInTheDocument();
            expect(lightdashApi).not.toHaveBeenCalled();
        },
    );

    it('waits for settings to load', () => {
        vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
        renderIdentityPage();
        expect(
            screen.queryByRole('button', { name: /: agents run as/ }),
        ).not.toBeInTheDocument();
    });

    it('allows retry after a load failure', async () => {
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        renderIdentityPage();
        expect(
            await screen.findByText('Could not load agent settings.'),
        ).toBeInTheDocument();
        vi.mocked(lightdashApi).mockImplementation(apiHandler);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findAllByRole('button', { name: /: agents run as/ }),
        ).toHaveLength(2);
    });

    it.each(['flag-off', 'non-admin'])('hides settings for %s', (mode) => {
        mocks.enabled = mode !== 'flag-off';
        mocks.canManage = mode !== 'non-admin';
        renderIdentityPage();
        expect(
            screen.queryByRole('heading', { name: 'Identity' }),
        ).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it.each(['/org/projects', '/org/agent-identity'])(
        'shows exactly one page loader until %s arrives',
        async (pendingUrl) => {
            let resolvePending: (
                value: Awaited<ReturnType<typeof apiHandler>>,
            ) => void = () => {};
            vi.mocked(lightdashApi).mockImplementation(async (request) =>
                request.url === pendingUrl
                    ? new Promise((resolve) => {
                          resolvePending = resolve;
                      })
                    : apiHandler(request),
            );
            const { client } = renderIdentityPage();
            await waitFor(() =>
                expect(
                    client.getQueryState(
                        pendingUrl === '/org/projects'
                            ? ['ai-access', 'org', 'agent-identity']
                            : ['projects'],
                    )?.status,
                ).toBe('success'),
            );
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            expect(
                document.querySelectorAll('.mantine-Loader-root'),
            ).toHaveLength(1);
            expect(
                screen.queryByRole('button', { name: /: agents run as/ }),
            ).not.toBeInTheDocument();
            await act(async () =>
                resolvePending(
                    pendingUrl === '/org/projects' ? projects : currentOverview,
                ),
            );
            expect(
                await screen.findAllByRole('button', {
                    name: /: agents run as/,
                }),
            ).toHaveLength(2);
            expect(document.querySelector('.mantine-Loader-root')).toBeNull();
        },
    );

    it('keeps the page loader when cached projects fail while identity first loads', async () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        client.setQueryData(['projects'], projects);
        const identity = deferred<OrganizationAgentIdentityOverview>();
        api.mockImplementation(async (request) => {
            if (request.url === '/org/projects')
                throw { error: { message: 'Unavailable' } };
            if (request.url === '/org/agent-identity') return identity.promise;
            return apiHandler(request);
        });
        renderPage(undefined, client);
        await waitFor(() =>
            expect(client.getQueryState(['projects'])?.status).toBe('error'),
        );
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(
            screen.queryByText('Could not load agent settings.'),
        ).not.toBeInTheDocument();
        expect(document.querySelectorAll('.mantine-Loader-root')).toHaveLength(
            1,
        );
        await act(async () => identity.resolve(currentOverview));
        expect(
            await screen.findAllByRole('button', { name: /: agents run as/ }),
        ).toHaveLength(2);
        expect(
            screen.queryByText('Could not load agent settings.'),
        ).not.toBeInTheDocument();
    });

    it('keeps the same saving chips locked through a failed background projects refetch and recovery', async () => {
        currentOverview.rules[0].source = 'marked_person';
        const saveRequest = deferred<Awaited<ReturnType<typeof apiHandler>>>();
        const projectsRequest =
            deferred<Awaited<ReturnType<typeof apiHandler>>>();
        vi.mocked(lightdashApi).mockImplementation((request) =>
            request.method === 'PUT'
                ? saveRequest.promise
                : apiHandler(request),
        );
        const { client } = renderIdentityPage();
        const chips = await screen.findAllByRole('button', {
            name: /: agents run as/,
        });
        fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
        const permissionsSave = screen.getByRole('button', {
            name: 'Review and save',
        });
        expect(permissionsSave).toBeEnabled();
        await changeToMarkedPerson('BigQuery');
        fireEvent.click(
            await screen.findByRole('button', { name: 'Run as the person' }),
        );
        const savingChip = screen.getByRole('button', {
            name: /^BigQuery: agents run as/,
        });
        await waitFor(() => expect(savingChip).toBeDisabled());
        const savingStatus = within(savingChip).getByRole('status', {
            name: 'Saving BigQuery identity',
        });
        const callsBefore = vi.mocked(lightdashApi).mock.calls.length;
        vi.mocked(lightdashApi).mockImplementation((request) =>
            request.url === '/org/projects'
                ? projectsRequest.promise
                : apiHandler(request),
        );
        let refetch: Promise<void>;
        act(() => {
            refetch = client.invalidateQueries(['projects']);
        });
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledTimes(callsBefore + 1),
        );
        await act(async () => {
            projectsRequest.reject({
                error: { message: 'Background projects unavailable' },
            });
            await refetch;
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await waitFor(() =>
            expect(client.getQueryState(['projects'])?.status).toBe('error'),
        );
        expect(
            screen.getAllByRole('button', { name: /: agents run as/ }),
        ).toEqual(chips);
        expect(
            screen.getByRole('button', { name: /^BigQuery: agents run as/ }),
        ).toBe(savingChip);
        expect(savingChip).toBeDisabled();
        expect(permissionsSave).toBeEnabled();
        expect(
            within(savingChip).getByRole('status', {
                name: 'Saving BigQuery identity',
            }),
        ).toBe(savingStatus);
        expect(
            screen.queryByText('Could not load agent settings.'),
        ).not.toBeInTheDocument();
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.slice(callsBefore)
                .map(([request]) => [request.method, request.url]),
        ).toEqual([['GET', '/org/projects']]);
        vi.mocked(lightdashApi).mockImplementation(apiHandler);
        await act(async () => {
            await client.invalidateQueries(['projects']);
        });
        expect(
            screen.getByRole('button', { name: /^BigQuery: agents run as/ }),
        ).toBe(savingChip);
        expect(savingChip).toBeDisabled();
        expect(permissionsSave).toBeEnabled();
        expect(
            within(savingChip).getByRole('status', {
                name: 'Saving BigQuery identity',
            }),
        ).toBe(savingStatus);
        fireEvent.click(savingChip);
        fireEvent.click(
            screen.getByRole('button', { name: 'Run as the person' }),
        );
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(([request]) => request.method === 'PUT'),
        ).toHaveLength(1);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.slice(callsBefore)
                .map(([request]) => [request.method, request.url]),
        ).toEqual([
            ['GET', '/org/projects'],
            ['GET', '/org/projects'],
        ]);
        await act(async () => {
            saveRequest.resolve(
                await apiHandler({
                    version: 'v2',
                    url: '/org/agent-identity/bigquery',
                    method: 'PUT',
                    body: JSON.stringify({ source: 'marked_person' }),
                }),
            );
        });
        await waitFor(() =>
            expect(
                screen.getByRole('button', {
                    name: 'BigQuery: agents run as the person. Change.',
                }),
            ).toBeEnabled(),
        );
    });

    it('keeps active Snowflake setup and one verification through a failed background projects refetch and recovery', async () => {
        const projectsRequest =
            deferred<Awaited<ReturnType<typeof apiHandler>>>();
        const { client } = renderIdentityPage();
        const chip = await screen.findByRole('button', {
            name: /^Snowflake: agents run as/,
        });
        await screen.findByRole('status', {
            name: 'Snowflake agent sign-in verified',
        });
        await openSetup();
        const setupContent = await screen.findByText(
            'Copy and run in Snowflake',
        );
        const hideSetup = screen.getByRole('button', { name: 'Hide setup' });
        const callsBefore = vi.mocked(lightdashApi).mock.calls.length;
        vi.mocked(lightdashApi).mockImplementation((request) =>
            request.url === '/org/projects'
                ? projectsRequest.promise
                : apiHandler(request),
        );
        let refetch: Promise<void>;
        act(() => {
            refetch = client.invalidateQueries(['projects']);
        });
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledTimes(callsBefore + 1),
        );
        await act(async () => {
            projectsRequest.reject({
                error: { message: 'Background projects unavailable' },
            });
            await refetch;
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await waitFor(() =>
            expect(client.getQueryState(['projects'])?.status).toBe('error'),
        );
        expect(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        ).toBe(chip);
        expect(screen.getByText('Copy and run in Snowflake')).toBe(
            setupContent,
        );
        expect(screen.getByRole('button', { name: 'Hide setup' })).toBe(
            hideSetup,
        );
        expect(setupContent).toBeVisible();
        expect(
            screen.queryByText('Could not load agent settings.'),
        ).not.toBeInTheDocument();
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.slice(callsBefore)
                .map(([request]) => [request.method, request.url]),
        ).toEqual([['GET', '/org/projects']]);
        vi.mocked(lightdashApi).mockImplementation(apiHandler);
        await act(async () => {
            await client.invalidateQueries(['projects']);
        });
        expect(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        ).toBe(chip);
        expect(screen.getByText('Copy and run in Snowflake')).toBe(
            setupContent,
        );
        expect(screen.getByRole('button', { name: 'Hide setup' })).toBe(
            hideSetup,
        );
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(([request]) =>
                    request.url.endsWith('/verify'),
                ),
        ).toHaveLength(1);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(([request]) =>
                    request.url.endsWith('/setup'),
                ),
        ).toHaveLength(1);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.slice(callsBefore)
                .map(([request]) => [request.method, request.url]),
        ).toEqual([
            ['GET', '/org/projects'],
            ['GET', '/org/projects'],
        ]);
    });

    it('retries a projects error without showing an empty row', async () => {
        vi.mocked(lightdashApi).mockImplementation(async (request) => {
            if (request.url === '/org/projects')
                throw { error: { message: 'Unavailable' } };
            return apiHandler(request);
        });
        renderIdentityPage();
        expect(
            await screen.findByText('Could not load agent settings.'),
        ).toBeVisible();
        expect(
            screen.queryByText('No warehouses in use yet.'),
        ).not.toBeInTheDocument();
        vi.mocked(lightdashApi).mockImplementation(apiHandler);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findAllByRole('button', { name: /: agents run as/ }),
        ).toHaveLength(2);
    });

    it.each(['/org/projects', '/org/agent-identity'])(
        'retries only the failed %s initial request',
        async (failedUrl) => {
            vi.mocked(lightdashApi).mockImplementation(async (request) => {
                if (request.url === failedUrl)
                    throw { error: { message: 'Unavailable' } };
                return apiHandler(request);
            });
            renderIdentityPage();
            await screen.findByText('Could not load agent settings.');
            vi.mocked(lightdashApi).mockImplementation(apiHandler);
            fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
            await screen.findAllByRole('button', { name: /: agents run as/ });
            for (const url of [
                '/org/projects',
                '/org/agent-identity',
                '/org/agent-permissions',
                '/aiAgents/admin/settings',
                '/org/groups?includeMembers=1',
            ])
                expect(
                    vi
                        .mocked(lightdashApi)
                        .mock.calls.filter(([request]) => request.url === url),
                ).toHaveLength(url === failedUrl ? 2 : 1);
        },
    );
});
