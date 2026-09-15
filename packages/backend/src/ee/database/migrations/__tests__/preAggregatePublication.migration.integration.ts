import {
    getPreAggregateExploreName,
    type PhysicalOutputContract,
    type PreAggregateDefinition,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { up as createMaterializations } from '../../../../database/migrations/20260223110000_create_pre_aggregate_materializations';
import { up as createDefinitions } from '../../../../database/migrations/20260224103000_create_pre_aggregate_definitions';
import { up as addUri } from '../../../../database/migrations/20260302120000_add_materialization_uri_to_pre_aggregate_materializations';
import { up as addBytes } from '../../../../database/migrations/20260309163357_add_total_bytes_to_materializations';
import { up as expandReuse } from '../../../../database/migrations/20260915120000_expand_pre_aggregate_reuse';
import {
    PreAggregateModel,
    type PreAggregatePublicationScope,
    type PublishPreAggregateDefinition,
} from '../../../models/PreAggregateModel';

describe('Pre-aggregate publication PostgreSQL integration in compatibility phase', () => {
    let database: Knex;
    let model: PreAggregateModel;
    const schema = `pre_agg_publish_${process.pid}_${randomUUID().replaceAll('-', '')}`;
    const projectUuid = randomUUID();
    const otherProjectUuid = randomUUID();
    const contract: PhysicalOutputContract = {
        columns: [{ name: 'orders_count', type: 'number' }],
        grain: [],
        format: 'parquet',
    };

    const definition = (
        name = 'daily',
        source = 'orders',
        project = projectUuid,
    ): PublishPreAggregateDefinition => ({
        project_uuid: project,
        source_explore_name: source,
        pre_aggregate_name: name,
        publication_version: randomUUID(),
        compatibility_hash: 'a'.repeat(64),
        physical_output_contract: contract,
        preparation_status: 'ready',
        automatic_eligible: true,
        pre_aggregate_definition: { name, dimensions: [], metrics: ['count'] },
        materialization_metric_query: {
            metricQuery: {
                exploreName: source,
                dimensions: [],
                metrics: [`${source}_count`],
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

    const writeCaches = async (
        trx: Knex.Transaction,
        project: string,
        definitions: PublishPreAggregateDefinition[],
    ) => {
        const names = [
            ...new Set(
                definitions.flatMap((row) => [
                    row.source_explore_name,
                    getPreAggregateExploreName(
                        row.source_explore_name,
                        row.pre_aggregate_name,
                    ),
                ]),
            ),
        ];
        if (names.length === 0) return;
        await trx.raw(
            `INSERT INTO cached_explore(cached_explore_uuid, project_uuid, name)
             SELECT uuid_generate_v4(), ?, name FROM unnest(?::text[]) AS names(name)
             ON CONFLICT (project_uuid, name) DO NOTHING`,
            [project, names],
        );
    };

    const publish = (
        definitions: PublishPreAggregateDefinition[],
        options: {
            project?: string;
            scope?: PreAggregatePublicationScope;
            schedulerTimezone?: string;
            invalidSourceErrors?: Record<string, string>;
            createCaches?: boolean;
            failAfterPublish?: boolean;
        } = {},
    ) =>
        database.transaction(async (trx) => {
            const project = options.project ?? projectUuid;
            await trx.raw(
                'SELECT project_uuid FROM projects WHERE project_uuid = ? FOR UPDATE',
                [project],
            );
            if (options.createCaches !== false)
                await writeCaches(trx, project, definitions);
            const result = await model.publishDefinitions(
                {
                    projectUuid: project,
                    definitions,
                    scope: options.scope ?? { type: 'full' },
                    invalidSourceErrors: options.invalidSourceErrors ?? {},
                    schedulerTimezone: options.schedulerTimezone ?? 'UTC',
                },
                trx,
            );
            if (options.failAfterPublish)
                throw new Error('Injected publication rollback');
            return result;
        });

    const onlyDefinition = (result: {
        definitions: PreAggregateDefinition[];
    }) => {
        if (result.definitions.length !== 1 || !result.definitions[0])
            throw new Error('Expected one synthetic published definition');
        return result.definitions[0];
    };

    const getDefinition = async (preAggregateDefinitionUuid: string) => {
        const row = await model.getPreAggregateDefinitionByUuid({
            projectUuid,
            preAggregateDefinitionUuid,
        });
        if (!row) throw new Error('Missing synthetic published definition');
        return row;
    };

    const refreshInput = (row: PreAggregateDefinition) => {
        if (!row.publicationVersion)
            throw new Error(
                'Synthetic definition is missing publication version',
            );
        return {
            projectUuid: row.projectUuid,
            preAggregateDefinitionUuid: row.preAggregateDefinitionUuid,
            expectedPublicationVersion: row.publicationVersion,
            compatibilityHash: row.compatibilityHash,
            physicalOutputContract: row.physicalOutputContract,
            preparationStatus: row.preparationStatus,
            automaticEligible: row.automaticEligible,
            materializationQueryError: row.materializationQueryError,
            materializationMetricQuery: row.materializationMetricQuery,
        };
    };

    beforeAll(async () => {
        if (!process.env.PGCONNECTIONURI)
            throw new Error('PGCONNECTIONURI is required');
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI,
            searchPath: [schema, 'public'],
            pool: { min: 0, max: 1 },
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
            table.text('project_type').notNullable().defaultTo('DEFAULT');
        });
        await database.schema.createTable('cached_explore', (table) => {
            table.uuid('cached_explore_uuid').primary();
            table.uuid('project_uuid').notNullable();
            table.text('name').notNullable();
            table.unique(['project_uuid', 'name']);
        });
        await database.schema.createTable('query_history', (table) => {
            table.uuid('query_uuid').primary();
        });
        await createMaterializations(database);
        await createDefinitions(database);
        await addUri(database);
        await addBytes(database);
        await expandReuse(database);
        await database.raw(
            `INSERT INTO projects(project_uuid, scheduler_timezone) VALUES (?, 'UTC'), (?, 'UTC')`,
            [projectUuid, otherProjectUuid],
        );
        expect(await model.getReuseState()).toEqual({
            phase: 'compatibility',
            reuseEnabled: false,
        });
    });

    afterAll(async () => {
        if (database) {
            await database.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
            await database.destroy();
        }
    });

    it('preserves logical identity and schedule revision while publishing new semantics against the same caches', async () => {
        const firstInput = definition();
        const first = onlyDefinition(await publish([firstInput]));
        const nextInput = {
            ...definition(),
            compatibility_hash: 'b'.repeat(64),
        };
        const result = await publish([nextInput]);
        const next = onlyDefinition(result);
        expect(next).toMatchObject({
            preAggregateDefinitionUuid: first.preAggregateDefinitionUuid,
            sourceCachedExploreUuid: first.sourceCachedExploreUuid,
            preAggCachedExploreUuid: first.preAggCachedExploreUuid,
            createdAt: first.createdAt,
            scheduleRevision: first.scheduleRevision,
            publicationVersion: nextInput.publication_version,
            compatibilityHash: nextInput.compatibility_hash,
        });
        expect(next.publicationVersion).not.toBe(first.publicationVersion);
        expect(result.scheduleChanges).toEqual([]);
        expect(
            await model.getPreAggregateDefinitionsForProject(projectUuid),
        ).toHaveLength(1);
    });

    it('retires every missing definition and its history on full publication within one project', async () => {
        const first = await publish([
            definition(),
            definition('hourly'),
            definition('daily', 'customers'),
        ]);
        const daily = first.definitions.find(
            (row) =>
                row.sourceExploreName === 'orders' &&
                row.preAggregateName === 'daily',
        );
        if (!daily) throw new Error('Missing synthetic orders definition');
        const attempt = await model.insertInProgress({
            projectUuid,
            preAggregateDefinitionUuid: daily.preAggregateDefinitionUuid,
            trigger: 'compile',
        });
        const other = onlyDefinition(
            await publish([definition('daily', 'orders', otherProjectUuid)], {
                project: otherProjectUuid,
            }),
        );
        const result = await publish([definition('daily', 'customers')]);
        const remaining = onlyDefinition(result);
        expect(remaining.sourceExploreName).toBe('customers');
        expect(result.scheduleChanges.toSorted()).toEqual(
            first.definitions
                .filter((row) => row.sourceExploreName === 'orders')
                .map((row) => row.preAggregateDefinitionUuid)
                .toSorted(),
        );
        const history = await database.raw<{ rows: { count: number }[] }>(
            'SELECT count(*)::integer AS count FROM pre_aggregate_materializations WHERE pre_aggregate_materialization_uuid = ?',
            [attempt.materializationUuid],
        );
        expect(history.rows).toEqual([{ count: 0 }]);
        expect(
            await model.getPreAggregateDefinitionsForProject(otherProjectUuid),
        ).toEqual([other]);
    });

    it('limits partial retirement to scoped sources, including legacy rows whose logical names are still null', async () => {
        const initial = await publish([
            definition(),
            definition('hourly'),
            definition('daily', 'customers'),
        ]);
        const customer = initial.definitions.find(
            (row) => row.sourceExploreName === 'customers',
        );
        const hourly = initial.definitions.find(
            (row) => row.preAggregateName === 'hourly',
        );
        if (!customer || !hourly)
            throw new Error('Missing synthetic definitions');
        await database.raw(
            'UPDATE pre_aggregate_definitions SET source_explore_name = NULL, pre_aggregate_name = NULL WHERE pre_aggregate_definition_uuid = ?',
            [customer.preAggregateDefinitionUuid],
        );
        const untouched = await getDefinition(
            customer.preAggregateDefinitionUuid,
        );
        const result = await publish([definition()], {
            scope: { type: 'partial', sourceExploreNames: ['orders'] },
        });
        expect(result.scheduleChanges).toEqual([
            hourly.preAggregateDefinitionUuid,
        ]);
        expect(
            await getDefinition(customer.preAggregateDefinitionUuid),
        ).toEqual(untouched);
        expect(
            await model.getPreAggregateDefinitionsForProject(projectUuid),
        ).toHaveLength(2);
        const adopted = onlyDefinition(
            await publish([definition('daily', 'customers')], {
                scope: { type: 'partial', sourceExploreNames: ['customers'] },
            }),
        );
        expect(adopted.preAggregateDefinitionUuid).toBe(
            customer.preAggregateDefinitionUuid,
        );
        expect(adopted.sourceExploreName).toBe('customers');
        expect(adopted.preAggregateName).toBe('daily');
    });

    it('keeps missing-cache and invalid-source publication compatible with legacy NOT NULL references', async () => {
        expect(await publish([definition()], { createCaches: false })).toEqual({
            definitions: [],
            scheduleChanges: [],
        });
        const first = onlyDefinition(await publish([definition()]));
        const result = await publish([], {
            scope: { type: 'partial', sourceExploreNames: ['orders'] },
            invalidSourceErrors: { orders: 'Synthetic invalid source' },
        });
        expect(result).toEqual({
            definitions: [],
            scheduleChanges: [first.preAggregateDefinitionUuid],
        });
        expect(
            await model.getPreAggregateDefinitionsForProject(projectUuid),
        ).toEqual([]);
        expect(await model.getReuseState()).toEqual({
            phase: 'compatibility',
            reuseEnabled: false,
        });
    });

    it.each(['cron', 'timezone', 'eligibility', 'invalidity'] as const)(
        'changes schedule revision when effective %s changes',
        async (change) => {
            const first = onlyDefinition(await publish([definition()]));
            const next = definition();
            if (change === 'cron') next.refresh_cron = '0 1 * * *';
            if (change === 'eligibility') next.automatic_eligible = false;
            if (change === 'invalidity') {
                next.preparation_status = 'invalid';
                next.materialization_query_error = 'Synthetic definition error';
            }
            const result = await publish([next], {
                schedulerTimezone: change === 'timezone' ? 'Asia/Tokyo' : 'UTC',
            });
            const updated = onlyDefinition(result);
            expect(updated.preAggregateDefinitionUuid).toBe(
                first.preAggregateDefinitionUuid,
            );
            expect(updated.scheduleRevision).not.toBe(first.scheduleRevision);
            expect(result.scheduleChanges).toEqual([
                first.preAggregateDefinitionUuid,
            ]);
            if (change === 'invalidity')
                expect(updated.materializationQueryError).toBe(
                    'Synthetic definition error',
                );
        },
    );

    it('rolls cache inserts and all registry changes back with the enclosing publication transaction', async () => {
        const first = onlyDefinition(await publish([definition()]));
        const beforeCaches = await database.raw<{
            rows: { cached_explore_uuid: string; name: string }[];
        }>(
            'SELECT cached_explore_uuid, name FROM cached_explore ORDER BY name',
        );
        await expect(
            publish(
                [
                    {
                        ...definition(),
                        compatibility_hash: 'b'.repeat(64),
                        refresh_cron: '0 1 * * *',
                    },
                    definition('weekly'),
                ],
                { failAfterPublish: true },
            ),
        ).rejects.toThrow('Injected publication rollback');
        expect(
            await model.getPreAggregateDefinitionsForProject(projectUuid),
        ).toEqual([first]);
        expect(
            (
                await database.raw<{
                    rows: { cached_explore_uuid: string; name: string }[];
                }>(
                    'SELECT cached_explore_uuid, name FROM cached_explore ORDER BY name',
                )
            ).rows,
        ).toEqual(beforeCaches.rows);
    });

    it('invalidates only the target project without changing its schedule or physical output contract', async () => {
        const first = onlyDefinition(await publish([definition()]));
        const other = onlyDefinition(
            await publish([definition('daily', 'orders', otherProjectUuid)], {
                project: otherProjectUuid,
            }),
        );
        await model.invalidateProjectPreparations(projectUuid);
        const invalidated = await getDefinition(
            first.preAggregateDefinitionUuid,
        );
        expect(invalidated.publicationVersion).not.toBe(
            first.publicationVersion,
        );
        expect(invalidated).toMatchObject({
            compatibilityHash: null,
            preparationStatus: 'unverified',
            scheduleRevision: first.scheduleRevision,
            physicalOutputContract: first.physicalOutputContract,
            automaticEligible: first.automaticEligible,
        });
        expect(
            await model.getPreAggregateDefinitionsForProject(otherProjectUuid),
        ).toEqual([other]);
    });

    it('changes timezone revisions only on an effective change and rolls setting invalidation back atomically', async () => {
        const first = onlyDefinition(await publish([definition()]));
        expect(await model.updateScheduleTimezone(projectUuid, 'UTC')).toEqual(
            [],
        );
        expect(await getDefinition(first.preAggregateDefinitionUuid)).toEqual(
            first,
        );
        expect(
            await model.updateScheduleTimezone(projectUuid, 'Europe/London'),
        ).toEqual([first.preAggregateDefinitionUuid]);
        const changed = await getDefinition(first.preAggregateDefinitionUuid);
        expect(changed.scheduleRevision).not.toBe(first.scheduleRevision);
        expect(changed.publicationVersion).toBe(first.publicationVersion);
        expect(changed.compatibilityHash).toBe(first.compatibilityHash);
        await expect(
            database.transaction(async (trx) => {
                await trx.raw(
                    'SELECT project_uuid FROM projects WHERE project_uuid = ? FOR UPDATE',
                    [projectUuid],
                );
                await trx.raw(
                    'UPDATE projects SET scheduler_timezone = ? WHERE project_uuid = ?',
                    ['Asia/Tokyo', projectUuid],
                );
                await model.updateScheduleTimezone(
                    projectUuid,
                    'Asia/Tokyo',
                    trx,
                );
                await model.invalidateProjectPreparations(projectUuid, trx);
                throw new Error('Injected settings rollback');
            }),
        ).rejects.toThrow('Injected settings rollback');
        expect(await getDefinition(first.preAggregateDefinitionUuid)).toEqual(
            changed,
        );
        const project = await database.raw<{
            rows: { scheduler_timezone: string }[];
        }>('SELECT scheduler_timezone FROM projects WHERE project_uuid = ?', [
            projectUuid,
        ]);
        expect(project.rows).toEqual([{ scheduler_timezone: 'UTC' }]);
    });

    it('refreshes desired preparation only for the expected project and publication', async () => {
        const first = onlyDefinition(await publish([definition()]));
        const firstInput = refreshInput(first);
        expect(await model.refreshDesiredPreparation(firstInput)).toEqual(
            first,
        );
        const refreshed = await model.refreshDesiredPreparation({
            ...firstInput,
            compatibilityHash: 'b'.repeat(64),
        });
        if (!refreshed)
            throw new Error('Expected refreshed synthetic preparation');
        expect(refreshed.publicationVersion).not.toBe(first.publicationVersion);
        expect(refreshed.scheduleRevision).toBe(first.scheduleRevision);
        expect(refreshed.compatibilityHash).toBe('b'.repeat(64));
        expect(
            await model.refreshDesiredPreparation({
                ...firstInput,
                compatibilityHash: 'c'.repeat(64),
            }),
        ).toBeUndefined();
        expect(
            await model.refreshDesiredPreparation({
                ...refreshInput(refreshed),
                projectUuid: otherProjectUuid,
            }),
        ).toBeUndefined();
        expect(await getDefinition(first.preAggregateDefinitionUuid)).toEqual(
            refreshed,
        );
        const invalid = await model.refreshDesiredPreparation({
            ...refreshInput(refreshed),
            compatibilityHash: null,
            preparationStatus: 'invalid',
            automaticEligible: false,
            materializationQueryError: 'Synthetic preparation failure',
        });
        if (!invalid) throw new Error('Expected invalid synthetic preparation');
        expect(invalid.publicationVersion).not.toBe(
            refreshed.publicationVersion,
        );
        expect(invalid.scheduleRevision).not.toBe(refreshed.scheduleRevision);
        expect(invalid.preparationStatus).toBe('invalid');
        expect(invalid.materializationQueryError).toBe(
            'Synthetic preparation failure',
        );
    });
});
