import {
    type Account,
    type CreateSavedChart,
    type DashboardDAO,
} from '@lightdash/common';
import { SavedChartService } from './SavedChartService';

const writeActor = { userUuid: 'write-actor-uuid' };

const buildEmbedAccount = (writeSpaceUuids: string[]) =>
    ({
        isJwtUser: () => true,
        embedWriteUser: writeActor,
        authentication: {
            type: 'jwt',
            data: {
                content: { type: 'dashboard' },
                writeActions: {
                    userUuid: writeActor.userUuid,
                    writeSpaceUuids,
                },
            },
        },
    }) as unknown as Account;

const getCreateSavedChartContext = (
    SavedChartService as unknown as {
        getCreateSavedChartContext: (
            account: Account,
            savedChart: CreateSavedChart,
            requestedDashboard: DashboardDAO | null,
        ) => { savedChart: CreateSavedChart; dashboard: DashboardDAO | null };
    }
).getCreateSavedChartContext.bind(SavedChartService);

const chart = (spaceUuid: string | undefined) =>
    ({ name: 'chart', spaceUuid }) as unknown as CreateSavedChart;

const dashboardChart = (dashboardUuid: string) =>
    ({ name: 'chart', dashboardUuid }) as unknown as CreateSavedChart;

const dashboardIn = (spaceUuid: string) =>
    ({ uuid: 'dashboard-uuid', spaceUuid }) as unknown as DashboardDAO;

describe('SavedChartService embed write spaces', () => {
    const account = buildEmbedAccount(['default-space', 'second-space']);

    test('saves into the requested write space', () => {
        expect(
            getCreateSavedChartContext(account, chart('second-space'), null)
                .savedChart.spaceUuid,
        ).toBe('second-space');
    });

    test.each([
        ['a space outside the write spaces', 'other-space'],
        ['no space', undefined],
    ])('falls back to the default write space for %s', (_label, spaceUuid) => {
        expect(
            getCreateSavedChartContext(account, chart(spaceUuid), null)
                .savedChart.spaceUuid,
        ).toBe('default-space');
    });

    test('saves into a dashboard that lives in a write space', () => {
        const dashboard = dashboardIn('second-space');
        const context = getCreateSavedChartContext(
            account,
            dashboardChart(dashboard.uuid),
            dashboard,
        );
        expect(context.savedChart.dashboardUuid).toBe(dashboard.uuid);
        expect(context.dashboard).toBe(dashboard);
    });

    test('saves into the default write space for a dashboard outside the write spaces', () => {
        const dashboard = dashboardIn('other-space');
        const context = getCreateSavedChartContext(
            account,
            dashboardChart(dashboard.uuid),
            dashboard,
        );
        expect(context.savedChart.dashboardUuid).toBeUndefined();
        expect(context.savedChart.spaceUuid).toBe('default-space');
        expect(context.dashboard).toBeNull();
    });
});
