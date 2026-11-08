import {
    getAgentIdentityWarehouseTypes,
    supportsAiServiceAccount,
    WarehouseTypes,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { agentIdentityWarehouses } from './agentIdentityWarehouses';
import { identityWarehouseNames } from './identityLabels';

describe('agentIdentityWarehouses', () => {
    it('describes exactly the warehouses that support agent identity', () => {
        const described = Object.keys(agentIdentityWarehouses).sort();
        expect(described).toEqual([...getAgentIdentityWarehouseTypes()].sort());
        expect(described).toEqual(
            Object.values(WarehouseTypes)
                .filter(supportsAiServiceAccount)
                .sort(),
        );
    });

    it('keeps the warehouse names and their order', () => {
        expect(Object.entries(identityWarehouseNames)).toEqual([
            [WarehouseTypes.POSTGRES, 'Postgres'],
            [WarehouseTypes.REDSHIFT, 'Redshift'],
            [WarehouseTypes.TRINO, 'Trino'],
            [WarehouseTypes.CLICKHOUSE, 'ClickHouse'],
            [WarehouseTypes.ATHENA, 'Athena'],
            [WarehouseTypes.SNOWFLAKE, 'Snowflake'],
            [WarehouseTypes.BIGQUERY, 'BigQuery'],
            [WarehouseTypes.DATABRICKS, 'Databricks'],
        ]);
    });
});
