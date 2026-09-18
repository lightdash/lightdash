import {
    ChartKind,
    toolFindContentOutputSchema,
    toolGetDashboardChartsOutputSchema,
    type ContentVerificationInfo,
    type DashboardSearchResult,
    type ToolFindContentOutput,
    type ToolGetDashboardChartsOutput,
} from '@lightdash/common';
import type {
    FindContentChartResult,
    FindContentDashboardResult,
    FindContentDataAppResult,
    FindContentResult,
} from '../types/aiAgentDependencies';
import { DASHBOARD_CHARTS_PREVIEW_COUNT } from '../utils/truncation';
import { getFindContent } from './findContent';
import { getGetDashboardCharts } from './getDashboardCharts';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Search rows carry timestamps as Date objects despite their declared string type.
type SearchRow<
    T extends { firstViewedAt: string | null; lastModified: string | null },
> = Omit<T, 'firstViewedAt' | 'lastModified'> & {
    firstViewedAt: Date | null;
    lastModified: Date | null;
};

type FindContentRow =
    | FindContentResult
    | SearchRow<FindContentChartResult>
    | SearchRow<FindContentDashboardResult>;

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
    overrides: Partial<SearchRow<FindContentDashboardResult>> = {},
): SearchRow<FindContentDashboardResult> => ({
    uuid: 'dash-uuid-1',
    name: 'Test Dashboard',
    slug: 'test-dashboard',
    description: 'A test dashboard',
    spaceUuid: 'space-uuid-1',
    projectUuid: 'project-uuid-1',
    search_rank: 1,
    viewsCount: 42,
    firstViewedAt: new Date('2024-01-01T00:00:00Z'),
    lastModified: new Date('2024-06-15T00:00:00Z'),
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

const makeMockChartResult = (
    overrides: Partial<SearchRow<FindContentChartResult>> = {},
): SearchRow<FindContentChartResult> => ({
    contentType: 'chart',
    uuid: 'chart-result-uuid',
    name: 'Revenue by month',
    slug: 'revenue-by-month',
    description: 'Monthly revenue',
    spaceUuid: 'space-uuid-1',
    projectUuid: 'project-uuid-1',
    search_rank: 2,
    chartType: ChartKind.VERTICAL_BAR,
    chartSource: 'saved',
    dashboardUuid: null,
    viewsCount: 7,
    firstViewedAt: new Date('2024-01-01T00:00:00Z'),
    lastModified: new Date('2024-06-15T00:00:00Z'),
    createdBy: {
        firstName: 'Test',
        lastName: 'User',
        userUuid: 'user-uuid-1',
    },
    lastUpdatedBy: null,
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
    ...overrides,
});

const makeMockDataApp = (
    overrides: Partial<FindContentDataAppResult> = {},
): FindContentDataAppResult => ({
    contentType: 'data_app',
    uuid: 'app-uuid-1',
    slug: 'sales-forecast',
    name: 'Sales forecast',
    description: 'Forecast revenue by region',
    spaceUuid: 'space-uuid-1',
    projectUuid: 'project-uuid-1',
    search_rank: 0.75,
    viewsCount: 12,
    createdBy: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        userUuid: 'user-uuid-1',
    },
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
    verification: null,
    ...overrides,
});

describe('getFindContent', () => {
    const createTool = (
        content: FindContentRow[],
        trackCoverage: import('vitest').Mock = vi.fn(),
    ) => {
        const mockFindContent = vi.fn().mockResolvedValue({ content });
        return {
            tool: getFindContent({
                findContent: mockFindContent,
                siteUrl: '',
                toolDescriptionMaxChars: 600,
                trackCoverage,
                dashboardDetailsToolName: 'readContent',
            }),
            mockFindContent,
            trackCoverage,
        };
    };
    const toolOf = (content: FindContentRow[]) => createTool(content).tool;

    it('renders Data App discovery metadata and canonical viewer link', async () => {
        const tool = toolOf([makeMockDataApp()]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'forecast revenue' }],
            spaceSlug: null,
        });

        expect(output.result).toContain('<dataApp');
        expect(output.result).toContain('dataAppUuid="app-uuid-1"');
        expect(output.result).toContain('slug="sales-forecast"');
        expect(output.result).toContain('searchRank="0.75"');
        expect(output.result).toContain('spaceUuid="space-uuid-1"');
        expect(output.result).toContain('viewsCount="12"');
        expect(output.result).toContain(
            'href="/projects/project-uuid-1/apps/app-uuid-1/view"',
        );
        expect(output.result).toContain('<name>Sales forecast</name>');
        expect(output.result).toContain(
            '<description>Forecast revenue by region</description>',
        );
        expect(output.result).toContain('<createdby>Ada Lovelace</createdby>');
        expect(output.result).toContain('breadcrumb="Marketing"');
    });

    it('keeps Data Apps in verified-only search without empty guidance', async () => {
        const tool = toolOf([
            makeMockDataApp({ spaceUuid: null, space: null }),
        ]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'forecast revenue' }],
            spaceSlug: null,
            verifiedOnly: true,
        });

        expect(output.result).toContain('<dataApp');
        expect(output.result).not.toContain('No verified content matched');
        expect(output.result).not.toContain('<space ');
    });

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
            verifiedOnly: false,
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
        expect(output.result).toMatch(
            new RegExp(`<charts count="${underLimit}"[^>]*>`),
        );

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

        expect(output.result).toMatch(
            new RegExp(
                `<charts count="${DASHBOARD_CHARTS_PREVIEW_COUNT}"[^>]*>`,
            ),
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

        expect(output.result).toMatch(/<charts count="100"[^>]*>/);

        const chartMatches = output.result.match(/<chart /g);
        expect(chartMatches).toHaveLength(DASHBOARD_CHARTS_PREVIEW_COUNT);
    });

    it('handles dashboard with one chart', async () => {
        const tool = toolOf([makeMockDashboard(1)]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'test query' }],
            spaceSlug: null,
        });

        expect(output.result).toMatch(/<charts count="1"[^>]*>/);

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
        expect(output.result).toMatch(/<charts count="200"[^>]*>/);

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
        const trackCoverage = vi.fn();
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
            verifiedOnly: false,
        });
    });

    it('reports topResultVerified=false when no verified results are returned', async () => {
        const trackCoverage = vi.fn();
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
            verifiedOnly: false,
        });
    });

    it('forwards verifiedOnly to the search and reports it in coverage', async () => {
        const trackCoverage = vi.fn();
        const { tool, mockFindContent } = createTool(
            [makeMockDashboard(0)],
            trackCoverage,
        );
        await executeFindContent(tool, {
            searchQueries: [{ label: 'revenue' }],
            spaceSlug: null,
            verifiedOnly: true,
        });

        expect(mockFindContent).toHaveBeenCalledWith({
            searchQuery: { label: 'revenue' },
            spaceSlug: null,
            verifiedOnly: true,
        });
        expect(trackCoverage).toHaveBeenCalledWith(
            expect.objectContaining({ verifiedOnly: true }),
        );
    });

    it('returns an empty result with guidance when a verified-only search has no matches', async () => {
        const { tool, mockFindContent } = createTool([]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'revenue' }],
            spaceSlug: null,
            verifiedOnly: true,
        });

        expect(output.metadata.status).toBe('success');
        expect(mockFindContent).toHaveBeenCalledTimes(1);
        expect(mockFindContent).toHaveBeenCalledWith({
            searchQuery: { label: 'revenue' },
            spaceSlug: null,
            verifiedOnly: true,
        });
        expect(output.result).toContain(
            'No verified content matched this query',
        );
        expect(output.result).not.toContain('<dashboard');
    });

    it('does not show the empty-result guidance when the verified-only search has matches', async () => {
        const { tool, mockFindContent } = createTool([
            makeMockDashboard(0, { verification: makeVerification() }),
        ]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'revenue' }],
            spaceSlug: null,
            verifiedOnly: true,
        });

        expect(mockFindContent).toHaveBeenCalledTimes(1);
        expect(output.result).not.toContain('No verified content matched');
        expect(output.result).toContain('<dashboard');
    });

    it('does not show the empty-result guidance on an empty unrestricted search', async () => {
        const { tool } = createTool([]);
        const output = await executeFindContent(tool, {
            searchQueries: [{ label: 'revenue' }],
            spaceSlug: null,
        });

        expect(output.metadata.status).toBe('success');
        expect(output.result).not.toContain('No verified content matched');
    });

    describe('structuredContent', () => {
        it('parses with the output schema and mirrors the rendered dashboard', async () => {
            const dashboard = makeMockDashboard(7, {
                verification: makeVerification('Alex', 'Doe'),
                validationErrors: [
                    { validationUuid: 'v-1', validationId: null },
                ],
            });
            const tool = toolOf([dashboard]);
            const output = await executeFindContent(tool, {
                searchQueries: [{ label: 'test query' }],
                spaceSlug: null,
            });

            expect(toolFindContentOutputSchema.safeParse(output).success).toBe(
                true,
            );
            expect(output.metadata).toEqual({ status: 'success' });
            expect(output.structuredContent).toEqual({
                searchResults: [
                    {
                        searchQuery: 'test query',
                        verifiedOnly: false,
                        count: 1,
                        note: null,
                        content: [
                            {
                                contentType: 'dashboard',
                                uuid: 'dash-uuid-1',
                                name: 'Test Dashboard',
                                slug: 'test-dashboard',
                                searchRank: 1,
                                spaceUuid: 'space-uuid-1',
                                viewsCount: 42,
                                href: '/projects/project-uuid-1/dashboards/dash-uuid-1/view#dashboard-link',
                                space: {
                                    uuid: 'space-uuid-1',
                                    name: 'Marketing',
                                    slug: 'marketing',
                                    breadcrumb: 'Marketing',
                                },
                                description: 'A test dashboard',
                                verification: {
                                    verifiedBy: 'Alex Doe',
                                    verifiedAt: '2026-04-01T00:00:00.000Z',
                                },
                                firstViewedAt: '2024-01-01T00:00:00.000Z',
                                lastModified: '2024-06-15T00:00:00.000Z',
                                createdBy: 'Test User',
                                lastUpdatedBy: null,
                                charts: {
                                    count: 7,
                                    preview: Array.from(
                                        {
                                            length: DASHBOARD_CHARTS_PREVIEW_COUNT,
                                        },
                                        (_, i) => ({
                                            uuid: `chart-uuid-${i}`,
                                            name: `Chart ${i}`,
                                            chartType: ChartKind.VERTICAL_BAR,
                                            description:
                                                i % 2 === 0
                                                    ? `Description for chart ${i}`
                                                    : null,
                                            verification: null,
                                        }),
                                    ),
                                },
                                validationErrorCount: 1,
                            },
                        ],
                    },
                ],
            });

            expect(output.result).toContain('dashboardUuid="dash-uuid-1"');
            expect(output.result).toContain('<name>Test Dashboard</name>');
            expect(output.result).toContain(
                'href="/projects/project-uuid-1/dashboards/dash-uuid-1/view#dashboard-link"',
            );
            expect(output.result).toMatch(/<verified[^>]*by="Alex Doe"/);
            expect(output.result).toMatch(/<charts count="7"[^>]*>/);
            expect(output.result).toContain('<validationerrors count="1"/>');
        });

        it('mirrors spaces, Data Apps without a space and the verified-first order', async () => {
            const unverified = makeMockDashboard(0, {
                uuid: 'dash-unverified',
                search_rank: 10,
            });
            const verified = makeMockDashboard(0, {
                uuid: 'dash-verified',
                search_rank: 1,
                verification: makeVerification(),
            });
            const tool = toolOf([
                unverified,
                makeMockSpace(),
                makeMockDataApp({ spaceUuid: null, space: null }),
                verified,
            ]);
            const output = await executeFindContent(tool, {
                searchQueries: [{ label: 'marketing' }],
                spaceSlug: null,
            });

            expect(toolFindContentOutputSchema.safeParse(output).success).toBe(
                true,
            );
            if ('error' in output.structuredContent) {
                throw new Error('expected success structuredContent');
            }
            const [searchResult] = output.structuredContent.searchResults;
            expect(searchResult.count).toBe(4);
            expect(searchResult.content.map((item) => item.uuid)).toEqual([
                'dash-verified',
                'dash-unverified',
                'space-uuid-1',
                'app-uuid-1',
            ]);
            expect(searchResult.content[2]).toEqual({
                contentType: 'space',
                uuid: 'space-uuid-1',
                name: 'Marketing',
                slug: 'marketing',
                searchRank: 1,
                chartCount: 2,
                dashboardCount: 1,
                childSpaceCount: 1,
                appCount: 0,
                directAccess: true,
                space: {
                    uuid: 'space-uuid-1',
                    name: 'Marketing',
                    slug: 'marketing',
                    breadcrumb: 'Marketing',
                },
            });
            expect(searchResult.content[3]).toEqual({
                contentType: 'data_app',
                uuid: 'app-uuid-1',
                name: 'Sales forecast',
                slug: 'sales-forecast',
                searchRank: 0.75,
                spaceUuid: null,
                viewsCount: 12,
                href: '/projects/project-uuid-1/apps/app-uuid-1/view',
                space: null,
                description: 'Forecast revenue by region',
                createdBy: 'Ada Lovelace',
            });
            expect(output.result.indexOf('dash-verified')).toBeLessThan(
                output.result.indexOf('dash-unverified'),
            );
        });

        it('serializes chart timestamps read from the database as ISO strings', async () => {
            const tool = toolOf([makeMockChartResult()]);
            const output = await executeFindContent(tool, {
                searchQueries: [{ label: 'revenue' }],
                spaceSlug: null,
            });

            expect(toolFindContentOutputSchema.safeParse(output).success).toBe(
                true,
            );
            if ('error' in output.structuredContent) {
                throw new Error('expected success structuredContent');
            }
            const [searchResult] = output.structuredContent.searchResults;
            expect(searchResult.content).toEqual([
                {
                    contentType: 'chart',
                    uuid: 'chart-result-uuid',
                    name: 'Revenue by month',
                    slug: 'revenue-by-month',
                    searchRank: 2,
                    chartType: ChartKind.VERTICAL_BAR,
                    chartSource: 'saved',
                    spaceUuid: 'space-uuid-1',
                    viewsCount: 7,
                    href: `/projects/project-uuid-1/saved/chart-result-uuid/view#chart-link#chart-type-${ChartKind.VERTICAL_BAR}`,
                    space: {
                        uuid: 'space-uuid-1',
                        name: 'Marketing',
                        slug: 'marketing',
                        breadcrumb: 'Marketing',
                    },
                    description: 'Monthly revenue',
                    verification: null,
                    firstViewedAt: '2024-01-01T00:00:00.000Z',
                    lastModified: '2024-06-15T00:00:00.000Z',
                    createdBy: 'Test User',
                    lastUpdatedBy: null,
                },
            ]);

            expect(output.result).toContain('chartUuid="chart-result-uuid"');
            expect(output.result).toContain('<name>Revenue by month</name>');
            expect(output.result).toContain('<firstviewedat>');
            expect(output.result).toContain('<lastmodified>');
        });

        it('carries the empty verified-only guidance', async () => {
            const { tool } = createTool([]);
            const output = await executeFindContent(tool, {
                searchQueries: [{ label: 'revenue' }],
                spaceSlug: null,
                verifiedOnly: true,
            });

            expect(toolFindContentOutputSchema.safeParse(output).success).toBe(
                true,
            );
            expect(output.structuredContent).toEqual({
                searchResults: [
                    {
                        searchQuery: 'revenue',
                        verifiedOnly: true,
                        count: 0,
                        note: expect.stringContaining(
                            'No verified content matched this query',
                        ),
                        content: [],
                    },
                ],
            });
        });

        it('returns { error } when the search fails', async () => {
            const mockFindContent = vi
                .fn()
                .mockRejectedValue(new Error('search index unavailable'));
            const tool = getFindContent({
                findContent: mockFindContent,
                siteUrl: '',
                toolDescriptionMaxChars: 600,
                trackCoverage: vi.fn(),
                dashboardDetailsToolName: 'readContent',
            });
            const output = await executeFindContent(tool, {
                searchQueries: [{ label: 'revenue' }],
                spaceSlug: null,
            });

            expect(toolFindContentOutputSchema.safeParse(output).success).toBe(
                true,
            );
            expect(output.metadata).toEqual({ status: 'error' });
            expect(output.result).toContain(
                'Error finding content for search queries: revenue',
            );
            expect(output.result).toContain('search index unavailable');
            expect(output.structuredContent).toEqual({ error: output.result });
        });
    });
});

