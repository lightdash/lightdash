import { describe, expect, it } from 'vitest';
import {
    buildDatabaseSelectData,
    databaseGroup,
    defaultValueName,
    initialSelections,
    isAdminRole,
    largestSchemaName,
    normalizeInventory,
    parseConnectStepResult,
    recommendedWarehouseName,
    schemaTotals,
    warehouseSecondaryText,
} from './configureHelpers';

const db = (name: string, kind: string | null = null, comment = null) => ({
    name,
    kind,
    comment,
});
const wh = (
    name: string,
    size: string | null = null,
    state: string | null = null,
) => ({ name, size, state, autoSuspendSeconds: null });

describe('normalizeInventory', () => {
    it('normalizes rich inventory shapes', () => {
        const result = normalizeInventory({
            databases: [
                { name: 'ANALYTICS', comment: 'core', kind: 'STANDARD' },
            ],
            warehouses: [
                {
                    name: 'WH',
                    size: 'X-Small',
                    state: 'STARTED',
                    autoSuspendSeconds: 60,
                },
            ],
            roles: [{ name: 'READER', isDefault: true }],
        });
        expect(result).toEqual({
            databases: [
                { name: 'ANALYTICS', comment: 'core', kind: 'STANDARD' },
            ],
            warehouses: [
                {
                    name: 'WH',
                    size: 'X-Small',
                    state: 'STARTED',
                    autoSuspendSeconds: 60,
                },
            ],
            roles: [{ name: 'READER', isDefault: true }],
        });
    });

    it('normalizes legacy string[] inventory into the rich shape', () => {
        const result = normalizeInventory({
            databases: ['ANALYTICS', 'RAW'],
            warehouses: ['COMPUTE_WH'],
            roles: ['PUBLIC'],
        });
        expect(result).toEqual({
            databases: [
                { name: 'ANALYTICS', comment: null, kind: null },
                { name: 'RAW', comment: null, kind: null },
            ],
            warehouses: [
                {
                    name: 'COMPUTE_WH',
                    size: null,
                    state: null,
                    autoSuspendSeconds: null,
                },
            ],
            roles: [{ name: 'PUBLIC', isDefault: false }],
        });
    });

    it('drops malformed entries and defaults missing arrays', () => {
        const result = normalizeInventory({
            databases: [{ comment: 'no name' }, 42, 'OK'],
        });
        expect(result).toEqual({
            databases: [{ name: 'OK', comment: null, kind: null }],
            warehouses: [],
            roles: [],
        });
    });

    it('returns null for non-object input', () => {
        expect(normalizeInventory(null)).toBeNull();
        expect(normalizeInventory('nope')).toBeNull();
    });
});

describe('parseConnectStepResult', () => {
    it('parses inventory, values and sources', () => {
        const parsed = parseConnectStepResult({
            inventory: { databases: ['A'], warehouses: [], roles: [] },
            connectionValues: {
                database: 'A',
                warehouse: null,
                role: 'READER',
                schema: null,
            },
            connectionValueSources: {
                database: 'default',
                warehouse: 'missing',
                role: 'user',
                schema: 'missing',
            },
        });
        expect(parsed?.connectionValues.database).toBe('A');
        expect(parsed?.connectionValueSources?.database).toBe('default');
        expect(parsed?.inventory.databases[0].name).toBe('A');
    });

    it('returns null when there is no inventory', () => {
        expect(parseConnectStepResult({ foo: 'bar' })).toBeNull();
        expect(parseConnectStepResult(null)).toBeNull();
    });
});

describe('databaseGroup + buildDatabaseSelectData', () => {
    it('classifies databases into normal / shared / system', () => {
        expect(databaseGroup(db('ANALYTICS'))).toBe('normal');
        expect(databaseGroup(db('SHARE_DB', 'IMPORTED DATABASE'))).toBe(
            'shared',
        );
        expect(databaseGroup(db('SNOWFLAKE'))).toBe('system');
        expect(
            databaseGroup(db('SNOWFLAKE_SAMPLE_DATA', 'IMPORTED DATABASE')),
        ).toBe('system');
    });

    it('orders normal (alpha) first, then Shared, then System', () => {
        const data = buildDatabaseSelectData([
            db('SNOWFLAKE'),
            db('ZED'),
            db('SHARED_B', 'IMPORTED DATABASE'),
            db('ALPHA'),
            db('SHARED_A', 'IMPORTED DATABASE'),
            db('SNOWFLAKE_SAMPLE_DATA', 'IMPORTED DATABASE'),
        ]);
        expect(data).toEqual([
            { value: 'ALPHA', label: 'ALPHA' },
            { value: 'ZED', label: 'ZED' },
            {
                group: 'Shared with you',
                items: [
                    { value: 'SHARED_A', label: 'SHARED_A' },
                    { value: 'SHARED_B', label: 'SHARED_B' },
                ],
            },
            {
                group: 'System',
                items: [
                    { value: 'SNOWFLAKE', label: 'SNOWFLAKE' },
                    {
                        value: 'SNOWFLAKE_SAMPLE_DATA',
                        label: 'SNOWFLAKE_SAMPLE_DATA',
                    },
                ],
            },
        ]);
    });

    it('omits empty groups', () => {
        const data = buildDatabaseSelectData([db('ONLY')]);
        expect(data).toEqual([{ value: 'ONLY', label: 'ONLY' }]);
    });
});

