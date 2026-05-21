import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { SavedChartsTableName } from '../database/entities/savedCharts';
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

    test('Should fetch versions with a single query (no windowing)', async () => {
        tracker.on.select(SavedChartsTableName).responseOnce([chartSummary]);

        const response = await model.getLatestVersionSummaries('chart_uuid');

        expect(response).toHaveLength(1);
        expect(response[0].chartUuid).toEqual(chartSummary.saved_query_uuid);
        // Only one query should run — no follow-up fetch for older versions
        expect(tracker.history.select).toHaveLength(1);
    });
});
