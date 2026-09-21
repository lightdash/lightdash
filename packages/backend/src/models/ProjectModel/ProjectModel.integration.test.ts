import { ExploreType } from '@lightdash/common';
import { trace } from '@opentelemetry/api';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    CachedExploreTableName,
    type CachedExploreTable,
} from '../../database/entities/projects';
import Logger from '../../logging/logger';
import { getTestContext } from '../../vitest.setup.integration';
import { ProjectModel } from './ProjectModel';
import { encryptionUtilMock } from './ProjectModel.mock';

describe('ProjectModel cached explore summary projection', () => {
    const cachedRowNames = [
        'prod10912_constructor',
        'prod10912_to_string',
        'prod10912_malformed_entries',
        'prod10912_non_object_tables',
        'prod10912_errors_null',
        'prod10912_top_scalar',
        'prod10912_numeric_name',
        'prod10912_numeric_base_table',
        'prod10912_numeric_type',
        'prod10912_evaluation_a',
        'prod10912_evaluation_b',
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
        const { db, testProjectUuid } = getTestContext();
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
            {
                project_uuid: testProjectUuid,
                name: 'prod10912_numeric_name',
                table_names: [],
                explore: {
                    name: 123,
                    type: ExploreType.DEFAULT,
                    baseTable: '',
                    tables: {},
                },
            },
            {
                project_uuid: testProjectUuid,
                name: 'prod10912_numeric_base_table',
                table_names: [],
                explore: {
                    name: 'prod10912_numeric_base_table',
                    type: ExploreType.DEFAULT,
                    baseTable: 123,
                    tables: {},
                },
            },
            {
                project_uuid: testProjectUuid,
                name: 'prod10912_numeric_type',
                table_names: [],
                explore: {
                    name: 'prod10912_numeric_type',
                    type: 123,
                    baseTable: '',
                    tables: {},
                },
            },
        ]);

        const projectionModel = new ProjectModel({
            database: db,
            lightdashConfig: {
                ...lightdashConfigMock,
                query: {
                    ...lightdashConfigMock.query,
                    exploreSummaryProjectionMinStoredBytesPerExplore: 0,
                },
            },
            encryptionUtil: encryptionUtilMock,
        });
        const fallbackModel = new ProjectModel({
            database: db,
            lightdashConfig: {
                ...lightdashConfigMock,
                query: {
                    ...lightdashConfigMock.query,
                    exploreSummaryProjectionMinStoredBytesPerExplore:
                        Number.MAX_SAFE_INTEGER,
                },
            },
            encryptionUtil: encryptionUtilMock,
        });
        const result =
            await projectionModel.findExploreTableSummariesFromCache(
                testProjectUuid,
            );
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
        expect(Object.hasOwn(result, '123')).toBe(false);
        expect(summary('prod10912_numeric_base_table')?.baseTable).toBe('123');
        expect(summary('prod10912_numeric_type')?.type).toBe('123');

        await Promise.all(
            [
                undefined,
                [
                    'prod10912_constructor',
                    'prod10912_malformed_entries',
                    'prod10912_top_scalar',
                    'prod10912_numeric_name',
                    'prod10912_numeric_base_table',
                    'prod10912_numeric_type',
                ],
            ].map(async (exploreNames) => {
                const [projected, fullRead] = await Promise.all([
                    projectionModel.findExploreTableSummariesFromCache(
                        testProjectUuid,
                        exploreNames,
                    ),
                    fallbackModel.findExploreTableSummariesFromCache(
                        testProjectUuid,
                        exploreNames,
                    ),
                ]);

                expect(fullRead).toEqual(projected);
            }),
        );
    });

    test('evaluates error presence once per explore before table expansion', async () => {
        const { db, testProjectUuid } = getTestContext();
        const exploreNames = [
            'prod10912_evaluation_a',
            'prod10912_evaluation_b',
        ];
        await db<CachedExploreTable>(CachedExploreTableName).insert(
            exploreNames.map((name, index) => ({
                project_uuid: testProjectUuid,
                name,
                table_names: ['table_a', 'table_b', 'table_c'],
                explore: {
                    name,
                    type: ExploreType.DEFAULT,
                    baseTable: 'table_a',
                    tables: {
                        table_a: table('table_a'),
                        table_b: table('table_b'),
                        table_c: table('table_c'),
                    },
                    ...(index === 0 ? { errors: null } : {}),
                },
            })),
        );
        const model = new ProjectModel({
            database: db,
            lightdashConfig: {
                ...lightdashConfigMock,
                query: {
                    ...lightdashConfigMock.query,
                    exploreSummaryProjectionMinStoredBytesPerExplore: 0,
                },
            },
            encryptionUtil: encryptionUtilMock,
        });
        let capturedQuery:
            | { sql: string; bindings: readonly unknown[] }
            | undefined;
        const captureProjectionQuery = (query: {
            sql: string;
            bindings?: readonly unknown[];
        }) => {
            if (query.sql.includes('explore_summary.name as "exploreName"')) {
                capturedQuery = {
                    sql: query.sql,
                    bindings: query.bindings ?? [],
                };
            }
        };
        db.on('query', captureProjectionQuery);
        try {
            await model.findExploreTableSummariesFromCache(
                testProjectUuid,
                exploreNames,
            );
        } finally {
            db.off('query', captureProjectionQuery);
        }
        expect(capturedQuery).toBeDefined();
        const projectionQuery = capturedQuery;
        if (!projectionQuery) {
            throw new Error('Projection query was not captured');
        }

        await db.transaction(async (trx) => {
            await trx.raw("SET LOCAL track_functions = 'all'");
            await trx.raw(`
                CREATE OR REPLACE FUNCTION pg_temp.prod10912_jsonb_exists(value jsonb, key text)
                RETURNS boolean
                LANGUAGE plpgsql
                IMMUTABLE
                AS $$
                BEGIN
                    RETURN jsonb_exists(value, key);
                END;
                $$
            `);
            const instrumentedSql = projectionQuery.sql.replace(
                "jsonb_exists(cached_explore.explore, 'errors')",
                "pg_temp.prod10912_jsonb_exists(cached_explore.explore, 'errors')",
            );
            expect(instrumentedSql).not.toBe(projectionQuery.sql);
            const bindings: Knex.RawBinding[] = [];
            const knexSql = instrumentedSql.replace(
                /\$(\d+)/g,
                (_placeholder, position: string) => {
                    bindings.push(
                        projectionQuery.bindings[
                            Number(position) - 1
                        ] as Knex.RawBinding,
                    );
                    return '?';
                },
            );

            const result = await trx.raw<{ rows: { calls: string }[] }>(
                knexSql,
                bindings,
            );
            expect(result.rows).toHaveLength(6);
            const stats = await trx.raw<{ rows: { calls: string }[] }>(`
                SELECT calls::text
                FROM pg_stat_xact_user_functions
                WHERE funcid = 'pg_temp.prod10912_jsonb_exists(jsonb,text)'::regprocedure
            `);
            expect(Number(stats.rows[0]?.calls)).toBe(2);
        });
    });
});

