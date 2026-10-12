import {
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
            screen.getByText('Checking Snowflake agent integration'),
        ).toBeInTheDocument();
        expect(loaders()).toHaveLength(0);
        expect(steps()).not.toBeInTheDocument();
        if (order.startsWith('setup')) await settleSetup();
        else await settleVerify();
        expect(loaders()).toHaveLength(0);
        expect(steps()).not.toBeInTheDocument();
        if (order.startsWith('setup')) await settleVerify();
        else await settleSetup();
        expect(
            await screen.findByText(
                /^Snowflake agent integration needs attention/,
            ),
        ).toBeInTheDocument();
        if (order === 'setup errors first')
            expect(
                await screen.findByText('Could not load the Snowflake setup.'),
            ).toBeInTheDocument();
        else
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
