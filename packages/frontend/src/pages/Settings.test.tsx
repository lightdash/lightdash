import {
    AGENT_IDENTITY_SETTINGS_PATH,
    CommercialFeatureFlags,
    DbtProjectType,
    FeatureFlags,
    ProjectType,
    SpaceMemberRole,
    type LightdashUserWithAbilityRules,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import nock from 'nock';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../api';
import SettingsMenu from '../components/NavBar/SettingsMenu';
import {
    agentSettingsPolicyMock,
    agentSettingsMcpMock,
    agentSettingsIdentityMock,
} from '../features/aiAccess/agentSettings.mock';
import { LAST_PROJECT_KEY } from '../hooks/useActiveProject';
import { mockViewport } from '../testing/mockViewport';
import { renderWithProviders } from '../testing/testUtils';
import flagOffBaseline from './__fixtures__/agentConnections-disabled-false.json';
import loadingBaseline from './__fixtures__/agentConnections-disabled-null.json';
import Settings from './Settings';

const projectUuid = '3675b69e-8324-4110-bdca-059031aa8da3';
const scope = { projectUuid, organizationUuid: 'org' };
const base = `/generalSettings/projectManagement/${projectUuid}`;

const Location = () => (
    <Text component="output" aria-label="Current URL">
        {useLocation().pathname}
    </Text>
);

const renderSettings = (
    page: string,
    abilityRules: LightdashUserWithAbilityRules['abilityRules'],
    isSoftDeleteEnabled = true,
    // A settings page outside the project's own; `page` is under it otherwise.
    initialPath = `${base}/${page}`,
    agentIdentityEnabled: boolean | null = false,
    aiSettings = { isCopilotEnabled: false, isTrial: false },
    seedAdminSettings = true,
    cold = false,
    isAnalyticsProject = false,
) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const user = {
        userUuid: 'test-user',
        organizationUuid: 'org',
        abilityRules,
    };
    localStorage.setItem(LAST_PROJECT_KEY, projectUuid);
    queryClient.setQueryData(['project', projectUuid], {
        ...scope,
        name: 'Test project',
        type: ProjectType.DEFAULT,
        dbtConnection: { type: DbtProjectType.NONE },
        provisioningSource: isAnalyticsProject ? 'analytics' : null,
    });
    queryClient.setQueryData(['organization'], {
        organizationUuid: 'org',
        name: 'Test organization',
        defaultProjectUuid: projectUuid,
    });
    queryClient.setQueryData(['projects'], []);
    queryClient.setQueryData(['ai-organization-runtime-settings'], aiSettings);
    if (seedAdminSettings)
        queryClient.setQueryData(
            ['ai-organization-admin-settings'],
            agentSettingsMcpMock(),
        );
    queryClient.setQueryData(
        ['ai-access', 'org', 'org', 'agent-permissions'],
        agentSettingsPolicyMock(),
    );
    [
        ...Object.values(FeatureFlags),
        ...Object.values(CommercialFeatureFlags),
    ].forEach((id) => {
        queryClient.setQueryData(['feature-flag', id], { id, enabled: false });
    });
    if (isAnalyticsProject) {
        queryClient.setQueryData(
            ['feature-flag', FeatureFlags.AnalyticsProject],
            {
                id: FeatureFlags.AnalyticsProject,
                enabled: true,
            },
        );
        queryClient.setQueryData(['analytics-project'], { project: null });
    }
    if (agentIdentityEnabled === null) {
        queryClient.removeQueries(['feature-flag', FeatureFlags.AgentIdentity]);
    } else {
        queryClient.setQueryData(['feature-flag', FeatureFlags.AgentIdentity], {
            id: FeatureFlags.AgentIdentity,
            enabled: agentIdentityEnabled,
        });
    }
    queryClient.setQueryData(
        ['ai-access', 'org', 'agent-identity'],
        agentSettingsIdentityMock,
    );
    nock(BASE_API_URL)
        .get('/api/v1/user/account')
        .reply(200, {
            status: 'ok',
            results: {
                user: { ...user, id: user.userUuid, type: 'registered' },
                organization: {
                    organizationUuid: 'org',
                    name: 'Test organization',
                },
                authentication: { type: 'session' },
            },
        });
    nock(BASE_API_URL)
        .get('/api/v2/content/deleted')
        .query(true)
        .optionally()
        .reply(200, {
            status: 'ok',
            results: {
                data: [],
                pagination: { totalResults: 0, totalPageCount: 0 },
            },
        });

    if (cold) queryClient.clear();
    const result = renderWithProviders(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[initialPath]}>
                <Location />
                <SettingsMenu />
                <Routes>
                    <Route path="/generalSettings/*" element={<Settings />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
        {
            health: {
                softDelete: { enabled: isSoftDeleteEnabled, retentionDays: 30 },
            },
            user,
        },
    );
    return { ...result, queryClient };
};

