import { SEED_PROJECT } from '@lightdash/common';
import { Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v1';

type PinnableItem = { uuid: string; pinnedListUuid: string | null };

function findByUuid(results: PinnableItem[], uuid: string) {
    return results.find((r) => r.uuid === uuid);
}

describe('Lightdash pinning endpoints', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should pin/unpin chart', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        // Find a chart that is not currently pinned
        const savedChart = projectResponse.body.results.find(
            (c) => c.pinnedListUuid === null,
        );
        expect(savedChart).toBeDefined();
        expect(savedChart!.pinnedListUuid).toBe(null);

        // Pin Chart
        const pinResp = await admin.patch<Body<PinnableItem>>(
            `${apiUrl}/saved/${savedChart!.uuid}/pinning`,
        );
        const res1 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const pinnedChart = findByUuid(res1.body.results, savedChart!.uuid);
        expect(pinnedChart?.pinnedListUuid).toBe(
            pinResp.body.results.pinnedListUuid,
        );

        // Unpin chart
        await admin.patch(`${apiUrl}/saved/${savedChart!.uuid}/pinning`);
        const res2 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const unpinnedChart = findByUuid(res2.body.results, savedChart!.uuid);
        expect(unpinnedChart?.pinnedListUuid).toBe(null);
    });

    it('Should pin/unpin dashboard', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        const dashboard = projectResponse.body.results[0];

        // Pin dashboard
        const pinResp = await admin.patch<Body<PinnableItem>>(
            `${apiUrl}/dashboards/${dashboard.uuid}/pinning`,
        );
        const res1 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        const pinnedDash = findByUuid(res1.body.results, dashboard.uuid);
        expect(pinnedDash?.pinnedListUuid).toBe(
            pinResp.body.results.pinnedListUuid,
        );

        // Unpin dashboard
        await admin.patch(`${apiUrl}/dashboards/${dashboard.uuid}/pinning`);
        const res2 = await admin.get<Body<PinnableItem[]>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        const unpinnedDash = findByUuid(res2.body.results, dashboard.uuid);
        expect(unpinnedDash?.pinnedListUuid).toBe(null);
    });
});
