import { randomUUID } from 'crypto';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { up as createMaterializations } from '../../../../database/migrations/20260223110000_create_pre_aggregate_materializations';
import { up as createDefinitions } from '../../../../database/migrations/20260224103000_create_pre_aggregate_definitions';
import { up as addUri } from '../../../../database/migrations/20260302120000_add_materialization_uri_to_pre_aggregate_materializations';
import { up as addBytes } from '../../../../database/migrations/20260309163357_add_total_bytes_to_materializations';
import {
    down,
    up,
} from '../../../../database/migrations/20260915120000_expand_pre_aggregate_reuse';

const definitionColumns = [
    'source_explore_name',
    'pre_aggregate_name',
    'publication_version',
    'compatibility_hash',
    'schedule_revision',
    'scheduler_timezone',
    'physical_output_contract',
    'preparation_status',
    'automatic_eligible',
];
const materializationColumns = [
    'publication_version',
    'schedule_revision',
    'compatibility_hash',
    'pinned_context_hash',
    'execution_scope_key_id',
    'physical_output_contract',
    'evaluated_at',
];
const indexes = [
    'pre_aggregate_definitions_logical_key',
    'pre_aggregate_definitions_source_cache_idx',
    'pre_aggregate_materializations_query_uuid_idx',
    'pre_aggregate_materializations_definition_idx',
];

type DefinitionRow = {
    source_explore_name: string | null;
    pre_aggregate_name: string | null;
    publication_version: string | null;
    compatibility_hash: string | null;
    schedule_revision: string | null;
    scheduler_timezone: string | null;
    physical_output_contract: unknown;
    preparation_status: string;
    automatic_eligible: boolean;
};

