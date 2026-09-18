import { WarehouseTypes, type Connection } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { useWarehouseTree } from './useWarehouseTree';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

const connection = (connectionUuid: string, name: string): Connection => ({
    connectionUuid,
    name,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
});

const postgres = connection('connection-postgres', 'postgres');
const finance = connection('connection-finance', 'finance');

// The document was seeded from the last-used connection, so finance is active
const activeConnection = {
    connections: [postgres, finance],
    hasSeveralConnections: true,
    isConnectionSettled: true,
    activeConnectionUuid: finance.connectionUuid,
    activeConnection: finance,
    connectionNameFor: () => undefined,
    switchConnection: vi.fn(),
    seedConnection: vi.fn(),
};

vi.mock('./useActiveConnection', () => ({
    useActiveConnection: () => activeConnection,
}));

const mockApi = vi.mocked(lightdashApi);

const wrapper: FC<PropsWithChildren> = ({ children }) =>
    createElement(
        QueryClientProvider,
        {
            client: new QueryClient({
                defaultOptions: { queries: { retry: false } },
            }),
        },
        children,
    );

describe('useWarehouseTree on first load', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApi.mockImplementation((({ url }: { url: string }) =>
            url.includes('connection-finance')
                ? Promise.resolve({
                      databases: [
                          {
                              name: 'acc_finance',
                              database: 'acc_finance',
                              schema: null,
                              isDefault: true,
                          },
                      ],
                      truncated: false,
                      limit: 100,
                  })
                : Promise.resolve({
                      databases: [],
                      truncated: false,
                      limit: 100,
                  })) as never);
    });

    it('keeps every project connection in the tree while only one has listed', async () => {
        const { result } = renderHook(
            () =>
                useWarehouseTree({
                    projectUuid: 'project-uuid',
                    warehouseConnectionType: WarehouseTypes.POSTGRES,
                    isRowExpandedByOverride: () => undefined,
                }),
            { wrapper },
        );

        await waitFor(() =>
            expect(
                result.current.connections.some(
                    (candidate) => candidate.listingStatus === 'loaded',
                ),
            ).toBe(true),
        );

        // The bug dropped connections without a listing, collapsing the tree
        // to one connection and hiding the connection level entirely.
        expect(result.current.connections).toHaveLength(2);
        expect(
            result.current.connections.map((candidate) => ({
                name: candidate.connectionName,
                isActive: candidate.isActive,
                listingStatus: candidate.listingStatus,
            })),
        ).toEqual([
            {
                name: 'postgres',
                isActive: false,
                listingStatus: 'loading',
            },
            {
                name: 'finance',
                isActive: true,
                listingStatus: 'loaded',
            },
        ]);
    });

    it('lists only the active connection until another is opened', async () => {
        renderHook(
            () =>
                useWarehouseTree({
                    projectUuid: 'project-uuid',
                    warehouseConnectionType: WarehouseTypes.POSTGRES,
                    isRowExpandedByOverride: () => undefined,
                }),
            { wrapper },
        );

        await waitFor(() => expect(mockApi).toHaveBeenCalled());
        const listedConnections = mockApi.mock.calls
            .map(([args]) => (args as { url: string }).url)
            .filter((url) => url.includes('/sqlRunner/databases'));
        expect(listedConnections).toHaveLength(1);
        expect(listedConnections[0]).toContain('connection-finance');
    });
});

describe('useWarehouseTree when the catalog is refused', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApi.mockImplementation((() =>
            Promise.reject({
                status: 'error',
                error: {
                    statusCode: 403,
                    name: 'ForbiddenError',
                    message: "You don't have access to this resource or action",
                },
            })) as never);
    });

    it('marks the listing forbidden so the tree offers no retry', async () => {
        const { result } = renderHook(
            () =>
                useWarehouseTree({
                    projectUuid: 'project-uuid',
                    warehouseConnectionType: WarehouseTypes.POSTGRES,
                    isRowExpandedByOverride: () => undefined,
                }),
            { wrapper },
        );

        await waitFor(() => expect(result.current.listingForbidden).toBe(true));
        // The connection names still show; only the catalog is withheld.
        expect(
            result.current.connections.map(
                ({ connectionName }) => connectionName,
            ),
        ).toEqual(['postgres', 'finance']);
        const active = result.current.connections.find(
            ({ isActive }) => isActive,
        );
        expect(active?.listingForbidden).toBe(true);
        expect(active?.listingStatus).toBe('error');
    });

    it('leaves an ordinary failure retryable', async () => {
        mockApi.mockImplementation((() =>
            Promise.reject({
                status: 'error',
                error: {
                    statusCode: 500,
                    name: 'UnexpectedServerError',
                    message: 'Something went wrong.',
                },
            })) as never);

        const { result } = renderHook(
            () =>
                useWarehouseTree({
                    projectUuid: 'project-uuid',
                    warehouseConnectionType: WarehouseTypes.POSTGRES,
                    isRowExpandedByOverride: () => undefined,
                }),
            { wrapper },
        );

        await waitFor(() => expect(result.current.listingError).not.toBeNull());
        expect(result.current.listingForbidden).toBe(false);
    });
});
