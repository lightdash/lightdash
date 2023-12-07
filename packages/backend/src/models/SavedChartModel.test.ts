import knex from 'knex';
import {
    FunctionQueryMatcher,
    getTracker,
    MockClient,
    RawQuery,
    Tracker,
} from 'knex-mock-client';

import {
    SavedChartsTableName,
    SavedChartVersionsTableName,
} from '../database/entities/savedCharts';
import { SavedChartModel } from './SavedChartModel';
import { chartSummary, lightdashConfigMock } from './SavedChartModel.mock';

function queryMatcher(
    tableName: string,
    params: any[] = [],
): FunctionQueryMatcher {
    return ({ sql, bindings }: RawQuery) =>
        sql.includes(tableName) &&
        params.length === bindings.length &&
        params.reduce(
            (valid, arg, index) => valid && bindings[index] === arg,
            true,
        );
}

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
    test('Should return recent chart version', async () => {
        tracker.on.select(SavedChartsTableName).responseOnce([chartSummary]);

        const response = await model.getLatestVersionSummaries('chartUuid');
        expect(response).toHaveLength(1);
        expect(response[0].chartUuid).toEqual(chartSummary.saved_query_uuid);
    });

    test('Should return all recent chart versions', async () => {
        const now = new Date();
        const dateDaysAgo = (days: number) =>
            new Date(new Date().setDate(new Date().getDate() - days));

        tracker.on.select(SavedChartsTableName).responseOnce([
            {
                ...chartSummary,
                saved_queries_version_uuid: 'version1',
                created_at: new Date(),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: 'version2',
                created_at: new Date(),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: 'version3',
                created_at: new Date(),
            },
        ]);

        const response = await model.getLatestVersionSummaries('chartUuid');
        expect(response).toHaveLength(3);
        const versionIds = response.map((r) => r.versionUuid);

        expect(versionIds).toEqual(['version1', 'version2', 'version3']);
    });

    test('Should not old chart versions', async () => {
        const dateDaysAgo = (days: number) =>
            new Date(new Date().setDate(new Date().getDate() - days));

        tracker.on.select(SavedChartsTableName).responseOnce([
            {
                ...chartSummary,
                saved_queries_version_uuid: 'now',
                created_at: new Date(),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: '1_day_ago',
                created_at: dateDaysAgo(1),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: '2_days_ago',
                created_at: dateDaysAgo(2),
            },

            // Old versions (greather than 3 days)
            {
                ...chartSummary,
                saved_queries_version_uuid: '3_days_ago',
                created_at: dateDaysAgo(3),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: '4_days_ago',
                created_at: dateDaysAgo(4),
            },
        ]);

        const response = await model.getLatestVersionSummaries('chartUuid');
        expect(response).toHaveLength(3);
        const versionIds = response.map((r) => r.versionUuid);

        expect(versionIds).toEqual(['now', '1_day_ago', '2_days_ago']);
    });

    test('Should get at least 1 old version if there are no more recent versions', async () => {
        const dateDaysAgo = (days: number) =>
            new Date(new Date().setDate(new Date().getDate() - days));

        tracker.on.select(SavedChartsTableName).responseOnce([
            {
                ...chartSummary,
                saved_queries_version_uuid: 'now',
                created_at: new Date(),
            },
            // Old versions (greather than 3 days)
            {
                ...chartSummary,
                saved_queries_version_uuid: '3_days_ago',
                created_at: dateDaysAgo(3),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: '4_days_ago',
                created_at: dateDaysAgo(4),
            },
        ]);

        const response = await model.getLatestVersionSummaries('chartUuid');
        expect(response).toHaveLength(2);
        const versionIds = response.map((r) => r.versionUuid);

        expect(versionIds).toEqual(['now', '3_days_ago']);
    });
});
