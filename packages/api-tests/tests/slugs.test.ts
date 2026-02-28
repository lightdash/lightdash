import { Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v1';

type DashboardResult = {
    name: string;
    slug: string;
    uuid: string;
    tiles: unknown[];
    filters: unknown;
};
type ChartResult = {
    name: string;
    slug: string;
    uuid: string;
    metricQuery: unknown;
    chartConfig: unknown;
};

describe('Slug-based API endpoints', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    describe('Dashboard API with slugs', () => {
        it('Should get dashboard by slug', async () => {
            const slug = 'jaffle-dashboard';
            const response = await admin.get<Body<DashboardResult>>(
                `${apiUrl}/dashboards/${slug}`,
            );
            expect(response.status).toBe(200);
            expect(response.body.status).toBe('ok');
            expect(response.body.results.name).toBe('Jaffle dashboard');
            expect(response.body.results.slug).toBe(slug);
            expect(response.body.results).toHaveProperty('uuid');
            expect(response.body.results).toHaveProperty('tiles');
            expect(response.body.results).toHaveProperty('filters');
            expect(response.body.results.tiles).toBeInstanceOf(Array);
        });

        it('Should get dashboard by UUID for backward compatibility', async () => {
            const slug = 'jaffle-dashboard';
            const response = await admin.get<Body<DashboardResult>>(
                `${apiUrl}/dashboards/${slug}`,
            );
            const dashboardUuid = response.body.results.uuid;

            const uuidResponse = await admin.get<Body<DashboardResult>>(
                `${apiUrl}/dashboards/${dashboardUuid}`,
            );
            expect(uuidResponse.status).toBe(200);
            expect(uuidResponse.body.results.uuid).toBe(dashboardUuid);
            expect(uuidResponse.body.results.slug).toBe(slug);
            expect(uuidResponse.body.results.name).toBe('Jaffle dashboard');
        });

        it('Should return 404 for non-existent dashboard slug', async () => {
            const response = await admin.get<{
                status: string;
                error: { message: string };
            }>(`${apiUrl}/dashboards/non-existent-dashboard-slug`, {
                failOnStatusCode: false,
            });
            expect(response.status).toBe(404);
            expect(response.body.status).toBe('error');
        });
    });

    describe('Chart API with slugs', () => {
        it('Should get chart by slug', async () => {
            const slug = 'how-much-revenue-do-we-have-per-payment-method';
            const response = await admin.get<Body<ChartResult>>(
                `${apiUrl}/saved/${slug}`,
            );
            expect(response.status).toBe(200);
            expect(response.body.status).toBe('ok');
            expect(response.body.results.name).toBe(
                'How much revenue do we have per payment method?',
            );
            expect(response.body.results.slug).toBe(slug);
            expect(response.body.results).toHaveProperty('uuid');
            expect(response.body.results).toHaveProperty('metricQuery');
            expect(response.body.results).toHaveProperty('chartConfig');
        });

        it('Should get chart by UUID for backward compatibility', async () => {
            const slug = 'how-much-revenue-do-we-have-per-payment-method';
            const response = await admin.get<Body<ChartResult>>(
                `${apiUrl}/saved/${slug}`,
            );
            const chartUuid = response.body.results.uuid;

            const uuidResponse = await admin.get<Body<ChartResult>>(
                `${apiUrl}/saved/${chartUuid}`,
            );
            expect(uuidResponse.status).toBe(200);
            expect(uuidResponse.body.results.uuid).toBe(chartUuid);
            expect(uuidResponse.body.results.slug).toBe(slug);
        });

        it('Should return 404 for non-existent chart slug', async () => {
            const response = await admin.get<{
                status: string;
                error: { message: string };
            }>(`${apiUrl}/saved/non-existent-chart-slug`, {
                failOnStatusCode: false,
            });
            expect(response.status).toBe(404);
            expect(response.body.status).toBe('error');
        });

        it('Should get chart available filters using slug-derived UUID', async () => {
            const slug = 'how-much-revenue-do-we-have-per-payment-method';
            const response = await admin.get<Body<ChartResult>>(
                `${apiUrl}/saved/${slug}`,
            );
            const chartUuid = response.body.results.uuid;

            const filtersResponse = await admin.get<Body<unknown[]>>(
                `${apiUrl}/saved/${chartUuid}/availableFilters`,
            );
            expect(filtersResponse.status).toBe(200);
            expect(filtersResponse.body.status).toBe('ok');
            expect(filtersResponse.body.results.length).toBeGreaterThan(0);
        });
    });

    describe('Slug and UUID interchangeability', () => {
        it('Should work with both slug and UUID for dashboards in same session', async () => {
            const slug = 'jaffle-dashboard';
            const slugResponse = await admin.get<Body<DashboardResult>>(
                `${apiUrl}/dashboards/${slug}`,
            );
            const { uuid } = slugResponse.body.results;

            const uuidResponse = await admin.get<Body<DashboardResult>>(
                `${apiUrl}/dashboards/${uuid}`,
            );
            expect(slugResponse.body.results.name).toBe(
                uuidResponse.body.results.name,
            );
        });

        it('Should work with both slug and UUID for charts in same session', async () => {
            const slug = 'how-much-revenue-do-we-have-per-payment-method';
            const slugResponse = await admin.get<Body<ChartResult>>(
                `${apiUrl}/saved/${slug}`,
            );
            const { uuid } = slugResponse.body.results;

            const uuidResponse = await admin.get<Body<ChartResult>>(
                `${apiUrl}/saved/${uuid}`,
            );
            expect(slugResponse.body.results).toEqual(
                uuidResponse.body.results,
            );
        });
    });
});
