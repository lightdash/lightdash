import { SEED_PROJECT } from '@lightdash/common';
import { Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { chartMock, dashboardMock } from '../helpers/mocks';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const apiUrl = '/api/v1';

type PinnableItem = { uuid: string; pinnedListUuid: string | null };

function findByUuid(results: PinnableItem[], uuid: string) {
    return results.find((r) => r.uuid === uuid);
}

describe('Lightdash pinning endpoints', () => {
    let admin: Awaited<ReturnType<typeof login>>;
    const tracker = new TestResourceTracker();
    let testChartUuid: string;
    let testDashboardUuid: string;

    beforeAll(async () => {
        admin = await login();
        const projectUuid = SEED_PROJECT.project_uuid;

        // Create a dedicated space for this test file
        const spaceResp = await admin.post<Body<{ uuid: string }>>(
            `${apiUrl}/projects/${projectUuid}/spaces`,
            { name: uniqueName('pinning-test-space'), isPrivate: false },
        );
        const spaceUuid = spaceResp.body.results.uuid;
        tracker.trackSpace(spaceUuid);

        // Create a dedicated chart
        const chartResp = await admin.post<Body<{ uuid: string }>>(
            `${apiUrl}/projects/${projectUuid}/saved`,
            {
                ...chartMock,
                name: uniqueName('pinning-test-chart'),
                spaceUuid,
                dashboardUuid: null,
            },
        );
        testChartUuid = chartResp.body.results.uuid;
        tracker.trackChart(testChartUuid);

        // Create a dedicated dashboard
        const dashResp = await admin.post<Body<{ uuid: string }>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
            {
                ...dashboardMock,
                name: uniqueName('pinning-test-dashboard'),
                spaceUuid,
            },
        );
        testDashboardUuid = dashResp.body.results.uuid;
        tracker.trackDashboard(testDashboardUuid);
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
    });

    it('Should pin/unpin chart', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // Verify chart starts unpinned
        const res0 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const initialChart = findByUuid(res0.body.results, testChartUuid);
        expect(initialChart).toBeDefined();
        expect(initialChart!.pinnedListUuid).toBe(null);

        // Pin chart
        const pinResp = await admin.patch<Body<PinnableItem>>(
            `${apiUrl}/saved/${testChartUuid}/pinning`,
        );
        const res1 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const pinnedChart = findByUuid(res1.body.results, testChartUuid);
        expect(pinnedChart?.pinnedListUuid).toBe(
            pinResp.body.results.pinnedListUuid,
        );

        // Unpin chart
        await admin.patch(`${apiUrl}/saved/${testChartUuid}/pinning`);
        const res2 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const unpinnedChart = findByUuid(res2.body.results, testChartUuid);
        expect(unpinnedChart?.pinnedListUuid).toBe(null);
    });

    it('Should pin/unpin dashboard', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // Verify dashboard starts unpinned
        const res0 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        const initialDash = findByUuid(res0.body.results, testDashboardUuid);
        expect(initialDash).toBeDefined();
        expect(initialDash!.pinnedListUuid).toBe(null);

        // Pin dashboard
        const pinResp = await admin.patch<Body<PinnableItem>>(
            `${apiUrl}/dashboards/${testDashboardUuid}/pinning`,
        );
        const res1 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        const pinnedDash = findByUuid(res1.body.results, testDashboardUuid);
        expect(pinnedDash?.pinnedListUuid).toBe(
            pinResp.body.results.pinnedListUuid,
        );

        // Unpin dashboard
        await admin.patch(`${apiUrl}/dashboards/${testDashboardUuid}/pinning`);
        const res2 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        const unpinnedDash = findByUuid(res2.body.results, testDashboardUuid);
        expect(unpinnedDash?.pinnedListUuid).toBe(null);
    });
});
