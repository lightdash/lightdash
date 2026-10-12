import { AgentCapability } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import { AgentConnectionsTable } from './AgentConnectionsTable';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
const api = vi.mocked(lightdashApi);
const connection = (grantUuid = 'grant-1') => ({
    grantUuid,
    name: grantUuid,
    clientId: 'lightdash-cli',
    limitsStatus: 'ok',
    approvedProjects: [
        {
            projectUuid: 'project',
            name: 'Development',
            approvedCapabilities: [AgentCapability.Query],
        },
    ],
    approvedAt: new Date(2026, 9, 11, 12).toISOString(),
    expiresAt: new Date(2099, 9, 12, 12).toISOString(),
    lastUsedAt: null,
    status: 'active',
    revokedAt: null,
});
const status = (grantUuid = 'grant-1') => ({
    ...connection(grantUuid),
    effectiveProjects: [
        {
            projectUuid: 'project',
            capabilities: [
                {
                    capability: AgentCapability.Query,
                    allowed: false,
                    reason: 'person_permission',
                },
            ],
        },
    ],
});
const renderTable = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return {
        ...renderWithProviders(
            <QueryClientProvider client={client}>
                <AgentConnectionsTable />
            </QueryClientProvider>,
        ),
        client,
    };
};
beforeEach(() => {
    vi.clearAllMocks();
    api.mockImplementation(async ({ url }) =>
        url.endsWith('/status') ? status() : [connection()],
    );
});
describe('agent connections table', () => {
    it('shows compact columns, summary, dates and status without fetching collapsed rows', async () => {
        renderTable();
        await screen.findByText('grant-1');
        expect(
            screen
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual(['Connection', 'Expires', 'Last used', 'Status', '']);
        const expander = screen.getByRole('button', { name: 'Expand grant-1' });
        expect(expander).toHaveAttribute('aria-expanded', 'false');
        expect(expander).toHaveAttribute(
            'aria-controls',
            'restrictions-grant-1',
        );
        expect(
            document.getElementById('restrictions-grant-1'),
        ).not.toBeInTheDocument();
        const row = within(expander.closest('tr')!);
        expect(row.getByText('CLI · 1 project · 1 action')).toBeVisible();
        expect(
            row.getByText(/^2099-10-12, 12:00 \([+-]\d{2}:\d{2}\)$/),
        ).toBeVisible();
        expect(row.getByText('Never used')).toBeVisible();
        expect(row.queryByText('Query data')).not.toBeInTheDocument();
        expect(row.getByText('Active')).toBeVisible();
        expect(row.getByRole('button', { name: 'Revoke' })).toBeVisible();
        expect(
            screen.queryByText('Expand to check current restrictions'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit' }),
        ).not.toBeInTheDocument();
        expect(api).toHaveBeenCalledTimes(1);
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: '/user/agent-connections',
            }),
        );
    });
    it('shows approved action badges per project and fetches only the expanded active row restrictions once', async () => {
        const data = {
            ...connection(),
            lastUsedAt: new Date(2026, 9, 12, 10, 30).toISOString(),
            approvedProjects: [
                connection().approvedProjects[0],
                {
                    projectUuid: 'unrestricted',
                    name: 'Production',
                    approvedCapabilities: [
                        AgentCapability.ReadDiscover,
                        AgentCapability.Query,
                    ],
                },
            ],
        };
        api.mockImplementation(async ({ url }) =>
            url.endsWith('/status')
                ? {
                      ...status(),
                      ...data,
                      effectiveProjects: [
                          status().effectiveProjects[0],
                          {
                              projectUuid: 'unrestricted',
                              capabilities: [
                                  {
                                      capability: AgentCapability.ReadDiscover,
                                      allowed: true,
                                      reason: null,
                                  },
                                  {
                                      capability: AgentCapability.Query,
                                      allowed: true,
                                      reason: null,
                                  },
                                  {
                                      capability: AgentCapability.Delete,
                                      allowed: false,
                                      reason: 'not_approved',
                                  },
                              ],
                          },
                      ],
                  }
                : [data, connection('grant-2')],
        );
        renderTable();
        const expander = await screen.findByRole('button', {
            name: 'Expand grant-1',
        });
        expect(screen.getByText('CLI · 2 projects · 2 actions')).toBeVisible();
        expect(
            within(expander.closest('tr')!).getByText(
                /^2026-10-12, 10:30 \([+-]\d{2}:\d{2}\)$/,
            ),
        ).toBeVisible();
        expect(api).toHaveBeenCalledTimes(1);
        fireEvent.click(expander);
        expect(expander).toHaveAccessibleName('Collapse grant-1');
        expect(expander).toHaveAttribute('aria-expanded', 'true');
        const details = document.getElementById(
            expander.getAttribute('aria-controls')!,
        )!;
        expect(details).toBeVisible();
        for (const [name, actions] of [
            ['Development', ['Query data']],
            ['Production', ['Read and discover', 'Query data']],
        ] as const) {
            const project = within(details).getByText(name).parentElement!;
            const badges = project.querySelectorAll('.mantine-Badge-root');
            expect(Array.from(badges, (badge) => badge.textContent)).toEqual(
                actions,
            );
            badges.forEach((badge) => expect(badge).toBeVisible());
        }
        expect(
            within(details).getByText(
                /^Approved 2026-10-11, 12:00 \([+-]\d{2}:\d{2}\)$/,
            ),
        ).toBeVisible();
        expect(
            await within(details).findByRole('button', {
                name: 'Why Query data is limited',
            }),
        ).toBeVisible();
        const restriction = within(details).getByRole('button', {
            name: 'Why Query data is limited',
        }).parentElement!.parentElement!;
        expect(within(restriction).getByText('Development')).toBeVisible();
        expect(
            within(restriction).getByText(
                'May return if your permissions change.',
            ),
        ).toBeVisible();
        expect(
            within(details).getAllByText(
                'May return if your permissions change.',
            ),
        ).toHaveLength(1);
        expect(within(details).getAllByText('Production')).toHaveLength(1);
        expect(
            within(details).queryByText('No current restrictions'),
        ).not.toBeInTheDocument();
        expect(
            within(details).queryByText(/not_approved/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit' }),
        ).not.toBeInTheDocument();
        expect(api).toHaveBeenCalledTimes(2);
        expect(api).toHaveBeenLastCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: '/user/agent-connections/grant-1/status',
            }),
        );
        fireEvent.click(expander);
        expect(expander).toHaveAttribute('aria-expanded', 'false');
        expect(details).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Expand grant-1' }));
        expect(
            await screen.findByRole('button', {
                name: 'Why Query data is limited',
            }),
        ).toBeVisible();
        expect(api).toHaveBeenCalledTimes(2);
    });
    it.each([
        [
            'person_permission',
            'Your permissions in this project do not allow this action.',
            true,
        ],
        ['agent_policy', 'This action is turned off for agents.', true],
        ['project_access', 'You no longer have access to this project.', true],
        [
            'not_supported',
            'This action is not available for connections.',
            false,
        ],
        ['agent_identity_disabled', 'Agents are turned off.', false],
        ['invalid_grant', 'Not available right now.', false],
        ['revoked', 'Not available right now.', false],
        ['expired', 'Not available right now.', false],
        ['future_reason', 'Not available right now.', false],
        [null, 'Not available right now.', false],
    ] as const)(
        'explains %s quietly and only promises restoration for access changes',
        async (reason, sentence, restorable) => {
            const data = status();
            Object.assign(data.effectiveProjects[0].capabilities[0], {
                reason,
            });
            api.mockImplementation(async ({ url }) =>
                url.endsWith('/status') ? data : [connection()],
            );
            renderTable();
            const expander = await screen.findByRole('button', {
                name: 'Expand grant-1',
            });
            const user = userEvent.setup();
            await user.hover(expander);
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                'Show details',
            );
            await user.unhover(expander);
            await user.click(expander);
            await user.hover(expander);
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                'Hide details',
            );
            await user.unhover(expander);
            await waitFor(() =>
                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
            );
            const trigger = await screen.findByRole('button', {
                name: 'Why Query data is limited',
            });
            expect(trigger).toHaveAccessibleDescription(sentence);
            if (reason) expect(document.body.innerHTML).not.toContain(reason);
            expect(
                screen.queryByText('May return if your permissions change.') !==
                    null,
            ).toBe(restorable);
            for (
                let tabs = 0;
                tabs < 10 && document.activeElement !== trigger;
                tabs += 1
            )
                await user.tab();
            expect(trigger).toHaveFocus();
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                sentence,
            );
            if (reason) expect(document.body.innerHTML).not.toContain(reason);
        },
    );
    it.each([
        ['expired', 'ok', 'Expired'],
        ['revoked', 'ok', 'Revoked'],
        ['active', 'invalid', 'Invalid'],
    ])(
        'shows %s / %s as %s without a reversible promise or revoke',
        async (state, limitsStatus, label) => {
            api.mockResolvedValue([
                { ...connection(), status: state, limitsStatus },
            ]);
            renderTable();
            expect(await screen.findByText(label)).toBeVisible();
            const expander = screen.getByRole('button', {
                name: 'Expand grant-1',
            });
            fireEvent.click(expander);
            expect(expander).toHaveAttribute('aria-expanded', 'true');
            const details = document.getElementById(
                expander.getAttribute('aria-controls')!,
            )!;
            expect(within(details).getByText('Development')).toBeVisible();
            expect(
                within(details)
                    .getByText('Query data')
                    .closest('.mantine-Badge-root'),
            ).toBeVisible();
            expect(api).toHaveBeenCalledTimes(1);
            expect(
                screen.queryByText('Checking restrictions'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Revoke' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('May return if your permissions change.'),
            ).not.toBeInTheDocument();
        },
    );
    it('does not promise restoration when a fresh status says the connection expired', async () => {
        api.mockImplementation(async ({ url }) =>
            url.endsWith('/status')
                ? { ...status(), status: 'expired' }
                : [connection()],
        );
        renderTable();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Expand grant-1' }),
        );
        expect(await screen.findByText('Expired')).toBeVisible();
        expect(
            screen.queryByText('May return if your permissions change.'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Revoke' }),
        ).not.toBeInTheDocument();
    });
    it('limits status requests to four even when six rows are expanded', async () => {
        const rows = Array.from({ length: 6 }, (_, index) =>
            connection(`grant-${index}`),
        );
        const resolvers: (() => void)[] = [];
        let active = 0;
        let maximum = 0;
        api.mockImplementation(async ({ url }) => {
            if (!url.endsWith('/status')) return rows;
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise<void>((resolve) =>
                resolvers.push(() => {
                    active -= 1;
                    resolve();
                }),
            );
            return status(url.split('/').at(-2));
        });
        renderTable();
        await screen.findByText('grant-0');
        for (const row of rows)
            fireEvent.click(
                screen.getByRole('button', { name: `Expand ${row.name}` }),
            );
        await waitFor(() => expect(resolvers).toHaveLength(4));
        expect(
            api.mock.calls.filter(([args]) => args.url.endsWith('/status')),
        ).toHaveLength(4);
        await act(async () => {
            resolvers.splice(0).forEach((resolve) => resolve());
        });
        await waitFor(() =>
            expect(
                api.mock.calls.filter(([args]) => args.url.endsWith('/status')),
            ).toHaveLength(6),
        );
        await act(async () => {
            resolvers.splice(0).forEach((resolve) => resolve());
        });
        expect(maximum).toBe(4);
    });
    it('does not start queued status requests after the tab unmounts', async () => {
        const rows = Array.from({ length: 6 }, (_, index) =>
            connection(`grant-${index}`),
        );
        const resolvers: (() => void)[] = [];
        api.mockImplementation(async ({ url }) => {
            if (!url.endsWith('/status')) return rows;
            await new Promise<void>((resolve) => resolvers.push(resolve));
            return status(url.split('/').at(-2));
        });
        const { unmount } = renderTable();
        await screen.findByText('grant-0');
        for (const row of rows)
            fireEvent.click(
                screen.getByRole('button', { name: `Expand ${row.name}` }),
            );
        await waitFor(() => expect(resolvers).toHaveLength(4));
        unmount();
        await act(async () => {
            resolvers.splice(0).forEach((resolve) => resolve());
        });
        expect(
            api.mock.calls.filter(([args]) => args.url.endsWith('/status')),
        ).toHaveLength(4);
        await act(async () => {
            resolvers.splice(0).forEach((resolve) => resolve());
        });
    });
    it('shows an empty state', async () => {
        api.mockResolvedValue([]);
        renderTable();
        expect(await screen.findByText('No agent connections')).toBeVisible();
        expect(
            screen.getByText(
                'Connections will appear here after you approve one.',
            ),
        ).toBeVisible();
    });
    it('shows loading and a retryable error', async () => {
        let reject!: (error: unknown) => void;
        api.mockImplementationOnce(
            () =>
                new Promise((_, fail) => {
                    reject = fail;
                }),
        );
        renderTable();
        expect(screen.getByText('Loading agent connections')).toBeVisible();
        await act(async () =>
            reject({ error: { message: 'The list failed.' } }),
        );
        expect(await screen.findByText('The list failed.')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('grant-1')).toBeVisible();
    });
});

