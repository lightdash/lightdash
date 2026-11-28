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

describe('a composer chart read by uuid or slug', () => {
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

    /** Chart `other` holds `owner`'s uuid as its slug, as a code upload can write. */
    const createCollision = async () => {
        const owner = await createChart(null);
        const other = await createChart(owner);
        return { owner, other };
    };

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
});
