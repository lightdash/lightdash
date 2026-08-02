import { Ability } from '@casl/ability';
import {
    DimensionType,
    FieldType,
    MetricType,
    OrganizationMemberRole,
    TimeFrames,
    type CompiledDimension,
    type ItemsMap,
    type MetricQuery,
    type MetricWithAssociatedTimeDimension,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import type { CatalogService } from '../CatalogService/CatalogService';
import type { ProjectService } from '../ProjectService/ProjectService';
import { MetricsExplorerService } from './MetricsExplorerService';

const PROJECT_UUID = 'project-uuid';
const EXPLORE_NAME = 'orders';
const METRIC_NAME = 'revenue';

const user: SessionUser = {
    userUuid: 'user-uuid',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: 'org-uuid',
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const metric: MetricWithAssociatedTimeDimension = {
    name: METRIC_NAME,
    table: EXPLORE_NAME,
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    label: 'Revenue',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    compiledSql: 'SUM("orders".revenue)',
    tablesReferences: [EXPLORE_NAME],
    hidden: false,
    timeDimension: {
        table: EXPLORE_NAME,
        field: 'created_at',
        interval: TimeFrames.WEEK,
    },
};

// The week-truncated grouping dimension, keyed by getItemId + getFieldIdForDateDimension.
const GROUP_BY_ID = `${EXPLORE_NAME}_created_at_week`;
const METRIC_ID = `${EXPLORE_NAME}_${METRIC_NAME}`;

const groupByDimension: CompiledDimension = {
    name: 'created_at_week',
    table: EXPLORE_NAME,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    label: 'Created at (week)',
    sql: '${TABLE}.created_at',
    compiledSql: 'DATE_TRUNC(\'week\', "orders".created_at)',
    tablesReferences: [EXPLORE_NAME],
    tableLabel: 'Orders',
    hidden: false,
};

const buildService = () => {
    const executeMetricQueryAndGetResults = vi.fn(
        async (_args: { metricQuery: MetricQuery }) => ({
            rows: [
                { [GROUP_BY_ID]: '2026-01-19', [METRIC_ID]: 30 },
                { [GROUP_BY_ID]: '2026-01-05', [METRIC_ID]: 10 },
                { [GROUP_BY_ID]: '2026-01-12', [METRIC_ID]: 20 },
            ],
            fields: { [GROUP_BY_ID]: groupByDimension } as ItemsMap,
            cacheMetadata: {},
            pivotDetails: null,
            displayTimezone: null,
        }),
    );

    const catalogService = {
        getMetric: vi.fn(async () => metric),
    } as unknown as CatalogService;

    const asyncQueryService = {
        executeMetricQueryAndGetResults,
    } as unknown as AsyncQueryService;

    const service = new MetricsExplorerService({
        projectModel: {} as ProjectModel,
        projectService: {} as ProjectService,
        catalogService,
        asyncQueryService,
    });

    return { service, catalogService, executeMetricQueryAndGetResults };
};

describe('MetricsExplorerService.getMetricSeries', () => {
    test('builds an ascending, unbounded-period series query', async () => {
        const { service, executeMetricQueryAndGetResults } = buildService();

        await service.getMetricSeries(
            user,
            PROJECT_UUID,
            EXPLORE_NAME,
            METRIC_NAME,
            TimeFrames.WEEK,
            '2026-01-01',
            '2026-01-31',
        );

        expect(executeMetricQueryAndGetResults).toHaveBeenCalledTimes(1);
        const { metricQuery } =
            executeMetricQueryAndGetResults.mock.calls[0][0];

        expect(metricQuery.dimensions).toEqual([GROUP_BY_ID]);
        expect(metricQuery.metrics).toEqual([METRIC_ID]);
        // Sorted ascending by the time dimension (oldest first).
        expect(metricQuery.sorts).toEqual([
            { fieldId: GROUP_BY_ID, descending: false },
        ]);
        // Series is not capped at 2 rows like the total query.
        expect(metricQuery.limit).toBe(500);
        // Single date range with an `and` filter — no previous-period `or`.
        expect(metricQuery.filters.dimensions).toHaveProperty('and');
        expect(metricQuery.filters.dimensions).not.toHaveProperty('or');
    });

    test('returns points sorted ascending by date', async () => {
        const { service } = buildService();

        const result = await service.getMetricSeries(
            user,
            PROJECT_UUID,
            EXPLORE_NAME,
            METRIC_NAME,
            TimeFrames.WEEK,
            '2026-01-01',
            '2026-01-31',
        );

        expect(result.metric.name).toBe(METRIC_NAME);
        expect(result.points.map((point) => point.metric.value)).toEqual([
            10, 20, 30,
        ]);
        expect(
            result.points.every(
                (point, index) =>
                    index === 0 ||
                    point.dateValue >= result.points[index - 1].dateValue,
            ),
        ).toBe(true);
    });

    test('throws when the metric has no time dimension', async () => {
        const { service, catalogService } = buildService();
        (
            catalogService.getMetric as ReturnType<typeof vi.fn>
        ).mockResolvedValue({ ...metric, timeDimension: undefined });

        await expect(
            service.getMetricSeries(
                user,
                PROJECT_UUID,
                EXPLORE_NAME,
                METRIC_NAME,
                TimeFrames.WEEK,
                '2026-01-01',
                '2026-01-31',
            ),
        ).rejects.toThrow('does not have a valid time dimension');
    });
});
