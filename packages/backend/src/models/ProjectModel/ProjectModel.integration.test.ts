import { ExploreType } from '@lightdash/common';
import {
    CachedExploreTableName,
    type CachedExploreTable,
} from '../../database/entities/projects';
import { getTestContext } from '../../vitest.setup.integration';

describe('ProjectModel cached explore summary projection', () => {
    const cachedRowNames = [
        'prod10912_constructor',
        'prod10912_to_string',
        'prod10912_malformed_entries',
        'prod10912_non_object_tables',
        'prod10912_errors_null',
        'prod10912_top_scalar',
    ];

    const table = (name: string, description: string | null = null) => ({
        name,
        database: 'database',
        schema: 'schema',
        sqlTable: `database.schema.${name}`,
        description,
    });

    const deleteFixtures = async () => {
        const { db, testProjectUuid } = getTestContext();
        await db<CachedExploreTable>(CachedExploreTableName)
            .where('project_uuid', testProjectUuid)
            .whereIn('name', cachedRowNames)
            .delete();
    };

    beforeEach(deleteFixtures);
    afterEach(deleteFixtures);

    test('executes guarded JSONB expansion without losing legal names', async () => {
        const { app, db, testProjectUuid } = getTestContext();
        await db<CachedExploreTable>(CachedExploreTableName).insert([
            {
                project_uuid: testProjectUuid,
                name: 'prod10912_constructor',
                table_names: ['__proto__'],
                explore: {
                    name: 'constructor',
                    type: ExploreType.DEFAULT,
                    baseTable: '__proto__',
                    tables: Object.fromEntries([
                        ['__proto__', table('prototype_table')],
                    ]),
                },
            },
            {
                project_uuid: testProjectUuid,
                name: 'prod10912_to_string',
                table_names: ['constructor'],
                explore: {
                    name: 'toString',
                    type: ExploreType.DEFAULT,
                    baseTable: 'constructor',
                    tables: { constructor: table('constructor_table') },
                },
            },
            {
                project_uuid: testProjectUuid,
                name: 'prod10912_malformed_entries',
                table_names: ['valid'],
                explore: {
                    name: 'prod10912_malformed_entries',
                    type: ExploreType.DEFAULT,
                    baseTable: 'valid',
                    tables: {
                        valid: table('valid', null),
                        nullValue: null,
                        numberValue: 1,
                        stringValue: 'invalid',
                        arrayValue: [],
                    },
                },
            },
            {
                project_uuid: testProjectUuid,
                name: 'prod10912_non_object_tables',
                table_names: [],
                explore: {
                    name: 'prod10912_non_object_tables',
                    type: ExploreType.DEFAULT,
                    baseTable: '',
                    tables: 1,
                },
            },
            {
                project_uuid: testProjectUuid,
                name: 'prod10912_errors_null',
                table_names: [],
                explore: {
                    name: 'prod10912_errors_null',
                    errors: null,
                },
            },
            {
                project_uuid: testProjectUuid,
                name: 'prod10912_top_scalar',
                table_names: [],
                explore: 1,
            },
        ]);

        const result = await app
            .getModels()
            .getProjectModel()
            .findExploreTableSummariesFromCache(testProjectUuid);
        const summary = (name: string) =>
            Object.entries(result).find(([key]) => key === name)?.[1];

        expect(Object.hasOwn(result, 'constructor')).toBe(true);
        expect(Object.keys(summary('constructor')?.tables ?? {})).toEqual([
            '__proto__',
        ]);
        expect(Object.hasOwn(result, 'toString')).toBe(true);
        expect(
            Object.keys(summary('prod10912_malformed_entries')?.tables ?? {}),
        ).toEqual(['valid']);
        expect(
            summary('prod10912_malformed_entries')?.tables.valid,
        ).toHaveProperty('description', null);
        expect(
            Object.keys(summary('prod10912_non_object_tables')?.tables ?? {}),
        ).toEqual([]);
        expect(summary('prod10912_errors_null')).toHaveProperty('errors', true);
        expect(Object.hasOwn(result, 'null')).toBe(false);
    });
});
