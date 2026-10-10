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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import nock from 'nock';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE_API_URL } from '../api';
import SettingsMenu from '../components/NavBar/SettingsMenu';
import { LAST_PROJECT_KEY } from '../hooks/useActiveProject';
import { mockViewport } from '../testing/mockViewport';
import { renderWithProviders } from '../testing/testUtils';
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
    });
    queryClient.setQueryData(['organization'], {
        organizationUuid: 'org',
        name: 'Test organization',
        defaultProjectUuid: projectUuid,
    });
    queryClient.setQueryData(['projects'], []);
    queryClient.setQueryData(['ai-organization-runtime-settings'], {
        isCopilotEnabled: false,
        isTrial: false,
    });
    [
        ...Object.values(FeatureFlags),
        ...Object.values(CommercialFeatureFlags),
    ].forEach((id) => {
        queryClient.setQueryData(['feature-flag', id], { id, enabled: false });
    });
    if (agentIdentityEnabled === null) {
        queryClient.removeQueries(['feature-flag', FeatureFlags.AgentIdentity]);
    } else {
        queryClient.setQueryData(['feature-flag', FeatureFlags.AgentIdentity], {
            id: FeatureFlags.AgentIdentity,
            enabled: agentIdentityEnabled,
        });
    }
    queryClient.setQueryData(['ai-access', 'org', 'agent-identity'], {
        requireVerifiedAgentSessions: false,
        rules: [],
    });
    queryClient.setQueryData(['organization-warehouse-credentials'], []);
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

    return renderWithProviders(
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
                    screen.getByText(/Choose who agents run as/),
                ).toBeInTheDocument();
                expect(
                    screen.getByRole('link', { name: 'Warehouse credentials' }),
                ).toHaveAttribute(
                    'href',
                    '/generalSettings/warehouseCredentials',
                );
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

    it('keeps Warehouse credentials available without the agent identity card', async () => {
        renderSettings(
            '',
            [
                viewProject,
                manageOrganization,
                {
                    action: 'manage',
                    subject: 'OrganizationWarehouseCredentials',
                },
            ],
            true,
            '/generalSettings/warehouseCredentials',
            true,
        );

        expect(
            await screen.findByRole('heading', {
                name: 'Warehouse credentials',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('No warehouse credentials'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Choose who agents run as/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Agents' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Agents' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('status', { name: 'Current URL' }),
        ).toHaveTextContent('/generalSettings/warehouseCredentials');
    });
});