describe('ProjectModel cached explore read metrics', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    test('records getAllExploreSummaries through the Knex hook', async () => {
        const { app, testProjectUuid } = getTestContext();
        vi.spyOn(Logger, 'info');
        const loggerInfo = vi.mocked(Logger.info);
        const caller = 'ProjectModel.getAllExploreSummaries.integration';
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_ENABLED', 'true');
        vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
            name: caller,
            spanContext: () => ({
                traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                spanId: 'bbbbbbbbbbbbbbbb',
                traceFlags: 1,
            }),
        } as never);

        await app
            .getModels()
            .getProjectModel()
            .getAllExploreSummaries(testProjectUuid);

        expect(loggerInfo).toHaveBeenCalledWith(
            expect.stringMatching(
                /Knex\.cachedExploreStatement - operation completed in \d+\.\d{2}ms/u,
            ),
            expect.objectContaining({
                name: 'Knex.cachedExploreStatement',
                duration: expect.any(Number),
                context: expect.objectContaining({
                    source: 'knex',
                    caller,
                    operation: 'select',
                    outcome: 'success',
                    returnedRowCount: expect.any(Number),
                    tableName: 'cached_explore',
                }),
                serverVersion: expect.any(String),
            }),
        );
    });

    test('classifies a raw staging insert through the Knex hook', async () => {
        const { db } = getTestContext();
        vi.spyOn(Logger, 'info');
        const loggerInfo = vi.mocked(Logger.info);
        const caller = 'ProjectModel.saveExploreStreamToCache.integration';
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_ENABLED', 'true');
        vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
            name: caller,
            spanContext: () => ({
                traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                spanId: 'bbbbbbbbbbbbbbbb',
                traceFlags: 1,
            }),
        } as never);

        await db.raw(`
            INSERT INTO cached_explore_staging
                (save_uuid, cached_explore_uuid, project_uuid, name, table_names, explore)
            SELECT
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
                cached_explore_uuid,
                project_uuid,
                name,
                table_names,
                explore
            FROM cached_explore
            WHERE false
        `);

        expect(loggerInfo).toHaveBeenCalledWith(
            expect.stringMatching(
                /Knex\.cachedExploreStatement - operation completed in \d+\.\d{2}ms/u,
            ),
            expect.objectContaining({
                name: 'Knex.cachedExploreStatement',
                duration: expect.any(Number),
                context: expect.objectContaining({
                    source: 'knex',
                    caller,
                    operation: 'insert',
                    outcome: 'success',
                    tableName: 'cached_explore_staging',
                }),
                serverVersion: expect.any(String),
            }),
        );
    });
});
