import {
    ChartKind,
    type ContentVerificationInfo,
    type DashboardSearchResult,
    type ToolFindContentOutput,
    type ToolGetDashboardChartsOutput,
} from '@lightdash/common';
import type {
    FindContentDashboardResult,
    FindContentResult,
} from '../types/aiAgentDependencies';
import { DASHBOARD_CHARTS_PREVIEW_COUNT } from '../utils/truncation';
import { getFindContent } from './findContent';
import { getGetDashboardCharts } from './getDashboardCharts';

const makeVerification = (
    firstName = 'Sarah',
    lastName = 'Khan',
): ContentVerificationInfo => ({
    verifiedBy: {
        userUuid: 'verifier-uuid',
        firstName,
        lastName,
    },
    verifiedAt: new Date('2026-04-01T00:00:00Z'),
});

const makeMockChart = (
    i: number,
    overrides: Partial<DashboardSearchResult['charts'][number]> = {},
): DashboardSearchResult['charts'][number] => ({
    uuid: `chart-uuid-${i}`,
    name: `Chart ${i}`,
    description: i % 2 === 0 ? `Description for chart ${i}` : undefined,
    chartType: ChartKind.VERTICAL_BAR,
    viewsCount: i * 10,
    verification: null,
    ...overrides,
});

const makeMockDashboard = (
    chartCount: number,
    overrides: Partial<FindContentDashboardResult> = {},
): FindContentDashboardResult => ({
    uuid: 'dash-uuid-1',
    name: 'Test Dashboard',
    slug: 'test-dashboard',
    description: 'A test dashboard',
    spaceUuid: 'space-uuid-1',
    projectUuid: 'project-uuid-1',
    search_rank: 1,
    viewsCount: 42,
    firstViewedAt: '2024-01-01T00:00:00Z',
    lastModified: '2024-06-15T00:00:00Z',
    createdBy: {
        firstName: 'Test',
        lastName: 'User',
        userUuid: 'user-uuid-1',
    },
    lastUpdatedBy: null,
    validationErrors: [],
    charts: Array.from({ length: chartCount }, (_, i) => makeMockChart(i)),
    verification: null,
    contentType: 'dashboard',
    space: {
        uuid: 'space-uuid-1',
        name: 'Marketing',
        slug: 'marketing',
        breadcrumbs: [
            {
                uuid: 'space-uuid-1',
                name: 'Marketing',
                slug: 'marketing',
            },
        ],
    },
    ...overrides,
});

type FindContentTool = ReturnType<typeof getFindContent>;
type GetDashboardChartsTool = ReturnType<typeof getGetDashboardCharts>;

const executeFindContent = (
    tool: FindContentTool,
    args: Parameters<NonNullable<FindContentTool['execute']>>[0],
): Promise<ToolFindContentOutput> =>
    tool.execute!(args, {
        messages: [],
        toolCallId: 'test',
    }) as Promise<ToolFindContentOutput>;

const executeGetDashboardCharts = (
    tool: GetDashboardChartsTool,
    args: Parameters<NonNullable<GetDashboardChartsTool['execute']>>[0],
): Promise<ToolGetDashboardChartsOutput> =>
    tool.execute!(args, {
        messages: [],
        toolCallId: 'test',
    }) as Promise<ToolGetDashboardChartsOutput>;

const makeMockSpace = (): FindContentResult => ({
    contentType: 'space',
    uuid: 'space-uuid-1',
    name: 'Marketing',
    slug: 'marketing',
    search_rank: 1,
    chartCount: 2,
    dashboardCount: 1,
    childSpaceCount: 1,
    appCount: 0,
    directAccess: true,
    verification: null,
    space: {
        uuid: 'space-uuid-1',
        name: 'Marketing',
        slug: 'marketing',
        breadcrumbs: [
            {
                uuid: 'space-uuid-1',
                name: 'Marketing',
                slug: 'marketing',
            },
        ],
    },
});

