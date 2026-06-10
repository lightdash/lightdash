import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { SavedChartModel } from './SavedChartModel';
import { chartSummary } from './SavedChartModel.mock';

describe('getLatestVersionSummaries', () => {
    const model = new SavedChartModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
        lightdashConfig: lightdashConfigMock,
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    test('Should return all chart versions, however old', async () => {
        const dateDaysAgo = (days: number) =>
            new Date(new Date().setDate(new Date().getDate() - days));

        tracker.on.select(SavedChartsTableName).responseOnce([
            {
                ...chartSummary,
                saved_queries_version_uuid: 'version1',
                created_at: dateDaysAgo(365),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: 'version2',
                created_at: dateDaysAgo(30),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: 'version3',
                created_at: new Date(),
            },
        ]);

        const response = await model.getLatestVersionSummaries('chart_uuid');
        expect(response).toHaveLength(3);
        const versionIds = response.map((r) => r.versionUuid);

        expect(versionIds).toEqual(['version1', 'version2', 'version3']);
    });

    test('Should return a single version without a windowing fallback', async () => {
        // `responseOnce` only answers the first query; the removed "fetch one
        // extra older version" fallback would issue a second (unmocked) query
        // and throw, so this implicitly guards against that regression.
        tracker.on.select(SavedChartsTableName).responseOnce([chartSummary]);

        const response = await model.getLatestVersionSummaries('chart_uuid');

        expect(response).toHaveLength(1);
        expect(response[0].chartUuid).toEqual(chartSummary.saved_query_uuid);
    });
});

describe('updateMultiple', () => {
    const model = new SavedChartModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
        lightdashConfig: lightdashConfigMock,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('requires the destination space to belong to the requested project', async () => {
        const projectUuid = '22222222-2222-4222-8222-222222222222';
        const spaceUuid = '33333333-3333-4333-8333-333333333333';

        tracker.on.select(SpaceTableName).responseOnce([]);

        await expect(
            model.updateMultiple(projectUuid, [
                {
                    uuid: '11111111-1111-4111-8111-111111111111',
                    name: 'Chart name',
                    description: 'Chart description',
                    spaceUuid,
                },
            ]),
        ).rejects.toThrow('Space not found');

        const [spaceQuery] = tracker.history.select;
        expect(spaceQuery.bindings).toContain(projectUuid);
        expect(spaceQuery.bindings).toContain(spaceUuid);
        expect(tracker.history.update).toHaveLength(0);
    });

    test('updates only charts that already belong to the requested project', async () => {
        const projectUuid = '22222222-2222-4222-8222-222222222222';
        const spaceUuid = '33333333-3333-4333-8333-333333333333';
        const chartUuid = '11111111-1111-4111-8111-111111111111';

        tracker.on.select(SpaceTableName).responseOnce([{ space_id: 1 }]);
        tracker.on.update(SavedChartsTableName).responseOnce(0);

        await expect(
            model.updateMultiple(projectUuid, [
                {
                    uuid: chartUuid,
                    name: 'Chart name',
                    description: 'Chart description',
                    spaceUuid,
                },
            ]),
        ).rejects.toThrow('Saved query not found');

        const [updateQuery] = tracker.history.update;
        expect(updateQuery.bindings).toContain(chartUuid);
        expect(updateQuery.bindings).toContain(projectUuid);
    });
});
