import {
    findReusedColumnNames,
    parseAllowList,
    type SchemaColumn,
} from './columnNames';

const baseColumns: SchemaColumn[] = [
    { tableName: 'projects', columnName: 'project_uuid' },
    {
        tableName: 'projects',
        columnName: 'organization_warehouse_credentials_uuid',
    },
    { tableName: 'warehouse_credentials', columnName: 'project_id' },
    { tableName: 'cached_explore', columnName: 'project_uuid' },
    { tableName: 'saved_sql_versions', columnName: 'saved_sql_uuid' },
];

describe('findReusedColumnNames', () => {
    test('reports a column added to an existing table under a name the base already uses', () => {
        expect(
            findReusedColumnNames({
                baseColumns,
                headColumns: [
                    ...baseColumns,
                    {
                        tableName: 'warehouse_credentials',
                        columnName: 'organization_warehouse_credentials_uuid',
                    },
                ],
                allowList: [],
            }),
        ).toEqual([
            {
                tableName: 'warehouse_credentials',
                columnName: 'organization_warehouse_credentials_uuid',
                existingTables: ['projects'],
            },
        ]);
    });

    test('accepts one new name added to several existing tables', () => {
        expect(
            findReusedColumnNames({
                baseColumns,
                headColumns: [
                    ...baseColumns,
                    {
                        tableName: 'cached_explore',
                        columnName: 'warehouse_connection_uuid',
                    },
                    {
                        tableName: 'saved_sql_versions',
                        columnName: 'warehouse_connection_uuid',
                    },
                ],
                allowList: [],
            }),
        ).toEqual([]);
    });

    test('accepts base names on a new table', () => {
        expect(
            findReusedColumnNames({
                baseColumns,
                headColumns: [
                    ...baseColumns,
                    {
                        tableName: 'warehouse_connections',
                        columnName: 'project_uuid',
                    },
                ],
                allowList: [],
            }),
        ).toEqual([]);
    });

    test('accepts a reused name that the allow-list explains', () => {
        expect(
            findReusedColumnNames({
                baseColumns,
                headColumns: [
                    ...baseColumns,
                    {
                        tableName: 'warehouse_credentials',
                        columnName: 'organization_warehouse_credentials_uuid',
                    },
                ],
                allowList: [
                    {
                        column: 'warehouse_credentials.organization_warehouse_credentials_uuid',
                        reason: 'Every query that joins these two tables qualifies the column.',
                    },
                ],
            }),
        ).toEqual([]);
    });
});

describe('parseAllowList', () => {
    test('reads entries with a reason', () => {
        expect(
            parseAllowList(
                JSON.stringify([
                    {
                        column: 'cached_explore.project_uuid',
                        reason: 'The previous release qualifies every read of this column.',
                    },
                ]),
            ),
        ).toEqual([
            {
                column: 'cached_explore.project_uuid',
                reason: 'The previous release qualifies every read of this column.',
            },
        ]);
    });

    test('refuses an entry without a real reason', () => {
        expect(() =>
            parseAllowList(
                JSON.stringify([
                    { column: 'cached_explore.project_uuid', reason: 'ok' },
                ]),
            ),
        ).toThrow('cached_explore.project_uuid needs a reason');
    });

    test('refuses an entry that does not name table.column', () => {
        expect(() =>
            parseAllowList(
                JSON.stringify([
                    {
                        column: 'project_uuid',
                        reason: 'The previous release qualifies every read of this column.',
                    },
                ]),
            ),
        ).toThrow('project_uuid must be written as table.column');
    });
});
