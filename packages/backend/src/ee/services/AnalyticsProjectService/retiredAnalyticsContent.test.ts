import { type SessionUser } from '@lightdash/common';
import {
    retiredAnalyticsCharts,
    retiredAnalyticsDashboards,
} from '../../../analytics/systemExplores/retiredContent';
import {
    analyticsContentAsCode,
    analyticsDefaultSpace,
} from '../../../analytics/systemExplores/sampleContent';
import {
    removeRetiredAnalyticsContent,
    type RetiredContentDependencies,
} from './retiredAnalyticsContent';

const user = { userUuid: 'admin' } as SessionUser;
const projectUuid = 'analytics-project';
const managedSpace = { uuid: 'managed-space' };
const [retiredChart, retiredChartOwner] = Object.entries(
    retiredAnalyticsCharts,
).find(([, owner]) => !retiredAnalyticsDashboards.includes(owner))!;

type Dashboard = { uuid: string; slug: string; spaceUuid: string };
type Chart = { uuid: string; slug: string; dashboardUuid: string | null };

// An instance that has the retired People dashboard and one retired chart on a dashboard that is still
// managed, both installed by the sync: in the managed space and verified.
const instance = (
    overrides: {
        softDelete?: boolean;
        spaces?: { uuid: string }[];
        dashboards?: Dashboard[];
        charts?: Chart[];
        verified?: string[];
    } = {},
) => {
    const dashboards = overrides.dashboards ?? [
        {
            uuid: 'people',
            slug: 'lightdash-analytics-people',
            spaceUuid: managedSpace.uuid,
        },
        {
            uuid: 'owner',
            slug: retiredChartOwner,
            spaceUuid: managedSpace.uuid,
        },
    ];
    const charts = overrides.charts ?? [
        { uuid: 'chart', slug: retiredChart, dashboardUuid: 'owner' },
    ];
    const softDeleteDashboard = vi.fn();
    const softDeleteChart = vi.fn();
    const info = vi.fn();
    const warn = vi.fn();
    const findSpaces = vi.fn(async () => overrides.spaces ?? [managedSpace]);
    const dependencies = {
        lightdashConfig: {
            softDelete: {
                enabled: overrides.softDelete ?? true,
                retentionDays: 30,
            },
        },
        spaceModel: { find: findSpaces },
        dashboardModel: {
            find: vi.fn(async ({ slugs }: { slugs: string[] }) =>
                dashboards.filter(({ slug }) => slugs.includes(slug)),
            ),
        },
        savedChartModel: {
            find: vi.fn(async ({ slugs }: { slugs: string[] }) =>
                charts.filter(({ slug }) => slugs.includes(slug)),
            ),
        },
        contentVerificationModel: {
            getByContentUuids: vi.fn(
                async (_type: unknown, uuids: string[]) =>
                    new Map(
                        uuids
                            .filter((uuid) =>
                                (
                                    overrides.verified ??
                                    dashboards.map((item) => item.uuid)
                                ).includes(uuid),
                            )
                            .map((uuid) => [uuid, {}]),
                    ),
            ),
        },
        dashboardService: { softDelete: softDeleteDashboard },
        savedChartService: { softDelete: softDeleteChart },
        logger: { info, warn },
    } as unknown as RetiredContentDependencies;
    return {
        run: () =>
            removeRetiredAnalyticsContent(dependencies, user, projectUuid),
        softDeleteDashboard,
        softDeleteChart,
        findSpaces,
        info,
        warn,
    };
};

