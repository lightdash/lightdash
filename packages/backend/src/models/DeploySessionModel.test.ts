import { SupportedDbtAdapter, type Explore } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME } from '../database/entities/deploySessions';
import { DeploySessionModel } from './DeploySessionModel';

const explore = (name: string): Explore => ({
    name,
    label: name,
    tags: [],
    tables: {},
    baseTable: name,
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
});

describe('DeploySessionModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new DeploySessionModel(database);
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('treats legacy array batches as incomplete', async () => {
        tracker.on
            .select(({ sql }) =>
                sql.includes(DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME),
            )
            .response([{ explores: [explore('orders')] }]);

        await expect(model.getDeployData('session-uuid')).resolves.toEqual({
            explores: [explore('orders')],
            complete: false,
        });
    });

    test('reports complete only when every batch asserts completeness', async () => {
        tracker.on
            .select(({ sql }) =>
                sql.includes(DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME),
            )
            .response([
                {
                    explores: {
                        explores: [explore('orders')],
                        complete: true,
                    },
                },
                {
                    explores: {
                        explores: [explore('customers')],
                        complete: true,
                    },
                },
            ]);

        await expect(model.getDeployData('session-uuid')).resolves.toEqual({
            explores: [explore('orders'), explore('customers')],
            complete: true,
        });

        tracker.reset();
        tracker.on
            .select(({ sql }) =>
                sql.includes(DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME),
            )
            .response([
                {
                    explores: {
                        explores: [explore('orders')],
                        complete: true,
                    },
                },
                {
                    explores: {
                        explores: [explore('customers')],
                        complete: false,
                    },
                },
            ]);

        await expect(model.getDeployData('session-uuid')).resolves.toEqual({
            explores: [explore('orders'), explore('customers')],
            complete: false,
        });
    });

    test('treats a deploy with no batches as incomplete', async () => {
        tracker.on
            .select(({ sql }) =>
                sql.includes(DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME),
            )
            .response([]);

        await expect(model.getDeployData('session-uuid')).resolves.toEqual({
            explores: [],
            complete: false,
        });
    });
});