describe('getFindContent', () => {
    const createTool = (
        content: FindContentResult[],
        trackCoverage: jest.Mock = jest.fn(),
    ) => {
        const mockFindContent = jest.fn().mockResolvedValue({ content });
        return {
            tool: getFindContent({
                findContent: mockFindContent,
                siteUrl: '',
                trackCoverage,
            }),
            mockFindContent,
            trackCoverage,
        };
    };
    const toolOf = (content: FindContentResult[]) => createTool(content).tool;

    it('renders spaces and forwards the space filter', async () => {
        const { tool, mockFindContent } = createTool([makeMockSpace()]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'marketing' }],
            spaceSlug: 'company/marketing',
        });

        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain('<spaceResult');
        expect(output.result).toContain('slug="marketing"');
        expect(output.result).toContain('breadcrumb="Marketing"');
        expect(mockFindContent).toHaveBeenCalledWith({
            searchQuery: { label: 'marketing' },
            spaceSlug: 'company/marketing',
        });
    });

    it('renders all charts when dashboard has fewer than the preview limit', async () => {
        const underLimit = DASHBOARD_CHARTS_PREVIEW_COUNT - 1;
        const tool = toolOf([makeMockDashboard(underLimit)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });

        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain(`<charts count="${underLimit}">`);

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(underLimit);
    });

    it('renders exactly the preview limit when dashboard has that many charts', async () => {
        const tool = toolOf([
            makeMockDashboard(DASHBOARD_CHARTS_PREVIEW_COUNT),
        ]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });

        expect(output.result).toContain(
            `<charts count="${DASHBOARD_CHARTS_PREVIEW_COUNT}">`,
        );

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(DASHBOARD_CHARTS_PREVIEW_COUNT);
    });

    it('crops to the preview limit when dashboard has many charts', async () => {
        const tool = toolOf([makeMockDashboard(100)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });

        expect(output.result).toContain('<charts count="100">');

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(DASHBOARD_CHARTS_PREVIEW_COUNT);
    });

    it('handles dashboard with one chart', async () => {
        const tool = toolOf([makeMockDashboard(1)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });

        expect(output.result).toContain('<charts count="1">');

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(1);
    });

    it('output stays bounded with a huge dashboard (200 charts)', async () => {
        const tool = toolOf([makeMockDashboard(200)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });

        expect(output.result.length).toBeLessThan(10_000);
        expect(output.result).toContain('<charts count="200">');

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(DASHBOARD_CHARTS_PREVIEW_COUNT);
    });

    it('sorts verified dashboards before unverified ones', async () => {
        const unverified = makeMockDashboard(1, {
            uuid: 'dash-unverified',
            name: 'Unverified Dashboard',
            search_rank: 10,
        });
        const verified = makeMockDashboard(1, {
            uuid: 'dash-verified',
            name: 'Verified Dashboard',
            search_rank: 1,
            verification: makeVerification(),
        });
        const tool = toolOf([unverified, verified]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });

        const verifiedIdx = output.result.indexOf('dash-verified');
        const unverifiedIdx = output.result.indexOf('dash-unverified');
        expect(verifiedIdx).toBeGreaterThan(-1);
        expect(unverifiedIdx).toBeGreaterThan(-1);
        expect(verifiedIdx).toBeLessThan(unverifiedIdx);
    });

    it('renders <verified> with verifier name and relative date on a verified dashboard', async () => {
        const verified = makeMockDashboard(0, {
            verification: makeVerification('Alex', 'Doe'),
        });
        const tool = toolOf([verified]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });

        expect(output.result).toMatch(/<verified[^>]*by="Alex Doe"/);
        expect(output.result).toMatch(/<verified[^>]*at="[^"]+"/);
    });

    it('does not render <verified> on an unverified dashboard', async () => {
        const tool = toolOf([makeMockDashboard(0)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });
        expect(output.result).not.toContain('<verified');
    });

    it('marks verified inner charts inside the dashboard preview', async () => {
        const verifiedChart = makeMockChart(7, {
            uuid: 'inner-verified',
            verification: makeVerification('Inner', 'Verifier'),
        });
        const dashboard = makeMockDashboard(0, {
            charts: [makeMockChart(0), verifiedChart, makeMockChart(1)],
        });
        const tool = toolOf([dashboard]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });

        expect(output.result).toMatch(/<verified[^>]*by="Inner Verifier"/);
    });

    it('emits coverage telemetry per search query', async () => {
        const verified = makeMockDashboard(0, {
            uuid: 'dash-v',
            verification: makeVerification(),
        });
        const unverified = makeMockDashboard(0, { uuid: 'dash-u' });
        const trackCoverage = jest.fn();
        const { tool } = createTool([verified, unverified], trackCoverage);
        await executeFindContent(tool, {
            searchQueries: [{ label: 'revenue dashboards' }],
            spaceSlug: null,
        });

        expect(trackCoverage).toHaveBeenCalledTimes(1);
        expect(trackCoverage).toHaveBeenCalledWith({
            searchQuery: 'revenue dashboards',
            totalResultCount: 2,
            verifiedResultCount: 1,
            topResultVerified: true,
        });
    });

    it('reports topResultVerified=false when no verified results are returned', async () => {
        const trackCoverage = jest.fn();
        const { tool } = createTool([makeMockDashboard(0)], trackCoverage);
        await executeFindContent(tool, {
            searchQueries: [{ label: 'q' }],
            spaceSlug: null,
        });

        expect(trackCoverage).toHaveBeenCalledWith({
            searchQuery: 'q',
            totalResultCount: 1,
            verifiedResultCount: 0,
            topResultVerified: false,
        });
    });
});

