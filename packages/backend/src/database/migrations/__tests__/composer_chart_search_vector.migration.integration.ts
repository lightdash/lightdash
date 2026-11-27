import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261127200000_add_composer_chart_search_vector';
import { createFixture, type Fixture } from './composerChartFixture.mock';

describe('composer chart search vector on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let fixture: Fixture;

    const matches = async (trx: Knex, uuid: string, tsquery: string) => {
        const { rows } = await trx.raw<{ rows: { matches: boolean }[] }>(
            `SELECT search_vector @@ to_tsquery('lightdash_english_config', ?) AS matches
            FROM composer_charts WHERE composer_chart_uuid = ?`,
            [tsquery, uuid],
        );
        return rows[0]?.matches;
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        fixture = await createFixture(database);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('weights the name over the description and follows edits', async () => {
        const trx = await database.transaction();
        try {
            const [{ composer_chart_uuid: uuid }] = await trx('composer_charts')
                .insert({
                    project_uuid: fixture.projectUuid,
                    space_uuid: fixture.spaceUuid,
                    dashboard_uuid: null,
                    name: 'Revenue',
                    description: 'Forecast',
                    slug: `revenue-${randomUUID()}`,
                })
                .returning('composer_chart_uuid');
            expect(await matches(trx, uuid, 'revenue:A')).toBe(true);
            expect(await matches(trx, uuid, 'forecast:B')).toBe(true);
            expect(await matches(trx, uuid, 'forecast:A')).toBe(false);
            await trx('composer_charts')
                .where('composer_chart_uuid', uuid)
                .update({ name: 'Retention', description: null });
            expect(await matches(trx, uuid, 'retention:A')).toBe(true);
            expect(await matches(trx, uuid, 'revenue | forecast')).toBe(false);
        } finally {
            await trx.rollback();
        }
    });

    it('down drops the column and its index, up restores them', async () => {
        const trx = await database.transaction();
        const hasIndex = async () =>
            (
                await trx.raw(
                    `SELECT 1 FROM pg_indexes WHERE indexname = 'composer_charts_search_vector_idx'`,
                )
            ).rows.length === 1;
        try {
            await down(trx);
            expect(
                await trx.schema.hasColumn('composer_charts', 'search_vector'),
            ).toBe(false);
            expect(await hasIndex()).toBe(false);
            await up(trx);
            expect(
                await trx.schema.hasColumn('composer_charts', 'search_vector'),
            ).toBe(true);
            expect(await hasIndex()).toBe(true);
        } finally {
            await trx.rollback();
        }
    });
});