describe('getGetDashboardCharts', () => {
    it('renders paginated charts with metadata', async () => {
        const charts = [makeMockChart(0), makeMockChart(1), makeMockChart(2)];
        const mockGetDashboardCharts = vi.fn().mockResolvedValue({
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

        expect(
            toolGetDashboardChartsOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.structuredContent).toEqual({
            dashboardUuid: 'dash-uuid-1',
            dashboardName: 'Sales Dashboard',
            page: 1,
            pageSize: 20,
            totalPageCount: 2,
            totalResults: 40,
            charts: [
                {
                    uuid: 'chart-uuid-0',
                    name: 'Chart 0',
                    description: 'Description for chart 0',
                    chartType: ChartKind.VERTICAL_BAR,
                    viewsCount: 0,
                    verification: null,
                },
                {
                    uuid: 'chart-uuid-1',
                    name: 'Chart 1',
                    description: null,
                    chartType: ChartKind.VERTICAL_BAR,
                    viewsCount: 10,
                    verification: null,
                },
                {
                    uuid: 'chart-uuid-2',
                    name: 'Chart 2',
                    description: 'Description for chart 2',
                    chartType: ChartKind.VERTICAL_BAR,
                    viewsCount: 20,
                    verification: null,
                },
            ],
        });
    });

    it('renders an empty page with structured content when the dashboard has no charts', async () => {
        const mockGetDashboardCharts = vi.fn().mockResolvedValue({
            dashboardName: 'Empty Dashboard',
            charts: [],
            pagination: {
                page: 1,
                pageSize: 20,
                totalResults: 0,
                totalPageCount: 0,
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
        expect(output.result).toContain('totalResults="0"');
        expect(output.result).not.toContain('<chart ');
        expect(
            toolGetDashboardChartsOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.structuredContent).toEqual({
            dashboardUuid: 'dash-uuid-1',
            dashboardName: 'Empty Dashboard',
            page: 1,
            pageSize: 20,
            totalPageCount: 0,
            totalResults: 0,
            charts: [],
        });
    });

    it('returns an error envelope with structured content when fetching charts fails', async () => {
        const mockGetDashboardCharts = vi
            .fn()
            .mockRejectedValue(new Error('Dashboard not found'));

        const tool = getGetDashboardCharts({
            getDashboardCharts: mockGetDashboardCharts,
            siteUrl: '',
            pageSize: 20,
        });

        const output = await executeGetDashboardCharts(tool, {
            dashboardUuid: 'missing-dash',
            page: 1,
        });

        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain(
            'Error getting charts for dashboard: missing-dash',
        );
        expect(output.result).toContain('Dashboard not found');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(
            toolGetDashboardChartsOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    it('defaults page to 1 when not provided', async () => {
        const mockGetDashboardCharts = vi.fn().mockResolvedValue({
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
        const mockGetDashboardCharts = vi.fn().mockResolvedValue({
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

        expect(
            toolGetDashboardChartsOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(
            'charts' in output.structuredContent
                ? output.structuredContent.charts.map((chart) => ({
                      uuid: chart.uuid,
                      verification: chart.verification,
                  }))
                : output.structuredContent,
        ).toEqual([
            {
                uuid: 'verified-b',
                verification: {
                    verifiedBy: 'Dana Lin',
                    verifiedAt: '2026-04-01T00:00:00.000Z',
                },
            },
            { uuid: 'unverified-a', verification: null },
            { uuid: 'unverified-c', verification: null },
        ]);
    });
});
