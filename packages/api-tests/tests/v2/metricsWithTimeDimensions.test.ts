import {
    CatalogField,
    KnexPaginatedData,
    SEED_PROJECT,
    Tag,
} from '@lightdash/common';
import { ApiClient, Body } from '../../helpers/api-client';
import { login } from '../../helpers/auth';

const projectUuid = SEED_PROJECT.project_uuid;
const v1Url = `/api/v1/projects/${projectUuid}`;
const v2Url = `/api/v2/projects/${projectUuid}/dataCatalog/metrics-with-time-dimensions`;

type PaginatedMetrics = Body<KnexPaginatedData<CatalogField[]>>;
type YamlTag = Pick<Tag, 'name' | 'color'> & { yamlReference: string };

const fixtureYamlTags: YamlTag[] = [
    { name: 'Sales', color: 'green', yamlReference: 'sales' },
    {
        name: 'Revenue Growth',
        color: 'violet',
        yamlReference: 'revenue_growth',
    },
];

describe('v2 metrics with time dimensions', () => {
    let admin: ApiClient;
    let fixtureMetricUuid: string | undefined;
    let originalYamlTags: YamlTag[] = [];
    const addedTagUuids: string[] = [];

    beforeAll(async () => {
        admin = await login();

        const originalTagsResp = await admin.get<Body<Tag[]>>(`${v1Url}/tags`);
        expect(originalTagsResp.status).toBe(200);
        originalYamlTags = originalTagsResp.body.results.flatMap((tag) =>
            tag.yamlReference === null
                ? []
                : [
                      {
                          name: tag.name,
                          color: tag.color,
                          yamlReference: tag.yamlReference,
                      },
                  ],
        );

        const mergedYamlTags = [
            ...originalYamlTags.filter(
                (tag) =>
                    !fixtureYamlTags.some(
                        (fixtureTag) =>
                            fixtureTag.yamlReference === tag.yamlReference,
                    ),
            ),
            ...fixtureYamlTags,
        ];
        const replaceResp = await admin.put(
            `${v1Url}/tags/yaml`,
            mergedYamlTags,
        );
        expect(replaceResp.status).toBe(200);

        const currentTagsResp = await admin.get<Body<Tag[]>>(`${v1Url}/tags`);
        expect(currentTagsResp.status).toBe(200);
        const fixtureTags = fixtureYamlTags.map((fixtureTag) =>
            currentTagsResp.body.results.find(
                (tag) => tag.yamlReference === fixtureTag.yamlReference,
            ),
        );
        if (fixtureTags.some((tag) => tag === undefined)) {
            throw new Error('Failed to create spotlight category fixtures');
        }

        const metricsResp = await admin.get<PaginatedMetrics>(
            `${v2Url}?page=1&pageSize=100`,
        );
        expect(metricsResp.status).toBe(200);
        expect(metricsResp.body.results.data.length).toBeGreaterThan(0);
        const metric =
            metricsResp.body.results.data.find((item) =>
                fixtureYamlTags.every((fixtureTag) =>
                    item.categories.every(
                        (category) =>
                            category.yamlReference !== fixtureTag.yamlReference,
                    ),
                ),
            ) ?? metricsResp.body.results.data[0];
        fixtureMetricUuid = metric.catalogSearchUuid;

        for (const fixtureTag of fixtureTags) {
            if (fixtureTag) {
                const isAlreadyLinked = metric.categories.some(
                    (category) => category.tagUuid === fixtureTag.tagUuid,
                );
                if (!isAlreadyLinked) {
                    const addResp = await admin.post(
                        `${v1Url}/dataCatalog/${fixtureMetricUuid}/categories`,
                        { tagUuid: fixtureTag.tagUuid },
                    );
                    expect(addResp.status).toBe(200);
                    addedTagUuids.push(fixtureTag.tagUuid);
                }
            }
        }
    });

    afterAll(async () => {
        if (!admin) return;
        if (fixtureMetricUuid) {
            for (const tagUuid of addedTagUuids) {
                const removeResp = await admin.delete(
                    `${v1Url}/dataCatalog/${fixtureMetricUuid}/categories/${tagUuid}`,
                );
                expect(removeResp.status).toBe(200);
            }
        }
        const restoreResp = await admin.put(
            `${v1Url}/tags/yaml`,
            originalYamlTags,
        );
        expect(restoreResp.status).toBe(200);
    });

    it('should filter by dbt tags', async () => {
        const allResp = await admin.get<PaginatedMetrics>(
            `${v2Url}?page=1&pageSize=1`,
        );
        const totalWithoutFilter =
            allResp.body.results.pagination!.totalResults;
        expect(allResp.status).toBe(200);
        expect(totalWithoutFilter).toBeGreaterThan(0);

        const resp = await admin.get<PaginatedMetrics>(
            `${v2Url}?page=1&pageSize=50&tags=core`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.pagination!.totalResults).toBeGreaterThan(0);
        expect(resp.body.results.pagination!.totalResults).toBeLessThan(
            totalWithoutFilter,
        );

        resp.body.results.data.forEach((metric) => {
            expect(metric.tags).toContain('core');
        });
    });

    it('should filter by multiple dbt tags (OR)', async () => {
        const resp = await admin.get<PaginatedMetrics>(
            `${v2Url}?page=1&pageSize=50&tags=core&tags=ai`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.pagination!.totalResults).toBeGreaterThan(0);

        resp.body.results.data.forEach((metric) => {
            const hasCore = metric.tags!.includes('core');
            const hasAi = metric.tags!.includes('ai');
            expect(hasCore || hasAi).toBe(true);
        });
    });

    it('should filter by spotlight categories', async () => {
        const resp = await admin.get<PaginatedMetrics>(
            `${v2Url}?page=1&pageSize=100&categories=sales`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.pagination!.totalResults).toBeGreaterThan(0);
        resp.body.results.data.forEach((metric) => {
            const refs = metric.categories.map((c) => c.yamlReference);
            expect(refs).toContain('sales');
        });
    });

    it('should filter by multiple spotlight categories (OR)', async () => {
        const resp = await admin.get<PaginatedMetrics>(
            `${v2Url}?page=1&pageSize=100&categories=sales&categories=revenue_growth`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.pagination!.totalResults).toBeGreaterThan(0);

        resp.body.results.data.forEach((metric) => {
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
