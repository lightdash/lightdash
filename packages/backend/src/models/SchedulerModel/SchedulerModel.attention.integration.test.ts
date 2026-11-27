import {
    SchedulerFormat,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { DashboardsTableName } from '../../database/entities/dashboards';
import { SchedulerTableName } from '../../database/entities/scheduler';
import { SchedulerModel } from './index';

describe('SchedulerModel automatically disabled deliveries', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: SchedulerModel;
    let dashboardUuid: string;

    beforeAll(async () => {
        if (!process.env.PGDATABASE && !process.env.PGCONNECTIONURI) {
            throw new Error('Set a seeded PostgreSQL database for this test');
        }
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
            pool: { min: 0, max: 1 },
        });
        const dashboard = await database(DashboardsTableName)
            .where({
                project_uuid: SEED_PROJECT.project_uuid,
                slug: 'jaffle-dashboard',
            })
            .first('dashboard_uuid');
        if (!dashboard) throw new Error('Seeded Jaffle dashboard is missing');
        dashboardUuid = dashboard.dashboard_uuid;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new SchedulerModel({ database: transaction });
    });

    afterEach(async () => {
        await transaction?.rollback();
    });

    afterAll(async () => {
        await database?.destroy();
    });

    const createScheduler = (name: string) =>
        model.createScheduler({
            name: `Attention fixture ${name}`,
            dashboardUuid,
            savedChartUuid: null,
            savedSqlUuid: null,
            appUuid: null,
            appName: null,
            createdBy: SEED_ORG_1_ADMIN.user_uuid,
            format: SchedulerFormat.IMAGE,
            cron: '0 9 * * *',
            options: {},
            enabled: true,
            includeLinks: true,
            targets: [],
        });

    const getPage = (page: number) =>
        model.getSchedulers({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            searchQuery: 'Attention fixture',
            filters: { needsAttention: true },
            paginateArgs: { page, pageSize: 1 },
        });

    it('filters before paginating and preserves the first automatic disable reason', async () => {
        await createScheduler('active');
        const paused = await createScheduler('manually paused');
        const first = await createScheduler('report A');
        const second = await createScheduler('report B');
        const missingRecipients =
            'The delivery has no recipients or destinations.';
        const disconnected = 'The Slack workspace is disconnected.';

        await model.setSchedulerEnabled(paused.schedulerUuid, false);
        await model.setSchedulerEnabled(
            paused.schedulerUuid,
            false,
            disconnected,
        );
        await model.setSchedulerEnabled(
            first.schedulerUuid,
            false,
            missingRecipients,
        );
        await model.setSchedulerEnabled(
            first.schedulerUuid,
            false,
            disconnected,
        );
        await model.setSchedulerEnabled(
            second.schedulerUuid,
            false,
            disconnected,
        );

        const firstPage = await getPage(1);
        expect(firstPage.pagination).toMatchObject({
            totalResults: 2,
            totalPageCount: 2,
        });
        expect(firstPage.data).toMatchObject([
            {
                schedulerUuid: first.schedulerUuid,
                enabled: false,
                automaticallyDisabledReason: missingRecipients,
            },
        ]);
        expect((await getPage(2)).data).toMatchObject([
            {
                schedulerUuid: second.schedulerUuid,
                automaticallyDisabledReason: disconnected,
            },
        ]);
    });

    it('clears the reason on manual re-enable', async () => {
        const { schedulerUuid } = await createScheduler('restored');
        await model.setSchedulerEnabled(
            schedulerUuid,
            false,
            'The Slack workspace is disconnected.',
        );
        await model.setSchedulerEnabled(schedulerUuid, true);

        const row = await transaction(SchedulerTableName)
            .where('scheduler_uuid', schedulerUuid)
            .first('enabled', 'automatically_disabled_reason');
        expect(row).toEqual({
            enabled: true,
            automatically_disabled_reason: null,
        });
        expect((await getPage(1)).data).toEqual([]);
    });
});
