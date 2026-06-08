import {
    ChartSourceType,
    ChartType,
    ContentType,
    SavedChart,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { chartMock } from '../helpers/mocks';
import { uniqueName } from '../helpers/test-isolation';

const apiUrl = '/api/v1';
const apiV2Url = '/api/v2';
const projectUuid = SEED_PROJECT.project_uuid;

const chartPayload = (name: string, limit = 500) => ({
    ...chartMock,
    name,
    description: 'Chart for saved chart get API behavior tests',
    metricQuery: { ...chartMock.metricQuery, limit },
    tableConfig: {
        columnOrder: ['orders_status', 'orders_average_order_size'],
    },
});

type ChartHistory = {
    history: { versionUuid: string; createdAt: string }[];
};

const oldestVersionUuid = (history: ChartHistory['history']) =>
    [...history].sort(
        (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )[0].versionUuid;

async function waitForV1JobCompletion(
    client: Awaited<ReturnType<typeof login>>,
    jobUuid: string,
    maxRetries = 60,
): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        const resp = await client.get<Body<{ jobStatus: string }>>(
            `/api/v1/jobs/${jobUuid}`,
        );
        const { jobStatus } = resp.body.results;
        if (jobStatus === 'ERROR') {
            return false;
        }
        if (jobStatus === 'DONE') {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
}

async function createAndRefreshProject(
    client: Awaited<ReturnType<typeof login>>,
    name: string,
): Promise<string> {
    const sourceProjectResp = await client.get<
        Body<{
            dbtConnection: Record<string, unknown>;
            dbtVersion: string;
            warehouseConnection?: Record<string, unknown>;
        }>
    >(`/api/v1/projects/${projectUuid}`);
    expect(sourceProjectResp.status).toBe(200);
    const sourceWarehouse = sourceProjectResp.body.results
        .warehouseConnection as Record<string, unknown> | undefined;

    const projectResp = await client.post<
        Body<{ project: { projectUuid: string } }>
    >('/api/v1/org/projects', {
        name,
        type: 'DEFAULT',
        dbtConnection: sourceProjectResp.body.results.dbtConnection,
        dbtVersion: sourceProjectResp.body.results.dbtVersion,
        warehouseConnection: {
            type: 'postgres',
            host: sourceWarehouse?.host || 'localhost',
            port: sourceWarehouse?.port || 5432,
            dbname: sourceWarehouse?.dbname || 'postgres',
            schema: sourceWarehouse?.schema || 'jaffle',
            sslmode: sourceWarehouse?.sslmode || 'disable',
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || 'password',
        },
    });
    expect(projectResp.status).toBe(200);
    const secondProjectUuid = projectResp.body.results.project.projectUuid;

    const refreshResp = await client.post<Body<{ jobUuid: string }>>(
        `/api/v1/projects/${secondProjectUuid}/refresh`,
    );
    expect(refreshResp.status).toBe(200);

    const compiled = await waitForV1JobCompletion(
        client,
        refreshResp.body.results.jobUuid,
    );
    expect(compiled).toBe(true);

    return secondProjectUuid;
}

describe('Saved chart get API behavior', () => {
    const spaceName = uniqueName('Chart get behavior space');
    const mainChartName = uniqueName('Chart get behavior main');
    const dashboardName = uniqueName('Chart get behavior dashboard');
    const uuidShapedName = randomUUID();

    let admin: Awaited<ReturnType<typeof login>>;
    let testSpaceUuid: string;
    let mainChart: SavedChart;
    let uuidShapedSlugChart: SavedChart;
    let versionedChart: SavedChart;
    let dashboardChart: SavedChart;
    let dashboardUuid: string;
    const createdChartUuids: string[] = [];

    const createChart = async (
        body: Record<string, unknown>,
    ): Promise<SavedChart> => {
        const resp = await admin.post<Body<SavedChart>>(
            `${apiUrl}/projects/${projectUuid}/saved`,
            body,
        );
        expect(resp.status).toBe(200);
        createdChartUuids.push(resp.body.results.uuid);
        return resp.body.results;
    };

    beforeAll(async () => {
        admin = await login();

        const spaceResp = await admin.post<Body<{ uuid: string }>>(
            `${apiUrl}/projects/${projectUuid}/spaces/`,
            { name: spaceName },
        );
        expect(spaceResp.status).toBe(200);
        testSpaceUuid = spaceResp.body.results.uuid;

        mainChart = await createChart({
            ...chartPayload(mainChartName),
            spaceUuid: testSpaceUuid,
        });

        // Slug is generated from the name, so it is uuid-shaped
        uuidShapedSlugChart = await createChart({
            ...chartPayload(uuidShapedName),
            spaceUuid: testSpaceUuid,
        });

        // Chart with 3 versions: limits 500 -> 600 -> 700
        versionedChart = await createChart({
            ...chartPayload('placeholder', 500),
            name: uniqueName('Chart get behavior versions'),
            spaceUuid: testSpaceUuid,
        });
        await admin.post(
            `${apiUrl}/saved/${versionedChart.uuid}/version`,
            chartPayload('', 600),
        );
        await admin.post(
            `${apiUrl}/saved/${versionedChart.uuid}/version`,
            chartPayload('', 700),
        );

        // Chart owned by a dashboard (no space_id of its own)
        const dashboardResp = await admin.post<Body<{ uuid: string }>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
            {
                name: dashboardName,
                tiles: [],
                tabs: [],
                spaceUuid: testSpaceUuid,
            },
        );
        expect(dashboardResp.status).toBe(201);
        dashboardUuid = dashboardResp.body.results.uuid;
        dashboardChart = await createChart({
            ...chartPayload(uniqueName('Chart get behavior in dashboard')),
            dashboardUuid,
            spaceUuid: null,
        });
    });

    afterAll(async () => {
        for (const uuid of createdChartUuids) {
            await admin
                .delete(`${apiUrl}/saved/${uuid}`, { failOnStatusCode: false })
                .catch(() => {});
        }
        await admin
            .delete(`${apiUrl}/dashboards/${dashboardUuid}`, {
                failOnStatusCode: false,
            })
            .catch(() => {});
        await admin
            .delete(
                `${apiUrl}/projects/${projectUuid}/spaces/${testSpaceUuid}`,
                { failOnStatusCode: false },
            )
            .catch(() => {});
    });

    describe('resolution by uuid and slug', () => {
        it('gets a chart by uuid with the full response shape', async () => {
            const resp = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${mainChart.uuid}`,
            );
            expect(resp.status).toBe(200);
            const chart = resp.body.results;
            expect(chart.uuid).toBe(mainChart.uuid);
            expect(chart.name).toBe(mainChartName);
            expect(chart.slug).toBe(mainChart.slug);
            expect(chart.projectUuid).toBe(projectUuid);
            expect(chart.organizationUuid).toBe(SEED_ORG_1.organization_uuid);
            expect(chart.spaceUuid).toBe(testSpaceUuid);
            expect(chart.spaceName).toBe(spaceName);
            expect(chart.dashboardUuid).toBeNull();
            expect(chart.dashboardName).toBeNull();
            expect(chart.pinnedListUuid).toBeNull();
            expect(chart.tableName).toBe('orders');
            expect(chart.metricQuery.dimensions).toEqual(['orders_status']);
            expect(chart.metricQuery.metrics).toEqual([
                'orders_average_order_size',
            ]);
            expect(chart.metricQuery.limit).toBe(500);
            expect(chart.chartConfig.type).toBe(ChartType.TABLE);
            expect(chart.tableConfig.columnOrder).toEqual([
                'orders_status',
                'orders_average_order_size',
            ]);
            expect(chart.updatedByUser?.userUuid).toBe(
                SEED_ORG_1_ADMIN.user_uuid,
            );
            expect(chart).toHaveProperty('colorPalette');
            expect(chart).toHaveProperty('updatedAt');
        });

        it('gets a chart by a uuid-shaped slug', async () => {
            expect(uuidShapedSlugChart.slug).toBe(uuidShapedName);
            const resp = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${uuidShapedName}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(uuidShapedSlugChart.uuid);
            expect(resp.body.results.slug).toBe(uuidShapedName);
        });

        it('resolves a uuid/slug collision to the chart with the latest version', async () => {
            // Naming a chart after another chart's uuid makes its slug
            // collide with that uuid; the most recently updated chart wins
            const chartA = await createChart({
                ...chartPayload(uniqueName('Chart get behavior collision')),
                spaceUuid: testSpaceUuid,
            });
            const chartB = await createChart({
                ...chartPayload(chartA.uuid),
                spaceUuid: testSpaceUuid,
            });
            expect(chartB.slug).toBe(chartA.uuid);

            // B has the latest version
            const respB = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${chartA.uuid}`,
            );
            expect(respB.body.results.uuid).toBe(chartB.uuid);

            // After updating A, A has the latest version
            await admin.post(
                `${apiUrl}/saved/${chartA.uuid}/version`,
                chartPayload('', 600),
            );
            const respA = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${chartA.uuid}`,
            );
            expect(respA.body.results.uuid).toBe(chartA.uuid);
        });

        it('returns 404 for a uuid that does not exist', async () => {
            const resp = await admin.get(`${apiUrl}/saved/${randomUUID()}`, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(404);
        });
    });

    describe('project-scoped resolution', () => {
        it('gets a chart by uuid scoped to the correct project (v2)', async () => {
            const resp = await admin.get<Body<SavedChart>>(
                `${apiV2Url}/projects/${projectUuid}/saved/${mainChart.uuid}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(mainChart.uuid);
        });

        it('gets a chart by slug scoped to the correct project (v2)', async () => {
            const resp = await admin.get<Body<SavedChart>>(
                `${apiV2Url}/projects/${projectUuid}/saved/${mainChart.slug}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(mainChart.uuid);
        });

        it('gets a chart by uuid-shaped slug scoped to the correct project (v2)', async () => {
            const resp = await admin.get<Body<SavedChart>>(
                `${apiV2Url}/projects/${projectUuid}/saved/${uuidShapedName}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(uuidShapedSlugChart.uuid);
        });

        it('gets a chart by uuid with the projectUuid query param (v1)', async () => {
            const resp = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${mainChart.uuid}?projectUuid=${projectUuid}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(mainChart.uuid);
        });

        it('gets a chart by slug with the projectUuid query param (v1)', async () => {
            const resp = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${mainChart.slug}?projectUuid=${projectUuid}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(mainChart.uuid);
        });

        it('gets a chart by uuid-shaped slug with the projectUuid query param (v1)', async () => {
            const resp = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${uuidShapedName}?projectUuid=${projectUuid}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(uuidShapedSlugChart.uuid);
        });

        it('returns 404 for a chart uuid scoped to the wrong project', async () => {
            const resp = await admin.get(
                `${apiV2Url}/projects/${randomUUID()}/saved/${mainChart.uuid}`,
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(404);
        });

        it('returns 404 for a chart slug scoped to the wrong project', async () => {
            const resp = await admin.get(
                `${apiV2Url}/projects/${randomUUID()}/saved/${mainChart.slug}`,
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(404);
        });

        it('prefers a slug match inside the scoped project over a uuid match in another project', async () => {
            const secondProjectName = uniqueName(
                'Chart get behavior second project',
            );
            const secondProjectUuid = await createAndRefreshProject(
                admin,
                secondProjectName,
            );

            try {
                const secondSpaceResp = await admin.post<
                    Body<{ uuid: string }>
                >(`/api/v1/projects/${secondProjectUuid}/spaces/`, {
                    name: uniqueName('Chart get behavior second project space'),
                });
                expect(secondSpaceResp.status).toBe(200);

                const secondProjectChart = await admin.post<Body<SavedChart>>(
                    `/api/v1/projects/${secondProjectUuid}/saved`,
                    {
                        ...chartPayload(mainChart.uuid),
                        spaceUuid: secondSpaceResp.body.results.uuid,
                    },
                );
                expect(secondProjectChart.status).toBe(200);

                const v2Resp = await admin.get<Body<SavedChart>>(
                    `${apiV2Url}/projects/${secondProjectUuid}/saved/${mainChart.uuid}`,
                );
                expect(v2Resp.status).toBe(200);
                expect(v2Resp.body.results.uuid).toBe(
                    secondProjectChart.body.results.uuid,
                );
                expect(v2Resp.body.results.projectUuid).toBe(secondProjectUuid);
                expect(v2Resp.body.results.slug).toBe(mainChart.uuid);

                const v1Resp = await admin.get<Body<SavedChart>>(
                    `${apiUrl}/saved/${mainChart.uuid}?projectUuid=${secondProjectUuid}`,
                );
                expect(v1Resp.status).toBe(200);
                expect(v1Resp.body.results.uuid).toBe(
                    secondProjectChart.body.results.uuid,
                );
                expect(v1Resp.body.results.projectUuid).toBe(secondProjectUuid);
            } finally {
                await admin.delete(
                    `/api/v1/org/projects/${secondProjectUuid}`,
                    {
                        failOnStatusCode: false,
                    },
                );
            }
        });
    });

    describe('unscoped v1 resolution', () => {
        it('prefers the newest matching chart across projects when lookup is unscoped', async () => {
            const secondProjectName = uniqueName(
                'Chart get behavior unscoped second project',
            );
            const secondProjectUuid = await createAndRefreshProject(
                admin,
                secondProjectName,
            );

            try {
                const secondSpaceResp = await admin.post<
                    Body<{ uuid: string }>
                >(`/api/v1/projects/${secondProjectUuid}/spaces/`, {
                    name: uniqueName(
                        'Chart get behavior unscoped second project space',
                    ),
                });
                expect(secondSpaceResp.status).toBe(200);

                const secondProjectChart = await admin.post<Body<SavedChart>>(
                    `/api/v1/projects/${secondProjectUuid}/saved`,
                    {
                        ...chartPayload(mainChart.uuid),
                        spaceUuid: secondSpaceResp.body.results.uuid,
                    },
                );
                expect(secondProjectChart.status).toBe(200);

                const resp = await admin.get<Body<SavedChart>>(
                    `${apiUrl}/saved/${mainChart.uuid}`,
                );
                expect(resp.status).toBe(200);
                expect(resp.body.results.uuid).toBe(
                    secondProjectChart.body.results.uuid,
                );
                expect(resp.body.results.projectUuid).toBe(secondProjectUuid);
                expect(resp.body.results.slug).toBe(mainChart.uuid);
            } finally {
                await admin.delete(
                    `/api/v1/org/projects/${secondProjectUuid}`,
                    {
                        failOnStatusCode: false,
                    },
                );
            }
        });
    });

    describe('version resolution', () => {
        it('returns the latest version of a chart', async () => {
            const resp = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${versionedChart.uuid}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.metricQuery.limit).toBe(700);
            expect(resp.body.results.updatedByUser?.userUuid).toBe(
                SEED_ORG_1_ADMIN.user_uuid,
            );
        });

        it('returns a specific old version, not the latest', async () => {
            const historyResp = await admin.get<Body<ChartHistory>>(
                `${apiUrl}/saved/${versionedChart.uuid}/history`,
            );
            expect(historyResp.status).toBe(200);
            const { history } = historyResp.body.results;
            expect(history).toHaveLength(3);

            const firstVersionUuid = oldestVersionUuid(history);
            const versionResp = await admin.get<Body<{ chart: SavedChart }>>(
                `${apiUrl}/saved/${versionedChart.uuid}/version/${firstVersionUuid}`,
            );
            expect(versionResp.status).toBe(200);
            expect(versionResp.body.results.chart.uuid).toBe(
                versionedChart.uuid,
            );
            expect(versionResp.body.results.chart.metricQuery.limit).toBe(500);
        });

        it('returns 404 for a version uuid that belongs to another chart', async () => {
            const historyResp = await admin.get<Body<ChartHistory>>(
                `${apiUrl}/saved/${mainChart.uuid}/history`,
            );
            const otherChartVersionUuid =
                historyResp.body.results.history[0].versionUuid;
            const resp = await admin.get(
                `${apiUrl}/saved/${versionedChart.uuid}/version/${otherChartVersionUuid}`,
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(404);
        });

        it('rolls back to an old version and returns it as the latest', async () => {
            const historyResp = await admin.get<Body<ChartHistory>>(
                `${apiUrl}/saved/${versionedChart.uuid}/history`,
            );
            const firstVersionUuid = oldestVersionUuid(
                historyResp.body.results.history,
            );
            const rollbackResp = await admin.post(
                `${apiUrl}/saved/${versionedChart.uuid}/rollback/${firstVersionUuid}/`,
            );
            expect(rollbackResp.status).toBe(200);

            const resp = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${versionedChart.uuid}`,
            );
            expect(resp.body.results.metricQuery.limit).toBe(500);
        });
    });

    describe('dashboard-owned charts', () => {
        it('gets a chart that belongs to a dashboard scoped to the project (v2)', async () => {
            const resp = await admin.get<Body<SavedChart>>(
                `${apiV2Url}/projects/${projectUuid}/saved/${dashboardChart.uuid}`,
            );
            expect(resp.status).toBe(200);
            const chart = resp.body.results;
            expect(chart.uuid).toBe(dashboardChart.uuid);
            expect(chart.dashboardUuid).toBe(dashboardUuid);
            expect(chart.dashboardName).toBe(dashboardName);
            expect(chart.spaceUuid).toBe(testSpaceUuid);
        });
    });

    describe('pinned charts', () => {
        it('returns the pinned list uuid for a pinned chart', async () => {
            const pinResp = await admin.patch(
                `${apiUrl}/saved/${versionedChart.uuid}/pinning`,
            );
            expect(pinResp.status).toBe(200);
            const pinned = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${versionedChart.uuid}`,
            );
            expect(pinned.body.results.pinnedListUuid).toBeTypeOf('string');

            // Unpin to leave no project-level state behind
            await admin.patch(`${apiUrl}/saved/${versionedChart.uuid}/pinning`);
            const unpinned = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${versionedChart.uuid}`,
            );
            expect(unpinned.body.results.pinnedListUuid).toBeNull();
        });
    });

    describe('soft-deleted charts', () => {
        it('returns 404 by uuid and slug after the chart is deleted', async () => {
            const chart = await createChart({
                ...chartPayload(uniqueName('Chart get behavior deleted')),
                spaceUuid: testSpaceUuid,
            });
            await admin.delete(`${apiUrl}/saved/${chart.uuid}`);

            const byUuid = await admin.get(`${apiUrl}/saved/${chart.uuid}`, {
                failOnStatusCode: false,
            });
            expect(byUuid.status).toBe(404);

            const bySlug = await admin.get(`${apiUrl}/saved/${chart.slug}`, {
                failOnStatusCode: false,
            });
            expect(bySlug.status).toBe(404);
        });

        it('returns 404 for a deleted chart with a uuid-shaped slug', async () => {
            const deletedUuidShapedName = randomUUID();
            const chart = await createChart({
                ...chartPayload(deletedUuidShapedName),
                spaceUuid: testSpaceUuid,
            });
            await admin.delete(`${apiUrl}/saved/${chart.uuid}`);

            const resp = await admin.get(
                `${apiUrl}/saved/${deletedUuidShapedName}`,
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(404);
        });

        // Skipped when SOFT_DELETE_ENABLED is off (delete is permanent)
        it('finds a deleted chart again after restoring it', async (ctx) => {
            const chart = await createChart({
                ...chartPayload(uniqueName('Chart get behavior restored')),
                spaceUuid: testSpaceUuid,
            });
            await admin.delete(`${apiUrl}/saved/${chart.uuid}`);

            const deleted = await admin.get(`${apiUrl}/saved/${chart.uuid}`, {
                failOnStatusCode: false,
            });
            expect(deleted.status).toBe(404);

            const trashResp = await admin.get<
                Body<{ data: { uuid: string }[] }>
            >(
                `${apiV2Url}/content/deleted?projectUuids=${projectUuid}&contentTypes=chart&pageSize=50`,
            );
            const isInTrash = trashResp.body.results.data.some(
                (item) => item.uuid === chart.uuid,
            );
            if (!isInTrash) {
                ctx.skip();
                return;
            }

            const restoreResp = await admin.post(
                `${apiV2Url}/content/${projectUuid}/restore`,
                {
                    item: {
                        uuid: chart.uuid,
                        contentType: ContentType.CHART,
                        source: ChartSourceType.DBT_EXPLORE,
                    },
                },
            );
            expect(restoreResp.status).toBe(200);

            const byUuid = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${chart.uuid}`,
            );
            expect(byUuid.status).toBe(200);
            expect(byUuid.body.results.uuid).toBe(chart.uuid);

            const bySlug = await admin.get<Body<SavedChart>>(
                `${apiUrl}/saved/${chart.slug}`,
            );
            expect(bySlug.status).toBe(200);
            expect(bySlug.body.results.uuid).toBe(chart.uuid);
        });
    });
});
