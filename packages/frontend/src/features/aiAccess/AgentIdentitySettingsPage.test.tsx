import {
    AgentCapability,
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
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { AgentIdentitySettingsPage } from './AgentIdentitySettingsPage';
import {
    agentSettingsIdentityMock,
    agentSettingsMcpMock,
} from './agentSettings.mock';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: { organizationUuid: 'org', ability: { can: () => true } },
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
vi.mock('./OrganizationAgentIdentitySection', () => ({
    default: ({ settings }: { settings: { rules: unknown[] } }) => (
        <div>Identity {settings.rules.length}</div>
    ),
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
) =>
    render(
        <MantineProvider env="test">
            <MemoryRouter>
                <QueryClientProvider
                    client={
                        new QueryClient({
                            defaultOptions: {
                                queries: { retry: false },
                                mutations: { retry: false },
                            },
                        })
                    }
                >
                    <AgentIdentitySettingsPage access={access} />
                </QueryClientProvider>
            </MemoryRouter>
        </MantineProvider>,
    );
const response = (url: string): ApiResponse['results'] =>
    url === '/org/agent-identity'
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
                expect(
                    screen.queryByText('Identity 0'),
                ).not.toBeInTheDocument();
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
            await act(async () =>
                resolve.get('/org/groups?includeMembers=1')?.({ data: [] }),
            );
            expect(await screen.findByText('Permissions')).toBeInTheDocument();
            expect(screen.getByText('Identity 0')).toBeInTheDocument();
            expect(
                view.container.querySelectorAll('.mantine-Loader-root'),
            ).toHaveLength(0);
        },
    );
    it.each(['flag off', 'no organization permission'])(
        'renders nothing and requests nothing for %s',
        () => {
            const view = renderPage({
                agentsPage: false,
                agentsMcp: false,
                mcpPage: 'switch',
            });
            expect(
                view.container.querySelector(':scope > :not(style)'),
            ).toBeNull();
            expect(api).not.toHaveBeenCalled();
        },
    );
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
        expect(screen.queryByText('Identity 0')).not.toBeInTheDocument();
        api.mockImplementation(async ({ url }) => response(url));
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('Permissions')).toBeInTheDocument();
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