const viewProject = {
    action: 'view',
    subject: 'Project',
    conditions: scope,
} satisfies LightdashUserWithAbilityRules['abilityRules'][number];

describe('limited project settings routes', () => {
    let viewport: ReturnType<typeof mockViewport>;
    beforeEach(() => {
        localStorage.clear();
        viewport = mockViewport(1280);
    });
    afterEach(() => viewport.restore());

    it.each(['settings', 'tablesConfiguration', 'unavailable', ''])(
        'redirects managed analytics /%s to analytics settings',
        async (page) => {
            renderSettings(
                page,
                [{ action: 'manage', subject: 'all' }],
                true,
                `${base}/${page}`,
                false,
                { isCopilotEnabled: false, isTrial: false },
                true,
                false,
                true,
            );
            expect(
                await screen.findByRole('heading', {
                    name: 'Lightdash analytics',
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('status', { name: 'Current URL' }),
            ).toHaveTextContent('/generalSettings/lightdashAnalytics');
            expect(
                screen.queryByRole('link', { name: 'Connection settings' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(
                    'Settings cannot be changed for managed analytics projects.',
                ),
            ).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
            expect(
                await screen.findByRole('menuitem', {
                    name: 'Project settings',
                }),
            ).toHaveAttribute('href', '/generalSettings/lightdashAnalytics');
        },
    );

    it.each(['projectAccess', 'recentlyDeleted'])(
        'keeps managed analytics /%s accessible',
        async (page) => {
            renderSettings(
                page,
                [{ action: 'manage', subject: 'all' }],
                true,
                `${base}/${page}`,
                false,
                { isCopilotEnabled: false, isTrial: false },
                true,
                false,
                true,
            );
            expect(
                await screen.findByRole('heading', {
                    name:
                        page === 'projectAccess'
                            ? 'Project access'
                            : 'Recently deleted',
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('status', { name: 'Current URL' }),
            ).toHaveTextContent(`${base}/${page}`);
            if (page === 'projectAccess') {
                expect(
                    screen.getByText(
                        /Standard project roles alone do not grant access/,
                    ),
                ).toBeInTheDocument();
            }
            expect(
                screen.queryByRole('link', { name: 'Connection settings' }),
            ).not.toBeInTheDocument();
        },
    );

    it('keeps analytics recovery available without project administration', async () => {
        renderSettings(
            'recentlyDeleted',
            [
                viewProject,
                {
                    action: 'manage',
                    subject: 'DeletedContent',
                    conditions: scope,
                },
            ],
            true,
            `${base}/recentlyDeleted`,
            false,
            { isCopilotEnabled: false, isTrial: false },
            true,
            false,
            true,
        );
        expect(
            await screen.findByRole('heading', {
                name: 'Recently deleted',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Project access' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
        expect(
            await screen.findByRole('menuitem', { name: 'Project settings' }),
        ).toHaveAttribute('href', `${base}/recentlyDeleted`);
    });

    it.each([
        'settings',
        'projectAccess',
        'validator',
        'embed/cors',
        'preAggregates/audit',
        'unavailable',
        '',
    ])(
        'redirects /%s to Recently deleted for a content restorer',
        async (page) => {
            renderSettings(page, [
                viewProject,
                {
                    action: 'manage',
                    subject: 'DeletedContent',
                    conditions: scope,
                },
            ]);

            await waitFor(() =>
                expect(
                    screen.getByRole('status', { name: 'Current URL' }),
                ).toHaveTextContent(`${base}/recentlyDeleted`),
            );
            expect(
                await screen.findByRole('heading', {
                    name: 'Recently deleted',
                }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('link', { name: 'Connection settings' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('link', { name: 'Validator' }),
            ).not.toBeInTheDocument();
            if (page === 'settings') {
                fireEvent.click(
                    await screen.findByRole('button', {
                        name: 'Settings',
                    }),
                );
                expect(
                    await screen.findByRole('menuitem', {
                        name: 'Project settings',
                    }),
                ).toHaveAttribute('href', `${base}/recentlyDeleted`);
            }
        },
    );

    it('preserves the recovery URL and shows an error when space access cannot be checked', async () => {
        // The navbar menu and the settings page each observe the spaces
        // query, and the page's observer refetches once the first attempt
        // has failed: a single-use interceptor would turn that second
        // request into a transport failure with a different message.
        nock(BASE_API_URL)
            .persist()
            .get(`/api/v1/projects/${projectUuid}/spaces`)
            .reply(503, {
                status: 'error',
                error: {
                    statusCode: 503,
                    name: 'ServiceUnavailableError',
                    message: 'Unable to check space access',
                },
            });
        renderSettings('recentlyDeleted', [
            viewProject,
            { action: 'create', subject: 'SavedChart', conditions: scope },
        ]);

        // The server's own message reaches the page: a 503 with the API
        // envelope is passed through, not replaced by the network message.
        expect(
            await screen.findByText('Unable to check space access'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('status', { name: 'Current URL' }),
        ).toHaveTextContent(`${base}/recentlyDeleted`);
    });

    it('shows no project settings entry to a Viewer, without fetching the spaces', async () => {
        const spaces = nock(BASE_API_URL)
            .get(`/api/v1/projects/${projectUuid}/spaces`)
            .reply(200, { status: 'ok', results: [] });
        renderSettings('recentlyDeleted', [viewProject]);

        expect(
            await screen.findByRole('heading', {
                name: 'Profile',
            }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('settings-menu')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Recently deleted' }),
        ).not.toBeInTheDocument();
        // A viewer holds no create rule, so the spaces never decide anything.
        expect(spaces.isDone()).toBe(false);
        nock.cleanAll();
    });

    it('keeps other settings pages open while the space check fails', async () => {
        nock(BASE_API_URL)
            .persist()
            .get(`/api/v1/projects/${projectUuid}/spaces`)
            .reply(503, {
                status: 'error',
                error: {
                    statusCode: 503,
                    name: 'ServiceUnavailableError',
                    message: 'Unable to check space access',
                },
            });
        renderSettings(
            'profile',
            [
                viewProject,
                { action: 'create', subject: 'SavedChart', conditions: scope },
            ],
            true,
            '/generalSettings/profile',
        );

        expect(
            await screen.findByRole('heading', { name: 'Profile' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Unable to check space access'),
        ).not.toBeInTheDocument();
    });

    it('hides recovery settings when soft delete is off', async () => {
        renderSettings(
            'recentlyDeleted',
            [
                viewProject,
                {
                    action: 'manage',
                    subject: 'DeletedContent',
                    conditions: scope,
                },
                { action: 'create', subject: 'SavedChart', conditions: scope },
            ],
            false,
        );

        expect(
            await screen.findByRole('heading', {
                name: 'Profile',
            }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('settings-menu')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Recently deleted' }),
        ).not.toBeInTheDocument();
    });

    it.each(['SavedChart', 'Dashboard', 'Document'] as const)(
        'keeps a cold Recently deleted link open while checking create:%s access in a space',
        async (subject) => {
            nock(BASE_API_URL)
                .get(`/api/v1/projects/${projectUuid}/spaces`)
                .delayBody(50)
                .reply(200, {
                    status: 'ok',
                    results: [{ userAccess: { role: SpaceMemberRole.EDITOR } }],
                });
            renderSettings('recentlyDeleted', [
                viewProject,
                {
                    action: 'create',
                    subject,
                    conditions: {
                        ...scope,
                        access: {
                            $elemMatch: { role: SpaceMemberRole.EDITOR },
                        },
                    },
                },
            ]);

            expect(
                await screen.findByRole('heading', {
                    name: 'Recently deleted',
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('status', { name: 'Current URL' }),
            ).toHaveTextContent(`${base}/recentlyDeleted`);
            fireEvent.click(
                await screen.findByRole('button', {
                    name: 'Settings',
                }),
            );
            expect(
                await screen.findByRole('menuitem', {
                    name: 'Project settings',
                }),
            ).toHaveAttribute('href', `${base}/recentlyDeleted`);
        },
    );
});

describe('Agent identity settings routes', () => {
    let viewport: ReturnType<typeof mockViewport>;
    beforeEach(() => {
        localStorage.clear();
        viewport = mockViewport(1280);
    });
    afterEach(() => viewport.restore());

    const manageOrganization = {
        action: 'manage',
        subject: 'Organization',
        conditions: { organizationUuid: 'org' },
    } satisfies LightdashUserWithAbilityRules['abilityRules'][number];

    it.each([
        { enabled: true, canManage: true },
        { enabled: true, canManage: false },
        { enabled: false, canManage: true },
        { enabled: false, canManage: false },
    ])(
        'gates the sidebar and route with %j',
        async ({ enabled, canManage }) => {
            renderSettings(
                '',
                canManage ? [viewProject, manageOrganization] : [viewProject],
                true,
                AGENT_IDENTITY_SETTINGS_PATH,
                enabled,
            );

            if (enabled && canManage) {
                expect(
                    await screen.findByRole('heading', {
                        name: 'Agents',
                    }),
                ).toBeInTheDocument();
                expect(
                    screen.getAllByRole('heading', { name: 'Agents' }),
                ).toHaveLength(1);
                expect(
                    screen.getByRole('link', { name: 'Agents' }),
                ).toHaveAttribute('href', '/generalSettings/agentIdentity');
                expect(
                    screen.getByRole('heading', { name: 'Identity' }),
                ).toBeInTheDocument();
                expect(
                    screen.getByText(
                        'Who agents run as, and what they may do. Agents are Ask AI, the Slack agent, MCP clients and the CLI.',
                    ),
                ).toBeInTheDocument();
                expect(
                    screen.getByText('No warehouses in use yet.'),
                ).toBeInTheDocument();
                expect(
                    screen.queryByText(/^Agents run as the person asking/),
                ).not.toBeInTheDocument();
                for (const link of screen.getAllByRole('link', {
                    name: 'My warehouse connections',
                })) {
                    expect(link).toHaveAttribute(
                        'href',
                        '/generalSettings/myWarehouseConnections',
                    );
                }
                expect(
                    screen.getByRole('status', { name: 'Current URL' }),
                ).toHaveTextContent('/generalSettings/agentIdentity');
            } else {
                expect(
                    await screen.findByRole('heading', { name: 'Profile' }),
                ).toBeInTheDocument();
                expect(
                    screen.queryByRole('link', { name: 'Agents' }),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByRole('heading', { name: 'Agents' }),
                ).not.toBeInTheDocument();
                expect(
                    screen.getByRole('status', { name: 'Current URL' }),
                ).toHaveTextContent('/generalSettings/profile');
            }
        },
    );

    it('keeps a direct visit open while the feature flag loads', async () => {
        nock(BASE_API_URL)
            .get(`/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`)
            .delayBody(100)
            .reply(200, {
                status: 'ok',
                results: { id: FeatureFlags.AgentIdentity, enabled: true },
            });
        renderSettings(
            '',
            [viewProject, manageOrganization],
            true,
            AGENT_IDENTITY_SETTINGS_PATH,
            null,
        );

        expect(
            await screen.findByRole('heading', { name: 'Agents' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('status', { name: 'Current URL' }),
        ).toHaveTextContent('/generalSettings/agentIdentity');
    });
    it('redirects the removed organization warehouse credentials settings to Profile', async () => {
        renderSettings(
            '',
            [viewProject, manageOrganization],
            true,
            '/generalSettings/warehouseCredentials',
            true,
        );
        expect(
            await screen.findByRole('heading', { name: 'Profile' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Warehouse credentials' }),
        ).not.toBeInTheDocument();
    });
});

describe('MCP settings route permission parity', () => {
    let viewport: ReturnType<typeof mockViewport>;
    beforeEach(() => {
        localStorage.clear();
        viewport = mockViewport(1280);
    });
    afterEach(() => viewport.restore());
    it.each([
        { enabled: true, manageOrg: true, manageAi: true },
        { enabled: true, manageOrg: false, manageAi: true },
        { enabled: true, manageOrg: true, manageAi: false },
        { enabled: false, manageOrg: true, manageAi: true },
    ])(
        'reads and writes through real routes: %j',
        async ({ enabled, manageOrg, manageAi }) => {
            const rules: LightdashUserWithAbilityRules['abilityRules'] = [
                viewProject,
            ];
            if (manageOrg)
                rules.push({
                    action: 'manage',
                    subject: 'Organization',
                    conditions: { organizationUuid: 'org' },
                });
            if (manageAi)
                rules.push({
                    action: 'manage',
                    subject: 'OrganizationAiAgent',
                    conditions: { organizationUuid: 'org' },
                });
            const adminRead = vi.fn(() => ({
                status: 'ok',
                results: agentSettingsMcpMock(),
            }));
            const adminWrite = vi.fn(() => ({
                status: 'ok',
                results: { ...agentSettingsMcpMock(), mcpAgentsEnabled: false },
            }));
            nock(BASE_API_URL)
                .get('/api/v1/aiAgents/admin/settings')
                .optionally()
                .reply(200, adminRead);
            const patch = nock(BASE_API_URL)
                .patch('/api/v1/aiAgents/admin/settings', {
                    mcpAgentsEnabled: false,
                })
                .optionally(!manageAi)
                .once()
                .reply(200, adminWrite);
            const view = renderSettings(
                '',
                rules,
                true,
                manageAi
                    ? '/generalSettings/mcp/general'
                    : AGENT_IDENTITY_SETTINGS_PATH,
                enabled,
                { isCopilotEnabled: true, isTrial: false },
                manageAi,
            );
            if (!manageAi) {
                await screen.findByRole('heading', { name: 'Agents' });
                expect(
                    screen.queryByRole('switch', { name: 'Agents over MCP' }),
                ).not.toBeInTheDocument();
                expect(adminRead).not.toHaveBeenCalled();
                expect(adminWrite).not.toHaveBeenCalled();
                return;
            }
            if (enabled && manageOrg) {
                const link = await screen.findByRole('link', {
                    name: 'Change on the Agents page',
                });
                expect(screen.getByText('On')).toBeInTheDocument();
                fireEvent.click(link);
                await screen.findByRole('heading', { name: 'Agents' });
            }
            const control = await screen.findByRole('switch', {
                name:
                    enabled && manageOrg
                        ? 'Agents over MCP'
                        : 'Enable agents over MCP',
            });
            expect(control).toBeChecked();
            fireEvent.click(control);
            await waitFor(() => expect(patch.isDone()).toBe(true));
            await waitFor(() => expect(control).not.toBeChecked());
            expect(adminWrite).toHaveBeenCalledTimes(1);
            expect(
                nock.pendingMocks().filter((mock) => mock.startsWith('PATCH')),
            ).toEqual([]);
            if (!enabled || !manageOrg) {
                view.unmount();
                renderSettings(
                    '',
                    rules,
                    true,
                    AGENT_IDENTITY_SETTINGS_PATH,
                    enabled,
                    {
                        isCopilotEnabled: true,
                        isTrial: false,
                    },
                );
                await screen.findByRole('heading', { name: 'Profile' });
                expect(
                    screen.queryByRole('heading', { name: 'Agents' }),
                ).not.toBeInTheDocument();
            }
        },
    );
    it.each(
        [false, true].flatMap((enabled) =>
            [false, true].flatMap((manageOrg) =>
                [false, true].map((manageAi) => ({
                    enabled,
                    manageOrg,
                    manageAi,
                })),
            ),
        ),
    )(
        'flag $enabled organization $manageOrg AI $manageAi',
        async ({ enabled, manageOrg, manageAi }) => {
            const rules: LightdashUserWithAbilityRules['abilityRules'] = [
                viewProject,
            ];
            if (manageOrg)
                rules.push({
                    action: 'manage',
                    subject: 'Organization',
                    conditions: { organizationUuid: 'org' },
                });
            if (manageAi)
                rules.push({
                    action: 'manage',
                    subject: 'OrganizationAiAgent',
                    conditions: { organizationUuid: 'org' },
                });
            renderSettings(
                '',
                rules,
                true,
                '/generalSettings/mcp/general',
                enabled,
                {
                    isCopilotEnabled: true,
                    isTrial: false,
                },
            );
            if (!manageAi) {
                expect(
                    await screen.findByRole('heading', { name: 'Profile' }),
                ).toBeInTheDocument();
                expect(
                    screen.queryByRole('switch', {
                        name: 'Enable agents over MCP',
                    }),
                ).not.toBeInTheDocument();
                return;
            }
            if (enabled && manageOrg) {
                expect(
                    await screen.findByRole('link', {
                        name: 'Change on the Agents page',
                    }),
                ).toHaveAttribute('href', '/generalSettings/agentIdentity');
                expect(
                    screen.queryByRole('switch', {
                        name: 'Enable agents over MCP',
                    }),
                ).not.toBeInTheDocument();
            } else
                expect(
                    await screen.findByRole('switch', {
                        name: 'Enable agents over MCP',
                    }),
                ).toBeEnabled();
            expect(
                screen.getByRole('switch', {
                    name: 'Allow content changes via MCP',
                }),
            ).toBeEnabled();
        },
    );
});

describe('agent connections flag-off baseline', () => {
    let viewport: ReturnType<typeof mockViewport>;
    beforeEach(() => {
        notifications.clean();
        localStorage.clear();
        viewport = mockViewport(1280);
    });
    afterEach(() => {
        viewport.restore();
        vi.restoreAllMocks();
    });
    const observeFetches = () => {
        const fetch = globalThis.fetch;
        const requests: string[] = [];
        let pending = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                const request = input instanceof Request ? input : null;
                const url = new URL(request?.url ?? String(input));
                requests.push(
                    `${init?.method ?? request?.method ?? 'GET'} ${url.pathname}${url.search}`,
                );
                pending += 1;
                try {
                    return await fetch(input, init);
                } finally {
                    pending -= 1;
                }
            },
        );
        return { requests, pending: () => pending };
    };
    const normalizeDom = (container: HTMLElement) =>
        container.innerHTML
            .replace(/<style[\s\S]*?<\/style>/g, '')
            .replace(/id="[^"]*"/g, 'id="ID"')
            .replace(/mantine-[a-z0-9]{8,}/g, 'mantine-ID')
            .replace(/__m__-_r_[a-z0-9]+_/g, '__m__-ID');
    const mockProfile = () => {
        nock(BASE_API_URL)
            .get('/api/v1/org/users')
            .optionally()
            .reply(200, { status: 'ok', results: { data: [] } });
        nock(BASE_API_URL)
            .get('/api/v1/user/me/email/status')
            .reply(200, { status: 'ok', results: { isVerified: true } });
    };
    const expectSettled = async (
        client: QueryClient,
        pending: () => number,
    ) => {
        await screen.findByRole('heading', { name: 'Profile' });
        await waitFor(() => {
            expect(
                client.getQueryData([
                    'feature-flag',
                    FeatureFlags.AgentIdentity,
                ]),
            ).toMatchObject({ enabled: false });
            expect(client.isFetching()).toBe(0);
            expect(pending()).toBe(0);
        });
        await act(async () => {});
        expect(client.isFetching()).toBe(0);
        expect(pending()).toBe(0);
        expect(screen.queryByText('My agent identity')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('tab', { name: 'Agent connections' }),
        ).not.toBeInTheDocument();
    };
    it.each([false, null])(
        'preserves the full settings lifecycle with initial flag %s',
        async (enabled) => {
            const observed = observeFetches();
            mockProfile();
            let releaseFlag!: () => void;
            if (enabled === null)
                nock(BASE_API_URL)
                    .get('/api/v2/feature-flag/agent-identity')
                    .reply((_uri, _body, callback) => {
                        releaseFlag = () =>
                            callback(null, [
                                200,
                                { status: 'ok', results: { enabled: false } },
                            ]);
                    });
            const result = renderSettings(
                '',
                [viewProject],
                true,
                '/generalSettings/myAgentConnections',
                enabled,
            );
            if (enabled === null) {
                await waitFor(() => {
                    expect(releaseFlag).toBeDefined();
                    expect(result.queryClient.isFetching()).toBe(1);
                    expect(observed.pending()).toBe(1);
                    expect(
                        result.queryClient.getQueryData(['account']),
                    ).toBeDefined();
                });
                expect([...observed.requests].sort()).toEqual(
                    loadingBaseline.requests,
                );
                expect(normalizeDom(result.container)).toEqual(
                    loadingBaseline.dom,
                );
                await act(async () => releaseFlag());
            }
            await expectSettled(result.queryClient, observed.pending);
            expect([...observed.requests].sort()).toEqual(
                [
                    ...flagOffBaseline.requests,
                    ...(enabled === null
                        ? ['GET /api/v2/feature-flag/agent-identity']
                        : []),
                ].sort(),
            );
            expect(normalizeDom(result.container)).toEqual(flagOffBaseline.dom);
            result.unmount();
            expect(observed.pending()).toBe(0);
        },
    );
    it('makes no agent data request on a cold profile route with the flag false', async () => {
        const observed = observeFetches();
        mockProfile();
        nock(BASE_API_URL)
            .persist()
            .get(/\/api\/v2\/feature-flag\//)
            .reply(200, (uri) => ({
                status: 'ok',
                results: { id: uri.split('/').at(-1), enabled: false },
            }));
        nock(BASE_API_URL)
            .get('/api/v1/org')
            .reply(200, {
                status: 'ok',
                results: {
                    organizationUuid: 'org',
                    name: 'Test organization',
                    defaultProjectUuid: projectUuid,
                },
            });
        nock(BASE_API_URL)
            .get('/api/v1/org/projects')
            .reply(200, { status: 'ok', results: [] });
        nock(BASE_API_URL)
            .get(`/api/v1/projects/${projectUuid}`)
            .reply(200, {
                status: 'ok',
                results: {
                    ...scope,
                    name: 'Test project',
                    type: ProjectType.DEFAULT,
                    dbtConnection: { type: DbtProjectType.NONE },
                },
            });
        nock(BASE_API_URL)
            .get('/api/v1/aiAgents/settings')
            .reply(200, {
                status: 'ok',
                results: { isCopilotEnabled: false, isTrial: false },
            });
        const result = renderSettings(
            '',
            [viewProject],
            true,
            '/generalSettings/profile',
            null,
            undefined,
            true,
            true,
        );
        await expectSettled(result.queryClient, observed.pending);
        expect(
            result.queryClient
                .getQueryCache()
                .getAll()
                .filter((query) => query.state.status === 'error')
                .map((query) => ({
                    key: query.queryKey,
                    error: query.state.error,
                })),
        ).toEqual([]);
        expect(observed.requests).toContain(
            'GET /api/v2/feature-flag/agent-identity',
        );
        expect(
            observed.requests
                .filter((request) => !request.includes('/feature-flag/'))
                .filter((request) =>
                    /agent-connections|agent-identity|ai-access|warehouse.*[Cc]redentials|warehouse-connection-user-credentials/.test(
                        request,
                    ),
                ),
        ).toEqual([]);
        result.unmount();
        expect(observed.pending()).toBe(0);
    });
});

describe('agent identity tabs', () => {
    let viewport: ReturnType<typeof mockViewport>;
    beforeEach(() => {
        notifications.clean();
        localStorage.clear();
        viewport = mockViewport(1280);
    });
    afterEach(() => {
        viewport.restore();
        vi.restoreAllMocks();
    });
    it('shows tabs for a revoked row and shares one list request with the table', async () => {
        const list = nock(BASE_API_URL)
            .get('/api/v2/user/agent-connections')
            .reply(200, {
                status: 'ok',
                results: [
                    {
                        grantUuid: 'retained',
                        name: 'Retained connection',
                        approvedProjects: [],
                        approvedAt: '2026-10-12T12:00:00Z',
                        expiresAt: '2099-10-12T12:00:00Z',
                        lastUsedAt: null,
                        status: 'revoked',
                        revokedAt: '2026-10-12T12:00:00Z',
                        limitsStatus: 'ok',
                    },
                ],
            });
        const credentials = nock(BASE_API_URL)
            .get('/api/v1/user/warehouseCredentials')
            .reply(200, { status: 'ok', results: [] });
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        renderSettings(
            '',
            [viewProject],
            true,
            '/generalSettings/myAgentConnections',
            true,
        );
        expect(
            await screen.findByRole('heading', { name: 'My agent identity' }),
        ).toBeVisible();
        expect(
            await screen.findByRole('tab', { name: 'Agent connections' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByText('Retained connection')).toBeVisible();
        expect(list.isDone()).toBe(true);
        await waitFor(() => expect(credentials.isDone()).toBe(true));
        fireEvent.click(
            screen.getByRole('tab', { name: 'Warehouse sign-ins' }),
        );
        expect(await screen.findByText('Your agents run as you')).toBeVisible();
        expect(credentials.isDone()).toBe(true);
        expect(
            fetchSpy.mock.calls.filter(([url]) =>
                String(url).includes('/feature-flag/agent-identity'),
            ),
        ).toHaveLength(0);
        expect(
            fetchSpy.mock.calls.filter(([url]) =>
                String(url).includes('/user/agent-connections'),
            ),
        ).toHaveLength(1);
    });
});
