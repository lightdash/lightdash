import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { down, up } from '../20260909190000_add_cached_explore_search_metadata';

describe('Explore search metadata migration', () => {
    let database: Knex;
    const schemaName = `search_metadata_${randomUUID().replaceAll('-', '')}`;
    const source = {
        name: 'orders',
        label: 'Orders',
        tags: ['finance'],
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                sqlTable: 'private.orders',
                requiredAttributes: { region: ['EU', 'US'] },
                anyAttributes: { team: 'finance' },
                dimensions: {
                    amount: {
                        name: 'amount',
                        label: 'Amount',
                        description: null,
                        fieldType: 'dimension',
                        type: 'number',
                        table: 'orders',
                        tableLabel: 'Orders',
                        hidden: false,
                        compiledSql: 'private.orders.amount',
                        requiredAttributes: { region: ['EU'] },
                        anyAttributes: { team: 'finance' },
                        tablesRequiredAttributes: {
                            customers: { region: ['EU', 'US'] },
                        },
                        tablesAnyAttributes: {
                            customers: { team: 'finance', missing: null },
                        },
                    },
                },
                metrics: {},
                lineageGraph: { orders: [] },
            },
        },
    };

    beforeAll(async () => {
        if (!process.env.PGCONNECTIONURI)
            throw new Error('PGCONNECTIONURI is required');
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI,
            searchPath: [schemaName],
            pool: { min: 0, max: 1 },
        });
        await database.raw('CREATE SCHEMA ??', [schemaName]);
        await database.schema.createTable('cached_explore', (table) => {
            table.uuid('cached_explore_uuid').primary();
            table.jsonb('explore').notNullable();
        });
    });

    beforeEach(async () => {
        await down(database);
        await database<Record<string, unknown>>('cached_explore').delete();
    });

    afterAll(async () => {
        if (database) {
            await database.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [
                schemaName,
            ]);
            await database.destroy();
        }
    });

    it('backfills multiple batches and resumes after a partially populated run', async () => {
        const rows = Array.from({ length: 251 }, () => ({
            cached_explore_uuid: randomUUID(),
            explore: source,
        }));
        await database<Record<string, unknown>>('cached_explore').insert(rows);
        await up(database);
        expect(
            await database<Record<string, unknown>>('cached_explore').whereNull(
                'search_metadata',
            ),
        ).toHaveLength(0);

        await database<Record<string, unknown>>('cached_explore')
            .where('cached_explore_uuid', rows[0].cached_explore_uuid)
            .update({ search_metadata: null });
        await up(database);
        expect(
            await database<Record<string, unknown>>('cached_explore').whereNull(
                'search_metadata',
            ),
        ).toHaveLength(0);
        expect(
            await database<Record<string, unknown>>('cached_explore')
                .count('* as count')
                .first(),
        ).toEqual({ count: '251' });
    });

    it('keeps only search metadata, preserving absent properties, nulls and permission maps', async () => {
        await up(database);
        const [row] = await database<Record<string, unknown>>('cached_explore')
            .insert({
                cached_explore_uuid: randomUUID(),
                explore: source,
            })
            .returning('search_metadata');
        const expected = structuredClone(source);
        const { sqlTable, lineageGraph, ...tableMetadata } =
            expected.tables.orders;
        const { compiledSql, ...fieldMetadata } =
            tableMetadata.dimensions.amount;
        expect(row.search_metadata).toEqual({
            name: source.name,
            label: source.label,
            tags: source.tags,
            tables: {
                orders: {
                    ...tableMetadata,
                    dimensions: { amount: fieldMetadata },
                },
            },
        });
        expect(row.search_metadata).not.toHaveProperty('type');
        expect(row.search_metadata).not.toHaveProperty('errors');
    });

    it('refreshes inserts, upserts and preview copies from writers unaware of the column', async () => {
        await up(database);
        const id = randomUUID();
        await database<Record<string, unknown>>('cached_explore').insert({
            cached_explore_uuid: id,
            explore: source,
        });
        const renamed = { ...source, label: 'Renamed orders' };
        await database<Record<string, unknown>>('cached_explore')
            .insert({ cached_explore_uuid: id, explore: renamed })
            .onConflict('cached_explore_uuid')
            .merge();
        const copy = await database<Record<string, unknown>>('cached_explore')
            .where('cached_explore_uuid', id)
            .first();
        expect(copy?.search_metadata).toMatchObject({
            label: 'Renamed orders',
        });

        const copyId = randomUUID();
        await database<Record<string, unknown>>('cached_explore').insert({
            ...copy,
            cached_explore_uuid: copyId,
            explore: { ...renamed, label: 'Preview orders' },
        });
        const preview = await database<Record<string, unknown>>(
            'cached_explore',
        )
            .where('cached_explore_uuid', copyId)
            .first();
        expect(preview?.search_metadata).toMatchObject({
            label: 'Preview orders',
        });

        const failure = { name: 'orders', label: 'Orders', errors: [] };
        await database<Record<string, unknown>>('cached_explore')
            .where('cached_explore_uuid', id)
            .update({ explore: failure });
        const failed = await database<Record<string, unknown>>('cached_explore')
            .where('cached_explore_uuid', id)
            .first();
        expect(failed?.search_metadata).toEqual({ ...failure, tables: {} });
    });

    it('reverses cleanly without changing compiled explores', async () => {
        await up(database);
        await database<Record<string, unknown>>('cached_explore').insert({
            cached_explore_uuid: randomUUID(),
            explore: source,
        });
        await down(database);
        expect(
            await database.schema.hasColumn(
                'cached_explore',
                'search_metadata',
            ),
        ).toBe(false);
        expect(
            (await database<Record<string, unknown>>('cached_explore').first())
                ?.explore,
        ).toEqual(source);
        const functions = await database('pg_proc')
            .join('pg_namespace', 'pg_proc.pronamespace', 'pg_namespace.oid')
            .where('pg_namespace.nspname', schemaName);
        expect(functions).toHaveLength(0);
        await up(database);
        expect(
            await database<Record<string, unknown>>('cached_explore').whereNull(
                'search_metadata',
            ),
        ).toHaveLength(0);
    });
});
