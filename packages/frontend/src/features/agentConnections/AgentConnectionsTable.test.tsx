import { AgentCapability } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
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
    approvedAt: '2026-10-11T12:00:00Z',
    expiresAt: '2099-10-12T12:00:00Z',
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
    it('shows columns, plain actions, metadata and status without fetching collapsed rows', async () => {
        renderTable();
        await screen.findByText('grant-1');
        for (const name of [
            'Connection',
            'Projects',
            'Approved actions',
            'Expires',
            'Last used',
            'Status',
        ])
            expect(screen.getByRole('columnheader', { name })).toBeVisible();
        expect(screen.getByText('CLI')).toBeVisible();
        expect(screen.getByText('Never used')).toBeVisible();
        expect(screen.getByText('Query data')).toBeVisible();
        expect(screen.getByText('Active')).toBeVisible();
        expect(
            screen.getByText('Expand to check current restrictions'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Edit' }),
        ).not.toBeInTheDocument();
        expect(api).toHaveBeenCalledTimes(1);
    });
    it('loads expanded status once and keeps the server reason with the reversible restriction line', async () => {
        renderTable();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Expand grant-1' }),
        );
        expect(
            await screen.findByText('Query data: person_permission'),
        ).toBeVisible();
        expect(
            screen.getByText('May return if your permissions change.'),
        ).toBeVisible();
        fireEvent.click(
            screen.getByRole('button', { name: 'Collapse grant-1' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Expand grant-1' }));
        expect(api).toHaveBeenCalledTimes(2);
    });
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
