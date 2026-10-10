import {
    QueryExecutionContext,
    QueryHistoryStatus,
    type AgentIdentityClaim,
    type QueryHistory,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { createHash } from 'node:crypto';
import { buildAccount } from '../../auth/account/account.mock';
import { QueryHistoryModel } from './QueryHistoryModel';

describe('QueryHistoryModel connection attribution', () => {
    test.each(['connection', null])(
        'returns the stored warehouse connection %s',
        async (connection) => {
            const database = knex({ client: MockClient, dialect: 'pg' });
            const tracker = getTracker();
            tracker.reset();
            const account = buildAccount();
            tracker.on.select('query_history').response({
                query_uuid: 'query',
                project_uuid: 'project',
                created_by_user_uuid: account.user.id,
                warehouse_connection_uuid: connection,
            });
            try {
                const model = new QueryHistoryModel({ database });
                expect(
                    await model.get('query', 'project', account),
                ).toMatchObject({ warehouseConnectionUuid: connection });
            } finally {
                tracker.reset();
                await database.destroy();
            }
        },
    );
});

describe('QueryHistoryModel', () => {
    test.each([
        {
            excludeAgentProduced: true,
            personCredential: undefined,
            expectedFile: 'person.jsonl',
        },
        {
            excludeAgentProduced: true,
            personCredential: null,
            expectedFile: 'person.jsonl',
        },
        {
            excludeAgentProduced: false,
            personCredential: undefined,
            expectedFile: 'agent.jsonl',
        },
    ])(
        'selects $expectedFile with agent exclusion $excludeAgentProduced and person credential $personCredential',
        async ({ excludeAgentProduced, personCredential, expectedFile }) => {
            const database = knex({ client: MockClient, dialect: 'pg' });
            const tracker = getTracker();
            tracker.reset();
            const rows = [
                {
                    created_at: new Date('2026-10-09T12:00:00Z'),
                    results_file_name: 'agent.jsonl',
                    request_parameters: { aiSignInCredentialUuid: 'agent' },
                },
                {
                    created_at: new Date('2026-10-09T11:00:00Z'),
                    results_file_name: 'person.jsonl',
                    request_parameters: {
                        aiSignInCredentialUuid: personCredential,
                    },
                },
            ];
            tracker.on
                .select('query_history')
                .response(
                    ({ sql }) =>
                        rows
                            .filter(
                                (row) =>
                                    !sql.includes(
                                        "request_parameters->>'aiSignInCredentialUuid' is null",
                                    ) ||
                                    row.request_parameters
                                        .aiSignInCredentialUuid == null,
                            )
                            .sort(
                                (a, b) =>
                                    b.created_at.getTime() -
                                    a.created_at.getTime(),
                            )[0],
                );
            try {
                const model = new QueryHistoryModel({ database });
                await expect(
                    model.findMostRecentByCacheKey('shared-key', 'project', {
                        excludeAgentProduced,
                    }),
                ).resolves.toMatchObject({ resultsFileName: expectedFile });
                expect(tracker.history.select).toHaveLength(1);
                const query = tracker.history.select[0];
                expect(query.bindings).toEqual(['shared-key', 'project', 1]);
                expect(query.sql).toContain('order by "created_at" desc limit');
                expect(
                    query.sql.includes(
                        "request_parameters->>'aiSignInCredentialUuid' is null",
                    ),
                ).toBe(excludeAgentProduced);
            } finally {
                tracker.reset();
                await database.destroy();
            }
        },
    );

    test('records the actual agent credential in the existing request metadata', async () => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const tracker = getTracker();
        tracker.reset();
        tracker.on.update('query_history').response(1);
        try {
            const model = new QueryHistoryModel({ database });
            await model.recordAiSignInCredential(
                'query',
                'project',
                'person',
                'credential',
            );
            const update = tracker.history.update[0];
            expect(update.sql).toContain('jsonb_set');
            expect(update.sql).toContain('aiSignInCredentialUuid');
            expect(update.bindings).toEqual([
                'credential',
                'query',
                'project',
                'person',
            ]);
        } finally {
            tracker.reset();
            await database.destroy();
        }
    });

    test('isolates cached results by principal after the connection segment', () => {
        const identifiers = {
            sql: 'SELECT 1',
            userUuid: null,
            warehouseConnectionUuid: 'connection',
        };
        const human = QueryHistoryModel.getCacheKey('project', identifiers);
        const first = QueryHistoryModel.getCacheKey('project', {
            ...identifiers,
            aiPrincipalUuid: 'first',
        });
        const second = QueryHistoryModel.getCacheKey('project', {
            ...identifiers,
            aiPrincipalUuid: 'second',
        });
        expect(new Set([human, first, second]).size).toBe(3);
        expect(first).toBe(
            createHash('sha256')
                .update(
                    'v3.project.SELECT 1.connection:connection.principal:first',
                )
                .digest('hex'),
        );
    });
    describe('getCacheKey', () => {
        const projectUuid = 'test-project-uuid';
        const sql = 'SELECT * FROM test_table';
        const timezone = 'UTC';

        test('should generate correct hash with SQL only', () => {
            const result = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                userUuid: null,
            });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64); // SHA-256 produces 64 character hex string
        });

        test('should generate correct hash with SQL and timezone', () => {
            const result = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64);
        });

        test('data timezone changes the hash', () => {
            const withDataTz = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
                dataTimezone: 'Asia/Tokyo',
            });
            const withoutDataTz = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            const withOtherDataTz = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
                dataTimezone: 'America/New_York',
            });
            expect(withDataTz).not.toBe(withoutDataTz);
            expect(withDataTz).not.toBe(withOtherDataTz);
        });

        test('undefined data timezone keeps existing keys stable', () => {
            const explicitUndefined = QueryHistoryModel.getCacheKey(
                projectUuid,
                {
                    sql,
                    timezone,
                    userUuid: null,
                    dataTimezone: undefined,
                },
            );
            const omitted = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            expect(explicitUndefined).toBe(omitted);
        });

        test('data timezone component cannot collide with the display timezone component', () => {
            const displayOnly = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone: 'UTC',
                userUuid: null,
            });
            const dataOnly = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                userUuid: null,
                dataTimezone: 'UTC',
            });
            expect(displayOnly).not.toBe(dataOnly);
        });

        test('should generate different hashes for different projects with same SQL', () => {
            const projectUuid2 = 'different-project-uuid';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid2, {
                sql,
                userUuid: null,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project with different SQL', () => {
            const sql2 = 'SELECT * FROM different_table';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql: sql2,
                userUuid: null,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project and SQL but different timezone', () => {
            const timezone2 = 'America/New_York';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone: timezone2,
                userUuid: null,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate same hash when userUuid is null (backward compatibility)', () => {
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            expect(hash1).toBe(hash2);
        });

        test('should generate different hashes for different users', () => {
            const userUuid1 = 'user-uuid-1';
            const userUuid2 = 'user-uuid-2';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: userUuid1,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: userUuid2,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate same hash for same user', () => {
            const userUuid = 'user-uuid-1';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid,
            });
            expect(hash1).toBe(hash2);
        });

        test('should generate different hash with vs without user UUID', () => {
            const userUuid = 'user-uuid-1';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid,
            });
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('getCacheKey for extra connections', () => {
        const identifiers = {
            sql: 'SELECT * FROM orders',
            timezone: 'UTC',
            userUuid: null,
        };

        test('extra-connection cache keys differ per connection', () => {
            const warehouseB = QueryHistoryModel.getCacheKey('project', {
                ...identifiers,
                warehouseConnectionUuid: 'connection-b',
            });
            const warehouseC = QueryHistoryModel.getCacheKey('project', {
                ...identifiers,
                warehouseConnectionUuid: 'connection-c',
            });

            expect(warehouseB).not.toBe(warehouseC);
        });

        test('an extra-connection key differs from the original key for the same query', () => {
            const original = QueryHistoryModel.getCacheKey(
                'project',
                identifiers,
            );
            const extra = QueryHistoryModel.getCacheKey('project', {
                ...identifiers,
                warehouseConnectionUuid: 'connection-b',
            });

            expect(extra).not.toBe(original);
        });

        test('the extra-connection suffix is appended after every other identifier', () => {
            expect(
                QueryHistoryModel.getCacheKey('pins-project-uuid', {
                    sql: 'SELECT 1',
                    timezone: 'Europe/London',
                    userUuid: 'pins-user-uuid',
                    dataTimezone: 'America/New_York',
                    externalSourceSalt: 'source-v7',
                    warehouseConnectionUuid: 'connection-b',
                }),
            ).toBe(
                createHash('sha256')
                    .update(
                        'v3.pins-project-uuid.pins-user-uuid.SELECT 1.Europe/London.dtz:America/New_York.source-v7.connection:connection-b',
                    )
                    .digest('hex'),
            );
        });
    });

    describe('getCacheKey golden values (SPK-2340)', () => {
        const pinsProjectUuid = 'pins-project-uuid';
        const pinsUserUuid = 'pins-user-uuid';
        const pinsTimezone = 'Europe/London';
        const pinsDataTimezone = 'America/New_York';
        const pinsExternalSourceSalt = 'source-v7';

        const exploreMetricSql = `SELECT "orders".order_id AS "orders_order_id" FROM "public"."orders" AS "orders" LIMIT 500`;
        const sqlRunnerSql = `SELECT * FROM orders WHERE region = 'EMEA'`;
        const sqlChartSql = `SELECT count(*) AS "count" FROM "public"."orders" AS "orders"`;
        const pivotedSql = `WITH pivoted AS (SELECT * FROM crosstab($$SELECT "orders".order_id, "orders".region, "orders".revenue FROM "public"."orders" AS "orders"$$)) SELECT * FROM pivoted`;

        test('explore metric query, no timezone, no personal credentials', () => {
            expect(
                QueryHistoryModel.getCacheKey(pinsProjectUuid, {
                    sql: exploreMetricSql,
                    userUuid: null,
                }),
            ).toBe(
                '1430c9929f676db55079f555b8ce10a50bac3604fe1b2f952dc27341d293cd06',
            );
        });

        test('explore metric query, with display timezone, no personal credentials', () => {
            expect(
                QueryHistoryModel.getCacheKey(pinsProjectUuid, {
                    sql: exploreMetricSql,
                    timezone: pinsTimezone,
                    userUuid: null,
                }),
            ).toBe(
                '89150ecbc7c6ab1d0b10b4d689fabf6181c0cea7b63ad312ae16ca56bca02eff',
            );
        });

        test('explore metric query, with display timezone and personal credentials', () => {
            expect(
                QueryHistoryModel.getCacheKey(pinsProjectUuid, {
                    sql: exploreMetricSql,
                    timezone: pinsTimezone,
                    userUuid: pinsUserUuid,
                }),
            ).toBe(
                '8bb4c2eafe2c2d6b6ea84b2b53386981de2c2c5d2c385ca1157bc724bf05c5e0',
            );
        });

        test('explore metric query, with display and data timezone, no personal credentials', () => {
            expect(
                QueryHistoryModel.getCacheKey(pinsProjectUuid, {
                    sql: exploreMetricSql,
                    timezone: pinsTimezone,
                    userUuid: null,
                    dataTimezone: pinsDataTimezone,
                }),
            ).toBe(
                '5a61eedb1d4e4dc1709a1c08843bed0748269b4e54ed81bc80d9412195c8b9a1',
            );
        });

        test('SQL runner query, no timezone, no personal credentials', () => {
            expect(
                QueryHistoryModel.getCacheKey(pinsProjectUuid, {
                    sql: sqlRunnerSql,
                    userUuid: null,
                }),
            ).toBe(
                '8bea5d57fa57ee86d7e095a94a0c09ea881f040c8daac80eefcda180396b9575',
            );
        });

        test('SQL chart query, with display timezone, no personal credentials', () => {
            expect(
                QueryHistoryModel.getCacheKey(pinsProjectUuid, {
                    sql: sqlChartSql,
                    timezone: pinsTimezone,
                    userUuid: null,
                }),
            ).toBe(
                'f2f76d7d2c2261285310f88b73a422a26c227258cb5d1e5f572f425a5ad95c6d',
            );
        });

        test('pivoted query, with display timezone, no personal credentials', () => {
            expect(
                QueryHistoryModel.getCacheKey(pinsProjectUuid, {
                    sql: pivotedSql,
                    timezone: pinsTimezone,
                    userUuid: null,
                }),
            ).toBe(
                'a3308188e99033ff9f0ae9150242c0ea136775600c7ce1bf5111cae2f73b77c6',
            );
        });

        test('explore metric query, with external source salt, no personal credentials', () => {
            expect(
                QueryHistoryModel.getCacheKey(pinsProjectUuid, {
                    sql: exploreMetricSql,
                    timezone: pinsTimezone,
                    userUuid: null,
                    externalSourceSalt: pinsExternalSourceSalt,
                }),
            ).toBe(
                '33efccf84fba3974bb81a93e5267e0e8ef6b31a514d963997b435640d3ae23e4',
            );
        });
    });
});

