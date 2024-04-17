import knex from 'knex';
import {
    FunctionQueryMatcher,
    getTracker,
    MockClient,
    RawQuery,
    Tracker,
} from 'knex-mock-client';

import { deepEqual } from '@lightdash/common';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SavedChartModel } from './SavedChartModel';
import { chartSummary } from './SavedChartModel.mock';

function queryMatcher(
    tableName: string,
    params: any[] = [],
): FunctionQueryMatcher {
    return ({ sql, bindings }: RawQuery) =>
        sql.includes(tableName) &&
        params.length === bindings.length &&
        params.reduce(
            (valid, arg, index) => valid && deepEqual(bindings[index], arg),
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

    test('Should return all recent chart versions', async () => {
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

        const response = await model.getLatestVersionSummaries('chart_uuid');
        expect(response).toHaveLength(3);
        const versionIds = response.map((r) => r.versionUuid);

        expect(versionIds).toEqual(['version1', 'version2', 'version3']);
    });
    test('Should return only 1 recent chart version', async () => {
        tracker.on.select(SavedChartsTableName).responseOnce([chartSummary]);
        // Mocking the query to get the old version
        tracker.on
            .select(
                queryMatcher(SavedChartsTableName, [
                    'chart_uuid',
                    'version_uuid',
                    1,
                ]),
            )
            .responseOnce([]);

        const response = await model.getLatestVersionSummaries('chart_uuid');
        expect(response).toHaveLength(1);
        expect(response[0].chartUuid).toEqual(chartSummary.saved_query_uuid);
    });

    test('Should return 1 old chart version', async () => {
        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ saved_queries_version_uuid: 'current_version' }]);
        // Mocking the query to get the old version
        tracker.on
            .select(
                queryMatcher(SavedChartsTableName, [
                    'chart_uuid',
                    'current_version',
                    1,
                ]),
            )
            .responseOnce([
                { ...chartSummary, saved_queries_version_uuid: 'old_version' },
            ]);

        const response = await model.getLatestVersionSummaries('chart_uuid');
        expect(response).toHaveLength(2);
        const versionIds = response.map((r) => r.versionUuid);

        expect(versionIds).toEqual(['current_version', 'old_version']);
    });
    test('Should not get old chart versions', async () => {
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
        ]);

        // We are not mocking the second request to fetch old versions, which means it is not happening

        const response = await model.getLatestVersionSummaries('chart_uuid');
        expect(response).toHaveLength(2);
        const versionIds = response.map((r) => r.versionUuid);

        expect(versionIds).toEqual(['now', '1_day_ago']);
    });
});
