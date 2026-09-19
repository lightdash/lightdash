import { type Connection, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getConnectionName } from './connectionName';

const connection = (connectionUuid: string, name: string): Connection => ({
    connectionUuid,
    name,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
});

describe('getConnectionName', () => {
    const connections = [
        connection('11111111-1111-1111-1111-111111111111', 'London'),
        connection('22222222-2222-2222-2222-222222222222', 'Tokyo'),
    ];

    it('returns the matching connection name', () => {
        expect(
            getConnectionName(connections, connections[1].connectionUuid),
        ).toBe('Tokyo');
    });

    it('returns a short uuid for an unknown connection', () => {
        expect(
            getConnectionName(
                connections,
                '33333333-3333-3333-3333-333333333333',
            ),
        ).toBe('33333333');
    });

    it('resolves a null binding to the sole connection', () => {
        expect(getConnectionName([connections[0]], null)).toBe('London');
    });
});
