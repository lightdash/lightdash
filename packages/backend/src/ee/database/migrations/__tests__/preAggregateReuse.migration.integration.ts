import {
    DimensionType,
    ProjectType,
    QueryExecutionContext,
    QueryHistoryStatus,
    SupportedDbtAdapter,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type PhysicalOutputContract,
    type QueryHistory,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { randomUUID } from 'crypto';
import knex, { type Knex } from 'knex';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import { up as createMaterializations } from '../../../../database/migrations/20260223110000_create_pre_aggregate_materializations';
import { up as createDefinitions } from '../../../../database/migrations/20260224103000_create_pre_aggregate_definitions';
import { up as addUri } from '../../../../database/migrations/20260302120000_add_materialization_uri_to_pre_aggregate_materializations';
import { up as addBytes } from '../../../../database/migrations/20260309163357_add_total_bytes_to_materializations';
import {
    down,
    up,
} from '../../../../database/migrations/20260915120000_expand_pre_aggregate_reuse';
import { scanPreAggregateExecutionScopes } from '../../../../scripts/rotate-lightdash-secret/rotation';
import type { AsyncQueryService } from '../../../../services/AsyncQueryService/AsyncQueryService';
import {
    sessionAccount,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { QueryComposer } from '../../../../utils/QueryBuilder/QueryComposer';
import {
    getSecretArtifactKeyId,
    PRE_AGGREGATE_EXECUTION_SCOPE_ARTIFACT,
} from '../../../../utils/secretArtifactKeyId';
import {
    ObsoletePreAggregateScheduleError,
    PreAggregateModel,
    type PublishPreAggregateDefinition,
} from '../../../models/PreAggregateModel';
import { PreAggregateMaterializationService } from '../../../services/PreAggregateMaterializationService/PreAggregateMaterializationService';
import {
    activatePreAggregateReuse,
    setPreAggregateReuseEnabled,
} from '../../activatePreAggregateReuse';

vi.mock('../../../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

describe('Pre-aggregate registry PostgreSQL migration and lifecycle', () => {
    let database: Knex;
    let model: PreAggregateModel;
    const schema = `pre_aggregate_reuse_${process.pid}`;
    const projectUuid = randomUUID();
    const contract: PhysicalOutputContract = {
        columns: [{ name: 'orders_count', type: 'number' }],
        grain: [],
        format: 'parquet',
    };

    const definition = (
        name = 'daily',
        hash: string | null = 'a'.repeat(64),
    ): PublishPreAggregateDefinition => ({
        project_uuid: projectUuid,
        source_explore_name: 'orders',
        pre_aggregate_name: name,
        publication_version: randomUUID(),
        compatibility_hash: hash,
        physical_output_contract: contract,
        preparation_status: hash ? 'ready' : 'unverified',
        automatic_eligible: true,
        pre_aggregate_definition: { name, dimensions: [], metrics: ['count'] },
        materialization_metric_query: {
            metricQuery: {
                exploreName: 'orders',
                dimensions: [],
                metrics: ['orders_count'],
                filters: {},
                sorts: [],
                limit: 100,
                tableCalculations: [],
            },
            metricComponents: {},
            timeDimensionFieldId: null,
            resolvedMaxRows: null,
        },
        materialization_query_error: null,
        refresh_cron: '0 0 * * *',
    });

    const writeCaches = async (trx: Knex.Transaction, names: string[]) => {
        await trx('cached_explore').insert(
            names.map((name) => ({
                cached_explore_uuid: randomUUID(),
                project_uuid: projectUuid,
                name,
                table_names: [],
                explore: {
                    name,
                    label: name,
                    baseTable: 'orders',
                    tables: {},
                    joinedTables: [],
                },
            })),
        );
    };

    const publish = async (
        definitions: PublishPreAggregateDefinition[],
        options: {
            replaceCache?: boolean;
            partial?: boolean;
            invalidSourceErrors?: Record<string, string>;
            failAfterPublish?: boolean;
        } = {},
    ) =>
        database.transaction(async (trx) => {
            await trx('projects')
                .where('project_uuid', projectUuid)
                .forUpdate()
                .first();
            if (options.replaceCache) {
                await trx('cached_explore')
                    .where('project_uuid', projectUuid)
                    .delete();
                await writeCaches(trx, [
                    'orders',
                    ...definitions.map(
                        (row) => `__preagg__orders__${row.pre_aggregate_name}`,
                    ),
                ]);
            }
            const result = await model.publishDefinitions(
                {
                    projectUuid,
                    definitions,
                    scope: options.partial
                        ? { type: 'partial', sourceExploreNames: ['orders'] }
                        : { type: 'full' },
                    invalidSourceErrors: options.invalidSourceErrors ?? {},
                    schedulerTimezone: 'UTC',
                },
                trx,
            );
            if (options.failAfterPublish)
                throw new Error('Injected publication failure');
            return result;
        });

    const activate = () =>
        activatePreAggregateReuse(database, {
            compatibleWritersConfirmed: true,
            actor: 'synthetic integration test',
        });

    const start = async (
        row: PublishPreAggregateDefinition,
        evaluatedAt: Date,
        executionScopeKeyId?: string,
    ) => {
        const [stored] =
            await model.getPreAggregateDefinitionsForProject(projectUuid);
        return model.insertInProgress({
            projectUuid,
            preAggregateDefinitionUuid: stored.preAggregateDefinitionUuid,
            trigger: 'compile',
            provenance: {
                publicationVersion: row.publication_version,
                compatibilityHash: row.compatibility_hash,
                physicalOutputContract: contract,
                evaluatedAt,
                pinnedContextHash: null,
                executionScopeKeyId,
            },
        });
    };

    const finish = async (materializationUuid: string) => {
        const queryUuid = randomUUID();
        await database.raw('INSERT INTO query_history(query_uuid) VALUES (?)', [
            queryUuid,
        ]);
        return model.promoteToActive({
            materializationUuid,
            queryUuid,
            materializationUri: 's3://synthetic-test/result.parquet',
            materializedAt: new Date(),
            rowCount: 1,
            columns: {},
            totalBytes: 100,
        });
    };

    beforeAll(async () => {
        if (!process.env.PGCONNECTIONURI)
            throw new Error('PGCONNECTIONURI is required');
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI,
            searchPath: [schema, 'public'],
            pool: { min: 0, max: 4 },
        });
        model = new PreAggregateModel({ database });
        await database.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    });

    beforeEach(async () => {
        await database.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
        await database.raw('CREATE SCHEMA ??', [schema]);
        await database.schema.createTable('projects', (table) => {
            table.uuid('project_uuid').primary();
            table.text('scheduler_timezone').notNullable();
            table
                .text('project_type')
                .notNullable()
                .defaultTo(ProjectType.DEFAULT);
        });
        await database.schema.createTable('cached_explore', (table) => {
            table.uuid('cached_explore_uuid').primary();
            table.uuid('project_uuid').notNullable();
            table.text('name').notNullable();
            table.specificType('table_names', 'text[]').notNullable();
            table.jsonb('explore').notNullable();
            table.unique(['project_uuid', 'name']);
        });
        await database.schema.createTable('query_history', (table) => {
            table.uuid('query_uuid').primary();
        });
        await createMaterializations(database);
        await createDefinitions(database);
        await addUri(database);
        await addBytes(database);
        await up(database);
        await database.raw(
            'INSERT INTO projects(project_uuid, scheduler_timezone) VALUES (?, ?)',
            [projectUuid, 'UTC'],
        );
    });

    afterAll(async () => {
        if (database) {
            await database.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
            await database.destroy();
        }
    });

    it('keeps legacy cascades until explicit activation and refuses old schema rollback afterward', async () => {
        await publish([definition()], { replaceCache: true });
        expect(await model.getReuseState()).toEqual({
            phase: 'compatibility',
            reuseEnabled: false,
        });
        await database('cached_explore')
            .where('project_uuid', projectUuid)
            .delete();
        expect(
            await model.getPreAggregateDefinitionsForProject(projectUuid),
        ).toEqual([]);
        await down(database);
        await up(database);
        await up(database);
        await activate();
        await activate();
        await expect(down(database)).rejects.toThrow('irreversible:');
    });

    it('preserves definition and active materialization through full replacement and transaction rollback', async () => {
        await activate();
        const first = definition();
        const {
            definitions: [before],
        } = await publish([first], { replaceCache: true });
        const build = await start(first, new Date('2026-09-01T00:00:00Z'));
        await finish(build.materializationUuid);
        const second = definition();
        const {
            definitions: [after],
            scheduleChanges,
        } = await publish([second], { replaceCache: true });
        expect(after.preAggregateDefinitionUuid).toBe(
            before.preAggregateDefinitionUuid,
        );
        expect(after.sourceCachedExploreUuid).not.toBe(
            before.sourceCachedExploreUuid,
        );
        expect(scheduleChanges).toEqual([]);
        expect(
            (
                await model.getActiveMaterialization(
                    projectUuid,
                    '__preagg__orders__daily',
                )
            )?.materializationUuid,
        ).toBe(build.materializationUuid);
        await expect(
            publish([definition('daily', 'b'.repeat(64))], {
                replaceCache: true,
                failAfterPublish: true,
            }),
        ).rejects.toThrow('Injected publication failure');
        expect(
            (await model.getPreAggregateDefinitionsForProject(projectUuid))[0]
                .publicationVersion,
        ).toBe(second.publication_version);
        expect(
            (
                await model.getActiveMaterialization(
                    projectUuid,
                    '__preagg__orders__daily',
                )
            )?.materializationUuid,
        ).toBe(build.materializationUuid);
    });

    it('allows an older publication with the same hash, but rejects a changed publication and stale insertion', async () => {
        await activate();
        const first = definition();
        await publish([first], { replaceCache: true });
        const compatibleBuild = await start(
            first,
            new Date('2026-09-01T00:00:00Z'),
        );
        const second = definition();
        await publish([second], { replaceCache: true });
        expect(await finish(compatibleBuild.materializationUuid)).toEqual({
            status: 'active',
        });
        await expect(start(first, new Date())).rejects.toThrow(
            'publication changed',
        );
        const staleBuild = await start(
            second,
            new Date('2026-09-02T00:00:00Z'),
        );
        await publish([definition('daily', 'b'.repeat(64))], {
            replaceCache: true,
        });
        expect(
            await model.getActiveMaterialization(
                projectUuid,
                '__preagg__orders__daily',
            ),
        ).toBeUndefined();
        expect(await finish(staleBuild.materializationUuid)).toEqual({
            status: 'superseded',
        });
    });

    it('orders promotion by evaluated time even when an older warehouse execution finishes last', async () => {
        await activate();
        const current = definition();
        await publish([current], { replaceCache: true });
        const older = await start(current, new Date('2026-09-01T00:00:00Z'));
        const newer = await start(current, new Date('2026-09-02T00:00:00Z'));
        expect(await finish(newer.materializationUuid)).toEqual({
            status: 'active',
        });
        expect(await finish(older.materializationUuid)).toEqual({
            status: 'superseded',
        });
        await model.markFailed({
            materializationUuid: newer.materializationUuid,
            errorMessage: 'late timeout',
        });
        expect(
            (
                await model.getActiveMaterialization(
                    projectUuid,
                    '__preagg__orders__daily',
                )
            )?.materializationUuid,
        ).toBe(newer.materializationUuid);
    });

    it('limits unknown provenance to one publication and preserves invalid source diagnostics', async () => {
        await activate();
        const unknown = definition('daily', null);
        await publish([unknown], { replaceCache: true });
        const build = await start(unknown, new Date());
        expect(await finish(build.materializationUuid)).toEqual({
            status: 'active',
        });
        await publish([definition('daily', null)], { replaceCache: true });
        expect(
            await model.getActiveMaterialization(
                projectUuid,
                '__preagg__orders__daily',
            ),
        ).toBeUndefined();
        await publish([], {
            replaceCache: true,
            invalidSourceErrors: { orders: 'Source compilation failed' },
        });
        const [invalid] =
            await model.getPreAggregateDefinitionsForProject(projectUuid);
        expect(invalid.preparationStatus).toBe('invalid');
        expect(invalid.materializationQueryError).toBe(
            'Source compilation failed',
        );
        expect(invalid.preAggCachedExploreUuid).toBeNull();
        await publish([], { partial: true });
        expect(
            await model.getPreAggregateDefinitionsForProject(projectUuid),
        ).toEqual([]);
    });
    it('backfills legacy writers and adopts their row across partial publication', async () => {
        await database.transaction(async (trx) =>
            writeCaches(trx, ['orders', '__preagg__orders__daily']),
        );
        const caches = await database('cached_explore').select(
            'cached_explore_uuid',
            'name',
        );
        const source = caches.find((row) => row.name === 'orders');
        const generated = caches.find(
            (row) => row.name === '__preagg__orders__daily',
        );
        if (!source || !generated)
            throw new Error('Missing synthetic cache fixtures');
        const prepared = definition();
        const [legacy] = await database('pre_aggregate_definitions')
            .insert({
                project_uuid: projectUuid,
                source_cached_explore_uuid: source.cached_explore_uuid,
                pre_agg_cached_explore_uuid: generated.cached_explore_uuid,
                pre_aggregate_definition: prepared.pre_aggregate_definition,
                materialization_metric_query:
                    prepared.materialization_metric_query,
                materialization_query_error: null,
                refresh_cron: prepared.refresh_cron,
            })
            .returning('*');
        expect(legacy.source_explore_name).toBeNull();
        await activate();
        const [backfilled] =
            await model.getPreAggregateDefinitionsForProject(projectUuid);
        expect(backfilled.sourceExploreName).toBe('orders');
        expect(backfilled.automaticEligible).toBe(true);
        const {
            definitions: [adopted],
        } = await publish([prepared], { partial: true });
        expect(adopted.preAggregateDefinitionUuid).toBe(
            legacy.pre_aggregate_definition_uuid,
        );
    });

    it('retains other sources on partial publication and removes only scoped missing definitions', async () => {
        await activate();
        const orders = definition();
        const customers = { ...definition(), source_explore_name: 'customers' };
        await database.transaction(async (trx) => {
            await writeCaches(trx, [
                'orders',
                '__preagg__orders__daily',
                'customers',
                '__preagg__customers__daily',
            ]);
            await model.publishDefinitions(
                {
                    projectUuid,
                    definitions: [orders, customers],
                    scope: { type: 'full' },
                    invalidSourceErrors: {},
                    schedulerTimezone: 'UTC',
                },
                trx,
            );
        });
        const before = (
            await model.getPreAggregateDefinitionsForProject(projectUuid)
        ).find((row) => row.sourceExploreName === 'customers');
        const { scheduleChanges } = await publish([], { partial: true });
        const after =
            await model.getPreAggregateDefinitionsForProject(projectUuid);
        expect(after).toHaveLength(1);
        expect(after[0].preAggregateDefinitionUuid).toBe(
            before?.preAggregateDefinitionUuid,
        );
        expect(after[0].publicationVersion).toBe(customers.publication_version);
        expect(scheduleChanges).toHaveLength(1);
    });

    it('retires inventory-pruned sources atomically during partial publication while preserving unselected sources', async () => {
        await activate();
        const inputs = ['orders', 'deleted', 'customers'].map((source) => ({
            ...definition(),
            source_explore_name: source,
        }));
        const initial = await database.transaction(async (trx) => {
            await writeCaches(
                trx,
                inputs.flatMap((row) => [
                    row.source_explore_name,
                    `__preagg__${row.source_explore_name}__daily`,
                ]),
            );
            return model.publishDefinitions(
                {
                    projectUuid,
                    definitions: inputs,
                    scope: { type: 'full' },
                    invalidSourceErrors: {},
                    schedulerTimezone: 'UTC',
                },
                trx,
            );
        });
        const deleted = initial.definitions.find(
            (row) => row.sourceExploreName === 'deleted',
        );
        const retained = initial.definitions.find(
            (row) => row.sourceExploreName === 'customers',
        );
        if (!deleted || !retained)
            throw new Error('Missing synthetic selective-deploy definitions');
        for (const row of [deleted, retained]) {
            if (!row.publicationVersion)
                throw new Error('Missing synthetic publication version');
            // eslint-disable-next-line no-await-in-loop
            const attempt = await model.insertInProgress({
                projectUuid,
                preAggregateDefinitionUuid: row.preAggregateDefinitionUuid,
                trigger: 'compile',
                provenance: {
                    publicationVersion: row.publicationVersion,
                    compatibilityHash: row.compatibilityHash,
                    physicalOutputContract: contract,
                    evaluatedAt: new Date('2026-09-01T00:00:00Z'),
                    pinnedContextHash: null,
                },
            });
            // eslint-disable-next-line no-await-in-loop
            await finish(attempt.materializationUuid);
        }
        const snapshot = async () => ({
            caches: await database('cached_explore').orderBy('name'),
            definitions: await database('pre_aggregate_definitions').orderBy(
                'pre_aggregate_definition_uuid',
            ),
            materializations: await database(
                'pre_aggregate_materializations',
            ).orderBy('pre_aggregate_materialization_uuid'),
        });
        const before = await snapshot();
        const next = definition();
        const publishSelection = (failAfterPublish = false) =>
            database.transaction(async (trx) => {
                await trx('projects')
                    .where('project_uuid', projectUuid)
                    .forUpdate()
                    .first();
                // The cache callback receives the writer's actual deleted names,
                // including generated explores, after inventory pruning runs
                // inside this same publication transaction.
                const deletedCaches = await trx('cached_explore')
                    .where('project_uuid', projectUuid)
                    .whereIn('name', ['deleted', '__preagg__deleted__daily'])
                    .delete()
                    .returning('name');
                expect(
                    await trx('pre_aggregate_definitions')
                        .where(
                            'pre_aggregate_definition_uuid',
                            deleted.preAggregateDefinitionUuid,
                        )
                        .first(),
                ).toMatchObject({
                    source_cached_explore_uuid: null,
                    pre_agg_cached_explore_uuid: null,
                });
                const result = await model.publishDefinitions(
                    {
                        projectUuid,
                        definitions: [next],
                        scope: {
                            type: 'partial',
                            sourceExploreNames: [
                                'orders',
                                ...deletedCaches.map((row) => row.name),
                            ],
                        },
                        invalidSourceErrors: {},
                        schedulerTimezone: 'UTC',
                    },
                    trx,
                );
                if (failAfterPublish)
                    throw new Error('Injected selective-deploy rollback');
                return result;
            });
        await expect(publishSelection(true)).rejects.toThrow(
            'Injected selective-deploy rollback',
        );
        expect(await snapshot()).toEqual(before);

        const result = await publishSelection();
        expect(result.scheduleChanges).toEqual([
            deleted.preAggregateDefinitionUuid,
        ]);
        const after = await snapshot();
        expect(after.caches.map((row) => row.name)).toEqual([
            '__preagg__customers__daily',
            '__preagg__orders__daily',
            'customers',
            'orders',
        ]);
        expect(
            after.definitions.map((row) => row.source_explore_name).toSorted(),
        ).toEqual(['customers', 'orders']);
        expect(
            after.definitions.find(
                (row) => row.source_explore_name === 'customers',
            ),
        ).toEqual(
            before.definitions.find(
                (row) => row.source_explore_name === 'customers',
            ),
        );
        expect(after.materializations).toEqual(
            before.materializations.filter(
                (row) =>
                    row.pre_aggregate_definition_uuid ===
                    retained.preAggregateDefinitionUuid,
            ),
        );
        expect(
            after.definitions.some(
                (row) =>
                    row.automatic_eligible &&
                    (row.source_cached_explore_uuid === null ||
                        row.pre_agg_cached_explore_uuid === null),
            ),
        ).toBe(false);
    });

    it('serializes simultaneous promotions and breaks equal-time ties deterministically', async () => {
        await activate();
        const current = definition();
        await publish([current], { replaceCache: true });
        const evaluatedAt = new Date('2026-09-01T00:00:00Z');
        const first = await start(current, evaluatedAt);
        const second = await start(current, evaluatedAt);
        await database.raw(
            'UPDATE pre_aggregate_materializations SET created_at = ?',
            [evaluatedAt],
        );
        await Promise.all([
            finish(first.materializationUuid),
            finish(second.materializationUuid),
        ]);
        const winner = [first.materializationUuid, second.materializationUuid]
            .sort()
            .at(-1);
        expect(
            (
                await model.getActiveMaterialization(
                    projectUuid,
                    '__preagg__orders__daily',
                )
            )?.materializationUuid,
        ).toBe(winner);
        expect(
            await database('pre_aggregate_materializations').where(
                'status',
                'active',
            ),
        ).toHaveLength(1);
    });

    it('keeps compatible active monitoring separate from the latest failed attempt', async () => {
        await activate();
        const current = definition();
        await publish([current], { replaceCache: true });
        const active = await start(current, new Date('2026-09-01T00:00:00Z'));
        await finish(active.materializationUuid);
        const failed = await start(current, new Date('2026-09-02T00:00:00Z'));
        await model.markFailed({
            materializationUuid: failed.materializationUuid,
            errorMessage: 'Synthetic warehouse failure',
        });
        const summary =
            await model.getDefinitionsWithLatestMaterialization(projectUuid);
        expect(
            summary.data.materializations[0].activeMaterialization
                ?.materializationUuid,
        ).toBe(active.materializationUuid);
        expect(summary.data.materializations[0].materialization?.status).toBe(
            'failed',
        );
        await publish([definition('daily', 'b'.repeat(64))], {
            replaceCache: true,
        });
        const changed =
            await model.getDefinitionsWithLatestMaterialization(projectUuid);
        expect(
            changed.data.materializations[0].activeMaterialization,
        ).toBeNull();
        expect(changed.data.materializations[0].materialization?.status).toBe(
            'failed',
        );
    });
    it('atomically invalidates context and changes schedule revisions only for effective timezone updates', async () => {
        await activate();
        const prepared = definition();
        const {
            definitions: [current],
        } = await publish([prepared], { replaceCache: true });
        const active = await start(prepared, new Date());
        await finish(active.materializationUuid);
        expect(await model.updateScheduleTimezone(projectUuid, 'UTC')).toEqual(
            [],
        );
        const changed = await model.updateScheduleTimezone(
            projectUuid,
            'Europe/London',
        );
        expect(changed).toEqual([current.preAggregateDefinitionUuid]);
        const [scheduled] =
            await model.getPreAggregateDefinitionsForProject(projectUuid);
        expect(scheduled.scheduleRevision).not.toBe(current.scheduleRevision);
        expect(scheduled.publicationVersion).toBe(current.publicationVersion);
        await expect(
            database.transaction(async (trx) => {
                await trx('projects')
                    .where('project_uuid', projectUuid)
                    .update('scheduler_timezone', 'Asia/Tbilisi');
                await model.invalidateProjectPreparations(projectUuid, trx);
                throw new Error('Injected settings failure');
            }),
        ).rejects.toThrow('Injected settings failure');
        expect(
            (await model.getPreAggregateDefinitionsForProject(projectUuid))[0]
                .publicationVersion,
        ).toBe(current.publicationVersion);
        await model.invalidateProjectPreparations(projectUuid);
        expect(
            await model.getActiveMaterialization(
                projectUuid,
                '__preagg__orders__daily',
            ),
        ).toBeUndefined();
        await expect(
            model.refreshDesiredPreparation({
                projectUuid,
                preAggregateDefinitionUuid: current.preAggregateDefinitionUuid,
                expectedPublicationVersion: prepared.publication_version,
                compatibilityHash: prepared.compatibility_hash,
                physicalOutputContract: contract,
                preparationStatus: 'ready',
                automaticEligible: true,
                materializationQueryError: null,
                materializationMetricQuery:
                    prepared.materialization_metric_query,
            }),
        ).resolves.toBeUndefined();
    });

    it('allows old-writer eligibility and revisionless cron only during compatibility', async () => {
        await publish([definition()], { replaceCache: true });
        await database('pre_aggregate_definitions').update({
            source_explore_name: null,
            pre_aggregate_name: null,
            automatic_eligible: false,
            compatibility_hash: null,
            physical_output_contract: null,
            preparation_status: 'unverified',
        });
        const [legacy] =
            await model.getPreAggregateDefinitionsForProject(projectUuid);
        expect(
            await model.isLegacyDefinitionAutomaticallyEligible(legacy),
        ).toBe(true);
        const insertCron = (expectedScheduleRevision?: string) =>
            model.insertInProgress({
                projectUuid,
                preAggregateDefinitionUuid: legacy.preAggregateDefinitionUuid,
                trigger: 'cron',
                expectedScheduleRevision,
            });
        expect((await insertCron()).scheduleRevision).toBeNull();
        await expect(insertCron(randomUUID())).rejects.toBeInstanceOf(
            ObsoletePreAggregateScheduleError,
        );
        // Synthetic fixtures can change project type; production update types
        // intentionally prevent this transition.
        await database<{ project_type: ProjectType }>('projects').update({
            project_type: ProjectType.PREVIEW,
        });
        expect(
            await model.isLegacyDefinitionAutomaticallyEligible(legacy),
        ).toBe(false);
        await expect(insertCron()).rejects.toBeInstanceOf(
            ObsoletePreAggregateScheduleError,
        );
        await database<{ project_type: ProjectType }>('projects').update({
            project_type: ProjectType.DEFAULT,
        });
        expect(
            await model.isLegacyDefinitionAutomaticallyEligible({
                ...legacy,
                sourceExploreName: 'orders',
                preAggregateName: 'daily',
            }),
        ).toBe(false);
        expect(
            await model.isLegacyDefinitionAutomaticallyEligible({
                ...legacy,
                materializationQueryError: 'Invalid definition',
            }),
        ).toBe(false);
        await database<{ project_type: ProjectType }>('projects').update({
            project_type: ProjectType.PREVIEW,
        });
        await up(database);
        expect(
            (await model.getPreAggregateDefinitionsForProject(projectUuid))[0]
                .automaticEligible,
        ).toBe(false);
        await database('pre_aggregate_definitions').update({
            source_explore_name: null,
            pre_aggregate_name: null,
        });
        await activate();
        expect(
            (await model.getPreAggregateDefinitionsForProject(projectUuid))[0]
                .automaticEligible,
        ).toBe(false);
        await expect(insertCron()).rejects.toBeInstanceOf(
            ObsoletePreAggregateScheduleError,
        );
    });

    it('rejects missing or changed cron revisions under the build insertion lock and retains the accepted revision', async () => {
        await activate();
        const prepared = definition();
        const {
            definitions: [current],
        } = await publish([prepared], { replaceCache: true });
        if (!current.scheduleRevision)
            throw new Error('Missing initial schedule revision');
        const insertCron = (expectedScheduleRevision?: string) =>
            model.insertInProgress({
                projectUuid,
                preAggregateDefinitionUuid: current.preAggregateDefinitionUuid,
                trigger: 'cron',
                expectedScheduleRevision,
                provenance: {
                    publicationVersion: prepared.publication_version,
                    compatibilityHash: prepared.compatibility_hash,
                    evaluatedAt: new Date(),
                    physicalOutputContract: contract,
                    pinnedContextHash: null,
                    executionScopeKeyId: 'c'.repeat(64),
                },
            });
        await expect(insertCron()).rejects.toBeInstanceOf(
            ObsoletePreAggregateScheduleError,
        );
        // A timezone change during async preparation leaves semantic publication
        // unchanged; the schedule CAS must still reject the obsolete job.
        await model.updateScheduleTimezone(projectUuid, 'Europe/London');
        await expect(
            insertCron(current.scheduleRevision),
        ).rejects.toBeInstanceOf(ObsoletePreAggregateScheduleError);
        expect(await database('pre_aggregate_materializations')).toHaveLength(
            0,
        );
        const [rescheduled] =
            await model.getPreAggregateDefinitionsForProject(projectUuid);
        if (!rescheduled.scheduleRevision)
            throw new Error('Missing updated schedule revision');
        const accepted = await insertCron(rescheduled.scheduleRevision);
        expect(accepted.scheduleRevision).toBe(rescheduled.scheduleRevision);
        expect(accepted.executionScopeKeyId).toBe('c'.repeat(64));
        const queryUuid = randomUUID();
        await database.raw('INSERT INTO query_history(query_uuid) VALUES (?)', [
            queryUuid,
        ]);
        await model.attachQueryUuid({
            materializationUuid: accepted.materializationUuid,
            queryUuid,
        });
        expect(
            (await model.getMaterializationByQueryUuid(queryUuid))
                ?.scheduleRevision,
        ).toBe(rescheduled.scheduleRevision);
        expect(
            (await model.getMaterializationByQueryUuid(queryUuid))
                ?.executionScopeKeyId,
        ).toBe('c'.repeat(64));
    });

    it('reports live fallback execution proofs until a new-key refresh and old-attempt drain', async () => {
        await activate();
        const prepared = definition('daily', null);
        await publish([prepared], { replaceCache: true });
        const oldSecret = 'synthetic-old-scope-secret';
        const newSecret = 'synthetic-new-scope-secret';
        const oldKeyId = getSecretArtifactKeyId(
            oldSecret,
            PRE_AGGREGATE_EXECUTION_SCOPE_ARTIFACT,
        );
        const newKeyId = getSecretArtifactKeyId(
            newSecret,
            PRE_AGGREGATE_EXECUTION_SCOPE_ARTIFACT,
        );
        const oldActive = await start(
            prepared,
            new Date('2026-09-01T00:00:00Z'),
            oldKeyId,
        );
        await finish(oldActive.materializationUuid);
        const oldQueued = await start(
            prepared,
            new Date('2026-09-01T01:00:00Z'),
            oldKeyId,
        );
        const scan = () =>
            scanPreAggregateExecutionScopes(
                {
                    database,
                    lightdashSecrets: {
                        active: newSecret,
                        fallbacks: [oldSecret],
                        all: [newSecret, oldSecret],
                    },
                },
                { batchSize: 1 },
            );
        expect(await scan()).toMatchObject({
            active: 0,
            fallback: [2],
            unknown: 0,
        });
        const fresh = await start(
            prepared,
            new Date('2026-09-01T02:00:00Z'),
            newKeyId,
        );
        await finish(fresh.materializationUuid);
        expect(await scan()).toMatchObject({
            active: 1,
            fallback: [1],
            unknown: 0,
        });
        await model.markFailed({
            materializationUuid: oldQueued.materializationUuid,
            errorMessage: 'Synthetic rotation drain',
        });
        expect(await scan()).toMatchObject({
            active: 1,
            fallback: [0],
            unknown: 0,
            blockingMaterializations: [],
        });
    });

    it('executes source SQL for first, manual and cron builds while unchanged deploys reuse the existing result', async () => {
        await activate();
        await database.schema.createTable('synthetic_orders', (table) => {
            table.integer('id').primary();
        });
        await database('synthetic_orders').insert([{ id: 1 }, { id: 2 }]);
        const sql =
            'SELECT count(*)::integer AS orders_count FROM synthetic_orders';
        const outputs = new Map<string, { orders_count: number }[]>();
        const histories = new Map<string, QueryHistory>();
        let executionCount = 0;
        const warehouseCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'localhost',
            user: 'synthetic',
            password: 'synthetic',
            port: 5432,
            dbname: 'synthetic',
            schema,
            userWarehouseCredentialsUuid: undefined,
        } satisfies CreatePostgresCredentials & {
            userWarehouseCredentialsUuid: string | undefined;
        };
        const asyncQueryService: Pick<
            AsyncQueryService,
            | 'prepareRegisteredPreAggregate'
            | 'executePreAggregateMaterialization'
        > = {
            async prepareRegisteredPreAggregate({
                definition: current,
                evaluatedAt,
            }) {
                if (!current.materializationMetricQuery)
                    throw new Error('Missing materialization query');
                return {
                    queryComposer: new QueryComposer(
                        {
                            metricQuery:
                                current.materializationMetricQuery.metricQuery,
                        },
                        {
                            explore: { ...validExplore, name: 'orders' },
                            warehouseSqlBuilder: warehouseSqlBuilderFromType(
                                SupportedDbtAdapter.POSTGRES,
                            ),
                        },
                    ),
                    warehouseCredentials,
                    evaluatedAt,
                    materializationMetricQuery:
                        current.materializationMetricQuery,
                    compatibilityHash: current.compatibilityHash,
                    physicalOutputContract: contract,
                    pinnedContextHash: 'c'.repeat(64),
                };
            },
            async executePreAggregateMaterialization({
                prepared,
                materializationUuid,
            }) {
                const queryUuid = randomUUID();
                executionCount += 1;
                const result = await database.raw<{
                    rows: { orders_count: number }[];
                }>(sql);
                outputs.set(queryUuid, result.rows);
                await database.raw(
                    'INSERT INTO query_history(query_uuid) VALUES (?)',
                    [queryUuid],
                );
                await model.attachQueryUuid({ materializationUuid, queryUuid });
                histories.set(queryUuid, {
                    queryUuid,
                    createdAt: new Date(),
                    createdBy: null,
                    createdByUserUuid: null,
                    createdByAccount: null,
                    createdByActorType: null,
                    organizationUuid: randomUUID(),
                    projectUuid,
                    warehouseQueryId: queryUuid,
                    warehouseQueryMetadata: null,
                    context:
                        QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
                    defaultPageSize: null,
                    compiledSql: sql,
                    metricQuery:
                        prepared.materializationMetricQuery.metricQuery,
                    fields: {},
                    requestParameters: {
                        query: prepared.materializationMetricQuery.metricQuery,
                    },
                    usedParameters: null,
                    status: QueryHistoryStatus.READY,
                    totalRowCount: result.rows.length,
                    warehouseExecutionTimeMs: 1,
                    error: null,
                    erroredAt: null,
                    cacheKey: queryUuid,
                    pivotConfiguration: null,
                    pivotValuesColumns: null,
                    pivotTotalColumnCount: null,
                    resultsFileName: queryUuid,
                    resultsCreatedAt: new Date(),
                    resultsUpdatedAt: new Date(),
                    resultsExpiresAt: null,
                    columns: {
                        orders_count: {
                            reference: 'orders_count',
                            type: DimensionType.NUMBER,
                        },
                    },
                    originalColumns: null,
                    preAggregateCompiledSql: null,
                    preAggregateExecution: null,
                    preAggregateFallbackReason: null,
                    processingStartedAt: new Date(),
                });
                return { queryUuid, cacheMetadata: { cacheHit: false } };
            },
        };
        const service = new PreAggregateMaterializationService({
            lightdashConfig: {
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    parquetEnabled: true,
                    s3: {
                        region: 'local',
                        endpoint: 'http://127.0.0.1',
                        bucket: 'synthetic-results',
                    },
                },
            },
            preAggregateModel: model,
            queryHistoryModel: {
                async pollForQueryCompletion({ queryUuid }) {
                    const history = histories.get(queryUuid);
                    if (!history)
                        throw new Error('Missing synthetic query history');
                    return history;
                },
            },
            asyncQueryService,
            analytics: { trackAccount: () => undefined },
            preAggregateResultsStorageClient: {
                async getFileSize(key) {
                    const queryUuid = key.endsWith('.parquet')
                        ? key.slice(0, -'.parquet'.length)
                        : key;
                    const result = outputs.get(queryUuid);
                    return result
                        ? Buffer.byteLength(JSON.stringify(result))
                        : null;
                },
            },
        });
        const {
            definitions: [initial],
        } = await publish([definition()], { replaceCache: true });
        const run = async (trigger: 'compile' | 'manual' | 'cron') => {
            const current = await model.getPreAggregateDefinitionByUuid({
                projectUuid,
                preAggregateDefinitionUuid: initial.preAggregateDefinitionUuid,
            });
            if (!current?.scheduleRevision)
                throw new Error('Missing schedule revision');
            return service.materializePreAggregate({
                account: sessionAccount,
                projectUuid,
                preAggregateDefinitionUuid: current.preAggregateDefinitionUuid,
                trigger,
                ...(trigger === 'cron'
                    ? { scheduleRevision: current.scheduleRevision }
                    : {}),
            });
        };
        const activeResult = async () => {
            const active = await model.getActiveMaterialization(
                projectUuid,
                '__preagg__orders__daily',
            );
            if (!active?.queryUuid)
                throw new Error('No active materialization');
            return {
                materializationUuid: active.materializationUuid,
                rows: outputs.get(active.queryUuid),
            };
        };
        expect((await run('compile')).status).toBe('active');
        const first = await activeResult();
        expect(first.rows).toEqual([{ orders_count: 2 }]);
        await publish([definition()], { replaceCache: true });
        expect(await run('compile')).toEqual({
            status: 'skipped',
            reason: 'unchanged_active',
        });
        expect(await activeResult()).toEqual(first);
        const beforeRetention = await model.getActiveMaterialization(
            projectUuid,
            '__preagg__orders__daily',
        );
        if (!beforeRetention?.queryUuid)
            throw new Error('Missing retained baseline');
        await database('query_history')
            .where('query_uuid', beforeRetention.queryUuid)
            .delete();
        const afterRetention = await model.getActiveMaterialization(
            projectUuid,
            '__preagg__orders__daily',
        );
        expect(afterRetention?.materializationUuid).toBe(
            first.materializationUuid,
        );
        expect(afterRetention?.queryUuid).toBeNull();
        expect(await run('compile')).toEqual({
            status: 'skipped',
            reason: 'unchanged_active',
        });
        await database('synthetic_orders').insert({ id: 3 });
        await publish([definition()], { replaceCache: true });
        expect(await run('compile')).toEqual({
            status: 'skipped',
            reason: 'unchanged_active',
        });
        expect(executionCount).toBe(1);
        expect(await database('pre_aggregate_materializations')).toHaveLength(
            1,
        );
        expect((await run('manual')).status).toBe('active');
        expect((await activeResult()).rows).toEqual([{ orders_count: 3 }]);
        await database('synthetic_orders').insert({ id: 4 });
        expect((await run('cron')).status).toBe('active');
        const finalResult = await activeResult();
        const source = await database.raw<{ rows: { orders_count: number }[] }>(
            sql,
        );
        expect(finalResult.rows).toEqual(source.rows);
        expect(finalResult.rows).toEqual([{ orders_count: 4 }]);
        expect(executionCount).toBe(3);
        expect(await database('pre_aggregate_materializations')).toHaveLength(
            3,
        );
        await setPreAggregateReuseEnabled(database, {
            enabled: false,
            actor: 'synthetic rollback test',
        });
        expect(await model.getReuseState()).toEqual({
            phase: 'active',
            reuseEnabled: false,
        });
        expect((await run('compile')).status).toBe('active');
        expect(executionCount).toBe(4);
        await publish([definition('daily', 'b'.repeat(64))], {
            replaceCache: true,
        });
        expect(
            await model.getActiveMaterialization(
                projectUuid,
                '__preagg__orders__daily',
            ),
        ).toBeUndefined();
        await setPreAggregateReuseEnabled(database, {
            enabled: true,
            actor: 'synthetic re-enable test',
        });
        expect(await model.getReuseState()).toEqual({
            phase: 'active',
            reuseEnabled: true,
        });
    });
});
