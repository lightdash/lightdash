import { DimensionType } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { PreAggregateMaterializationsTableName } from '../database/entities/preAggregates';
import { PreAggregateModel } from './PreAggregateModel';

describe('PreAggregateModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new PreAggregateModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('gets active materialization without joining query_history', async () => {
        tracker.on.select(PreAggregateMaterializationsTableName).responseOnce([
            {
                pre_aggregate_materialization_uuid: 'mat-1',
                query_uuid: 'query-1',
                materialization_uri: 's3://preagg-bucket/materialization.jsonl',
                columns: {
                    orders_total: {
                        reference: 'orders.total',
                        type: DimensionType.NUMBER,
                    },
                },
                materialized_at: new Date('2024-02-01T00:00:00.000Z'),
            },
        ]);

        const result = await model.getActiveMaterialization(
            'project-1',
            '__preagg__orders__daily',
        );

        expect(result).toEqual({
            materializationUuid: 'mat-1',
            queryUuid: 'query-1',
            materializationUri: 's3://preagg-bucket/materialization.jsonl',
            format: 'jsonl',
            columns: {
                orders_total: {
                    reference: 'orders.total',
                    type: DimensionType.NUMBER,
                },
            },
            materializedAt: new Date('2024-02-01T00:00:00.000Z'),
        });
        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.select[0].sql).not.toContain('query_history');
    });

    test('ignores active rows without a persisted materialization uri', async () => {
        tracker.on.select(PreAggregateMaterializationsTableName).responseOnce([
            {
                pre_aggregate_materialization_uuid: 'mat-1',
                query_uuid: 'query-1',
                materialization_uri: null,
                columns: null,
                materialized_at: new Date('2024-02-01T00:00:00.000Z'),
            },
        ]);

        const result = await model.getActiveMaterialization(
            'project-1',
            '__preagg__orders__daily',
        );

        expect(result).toBeUndefined();
    });
});