describe('QueryHistoryModel polling cancellation', () => {
    it('interrupts the polling delay without reading again', async () => {
        const model = new QueryHistoryModel({ database: {} as Knex });
        const controller = new AbortController();
        const get = vi
            .spyOn(model, 'getByQueryUuid')
            .mockImplementation(async () => {
                controller.abort();
                return { status: QueryHistoryStatus.EXECUTING } as QueryHistory;
            });
        await expect(
            model.pollForQueryCompletion({
                queryUuid: 'query',
                projectUuid: 'project',
                account: null,
                initialBackoffMs: 60_000,
                abortSignal: controller.signal,
            }),
        ).rejects.toMatchObject({ name: 'AbortError' });
        expect(get).toHaveBeenCalledOnce();
    });
});

describe('QueryHistoryModel agent identity', () => {
    const claim = {
        sub: 'user:person',
        subject: { type: 'user', uuid: 'person' },
        act: {
            sub: 'in_app_agent:lightdash-chat',
            surface: 'in_app_agent',
            client_id: 'lightdash-chat',
        },
    } as AgentIdentityClaim;
    const claimCases = [
        claim,
        { ...claim, act: { ...claim.act, agent_uuid: null } },
        { ...claim, act: { ...claim.act, agent_uuid: 'agent-uuid' } },
        null,
        undefined,
    ];
    test.each(claimCases)(
        'persists only a supplied claim (%j)',
        async (agentIdentity) => {
            const database = knex({ client: MockClient, dialect: 'pg' });
            const tracker = getTracker();
            tracker.reset();
            tracker.on
                .insert('query_history')
                .response([{ query_uuid: 'query' }]);
            try {
                await new QueryHistoryModel({ database }).create(
                    buildAccount(),
                    {
                        organizationUuid: 'org',
                        projectUuid: 'project',
                        context: QueryExecutionContext.AI,
                        compiledSql: 'SELECT 1',
                        metricQuery: {} as QueryHistory['metricQuery'],
                        fields: {},
                        requestParameters:
                            {} as QueryHistory['requestParameters'],
                        usedParameters: null,
                        cacheKey: 'cache',
                        pivotConfiguration: null,
                        originalColumns: null,
                        agentIdentity,
                    },
                );
                expect(tracker.history.insert).toHaveLength(1);
                expect(tracker.history.select).toHaveLength(0);
                expect(
                    tracker.history.insert[0].sql.includes('"agent_identity"'),
                ).toBe(agentIdentity != null);
                if (agentIdentity)
                    expect(tracker.history.insert[0].bindings).toContainEqual(
                        JSON.stringify(agentIdentity),
                    );
            } finally {
                tracker.reset();
                await database.destroy();
            }
        },
    );
    test.each(claimCases)(
        'reads a stored claim or explicit null (%j)',
        async (agentIdentity) => {
            const database = knex({ client: MockClient, dialect: 'pg' });
            const tracker = getTracker();
            tracker.reset();
            tracker.on.select('query_history').response({
                query_uuid: 'query',
                created_by_user_uuid: buildAccount().user.id,
                agent_identity: agentIdentity,
            });
            try {
                const row = await new QueryHistoryModel({ database }).get(
                    'query',
                    'project',
                    buildAccount(),
                );
                expect(row.agentIdentity).toEqual(agentIdentity ?? null);
            } finally {
                tracker.reset();
                await database.destroy();
            }
        },
    );
});
