import {
    ChartType,
    FieldType,
    NotFoundError,
    QuerySourceType,
    type ComposerChartPipeline,
    type ComposerStoredChart,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { ComposerChartModel } from '../../../models/ComposerChartModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { up } from '../20261128160000_rename_composer_chart_slugs_equal_to_another_chart_uuid';
import { createFixture, type Fixture } from './composerChartFixture.mock';

// Untyped on purpose: the test reads the raw schema.
const COMPOSER_CHARTS: string = 'composer_charts';

const pipeline: ComposerChartPipeline = {
    schemaVersion: 1,
    terminalNodeId: 'orders',
    nodes: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'orders',
            title: 'Orders',
            sql: 'select 1',
        },
    ],
};

const storedChart: ComposerStoredChart = {
    schemaVersion: 1,
    columns: [{ reference: 'total', fieldType: FieldType.METRIC }],
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: { layout: { yField: ['total'] }, eChartsConfig: {} },
    },
    pivotConfig: null,
    tableConfig: { columnOrder: ['total'] },
};

describe("a composer chart slug that is another chart's uuid", () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: ComposerChartModel;
    let fixture: Fixture;

    const createChart = (slug: string | null) =>
        model.create({
            uuid: null,
            slug,
            projectUuid: fixture.projectUuid,
            owner: { type: 'space', spaceUuid: fixture.spaceUuid },
            name: 'Orders',
            description: null,
            pipeline,
            chart: storedChart,
            createdByUserUuid: fixture.userUuid,
        });

    /** Chart `other` holds `owner`'s uuid as its slug, as a code upload could write before the fix. */
    const createCollision = async () => {
        const owner = await createChart(null);
        const other = await createChart(owner);
        return { owner, other };
    };

    const slugOf = async (uuid: string) =>
        (
            await database(COMPOSER_CHARTS)
                .where('composer_chart_uuid', uuid)
                .first('slug')
        ).slug;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        model = new ComposerChartModel({ database });
        fixture = await createFixture(database);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('resolves the uuid to its own chart, and to none once that chart is deleted', async () => {
        const { owner } = await createCollision();
        await expect(
            model.getUuidByUuidOrSlug(fixture.projectUuid, owner),
        ).resolves.toBe(owner);

        await database(COMPOSER_CHARTS)
            .where('composer_chart_uuid', owner)
            .update({ deleted_at: new Date() });
        await expect(
            model.getUuidByUuidOrSlug(fixture.projectUuid, owner),
        ).rejects.toThrow(NotFoundError);
    });

    it('resolves a uuid-shaped slug no chart has as its uuid', async () => {
        const slug = randomUUID();
        const chart = await createChart(slug);
        await expect(
            model.getUuidByUuidOrSlug(fixture.projectUuid, slug),
        ).resolves.toBe(chart);
    });

    it("up renames only a slug that is another chart's uuid", async () => {
        const { owner, other } = await createCollision();
        const lone = randomUUID();
        const loneChart = await createChart(lone);
        const ownerSlug = await slugOf(owner);

        await database.transaction((trx) => up(trx));

        expect(await slugOf(other)).toBe(`${owner}-${other}`);
        expect(await slugOf(owner)).toBe(ownerSlug);
        expect(await slugOf(loneChart)).toBe(lone);
        await expect(
            model.getUuidByUuidOrSlug(fixture.projectUuid, `${owner}-${other}`),
        ).resolves.toBe(other);
    });
});