describe('Pre-aggregate reuse expansion PostgreSQL integration', () => {
    let database: Knex;
    const schema = `pre_agg_expand_${process.pid}_${randomUUID().replaceAll('-', '')}`;
    const projectUuid = randomUUID();

    const readDefinition = async (definitionUuid: string) => {
        const result = await database.raw<{ rows: DefinitionRow[] }>(
            `SELECT source_explore_name, pre_aggregate_name, publication_version,
                    compatibility_hash, schedule_revision, scheduler_timezone,
                    physical_output_contract, preparation_status, automatic_eligible
             FROM pre_aggregate_definitions WHERE pre_aggregate_definition_uuid = ?`,
            [definitionUuid],
        );
        if (!result.rows[0]) throw new Error('Missing synthetic definition');
        return result.rows[0];
    };

    const insertLegacyDefinition = async (
        options: {
            name?: string;
            external?: boolean;
            queryError?: string;
            missingQuery?: boolean;
        } = {},
    ) => {
        const definitionUuid = randomUUID();
        const sourceCacheUuid = randomUUID();
        const generatedCacheUuid = randomUUID();
        const source = await database.raw<{
            rows: { cached_explore_uuid: string }[];
        }>(
            `INSERT INTO cached_explore(cached_explore_uuid, project_uuid, name)
             VALUES (?, ?, 'orders')
             ON CONFLICT (project_uuid, name) DO UPDATE SET name = EXCLUDED.name
             RETURNING cached_explore_uuid`,
            [sourceCacheUuid, projectUuid],
        );
        if (!source.rows[0]) throw new Error('Missing synthetic source cache');
        await database.raw(
            `INSERT INTO cached_explore(cached_explore_uuid, project_uuid, name)
             VALUES (?, ?, ?)`,
            [generatedCacheUuid, projectUuid, `generated_${definitionUuid}`],
        );
        await database.raw(
            `INSERT INTO pre_aggregate_definitions(
                pre_aggregate_definition_uuid, project_uuid,
                source_cached_explore_uuid, pre_agg_cached_explore_uuid,
                pre_aggregate_definition, materialization_metric_query,
                materialization_query_error, refresh_cron)
             VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, '0 0 * * *')`,
            [
                definitionUuid,
                projectUuid,
                source.rows[0].cached_explore_uuid,
                generatedCacheUuid,
                JSON.stringify({
                    name: options.name ?? 'daily',
                    dimensions: [],
                    metrics: ['count'],
                    ...(options.external ? { table: 'analytics.daily' } : {}),
                }),
                options.missingQuery
                    ? null
                    : JSON.stringify({ metricQuery: {} }),
                options.queryError ?? null,
            ],
        );
        return {
            definitionUuid,
            sourceCacheUuid: source.rows[0].cached_explore_uuid,
            generatedCacheUuid,
        };
    };

    const insertLegacyMaterialization = async (definitionUuid: string) => {
        const queryUuid = randomUUID();
        const materializationUuid = randomUUID();
        await database.raw('INSERT INTO query_history(query_uuid) VALUES (?)', [
            queryUuid,
        ]);
        await database.raw(
            `INSERT INTO pre_aggregate_materializations(
                pre_aggregate_materialization_uuid, project_uuid,
                pre_aggregate_definition_uuid, status, trigger, query_uuid,
                materialization_uri, row_count, total_bytes)
             VALUES (?, ?, ?, 'active', 'compile', ?, 's3://synthetic/result.parquet', 2, 42)`,
            [materializationUuid, projectUuid, definitionUuid, queryUuid],
        );
        return { queryUuid, materializationUuid };
    };

    const readIndexes = async () =>
        (
            await database.raw<{
                rows: { name: string; valid: boolean }[];
            }>(
                `SELECT c.relname AS name, i.indisvalid AS valid
                 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
                 WHERE c.relnamespace = current_schema()::regnamespace
                   AND c.relname = ANY(?::text[]) ORDER BY c.relname`,
                [indexes],
            )
        ).rows;

    beforeAll(async () => {
        if (!process.env.PGCONNECTIONURI)
            throw new Error('PGCONNECTIONURI is required');
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI,
            searchPath: [schema, 'public'],
            // Concurrent index DDL must run outside a transaction; one session
            // also keeps the migration's SET/RESET on that same connection.
            pool: { min: 0, max: 1 },
        });
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
        await database.raw(
            `INSERT INTO projects(project_uuid, scheduler_timezone) VALUES (?, 'Asia/Tokyo')`,
            [projectUuid],
        );
    });

    afterAll(async () => {
        if (database) {
            await database.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
            await database.destroy();
        }
    });

    it('adds nullable provenance without inventing successful result provenance or enabling reuse', async () => {
        const { definitionUuid } = await insertLegacyDefinition();
        const { materializationUuid, queryUuid } =
            await insertLegacyMaterialization(definitionUuid);
        await up(database);
        const result = await database.raw<{
            rows: { [column: string]: unknown }[];
        }>(
            'SELECT * FROM pre_aggregate_materializations WHERE pre_aggregate_materialization_uuid = ?',
            [materializationUuid],
        );
        expect(result.rows[0]).toMatchObject({
            pre_aggregate_materialization_uuid: materializationUuid,
            pre_aggregate_definition_uuid: definitionUuid,
            query_uuid: queryUuid,
            status: 'active',
            materialization_uri: 's3://synthetic/result.parquet',
            row_count: 2,
            total_bytes: '42',
            ...Object.fromEntries(
                materializationColumns.map((key) => [key, null]),
            ),
        });
        const state = await database.raw<{
            rows: {
                phase: string;
                reuse_enabled: boolean;
                activated_by: string | null;
            }[];
        }>(
            `SELECT phase, reuse_enabled, activated_by FROM pre_aggregate_reuse_state
             WHERE state_key = 'singleton'`,
        );
        expect(state.rows).toEqual([
            {
                phase: 'compatibility',
                reuse_enabled: false,
                activated_by: null,
            },
        ]);
    });

    it.each([
        {
            label: 'managed',
            projectType: 'DEFAULT',
            options: {},
            eligible: true,
            status: 'unverified',
        },
        {
            label: 'preview',
            projectType: 'PREVIEW',
            options: {},
            eligible: false,
            status: 'unverified',
        },
        {
            label: 'external',
            projectType: 'DEFAULT',
            options: { external: true },
            eligible: false,
            status: 'unverified',
        },
        {
            label: 'invalid',
            projectType: 'DEFAULT',
            options: { queryError: 'Synthetic compile failure' },
            eligible: false,
            status: 'invalid',
        },
        {
            label: 'missing query',
            projectType: 'DEFAULT',
            options: { missingQuery: true },
            eligible: false,
            status: 'unverified',
        },
    ])(
        'backfills logical identity and conservative eligibility for $label definitions',
        async ({ projectType, options, eligible, status }) => {
            await database.raw('UPDATE projects SET project_type = ?', [
                projectType,
            ]);
            const { definitionUuid } = await insertLegacyDefinition(options);
            await up(database);
            const row = await readDefinition(definitionUuid);
            expect(row.publication_version).toMatch(/^[a-f0-9-]{36}$/);
            expect(row.schedule_revision).toMatch(/^[a-f0-9-]{36}$/);
            expect(row).toEqual({
                source_explore_name: 'orders',
                pre_aggregate_name: 'daily',
                publication_version: row.publication_version,
                compatibility_hash: null,
                schedule_revision: row.schedule_revision,
                scheduler_timezone: 'Asia/Tokyo',
                physical_output_contract: null,
                preparation_status: status,
                automatic_eligible: eligible,
            });
        },
    );

    it('accepts legacy writes after expansion and backfills them on restart without changing assigned revisions', async () => {
        await up(database);
        const { definitionUuid } = await insertLegacyDefinition();
        await insertLegacyMaterialization(definitionUuid);
        const before = await readDefinition(definitionUuid);
        expect(before.publication_version).toMatch(/^[a-f0-9-]{36}$/);
        expect(before.schedule_revision).toMatch(/^[a-f0-9-]{36}$/);
        expect(before).toEqual({
            source_explore_name: null,
            pre_aggregate_name: null,
            publication_version: before.publication_version,
            compatibility_hash: null,
            schedule_revision: before.schedule_revision,
            scheduler_timezone: null,
            physical_output_contract: null,
            preparation_status: 'unverified',
            automatic_eligible: false,
        });
        await up(database);
        const after = await readDefinition(definitionUuid);
        expect(after).toEqual({
            ...before,
            source_explore_name: 'orders',
            pre_aggregate_name: 'daily',
            scheduler_timezone: 'Asia/Tokyo',
            automatic_eligible: true,
        });
        await up(database);
        expect(await readDefinition(definitionUuid)).toEqual(after);
        expect(await readIndexes()).toEqual(
            indexes.toSorted().map((name) => ({ name, valid: true })),
        );
    });

    it.each(['sourceCacheUuid', 'generatedCacheUuid'] as const)(
        'retains the legacy %s deletion cascade before activation',
        async (cacheKey) => {
            const fixture = await insertLegacyDefinition();
            await insertLegacyMaterialization(fixture.definitionUuid);
            await up(database);
            await database.raw(
                'DELETE FROM cached_explore WHERE cached_explore_uuid = ?',
                [fixture[cacheKey]],
            );
            const result = await database.raw<{
                rows: { definitions: number; materializations: number }[];
            }>(
                `SELECT (SELECT count(*)::integer FROM pre_aggregate_definitions) AS definitions,
                        (SELECT count(*)::integer FROM pre_aggregate_materializations) AS materializations`,
            );
            expect(result.rows).toEqual([
                { definitions: 0, materializations: 0 },
            ]);
        },
    );

    it('retains query-history deletion behavior and required cache references', async () => {
        const { definitionUuid } = await insertLegacyDefinition();
        const { queryUuid, materializationUuid } =
            await insertLegacyMaterialization(definitionUuid);
        await up(database);
        await database.raw('DELETE FROM query_history WHERE query_uuid = ?', [
            queryUuid,
        ]);
        const result = await database.raw<{
            rows: { query_uuid: string | null }[];
        }>(
            'SELECT query_uuid FROM pre_aggregate_materializations WHERE pre_aggregate_materialization_uuid = ?',
            [materializationUuid],
        );
        expect(result.rows).toEqual([{ query_uuid: null }]);
        await expect(
            database.raw(
                'UPDATE pre_aggregate_definitions SET source_cached_explore_uuid = NULL WHERE pre_aggregate_definition_uuid = ?',
                [definitionUuid],
            ),
        ).rejects.toMatchObject({ code: '23502' });
        await expect(
            database.raw(
                'UPDATE pre_aggregate_definitions SET pre_agg_cached_explore_uuid = NULL WHERE pre_aggregate_definition_uuid = ?',
                [definitionUuid],
            ),
        ).rejects.toMatchObject({ code: '23502' });
    });

    it('resumes after a failed concurrent unique index without replacing backfilled identities', async () => {
        const keep = await insertLegacyDefinition();
        const duplicate = await insertLegacyDefinition();
        await expect(up(database)).rejects.toMatchObject({ code: '23505' });
        expect(await readIndexes()).toContainEqual({
            name: 'pre_aggregate_definitions_logical_key',
            valid: false,
        });
        const before = await readDefinition(keep.definitionUuid);
        await database.raw(
            'DELETE FROM pre_aggregate_definitions WHERE pre_aggregate_definition_uuid = ?',
            [duplicate.definitionUuid],
        );
        await up(database);
        expect(await readDefinition(keep.definitionUuid)).toEqual(before);
        expect(await readIndexes()).toEqual(
            indexes.toSorted().map((name) => ({ name, valid: true })),
        );
        await expect(
            database.raw(
                `INSERT INTO pre_aggregate_definitions(
                project_uuid, source_cached_explore_uuid, pre_agg_cached_explore_uuid,
                pre_aggregate_definition, source_explore_name, pre_aggregate_name)
             VALUES (?, ?, ?, '{"name":"daily"}', 'orders', 'daily')`,
                [
                    projectUuid,
                    keep.sourceCacheUuid,
                    duplicate.generatedCacheUuid,
                ],
            ),
        ).rejects.toMatchObject({ code: '23505' });
    });

    it('backfills more than one batch of legacy definitions', async () => {
        const sourceCacheUuid = randomUUID();
        await database.raw(
            `INSERT INTO cached_explore(cached_explore_uuid, project_uuid, name) VALUES (?, ?, 'orders')`,
            [sourceCacheUuid, projectUuid],
        );
        await database.raw(
            `WITH caches AS (
                INSERT INTO cached_explore(cached_explore_uuid, project_uuid, name)
                SELECT uuid_generate_v4(), ?, 'daily_' || n FROM generate_series(1, 1001) n
                RETURNING cached_explore_uuid, name
             )
             INSERT INTO pre_aggregate_definitions(
                project_uuid, source_cached_explore_uuid, pre_agg_cached_explore_uuid,
                pre_aggregate_definition, materialization_metric_query)
             SELECT ?, ?, cached_explore_uuid, jsonb_build_object('name', name), '{}'::jsonb FROM caches`,
            [projectUuid, projectUuid, sourceCacheUuid],
        );
        await up(database);
        const result = await database.raw<{ rows: { count: number }[] }>(
            `SELECT count(*)::integer AS count FROM pre_aggregate_definitions
             WHERE source_explore_name = 'orders' AND pre_aggregate_name IS NOT NULL
               AND publication_version IS NOT NULL AND schedule_revision IS NOT NULL
               AND automatic_eligible AND preparation_status = 'unverified'`,
        );
        expect(result.rows).toEqual([{ count: 1001 }]);
    });

    it('reverses only the expansion before activation and can expand again', async () => {
        const { definitionUuid } = await insertLegacyDefinition();
        const { materializationUuid } =
            await insertLegacyMaterialization(definitionUuid);
        await up(database);
        await down(database);
        expect(
            await database.schema.hasTable('pre_aggregate_reuse_state'),
        ).toBe(false);
        const columns = await database.raw<{ rows: { column_name: string }[] }>(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = ? AND
               ((table_name = 'pre_aggregate_definitions' AND column_name = ANY(?::text[])) OR
                (table_name = 'pre_aggregate_materializations' AND column_name = ANY(?::text[])))`,
            [schema, definitionColumns, materializationColumns],
        );
        expect(columns.rows).toEqual([]);
        expect(await readIndexes()).toEqual([]);
        const result = await database.raw<{
            rows: { status: string; materialization_uri: string }[];
        }>(
            'SELECT status, materialization_uri FROM pre_aggregate_materializations WHERE pre_aggregate_materialization_uuid = ?',
            [materializationUuid],
        );
        expect(result.rows).toEqual([
            {
                status: 'active',
                materialization_uri: 's3://synthetic/result.parquet',
            },
        ]);
        await up(database);
        expect(await readDefinition(definitionUuid)).toMatchObject({
            source_explore_name: 'orders',
            pre_aggregate_name: 'daily',
            compatibility_hash: null,
        });
    });
});
