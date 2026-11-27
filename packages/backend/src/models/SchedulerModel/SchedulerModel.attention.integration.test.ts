import { SchedulerFormat, SEED_ORG_1 } from '@lightdash/common';
import { type Knex } from 'knex';
import { DashboardsTableName } from '../../database/entities/dashboards';
import { SchedulerTableName } from '../../database/entities/scheduler';
import { getTestContext } from '../../vitest.setup.integration';
import { SchedulerModel } from './index';

describe('SchedulerModel automatically disabled deliveries', () => {
    let transaction: Knex.Transaction;
    let model: SchedulerModel;
    let dashboardUuid: string;

    beforeEach(async () => {
        const { db, testProjectUuid } = getTestContext();
        transaction = await db.transaction();
        model = new SchedulerModel({ database: transaction });
        const dashboard = await transaction(DashboardsTableName)
            .where({ project_uuid: testProjectUuid, slug: 'jaffle-dashboard' })
            .first('dashboard_uuid');
        if (!dashboard) throw new Error('Seeded Jaffle dashboard is missing');
        dashboardUuid = dashboard.dashboard_uuid;
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    const createScheduler = (name: string) =>
        model.createScheduler({
            name: `Attention fixture ${name}`,
            dashboardUuid,
            savedChartUuid: null,
            savedSqlUuid: null,
            appUuid: null,
            appName: null,
            createdBy: getTestContext().testUser.userUuid,
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
            projectUuid: getTestContext().testProjectUuid,
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
