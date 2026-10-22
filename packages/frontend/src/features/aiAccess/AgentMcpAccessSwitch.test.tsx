import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpGeneralSettingsPage } from '../../ee/features/aiCopilot/components/Admin/settings/McpGeneralSettingsPage';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { AgentIdentitySettingsPage } from './AgentIdentitySettingsPage';
import {
    agentSettingsIdentityMock,
    agentSettingsMcpMock,
    agentSettingsPolicyMock,
} from './agentSettings.mock';
import { getAgentSettingsAccess } from './agentSettingsAccess';
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../api');
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
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: toasts.success,
        showToastApiError: toasts.error,
    }),
}));
vi.mock('./OrganizationAgentIdentitySection', () => ({
    OrganizationAgentIdentityCard: () => null,
}));
const api = mockedLightdashApi;
let settings = agentSettingsMcpMock();
let mcpEnabled = true;
const renderPages = (input: {
    agentIdentityEnabled: boolean;
    canManageOrganization: boolean;
    canManageOrgAiAgent: boolean;
}) => {
    const access = getAgentSettingsAccess({ ...input, isAiAvailable: true });
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    const content = (view: 'link' | 'switch') => (
        <MantineProvider env="test">
            <MemoryRouter>
                <QueryClientProvider client={client}>
                    <AgentIdentitySettingsPage access={access} />
                    {access.mcpPage !== 'hidden' && (
                        <McpGeneralSettingsPage
                            showAgentsPageLink={view === 'link'}
                        />
                    )}
                </QueryClientProvider>
            </MemoryRouter>
        </MantineProvider>
    );
    const view = render(content(access.mcpPage === 'link' ? 'link' : 'switch'));
    return {
        fallback: () => view.rerender(content('switch')),
        link: () => view.rerender(content('link')),
    };
};
beforeEach(() => {
    vi.clearAllMocks();
    settings = agentSettingsMcpMock();
    mcpEnabled = true;
    api.mockImplementation(async (request) => {
        if (request.url === '/aiAgents/admin/settings') {
            if (request.method === 'PATCH')
                settings = { ...settings, ...JSON.parse(String(request.body)) };
            return { ...settings, mcpEnabled };
        }
        if (request.url === '/org/projects') return [];
        if (request.url === '/org')
            return {
                organizationUuid: 'org',
                name: 'Test organization',
            };
        if (request.url === '/org/agent-identity')
            return agentSettingsIdentityMock;
        if (request.url === '/org/agent-permissions')
            return agentSettingsPolicyMock();
        throw new Error(`Unexpected request ${request.url}`);
    });
});
describe('Agents over MCP', () => {
    it.each(
        [false, true].flatMap((agentIdentityEnabled) =>
            [false, true].flatMap((canManageOrganization) =>
                [false, true].map((canManageOrgAiAgent) => ({
                    agentIdentityEnabled,
                    canManageOrganization,
                    canManageOrgAiAgent,
                })),
            ),
        ),
    )(
        'renders access for flag $agentIdentityEnabled organization $canManageOrganization AI $canManageOrgAiAgent',
        async (input) => {
            renderPages(input);
            const moved =
                input.agentIdentityEnabled &&
                input.canManageOrganization &&
                input.canManageOrgAiAgent;
            if (input.canManageOrgAiAgent) {
                const control = await screen.findByRole('switch', {
                    name: moved ? 'Agents over MCP' : 'Enable agents over MCP',
                });
                expect(control).toBeEnabled();
                expect(
                    screen.getByRole('switch', {
                        name: 'Allow content changes via MCP',
                    }),
                ).toBeEnabled();
                if (moved) {
                    expect(
                        screen.getByRole('link', {
                            name: 'Change on the Agents page',
                        }),
                    ).toHaveAttribute('href', '/generalSettings/agentIdentity');
                    expect(screen.getByText('On')).toBeInTheDocument();
                    expect(
                        screen.queryByRole('switch', {
                            name: 'Enable agents over MCP',
                        }),
                    ).not.toBeInTheDocument();
                } else
                    expect(
                        screen.queryByRole('link', {
                            name: 'Change on the Agents page',
                        }),
                    ).not.toBeInTheDocument();
            } else {
                if (input.agentIdentityEnabled && input.canManageOrganization)
                    await screen.findByText('Permissions');
                expect(screen.queryByRole('switch')).not.toBeInTheDocument();
                expect(
                    api.mock.calls.some(
                        ([request]) =>
                            request.url === '/aiAgents/admin/settings',
                    ),
                ).toBe(false);
            }
            if (!input.agentIdentityEnabled)
                expect(
                    api.mock.calls.every(
                        ([request]) =>
                            request.url === '/aiAgents/admin/settings' ||
                            request.url === '/aiAgents/admin/settings',
                    ),
                ).toBe(true);
        },
    );
    it('disables MCP controls on both pages when the organization turns MCP off', async () => {
        mcpEnabled = false;
        renderPages({
            agentIdentityEnabled: true,
            canManageOrganization: true,
            canManageOrgAiAgent: true,
        });
        const agents = await screen.findByRole('switch', {
            name: 'Agents over MCP',
        });
        await waitFor(() => expect(agents).toBeDisabled());
        expect(agents).toBeChecked();
        const writes = screen.getByRole('switch', {
            name: 'Allow content changes via MCP',
        });
        expect(writes).toBeDisabled();
        expect(writes).toBeChecked();
        const user = userEvent.setup();
        await user.click(agents);
        await user.click(writes);
        expect(
            api.mock.calls.some(([request]) => request.method === 'PATCH'),
        ).toBe(false);
        expect(
            screen.getByText('MCP access is disabled for this organization.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Custom' })).toBeEnabled();
    });
    it('saves at once, shares state in both directions and stays out of draft/discard', async () => {
        const view = renderPages({
            agentIdentityEnabled: true,
            canManageOrganization: true,
            canManageOrgAiAgent: true,
        });
        fireEvent.click(await screen.findByRole('radio', { name: 'Custom' }));
        expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('switch', { name: 'Agents over MCP' }),
        );
        await screen.findByText('Off');
        expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
        expect(toasts.success).toHaveBeenCalledTimes(1);
        const writes = api.mock.calls.filter(
            ([request]) => request.method === 'PATCH',
        );
        expect(writes).toHaveLength(1);
        expect(JSON.parse(String(writes[0][0].body))).toEqual({
            mcpAgentsEnabled: false,
        });
        expect(
            api.mock.calls.some(([request]) => request.method === 'PUT'),
        ).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(screen.getByText('No changes')).toBeInTheDocument();
        expect(
            screen.getByRole('switch', { name: 'Agents over MCP' }),
        ).not.toBeChecked();
        view.fallback();
        fireEvent.click(
            await screen.findByRole('switch', {
                name: 'Enable agents over MCP',
            }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('switch', { name: 'Agents over MCP' }),
            ).toBeChecked(),
        );
        view.link();
        expect(await screen.findByText('On')).toBeInTheDocument();
        expect(screen.getByText('No changes')).toBeInTheDocument();
    });
    it('refreshes AI settings after a stale tab gets a forbidden preference update', async () => {
        renderPages({
            agentIdentityEnabled: true,
            canManageOrganization: true,
            canManageOrgAiAgent: true,
        });
        const agents = await screen.findByRole('switch', {
            name: 'Agents over MCP',
        });
        await waitFor(() => expect(agents).toBeEnabled());
        const settingsReadsBefore = api.mock.calls.filter(
            ([request]) =>
                request.url === '/aiAgents/admin/settings' &&
                request.method === 'GET',
        ).length;
        mcpEnabled = false;
        api.mockRejectedValueOnce({
            error: {
                statusCode: 403,
                message: 'MCP access is disabled for this organization',
            },
        });
        const user = userEvent.setup();
        await user.click(agents);
        await screen.findByText('MCP access is disabled');
        await waitFor(() => expect(agents).toBeDisabled());
        const writes = screen.getByRole('switch', {
            name: 'Allow content changes via MCP',
        });
        expect(writes).toBeDisabled();
        expect(agents).toBeChecked();
        expect(writes).toBeChecked();
        expect(settings.mcpAgentsEnabled).toBe(true);
        expect(toasts.error).toHaveBeenCalledTimes(1);
        expect(
            api.mock.calls.filter(
                ([request]) =>
                    request.url === '/aiAgents/admin/settings' &&
                    request.method === 'GET',
            ),
        ).toHaveLength(settingsReadsBefore + 1);
        await user.click(agents);
        await user.click(writes);
        expect(
            api.mock.calls.filter(([request]) => request.method === 'PATCH'),
        ).toHaveLength(1);
    });
    it('keeps the confirmed value after failure and blocks duplicate saves while pending', async () => {
        renderPages({
            agentIdentityEnabled: true,
            canManageOrganization: true,
            canManageOrgAiAgent: true,
        });
        const control = await screen.findByRole('switch', {
            name: 'Agents over MCP',
        });
        let fail: (reason: unknown) => void = () => {};
        api.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    fail = reject;
                }),
        );
        fireEvent.click(control);
        await waitFor(() => expect(control).toBeDisabled());
        await act(async () => fail({ error: { message: 'Unavailable' } }));
        await waitFor(() => expect(control).toBeEnabled());
        expect(control).toBeChecked();
        expect(screen.getByText('No changes')).toBeInTheDocument();
        expect(toasts.error).toHaveBeenCalledTimes(1);
    });
});
