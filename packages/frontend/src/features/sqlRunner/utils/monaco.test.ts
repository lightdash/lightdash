import {
    type WarehouseListedDatabase,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { generateTableCompletions } from './monaco';

const listedDatabases: WarehouseListedDatabase[] = [
    {
        name: 'jaffle',
        database: 'AwsDataCatalog',
        schema: 'jaffle',
        isDefault: true,
    },
    {
        name: 'staging',
        database: 'AwsDataCatalog',
        schema: 'staging',
        isDefault: false,
    },
];

const twoLoadedDatabases: WarehouseTablesCatalog = {
    AwsDataCatalog: {
        jaffle: { orders: {} },
        staging: { stg_orders: {} },
    },
};

describe('generateTableCompletions', () => {
    it('qualifies a table from its own database and schema across loaded databases', () => {
        expect(
            generateTableCompletions('"', twoLoadedDatabases, listedDatabases),
        ).toEqual([
            { value: '"AwsDataCatalog"."jaffle"."orders"', kind: 'table' },
            {
                value: '"AwsDataCatalog"."staging"."stg_orders"',
                kind: 'table',
            },
            { value: '"AwsDataCatalog"', kind: 'database' },
            { value: '"jaffle"', kind: 'schema' },
            { value: '"staging"', kind: 'schema' },
        ]);
    });

    it('suggests a listed database before its tables load', () => {
        const completions = generateTableCompletions(
            '"',
            { AwsDataCatalog: { jaffle: { orders: {} } } },
            listedDatabases,
        );

        expect(completions).toContainEqual({
            value: '"staging"',
            kind: 'schema',
        });
        expect(
            completions.filter((entry) => entry.kind === 'table'),
        ).toHaveLength(1);
    });

    it('keeps the case and quote preferences', () => {
        expect(
            generateTableCompletions('"', twoLoadedDatabases, [], {
                casePreference: 'uppercase',
                quotePreference: 'never',
            }),
        ).toEqual([
            { value: 'AWSDATACATALOG.JAFFLE.ORDERS', kind: 'table' },
            { value: 'AWSDATACATALOG.STAGING.STG_ORDERS', kind: 'table' },
        ]);
    });

    it('keeps the two-part form when the database is empty', () => {
        expect(
            generateTableCompletions('`', { '': { default: { events: {} } } }, [
                {
                    name: 'default',
                    database: '',
                    schema: null,
                    isDefault: true,
                },
            ]),
        ).toEqual([{ value: '`default`.`events`', kind: 'table' }]);
    });
});
