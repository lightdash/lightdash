import {
    ExploreType,
    type WarehouseConnectionForUserCredentials,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getExploreConnectionName } from './connectionName';

const connections = [
    {
        warehouseConnectionUuid: 'original-uuid',
        name: 'Postgres',
        isOriginal: true,
    },
    {
        warehouseConnectionUuid: 'second-uuid',
        name: 'BigQuery',
        isOriginal: false,
    },
] as WarehouseConnectionForUserCredentials[];

describe('getExploreConnectionName', () => {
    it('names the connection a warehouse explore reads', () => {
        expect(
            getExploreConnectionName(connections, {
                type: ExploreType.DEFAULT,
                warehouseConnectionUuid: 'second-uuid',
            }),
        ).toBe('BigQuery');
        expect(
            getExploreConnectionName(connections, {
                type: ExploreType.DEFAULT,
                warehouseConnectionUuid: null,
            }),
        ).toBe('Postgres');
    });

    it('gives a live data source explore no warehouse badge', () => {
        expect(
            getExploreConnectionName(connections, {
                type: ExploreType.API_SOURCE,
                warehouseConnectionUuid: null,
            }),
        ).toBeNull();
    });
});
