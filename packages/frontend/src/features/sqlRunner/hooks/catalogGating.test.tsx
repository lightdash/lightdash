import { WarehouseTypes, type Connection } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { resolveActiveConnection } from '../utils/activeConnection';
import { useDatabases } from './useTables';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

const mockApi = vi.mocked(lightdashApi);

const connection = (connectionUuid: string, name: string): Connection => ({
    connectionUuid,
    name,
    warehouseType:
        connectionUuid === 'connection-b'
            ? WarehouseTypes.SNOWFLAKE
            : WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
});

const severalConnections = [
    connection('connection-a', 'Analytics'),
    connection('connection-b', 'Reporting'),
];

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

const renderDatabases = (args: {
    connectionUuid: string | undefined;
    isConnectionSettled: boolean;
}) =>
    renderHook(
        () =>
            useDatabases({
                projectUuid: 'project-uuid',
                connectionUuid: args.connectionUuid,
                isConnectionSettled: args.isConnectionSettled,
            }),
        { wrapper },
    );

const settledFor = (connections: Connection[], connectionUuid?: string) =>
    connectionUuid !== undefined || connections.length === 1;

describe('catalog gating on the active connection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApi.mockResolvedValue({
            databases: [],
            truncated: false,
            limit: 100,
        } as never);
    });

    it('opens a multi-connection project with no catalog request', async () => {
        const selected = resolveActiveConnection({
            connections: severalConnections,
            savedConnectionUuid: undefined,
            lastUsedConnectionUuid: undefined,
            isSavedChart: false,
        });
        expect(selected).toBeUndefined();

        renderDatabases({
            connectionUuid: selected,
            isConnectionSettled: settledFor(severalConnections, selected),
        });

        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('fetches the catalog of the connection the picker selects', async () => {
        const { result } = renderDatabases({
            connectionUuid: 'connection-b',
            isConnectionSettled: settledFor(severalConnections, 'connection-b'),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: expect.stringContaining('connectionUuid=connection-b'),
            }),
        );
    });

    it('restores a saved chart connection before any catalog access', async () => {
        const selected = resolveActiveConnection({
            connections: severalConnections,
            savedConnectionUuid: 'connection-b',
            lastUsedConnectionUuid: 'connection-a',
            isSavedChart: true,
        });
        expect(selected).toBe('connection-b');

        renderDatabases({
            connectionUuid: selected,
            isConnectionSettled: settledFor(severalConnections, selected),
        });

        await waitFor(() => expect(mockApi).toHaveBeenCalled());
        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: expect.stringContaining('connectionUuid=connection-b'),
            }),
        );
    });

    it('needs no manual choice on a project with one connection', async () => {
        const sole = [severalConnections[0]];
        const selected = resolveActiveConnection({
            connections: sole,
            savedConnectionUuid: undefined,
            lastUsedConnectionUuid: undefined,
            isSavedChart: false,
        });
        expect(selected).toBe('connection-a');

        const { result } = renderDatabases({
            connectionUuid: selected,
            isConnectionSettled: settledFor(sole, selected),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockApi).toHaveBeenCalledTimes(1);
    });

    it('selects the dialect of the selected connection, not the first', () => {
        const selectedConnection = severalConnections.find(
            (candidate) => candidate.connectionUuid === 'connection-b',
        );
        expect(selectedConnection?.warehouseType).toBe(
            WarehouseTypes.SNOWFLAKE,
        );
        expect(severalConnections[0].warehouseType).toBe(
            WarehouseTypes.POSTGRES,
        );
    });
});
