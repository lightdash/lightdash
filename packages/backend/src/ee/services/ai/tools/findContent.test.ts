import {
    ChartKind,
    type DashboardSearchResult,
    type ToolFindContentOutput,
    type ToolGetDashboardChartsOutput,
} from '@lightdash/common';
import { getFindContent } from './findContent';
import { getGetDashboardCharts } from './getDashboardCharts';

const makeMockChart = (i: number): DashboardSearchResult['charts'][number] => ({
    uuid: `chart-uuid-${i}`,
    name: `Chart ${i}`,
    description: i % 2 === 0 ? `Description for chart ${i}` : undefined,
    chartType: ChartKind.VERTICAL_BAR,
    viewsCount: i * 10,
});

const makeMockDashboard = (chartCount: number): DashboardSearchResult => ({
    uuid: 'dash-uuid-1',
    name: 'Test Dashboard',
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

describe('getFindContent', () => {
    const createTool = (content: DashboardSearchResult[]) => {
        const mockFindContent = jest.fn().mockResolvedValue({ content });
        return getFindContent({
            findContent: mockFindContent,
            siteUrl: '',
        });
    };

    it('renders all charts when dashboard has 3 charts (under limit)', async () => {
        const tool = createTool([makeMockDashboard(3)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
        });

        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain('<charts count="3">');

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(3);
    });

    it('renders exactly 5 charts when dashboard has 5 charts (at limit)', async () => {
        const tool = createTool([makeMockDashboard(5)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
        });

        expect(output.result).toContain('<charts count="5">');

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(5);
    });

    it('crops to 5 charts when dashboard has many charts', async () => {
        const tool = createTool([makeMockDashboard(100)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
        });

        // Total count attribute reflects the real number
        expect(output.result).toContain('<charts count="100">');

        // But only 5 chart elements are rendered
        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(5);
    });

    it('handles dashboard with one chart', async () => {
        const tool = createTool([makeMockDashboard(1)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
        });

        expect(output.result).toContain('<charts count="1">');

        const chartMatches = output.result.match(/<chart /g);
        // 1 chart inside the <charts> block
        expect(chartMatches).toHaveLength(1);
    });

    it('output stays bounded with a huge dashboard (200 charts)', async () => {
        const tool = createTool([makeMockDashboard(200)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
        });

        // Even with 200 charts, we only render 5 so size should be small
        expect(output.result.length).toBeLessThan(10_000);
        expect(output.result).toContain('<charts count="200">');

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(5);
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
});
