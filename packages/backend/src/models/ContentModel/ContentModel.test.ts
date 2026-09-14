import { ChartKind, ChartSourceType, ContentType } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import KnexPaginate from '../../database/pagination';
import { ContentModel } from './ContentModel';
import { type SummaryContentRow } from './ContentModelTypes';

const chartUuid = '00000000-0000-0000-0000-000000000001';
const dashboardUuid = '00000000-0000-0000-0000-000000000002';
const sqlChartUuid = '00000000-0000-0000-0000-000000000003';
const lastViewedAt = new Date('2026-09-14T12:30:00.000Z');

const row = (
    overrides: Partial<SummaryContentRow> = {},
): SummaryContentRow => ({
    content_type: ContentType.CHART,
    content_type_rank: 3,
    uuid: chartUuid,
    name: 'Chart',
    description: null,
    slug: 'chart',
    space_uuid: 'space-uuid',
    space_name: 'Space',
    project_uuid: 'project-uuid',
    project_name: 'Project',
    organization_uuid: 'org-uuid',
    organization_name: 'Organization',
    pinned_list_uuid: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    created_by_user_uuid: null,
    created_by_user_first_name: null,
    created_by_user_last_name: null,
    last_updated_at: null,
    last_updated_by_user_uuid: null,
    last_updated_by_user_first_name: null,
    last_updated_by_user_last_name: null,
    views: 0,
    first_viewed_at: null,
    last_viewed_at: null,
    deleted_at: null,
    deleted_by_user_uuid: null,
    deleted_by_user_first_name: null,
    deleted_by_user_last_name: null,
    verified_at: null,
    verified_by_user_uuid: null,
    verified_by_user_first_name: null,
    verified_by_user_last_name: null,
    owner_user_uuid: null,
    owner_user_first_name: null,
    owner_user_last_name: null,
    owner_user_email: null,
    metadata: {
        source: ChartSourceType.DBT_EXPLORE,
        chart_kind: ChartKind.VERTICAL_BAR,
        dashboard_uuid: null,
        dashboard_name: null,
    },
    ...overrides,
});

describe('ContentModel lastViewedAt', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ContentModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        vi.restoreAllMocks();
    });

    const paginate = (data: SummaryContentRow[]) =>
        vi.spyOn(KnexPaginate, 'paginate').mockResolvedValue({
            data,
            pagination: {
                page: 2,
                pageSize: 3,
                totalResults: 100,
                totalPageCount: 34,
            },
        });

    it('enriches only the returned page and keeps SQL chart timestamps', async () => {
        const pagination = paginate([
            row(),
            row({ uuid: dashboardUuid, content_type: ContentType.DASHBOARD }),
            row({
                uuid: sqlChartUuid,
                metadata: {
                    source: ChartSourceType.SQL,
                    chart_kind: ChartKind.VERTICAL_BAR,
                },
                last_viewed_at: lastViewedAt,
            }),
        ]);
        tracker.on.any(/FROM "analytics_chart_views"/).response({
            rows: [{ uuid: chartUuid, last_viewed_at: lastViewedAt }],
        });
        tracker.on.any(/FROM "analytics_dashboard_views"/).response({
            rows: [{ uuid: dashboardUuid, last_viewed_at: lastViewedAt }],
        });

        const result = await model.findSummaryContents(
            {},
            {},
            { page: 2, pageSize: 3 },
        );

        expect(result.data.map((content) => content.lastViewedAt)).toEqual([
            lastViewedAt,
            lastViewedAt,
            lastViewedAt,
        ]);
        expect(result.pagination?.totalResults).toBe(100);
        expect(tracker.history.all).toHaveLength(2);
        expect(tracker.history.all.map((query) => query.bindings)).toEqual(
            expect.arrayContaining([[[chartUuid]], [[dashboardUuid]]]),
        );
        for (const query of tracker.history.all) {
            expect(query.sql).toContain('ORDER BY timestamp DESC LIMIT 1');
            expect(query.sql).toContain('unnest($1::uuid[])');
            expect(query.sql).not.toContain('MAX(');
        }
        const contentQuery = pagination.mock.calls[0][0].toSQL().sql;
        expect(contentQuery).not.toContain('analytics_chart_views');
        expect(contentQuery).not.toContain('analytics_dashboard_views');
        expect(pagination).toHaveBeenCalledWith(expect.anything(), {
            page: 2,
            pageSize: 3,
        });
    });

    it('returns null for never-viewed content and skips irrelevant analytics', async () => {
        paginate([
            row(),
            row({ content_type: ContentType.DASHBOARD, uuid: dashboardUuid }),
            row({
                content_type: ContentType.SPACE,
                uuid: 'space-uuid',
                metadata: {},
            }),
            row({
                content_type: ContentType.DATA_APP,
                uuid: 'app-uuid',
                metadata: {},
            }),
        ]);
        tracker.on.any(/FROM "analytics_.*_views"/).response({ rows: [] });
        const result = await model.findSummaryContents(
            { uuids: [chartUuid, dashboardUuid, 'space-uuid', 'app-uuid'] },
            {},
        );
        expect(result.data.map((content) => content.lastViewedAt)).toEqual([
            null,
            null,
            null,
            null,
        ]);
        expect(tracker.history.all).toHaveLength(2);
    });

    it('does not query analytics for a SQL-only page', async () => {
        paginate([
            row({
                uuid: sqlChartUuid,
                metadata: {
                    source: ChartSourceType.SQL,
                    chart_kind: ChartKind.VERTICAL_BAR,
                },
                last_viewed_at: lastViewedAt,
            }),
        ]);
        const result = await model.findSummaryContents(
            { chart: { sources: [ChartSourceType.SQL] } },
            {},
        );
        expect(result.data[0].lastViewedAt).toEqual(lastViewedAt);
        expect(tracker.history.all).toHaveLength(0);
    });

    it('does not query analytics for an empty page', async () => {
        paginate([]);
        expect((await model.findSummaryContents({}, {})).data).toEqual([]);
        expect(tracker.history.all).toHaveLength(0);
    });

    it('does not add recency queries to recently deleted content', async () => {
        paginate([row()]);
        const result = await model.findDeletedContents({
            contentTypes: [ContentType.CHART],
        });
        expect(result.data).toHaveLength(1);
        expect(tracker.history.all).toHaveLength(0);
    });
});