describe('getGetDashboardCharts', () => {
    it('renders paginated charts with metadata', async () => {
        const charts = [makeMockChart(0), makeMockChart(1), makeMockChart(2)];
        const mockGetDashboardCharts = jest.fn().mockResolvedValue({
            dashboardName: 'Sales Dashboard',
            charts,
            pagination: {
                page: 1,
                pageSize: 20,
                totalResults: 40,
                totalPageCount: 2,
            },
        });

        const tool = getGetDashboardCharts({
            getDashboardCharts: mockGetDashboardCharts,
            siteUrl: '',
            pageSize: 20,
        });

        const output = await executeGetDashboardCharts(tool, {
            dashboardUuid: 'dash-uuid-1',
            page: 1,
        });

        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain('dashboardName="Sales Dashboard"');
        expect(output.result).toContain('page="1"');
        expect(output.result).toContain('totalPageCount="2"');
        expect(output.result).toContain('totalResults="40"');

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(3);
    });

    it('defaults page to 1 when not provided', async () => {
        const mockGetDashboardCharts = jest.fn().mockResolvedValue({
            dashboardName: 'My Dashboard',
            charts: [makeMockChart(0)],
            pagination: {
                page: 1,
                pageSize: 20,
                totalResults: 1,
                totalPageCount: 1,
            },
        });

        const tool = getGetDashboardCharts({
            getDashboardCharts: mockGetDashboardCharts,
            siteUrl: '',
            pageSize: 20,
        });

        await executeGetDashboardCharts(tool, {
            dashboardUuid: 'dash-uuid-1',
            page: null,
        });

        expect(mockGetDashboardCharts).toHaveBeenCalledWith({
            dashboardUuid: 'dash-uuid-1',
            page: 1,
            pageSize: 20,
        });
    });

    it('sorts verified charts before unverified ones and renders <verified>', async () => {
        const unverifiedFirst = makeMockChart(0, { uuid: 'unverified-a' });
        const verified = makeMockChart(1, {
            uuid: 'verified-b',
            verification: makeVerification('Dana', 'Lin'),
        });
        const unverifiedSecond = makeMockChart(2, { uuid: 'unverified-c' });
        const mockGetDashboardCharts = jest.fn().mockResolvedValue({
            dashboardName: 'Dashboard',
            charts: [unverifiedFirst, verified, unverifiedSecond],
            pagination: {
                page: 1,
                pageSize: 20,
                totalResults: 3,
                totalPageCount: 1,
            },
        });

        const tool = getGetDashboardCharts({
            getDashboardCharts: mockGetDashboardCharts,
            siteUrl: '',
            pageSize: 20,
        });

        const output = await executeGetDashboardCharts(tool, {
            dashboardUuid: 'dash-uuid-1',
            page: 1,
        });

        const verifiedIdx = output.result.indexOf('verified-b');
        const unverifiedAIdx = output.result.indexOf('unverified-a');
        expect(verifiedIdx).toBeLessThan(unverifiedAIdx);
        expect(output.result).toMatch(/<verified[^>]*by="Dana Lin"/);
    });
});
