import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../testing/testUtils';
import baseline from './__fixtures__/main-no-connections.json';
import { MyAgentConnectionsPanel } from './index';

vi.mock('../../../api');
vi.mock('../../../features/aiAccess/api', () => ({
    useOrganizationAgentIdentitySettings: () => ({ data: { rules: [] } }),
}));
vi.mock('../../../hooks/useProjects', () => ({
    useProjects: () => ({ data: [] }),
}));
vi.mock(
    '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials',
    () => ({ useUserWarehouseCredentials: () => ({ data: [] }) }),
);
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
const api = mockedLightdashApi;
const normalizeDom = (container: HTMLElement) =>
    container.innerHTML
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/id="[^"]*"/g, 'id="ID"')
        .replace(/mantine-[a-z0-9]{8,}/g, 'mantine-ID')
        .replace(/__m__-_r_[a-z0-9]+_/g, '__m__-ID');
const renderPanel = (search = '') => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return {
        ...renderWithProviders(
            <QueryClientProvider client={client}>
                <MemoryRouter
                    initialEntries={[
                        `/generalSettings/myAgentConnections${search}`,
                    ]}
                >
                    <MyAgentConnectionsPanel />
                </MemoryRouter>
            </QueryClientProvider>,
        ),
        client,
    };
};
beforeEach(() => {
    vi.clearAllMocks();
    api.mockReset();
    api.mockResolvedValue([]);
});
describe('agent identity without connections', () => {
    it.each(['', '?tab=warehouses', '?tab=connections'])(
        'matches the main panel DOM with no rows at %s',
        async (search) => {
            const { container, client } = renderPanel(search);
            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
            expect(normalizeDom(container)).toBe(baseline.dom);
            expect(api).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    url: '/user/agent-connections',
                    method: 'GET',
                }),
            );
        },
    );
    it('keeps the main panel while the list loads and shows the list error with a retry when it fails', async () => {
        let reject!: (error: unknown) => void;
        api.mockImplementationOnce(
            () =>
                new Promise((_, fail) => {
                    reject = fail;
                }),
        );
        const { container, client } = renderPanel();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        expect(normalizeDom(container)).toBe(baseline.dom);
        await act(async () =>
            reject({ error: { message: 'Connection list failed.' } }),
        );
        await waitFor(() => expect(client.isFetching()).toBe(0));
        expect(
            await screen.findByRole('tab', { name: 'Agent connections' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Connection list failed.')).toBeVisible();
        expect(api).toHaveBeenCalledOnce();
        expect(screen.getByRole('button', { name: /retry/i })).toBeVisible();
    });
    it.each(['', '?tab=warehouses'])(
        'shows one shared list error and Retry above the panels at %s',
        async (search) => {
            api.mockRejectedValueOnce({
                error: { message: 'Connection list failed.' },
            });
            renderPanel(search);
            const message = await screen.findByText('Connection list failed.');
            expect(message).toBeVisible();
            expect(screen.getAllByText('Connection list failed.')).toHaveLength(
                1,
            );
            expect(
                screen.getAllByRole('button', { name: 'Retry' }),
            ).toHaveLength(1);
            expect(message.closest('[role="tabpanel"]')).toBeNull();
            if (search)
                expect(
                    screen.getByText('Your agents run as you'),
                ).toBeVisible();
            expect(api).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    url: '/user/agent-connections',
                    method: 'GET',
                }),
            );
        },
    );
    it.each([true, false])(
        'retries the warehouse-tab list once and recovers with rows: %s',
        async (hasRows) => {
            api.mockRejectedValueOnce({
                error: { message: 'Connection list failed.' },
            }).mockResolvedValueOnce(
                hasRows
                    ? [
                          {
                              grantUuid: 'grant',
                              name: 'Retained connection',
                              approvedProjects: [],
                              approvedAt: '2026-10-12T12:00:00Z',
                              expiresAt: '2099-10-12T12:00:00Z',
                              lastUsedAt: null,
                              revokedAt: null,
                              limitsStatus: 'ok',
                              status: 'active',
                          },
                      ]
                    : [],
            );
            const { container, client } = renderPanel('?tab=warehouses');
            const retry = await screen.findByRole('button', { name: 'Retry' });
            expect(screen.getByText('Your agents run as you')).toBeVisible();
            expect(api).toHaveBeenCalledOnce();
            fireEvent.click(retry);
            await waitFor(() =>
                expect(
                    screen.queryByText('Connection list failed.'),
                ).not.toBeInTheDocument(),
            );
            expect(
                screen.queryByRole('button', { name: 'Retry' }),
            ).not.toBeInTheDocument();
            if (hasRows) {
                expect(
                    screen.getByRole('tab', { name: 'Warehouse sign-ins' }),
                ).toHaveAttribute('aria-selected', 'true');
                fireEvent.click(
                    screen.getByRole('tab', { name: 'Agent connections' }),
                );
                expect(
                    await screen.findByText('Retained connection'),
                ).toBeVisible();
            } else {
                expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
                expect(normalizeDom(container)).toBe(baseline.dom);
            }
            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(api).toHaveBeenCalledTimes(2);
            for (const [args] of api.mock.calls)
                expect(args).toMatchObject({
                    url: '/user/agent-connections',
                    method: 'GET',
                });
        },
    );
    it.each(['active', 'expired', 'revoked'])(
        'reveals tabs for a %s row without fetching the list again',
        async (status) => {
            api.mockResolvedValue([
                {
                    grantUuid: 'grant',
                    name: 'Retained connection',
                    approvedProjects: [],
                    approvedAt: '2026-10-12T12:00:00Z',
                    expiresAt: '2099-10-12T12:00:00Z',
                    lastUsedAt: null,
                    revokedAt: null,
                    limitsStatus: 'ok',
                    status,
                },
            ]);
            const { client } = renderPanel();
            expect(
                await screen.findByRole('tab', { name: 'Agent connections' }),
            ).toHaveAttribute('aria-selected', 'true');
            expect(
                await screen.findByText('Retained connection'),
            ).toBeVisible();
            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(api).toHaveBeenCalledOnce();
        },
    );
    it('honours the warehouse tab when a row exists', async () => {
        api.mockResolvedValue([{ grantUuid: 'grant', status: 'revoked' }]);
        renderPanel('?tab=warehouses');
        expect(
            await screen.findByRole('tab', { name: 'Warehouse sign-ins' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Your agents run as you')).toBeVisible();
        expect(api).toHaveBeenCalledOnce();
    });
});
