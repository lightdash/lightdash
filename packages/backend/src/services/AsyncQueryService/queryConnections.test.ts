import {
    CrossConnectionQueryError,
    MultipleConnectionsError,
    WarehouseTypes,
    type Connection,
} from '@lightdash/common';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import {
    assertSameQueryConnection,
    resolveQueryHistoryConnection,
} from './queryConnections';

const connection: Connection = {
    connectionUuid: 'connection-a',
    name: 'Warehouse A',
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date(),
};

describe('query connection identity', () => {
    it('allows one warehouse together with external-only results', () => {
        expect(
            assertSameQueryConnection([connection, null, connection]),
        ).toEqual(connection);
        expect(assertSameQueryConnection([null])).toBeNull();
    });

    it('refuses multiple warehouses with their structured identities', () => {
        const second = {
            ...connection,
            connectionUuid: 'connection-b',
            name: 'Warehouse B',
        };
        expect(() => assertSameQueryConnection([connection, second])).toThrow(
            CrossConnectionQueryError,
        );
        try {
            assertSameQueryConnection([connection, second]);
        } catch (error) {
            expect(error).toMatchObject({
                data: {
                    connections: [
                        {
                            connectionUuid: connection.connectionUuid,
                            name: connection.name,
                        },
                        {
                            connectionUuid: second.connectionUuid,
                            name: second.name,
                        },
                    ],
                },
            });
        }
    });

    it('validates the persisted warehouse and does not need mutable content', async () => {
        const resolveConnection = vi
            .fn<ProjectModel['resolveConnection']>()
            .mockResolvedValue(connection);
        await expect(
            resolveQueryHistoryConnection({ resolveConnection }, 'project', {
                connectionUuid: connection.connectionUuid,
                requestParameters: { sql: 'SELECT 1' },
            }),
        ).resolves.toEqual(connection);
        expect(resolveConnection).toHaveBeenCalledWith(
            'project',
            connection.connectionUuid,
        );
    });

    it('uses the sole rule for legacy null rows and preserves its refusal', async () => {
        const resolveConnection = vi
            .fn<ProjectModel['resolveConnection']>()
            .mockRejectedValue(new MultipleConnectionsError());
        await expect(
            resolveQueryHistoryConnection({ resolveConnection }, 'project', {
                connectionUuid: null,
                requestParameters: { sql: 'SELECT 1' },
            }),
        ).rejects.toBeInstanceOf(MultipleConnectionsError);
        expect(resolveConnection).toHaveBeenCalledWith('project', null);
    });

    it('does not invent a warehouse for explicitly external history', async () => {
        const resolveConnection = vi.fn<ProjectModel['resolveConnection']>();
        await expect(
            resolveQueryHistoryConnection({ resolveConnection }, 'project', {
                connectionUuid: null,
                requestParameters: {
                    sql: 'SELECT 1',
                    executionBackend: 'external',
                },
            }),
        ).resolves.toBeNull();
        expect(resolveConnection).not.toHaveBeenCalled();
    });
});