describe('recommendedWarehouseName', () => {
    it('picks the smallest by size order', () => {
        expect(
            recommendedWarehouseName([
                wh('BIG', 'Large'),
                wh('SMALL', 'X-Small'),
                wh('MED', 'Medium'),
            ]),
        ).toBe('SMALL');
    });

    it('prefers STARTED on a size tie', () => {
        expect(
            recommendedWarehouseName([
                wh('SUSPENDED', 'Small', 'SUSPENDED'),
                wh('RUNNING', 'Small', 'STARTED'),
            ]),
        ).toBe('RUNNING');
    });

    it('ranks unknown sizes last', () => {
        expect(
            recommendedWarehouseName([
                wh('MYSTERY', null),
                wh('KNOWN', '3X-Large'),
            ]),
        ).toBe('KNOWN');
    });

    it('returns null for an empty list', () => {
        expect(recommendedWarehouseName([])).toBeNull();
    });
});

describe('warehouseSecondaryText', () => {
    it('joins size and lowercased state', () => {
        expect(warehouseSecondaryText(wh('W', 'X-Small', 'STARTED'))).toBe(
            'X-Small · started',
        );
    });
    it('pads missing metadata gracefully', () => {
        expect(warehouseSecondaryText(wh('W', 'Small', null))).toBe('Small');
        expect(warehouseSecondaryText(wh('W', null, 'SUSPENDED'))).toBe(
            'suspended',
        );
        expect(warehouseSecondaryText(wh('W', null, null))).toBeNull();
    });
});

describe('largestSchemaName + schemaTotals', () => {
    it('picks the schema with the most tables', () => {
        expect(
            largestSchemaName([
                { name: 'small', tableCount: 2 },
                { name: 'big', tableCount: 9 },
                { name: 'mid', tableCount: 5 },
            ]),
        ).toBe('big');
    });
    it('returns null for empty schema list', () => {
        expect(largestSchemaName([])).toBeNull();
    });
    it('sums totals', () => {
        expect(
            schemaTotals([
                { name: 'a', tableCount: 3 },
                { name: 'b', tableCount: 4 },
            ]),
        ).toEqual({ schemaCount: 2, tableCount: 7 });
    });
});

describe('isAdminRole', () => {
    it('flags Snowflake admin roles case-insensitively', () => {
        expect(isAdminRole('ACCOUNTADMIN')).toBe(true);
        expect(isAdminRole('securityadmin')).toBe(true);
        expect(isAdminRole(' ORGADMIN ')).toBe(true);
        expect(isAdminRole('READER')).toBe(false);
        expect(isAdminRole('SYSADMIN')).toBe(false);
        expect(isAdminRole(null)).toBe(false);
    });
});

describe('defaultValueName', () => {
    const values = {
        database: 'A',
        warehouse: 'WH',
        role: 'READER',
        schema: null,
    };
    it('returns the value only when its source is default', () => {
        const sources = {
            database: 'default' as const,
            warehouse: 'user' as const,
            role: 'default' as const,
            schema: 'missing' as const,
        };
        expect(defaultValueName(values, sources, 'database')).toBe('A');
        expect(defaultValueName(values, sources, 'warehouse')).toBeNull();
        expect(defaultValueName(values, sources, 'role')).toBe('READER');
    });
    it('returns null with no sources', () => {
        expect(defaultValueName(values, null, 'database')).toBeNull();
    });
});

describe('initialSelections', () => {
    const inventory = {
        databases: [db('A')],
        warehouses: [wh('SMALL', 'X-Small'), wh('BIG', 'Large')],
        roles: [{ name: 'READER', isDefault: false }],
    };

    it('never auto-selects an admin default role, leaving it empty', () => {
        const selections = initialSelections(
            {
                database: 'A',
                warehouse: 'BIG',
                role: 'ACCOUNTADMIN',
                schema: null,
            },
            inventory,
        );
        expect(selections.role).toBeNull();
    });

    it('keeps a non-admin default role', () => {
        const selections = initialSelections(
            { database: 'A', warehouse: 'BIG', role: 'READER', schema: null },
            inventory,
        );
        expect(selections.role).toBe('READER');
    });

    it('pre-selects the recommended warehouse when none is provided', () => {
        const selections = initialSelections(
            { database: 'A', warehouse: null, role: null, schema: null },
            inventory,
        );
        expect(selections.warehouse).toBe('SMALL');
    });

    it('keeps a provided default warehouse over the recommendation', () => {
        const selections = initialSelections(
            { database: 'A', warehouse: 'BIG', role: null, schema: null },
            inventory,
        );
        expect(selections.warehouse).toBe('BIG');
    });
});