describe('retired analytics content', () => {
    it('lists nothing that is still defined in code', () => {
        const dashboards = analyticsContentAsCode.map(
            ({ dashboard }) => dashboard.slug,
        );
        const charts = analyticsContentAsCode.flatMap(({ charts: all }) =>
            all.map(({ slug }) => slug),
        );
        expect(
            retiredAnalyticsDashboards.filter((slug) =>
                dashboards.includes(slug),
            ),
        ).toEqual([]);
        expect(
            Object.keys(retiredAnalyticsCharts).filter((slug) =>
                charts.includes(slug),
            ),
        ).toEqual([]);
        // Every retired chart names a dashboard that is managed now or was retired with it
        expect(
            Object.values(retiredAnalyticsCharts).filter(
                (owner) =>
                    !dashboards.includes(owner) &&
                    !retiredAnalyticsDashboards.includes(owner),
            ),
        ).toEqual([]);
        expect(retiredAnalyticsDashboards).toContain(
            'lightdash-analytics-people',
        );
    });

    it('removes a retired managed dashboard and a retired chart of a managed dashboard, with the recoverable delete', async () => {
        const { run, softDeleteDashboard, softDeleteChart, findSpaces, info } =
            instance();
        expect(await run()).toEqual({
            dashboards: ['lightdash-analytics-people'],
            charts: [retiredChart],
        });
        expect(findSpaces).toHaveBeenCalledWith({
            projectUuid,
            path: analyticsDefaultSpace.slug.replaceAll('-', '_'),
        });
        // The acting administrator's own permissions apply: no bypass options are passed
        expect(softDeleteDashboard.mock.calls).toEqual([[user, 'people']]);
        expect(softDeleteChart.mock.calls).toEqual([[user, 'chart']]);
        expect(info).toHaveBeenCalledTimes(2);
    });

    it('leaves the charts of a removed dashboard to that delete', async () => {
        const peopleChart = Object.entries(retiredAnalyticsCharts).find(
            ([, owner]) => owner === 'lightdash-analytics-people',
        )![0];
        const { run, softDeleteDashboard, softDeleteChart } = instance({
            charts: [
                { uuid: 'chart', slug: peopleChart, dashboardUuid: 'people' },
            ],
        });
        await run();
        expect(softDeleteDashboard).toHaveBeenCalledTimes(1);
        expect(softDeleteChart).not.toHaveBeenCalled();
    });

    it('skips an item with a retired slug outside the managed space', async () => {
        const { run, softDeleteDashboard, softDeleteChart } = instance({
            dashboards: [
                {
                    uuid: 'people',
                    slug: 'lightdash-analytics-people',
                    spaceUuid: 'a-customer-space',
                },
                {
                    uuid: 'owner',
                    slug: retiredChartOwner,
                    spaceUuid: 'a-customer-space',
                },
            ],
        });
        expect(await run()).toEqual({ dashboards: [], charts: [] });
        expect(softDeleteDashboard).not.toHaveBeenCalled();
        expect(softDeleteChart).not.toHaveBeenCalled();
    });

    it('skips an item in the managed space that the sync did not verify', async () => {
        const { run, softDeleteDashboard, softDeleteChart } = instance({
            verified: [],
        });
        expect(await run()).toEqual({ dashboards: [], charts: [] });
        expect(softDeleteDashboard).not.toHaveBeenCalled();
        expect(softDeleteChart).not.toHaveBeenCalled();
    });

    it('skips a chart that has the slug but belongs to another dashboard', async () => {
        const { run, softDeleteChart } = instance({
            dashboards: [
                {
                    uuid: 'owner',
                    slug: retiredChartOwner,
                    spaceUuid: managedSpace.uuid,
                },
            ],
            charts: [
                { uuid: 'chart', slug: retiredChart, dashboardUuid: 'a-copy' },
            ],
        });
        expect(await run()).toEqual({ dashboards: [], charts: [] });
        expect(softDeleteChart).not.toHaveBeenCalled();
    });

    it('does nothing when the items are already deleted', async () => {
        // The models only return content that is not deleted
        const { run, softDeleteDashboard, softDeleteChart, info } = instance({
            dashboards: [],
            charts: [],
        });
        expect(await run()).toEqual({ dashboards: [], charts: [] });
        expect(softDeleteDashboard).not.toHaveBeenCalled();
        expect(softDeleteChart).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
    });

    it('does nothing on a fresh install, which has no managed space yet or no retired content', async () => {
        const noSpace = instance({ spaces: [] });
        expect(await noSpace.run()).toEqual({ dashboards: [], charts: [] });
        expect(noSpace.softDeleteDashboard).not.toHaveBeenCalled();
        const current = instance({
            dashboards: [
                {
                    uuid: 'home',
                    slug: 'lightdash-analytics-home',
                    spaceUuid: managedSpace.uuid,
                },
            ],
            charts: [],
        });
        expect(await current.run()).toEqual({ dashboards: [], charts: [] });
        expect(current.softDeleteDashboard).not.toHaveBeenCalled();
    });

    it('removes nothing where a delete could not be undone', async () => {
        const { run, softDeleteDashboard, softDeleteChart, findSpaces } =
            instance({ softDelete: false });
        expect(await run()).toEqual({ dashboards: [], charts: [] });
        expect(findSpaces).not.toHaveBeenCalled();
        expect(softDeleteDashboard).not.toHaveBeenCalled();
        expect(softDeleteChart).not.toHaveBeenCalled();
    });

    it('carries on when one item cannot be removed', async () => {
        const { run, softDeleteDashboard, softDeleteChart, warn } = instance();
        softDeleteDashboard.mockRejectedValueOnce(new Error('not allowed'));
        expect(await run()).toEqual({ dashboards: [], charts: [retiredChart] });
        expect(softDeleteChart).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
