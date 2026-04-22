import {
    CatalogField,
    KnexPaginatedData,
    SEED_PROJECT,
} from '@lightdash/common';
import { ApiClient, Body } from '../../helpers/api-client';
import { login } from '../../helpers/auth';

const projectUuid = SEED_PROJECT.project_uuid;
const v2Url = `/api/v2/projects/${projectUuid}/dataCatalog/metrics-with-time-dimensions`;

type PaginatedMetrics = Body<KnexPaginatedData<CatalogField[]>>;

/**
 * Fetch paginated metrics, retrying while the catalog is still being
 * indexed. The seed project's catalog is re-indexed on compile and can
 * briefly return empty results while that completes, so tests that assert
 * > 0 matches need a short polling window to avoid flaking on CI.
 */
async function fetchMetricsWithRetry(
    admin: ApiClient,
    query: string,
): Promise<PaginatedMetrics> {
    return vi.waitFor<PaginatedMetrics>(
        async () => {
            const resp = await admin.get<PaginatedMetrics>(`${v2Url}${query}`);
            expect(resp.status).toBe(200);
            expect(
                resp.body.results.pagination!.totalResults,
            ).toBeGreaterThan(0);
            return resp.body;
        },
        { timeout: 30_000, interval: 2_000 },
    );
}

describe('v2 metrics with time dimensions', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('should filter by dbt tags', async () => {
        const allResp = await admin.get<PaginatedMetrics>(
            `${v2Url}?page=1&pageSize=1`,
        );
        const totalWithoutFilter =
            allResp.body.results.pagination!.totalResults;

        const body = await fetchMetricsWithRetry(
            admin,
            `?page=1&pageSize=50&tags=core`,
        );
        expect(body.results.pagination!.totalResults).toBeLessThan(
            totalWithoutFilter,
        );

        body.results.data.forEach((metric) => {
            expect(metric.tags).toContain('core');
        });
    });

    it('should filter by multiple dbt tags (OR)', async () => {
        const body = await fetchMetricsWithRetry(
            admin,
            `?page=1&pageSize=50&tags=core&tags=ai`,
        );

        body.results.data.forEach((metric) => {
            const hasCore = metric.tags!.includes('core');
            const hasAi = metric.tags!.includes('ai');
            expect(hasCore || hasAi).toBe(true);
        });
    });

    it('should filter by spotlight categories', async () => {
        const body = await fetchMetricsWithRetry(
            admin,
            `?page=1&pageSize=100&categories=sales`,
        );
        body.results.data.forEach((metric) => {
            const refs = metric.categories.map((c) => c.yamlReference);
            expect(refs).toContain('sales');
        });
    });

    it('should filter by multiple spotlight categories (OR)', async () => {
        const body = await fetchMetricsWithRetry(
            admin,
            `?page=1&pageSize=100&categories=sales&categories=revenue_growth`,
        );

        body.results.data.forEach((metric) => {
            const refs = metric.categories.map((c) => c.yamlReference);
            const hasSales = refs.includes('sales');
            const hasRevenueGrowth = refs.includes('revenue_growth');
            expect(hasSales || hasRevenueGrowth).toBe(true);
        });
    });

    it('should return empty results for non-existent category', async () => {
        const resp = await admin.get<PaginatedMetrics>(
            `${v2Url}?page=1&pageSize=50&categories=nonexistent`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.data).toHaveLength(0);
        expect(resp.body.results.pagination!.totalResults).toBe(0);
    });
});
