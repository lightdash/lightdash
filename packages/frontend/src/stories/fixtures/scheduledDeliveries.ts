import {
    getSchedulerResourceTypeAndId,
    isEmailTarget,
    isSlackTarget,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerRunStatus,
    type KnexPaginatedData,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { type LightdashApi, type LightdashApiProps } from '../../api';
import mockHealthResponse from '../../testing/__mocks__/api/healthResponse.mock';

export const projectUuid = 'revenue-analytics';
const owners = [
    {
        userUuid: 'nora',
        firstName: 'Nora',
        lastName: 'Chen',
        email: 'nora@example.com',
    },
    {
        userUuid: 'sam',
        firstName: 'Sam',
        lastName: 'Patel',
        email: 'sam@example.com',
    },
];
const createdAt = new Date('2026-03-02T08:00:00Z');
const lastRun = new Date();
lastRun.setHours(8, 0, 0, 0);
if (lastRun.getTime() > Date.now()) lastRun.setDate(lastRun.getDate() - 1);

const chartDelivery = {
    schedulerUuid: 'orders-digest',
    slug: 'orders-digest',
    name: 'Daily orders digest',
    createdAt,
    updatedAt: createdAt,
    createdBy: owners[0].userUuid,
    createdByName: 'Nora Chen',
    projectUuid,
    projectName: 'Revenue analytics',
    savedChartUuid: 'daily-orders',
    savedChartName: 'Orders by day',
    savedSqlUuid: null,
    savedSqlName: null,
    dashboardUuid: null,
    dashboardName: null,
    appUuid: null,
    appName: null,
    cron: '0 8 * * *',
    timezone: 'UTC',
    format: SchedulerFormat.CSV,
    options: { formatted: true, limit: 'all' },
    enabled: true,
    includeLinks: true,
    plainTextEmail: false,
    useCachedResults: false,
    targets: [
        {
            schedulerUuid: 'orders-digest',
            schedulerEmailTargetUuid: 'orders-email',
            recipient: 'operations@example.com',
            createdAt,
            updatedAt: createdAt,
        },
    ],
} satisfies SchedulerAndTargets;

const examples: SchedulerAndTargets[] = [
    chartDelivery,
    {
        ...chartDelivery,
        schedulerUuid: 'regional-review',
        slug: 'regional-review',
        name: 'Weekly regional review',
        createdBy: owners[1].userUuid,
        createdByName: 'Sam Patel',
        createdAt: new Date('2026-03-05T12:00:00Z'),
        updatedAt: lastRun,
        format: SchedulerFormat.PDF,
        cron: '0 9 * * 1',
        enabled: false,
        dashboardUuid: 'region-dashboard',
        dashboardName: 'Regional performance',
        savedChartUuid: null,
        savedChartName: null,
        selectedTabs: null,
        options: {},
        targets: [
            {
                schedulerUuid: 'regional-review',
                schedulerSlackTargetUuid: 'regional-slack',
                channel: 'sales-team',
                createdAt,
                updatedAt: createdAt,
            },
        ],
    },
    {
        ...chartDelivery,
        schedulerUuid: 'forecast-sync',
        slug: 'forecast-sync',
        name: 'Revenue forecast sync',
        createdAt: new Date('2026-03-10T08:00:00Z'),
        updatedAt: lastRun,
        savedChartUuid: 'forecast-chart',
        savedChartName: 'Revenue forecast',
        format: SchedulerFormat.GSHEETS,
        options: {
            gdriveId: 'forecast-sheet',
            gdriveName: 'Revenue planning workbook',
            gdriveOrganizationName: 'Revenue analytics',
            url: 'https://example.com/forecast-sheet',
        },
        enabled: false,
        automaticallyDisabledReason:
            'A resource required by this Google Sheets sync could not be found.',
        targets: [],
    },
];

const deliveries: SchedulerAndTargets[] = examples.map((delivery) => {
    const { resourceType, resourceId } =
        getSchedulerResourceTypeAndId(delivery);
    const failed = Boolean(delivery.automaticallyDisabledReason);
    return {
        ...delivery,
        latestRun: {
            runId: delivery.schedulerUuid + '-last-run',
            schedulerUuid: delivery.schedulerUuid,
            schedulerName: delivery.name,
            scheduledTime: lastRun,
            createdAt: lastRun,
            status: SchedulerJobStatus.COMPLETED,
            runStatus: failed
                ? SchedulerRunStatus.PARTIAL_FAILURE
                : SchedulerRunStatus.COMPLETED,
            logCounts: {
                total: 2,
                completed: failed ? 1 : 2,
                error: failed ? 1 : 0,
                scheduled: 0,
                started: 0,
            },
            details: null,
            resourceType,
            resourceUuid: resourceId,
            resourceName:
                delivery.savedChartName ?? delivery.dashboardName ?? '',
            createdByUserUuid: delivery.createdBy,
            createdByUserName: delivery.createdByName ?? '',
            format: delivery.format,
        },
    };
});

function page<T>(rows: T[], params: URLSearchParams): KnexPaginatedData<T[]> {
    const pageSize = Number(params.get('pageSize') ?? 50);
    const current = Number(params.get('page') ?? 1);
    return {
        data: rows.slice((current - 1) * pageSize, current * pageSize),
        pagination: {
            page: current,
            pageSize,
            totalResults: rows.length,
            totalPageCount: Math.ceil(rows.length / pageSize),
        },
    };
}

function fixtureResult({ method, url }: LightdashApiProps) {
    const { pathname, searchParams: params } = new URL(
        url,
        'https://storybook.example',
    );
    const search = (params.get('searchQuery') ?? '').toLowerCase();
    if (method === 'GET' && pathname === '/health') {
        return mockHealthResponse({ hasEmailClient: true });
    }
    if (method === 'GET' && pathname === '/slack/') {
        return { organizationUuid: 'sales' };
    }
    if (method === 'GET' && pathname === '/org/users') {
        return page(
            owners.filter((owner) =>
                (owner.firstName + ' ' + owner.lastName + ' ' + owner.email)
                    .toLowerCase()
                    .includes(search),
            ),
            params,
        );
    }
    if (method === 'GET' && pathname === '/projects/' + projectUuid) {
        return {
            projectUuid,
            name: 'Revenue analytics',
            organizationUuid: 'sales',
            schedulerTimezone: 'UTC',
        };
    }
    if (
        method === 'GET' &&
        pathname === '/schedulers/' + projectUuid + '/list'
    ) {
        const matches = (key: string, value: string) =>
            params.get(key)?.split(',').includes(value) ?? true;
        const selected = deliveries.filter((delivery) => {
            const resource = getSchedulerResourceTypeAndId(delivery);
            return (
                delivery.name.toLowerCase().includes(search) &&
                matches('enabled', String(delivery.enabled)) &&
                (params.get('needsAttention') !== 'true' ||
                    (!delivery.enabled &&
                        Boolean(delivery.automaticallyDisabledReason))) &&
                matches('formats', delivery.format) &&
                matches('resourceType', resource.resourceType) &&
                matches('resourceUuids', resource.resourceId) &&
                matches('createdByUserUuids', delivery.createdBy) &&
                (!params.has('destinations') ||
                    delivery.targets.some(
                        (target) =>
                            (isSlackTarget(target) &&
                                matches('destinations', 'slack')) ||
                            (isEmailTarget(target) &&
                                matches('destinations', 'email')),
                    ))
            );
        });
        const direction = params.get('sortDirection') === 'desc' ? -1 : 1;
        selected.sort(
            (a, b) =>
                direction *
                (params.get('sortBy') === 'createdAt'
                    ? a.createdAt.getTime() - b.createdAt.getTime()
                    : a.name.localeCompare(b.name)),
        );
        return page(selected, params);
    }
    throw new Error(`Unsupported story request: ${method} ${pathname}`);
}

const unsupported = () =>
    Promise.reject(new Error('Streaming is unavailable in this story'));

export const schedulerStoryApi: LightdashApi = Object.assign(
    async <T>(props: LightdashApiProps) => fixtureResult(props) as T,
    {
        response: unsupported,
        stream: unsupported,
        getResultsFromStream: unsupported,
    },
);
