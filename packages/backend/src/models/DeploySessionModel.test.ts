import {
    attachNativeMaterializationDocument,
    getNativeMaterializationDocument,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME,
    DEPLOY_SESSIONS_TABLE_NAME,
} from '../database/entities/deploySessions';
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

    test('restores the matching native document for each explore across staged batches', async () => {
        const materialized = { name: 'orders', content: '{"name":"orders"}' };
        const live = { name: 'inventory', content: null };
        tracker.on.select(DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME).response([
            {
                explores: {
                    explores: [explore('orders')],
                    nativeModelDocuments: [materialized],
                    complete: true,
                },
            },
            {
                explores: {
                    explores: [explore('inventory')],
                    nativeModelDocuments: [live],
                    complete: true,
                },
            },
        ]);
        const data = await model.getDeployData('session-uuid');
        expect(data.explores.map(getNativeMaterializationDocument)).toEqual([
            materialized,
            live,
        ]);
        expect(data.explores).toEqual([
            explore('orders'),
            explore('inventory'),
        ]);
    });

    test('stages the document alongside the compiled explore', async () => {
        const orders = explore('orders');
        const document = { name: 'orders', content: '{"name":"orders"}' };
        attachNativeMaterializationDocument(orders, document);
        tracker.on
            .insert(DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME)
            .response([]);
        tracker.on.update(DEPLOY_SESSIONS_TABLE_NAME).response(1);
        await model.addBatch('session-uuid', 'project-uuid', [orders], 0, true);
        expect(tracker.history.insert[0].bindings).toContain(
            JSON.stringify({
                explores: [orders],
                nativeModelDocuments: [document],
                complete: true,
            }),
        );
        expect(JSON.stringify(orders)).not.toContain('content');
    });
});