describe('revoke confirmation', () => {
    it('cancel sends no delete', async () => {
        renderTable();
        fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText(
                'Its credential will stop working. Warehouse sign-ins stay connected.',
            ),
        ).toBeVisible();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(api.mock.calls.some(([args]) => args.method === 'DELETE')).toBe(
            false,
        );
    });
    it('deletes once, disables repeat, retains the revoked row and invalidates its status and list', async () => {
        let finish!: (value: ReturnType<typeof connection>) => void;
        let revoked = false;
        api.mockImplementation(async ({ method, url }) => {
            if (method === 'DELETE')
                return new Promise((resolve) => {
                    finish = resolve;
                });
            return url.endsWith('/status')
                ? status()
                : [{ ...connection(), status: revoked ? 'revoked' : 'active' }];
        });
        const { client } = renderTable();
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
        const confirm = within(await screen.findByRole('dialog')).getByRole(
            'button',
            { name: 'Revoke' },
        );
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        await waitFor(() => expect(confirm).toBeDisabled());
        expect(
            api.mock.calls.filter(([args]) => args.method === 'DELETE'),
        ).toHaveLength(1);
        revoked = true;
        await act(async () => finish({ ...connection(), status: 'revoked' }));
        expect(await screen.findByText('Revoked')).toBeVisible();
        expect(screen.getByText('grant-1')).toBeVisible();
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: ['agent-connections'],
            exact: true,
        });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: ['agent-connection-status', 'grant-1'],
            exact: true,
        });
    });
    it('keeps the row on a failure and offers retry', async () => {
        api.mockImplementation(async ({ method }) => {
            if (method === 'DELETE')
                throw { error: { message: 'Revoke failed.' } };
            return [connection()];
        });
        renderTable();
        fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
        fireEvent.click(
            within(await screen.findByRole('dialog')).getByRole('button', {
                name: 'Revoke',
            }),
        );
        expect(await screen.findByText('Revoke failed.')).toBeVisible();
        expect(screen.getAllByText('grant-1').length).toBeGreaterThan(0);
        expect(
            within(await screen.findByRole('dialog')).getByRole('button', {
                name: 'Revoke',
            }),
        ).toBeEnabled();
    });
});
