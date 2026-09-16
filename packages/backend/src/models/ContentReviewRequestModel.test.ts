import { ContentReviewContentType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { ContentReviewRequestModel } from './ContentReviewRequestModel';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const spaceUuid = '22222222-2222-4222-8222-222222222222';

describe('ContentReviewRequestModel similarity queries', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ContentReviewRequestModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    const scope = {
        projectUuid,
        excludeContentUuid: null,
        accessibleSpaceUuids: [spaceUuid],
    };

    // Knex clone() drops timeout options; every executed lookup must keep them.
    const expectEveryQueryCancelsOnTimeout = (count: number) => {
        expect(tracker.history.select).toHaveLength(count);
        tracker.history.select.forEach((query) => {
            expect(query.timeout).toBe(5000);
            expect(query.cancelOnTimeout).toBe(true);
        });
    };

    it('bounds the chart candidate search with a cancelling timeout', async () => {
        tracker.on.select(/union all/i).response([]);

        await model.findChartSimilarityCandidates({
            ...scope,
            chart: {
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_month'],
                    metrics: ['orders_revenue'],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                },
            },
        });

        expectEveryQueryCancelsOnTimeout(1);
    });

    it('bounds the name lookup for every source with a cancelling timeout', async () => {
        tracker.on.select(/ilike/i).response([]);

        await model.findSimilarByName({
            ...scope,
            contentType: ContentReviewContentType.CHART,
            name: 'Revenue',
            limit: 5,
        });

        expectEveryQueryCancelsOnTimeout(2);
    });
});
