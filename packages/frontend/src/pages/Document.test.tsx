import {
    ChartType,
    type Document,
    type DocumentCellV3,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import reportStyles from '../features/documents/presentation/ReportPresentation.module.css';
import DocumentPage from './Document';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    chartFails: false,
    flag: { data: { enabled: true }, isInitialLoading: false, isError: false },
}));

vi.unmock('@uiw/react-markdown-preview');
vi.mock('../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../features/documents/DocumentActions', () => ({
    default: () => null,
}));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => mocks.flag,
}));
vi.mock('../components/common/Page/Page', () => ({
    default: ({
        children,
        header,
    }: {
        children: ReactNode;
        header: ReactNode;
    }) => (
        <main>
            {header}
            {children}
        </main>
    ),
}));
vi.mock('../features/documents/DocumentChart', () => ({
    default: ({
        cell,
    }: {
        cell: Extract<DocumentCellV3, { type: 'chart' }>;
    }) => {
        if (mocks.chartFails) {
            throw new Error('Chart rendering failed');
        }
        return (
            <div data-testid="document-chart">{cell.content.chart.name}</div>
        );
    },
}));

const chart: DocumentCellV3 = {
    id: 'chart',
    type: 'chart',
    content: {
        source: 'semantic',
        chart: {
            name: 'Orders chart',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [],
                metrics: ['orders_count'],
                filters: {},
                sorts: [],
                limit: 100,
                tableCalculations: [],
            },
            chartConfig: { type: ChartType.TABLE },
        },
    },
};
const document: Document = {
    documentUuid: 'document-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    spaceUuid: 'space-uuid',
    name: 'Weekly review',
    slug: 'weekly-review',
    description: 'Revenue and next steps',
    createdAt: new Date('2026-09-15'),
    updatedAt: new Date('2026-09-15'),
    createdByUserUuid: null,
    version: {
        versionUuid: 'version-uuid',
        versionNumber: 1,
        schemaVersion: 3,
        content: {
            cells: [
                {
                    id: 'intro',
                    type: 'markdown',
                    content: {
                        markdown: '## Findings\n\nSupporting findings',
                    },
                },
                chart,
                {
                    id: 'end',
                    type: 'markdown',
                    content: {
                        markdown: '## Recommendations\n\nNext steps',
                    },
                },
            ],
        },
        createdAt: new Date('2026-09-15'),
        createdByUserUuid: null,
    },
};

const renderPage = (returnTo?: string) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
        logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    const router = createMemoryRouter(
        [
            {
                path: '/projects/:projectUuid/documents/:documentUuid',
                element: <DocumentPage />,
            },
            {
                path: '/projects/:projectUuid/home',
                element: <div>Project home</div>,
            },
            {
                path: '/projects/:projectUuid/documents',
                element: <div>Document list</div>,
            },
            {
                path: '/projects/:projectUuid/research',
                element: <div>Research run</div>,
            },
        ],
        {
            initialEntries: [
                `/projects/project-slug/documents/document-uuid${returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`,
            ],
        },
    );
    const result = render(
        <QueryClientProvider client={queryClient}>
            <MantineProvider env="test">
                <RouterProvider router={router} />
            </MantineProvider>
        </QueryClientProvider>,
    );
    return { ...result, router };
};

describe('Document page', () => {
    beforeEach(() => {
        mocks.chartFails = false;
        mocks.api.mockReset();
        mocks.api.mockResolvedValue(document);
        mocks.flag = {
            data: { enabled: true },
            isInitialLoading: false,
            isError: false,
        };
    });

    test('does not request document content while the feature flag loads', () => {
        mocks.flag.isInitialLoading = true;
        renderPage();
        expect(screen.getByText('Loading document')).toBeInTheDocument();
        expect(mocks.api).not.toHaveBeenCalled();
    });

    test.each([
        { data: { enabled: false }, isInitialLoading: false, isError: false },
        { data: { enabled: true }, isInitialLoading: false, isError: true },
    ])('fails closed for a disabled or failed feature flag', async (flag) => {
        mocks.flag = flag;
        renderPage();
        expect(await screen.findByText('Project home')).toBeInTheDocument();
        expect(mocks.api).not.toHaveBeenCalled();
    });

    test('shows the document loading state until the request resolves', async () => {
        mocks.api.mockReturnValue(new Promise(() => {}));
        renderPage();
        await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
        expect(screen.getByText('Loading document')).toBeInTheDocument();
    });

    test('renders ordered markdown and chart cells with title and description', async () => {
        const { container } = renderPage();
        expect(
            await screen.findByRole('heading', {
                name: 'Weekly review',
                level: 1,
            }),
        ).toBeInTheDocument();
        expect(screen.getByText('Revenue and next steps')).toBeInTheDocument();
        expect(mocks.api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/documents/document-uuid',
                method: 'GET',
            }),
        );
        expect(
            Array.from(
                container.querySelectorAll(
                    'h2, [data-testid="document-chart"]',
                ),
            ).map((element) => element.textContent),
        ).toEqual([
            'Findings',
            'Orders chart',
            'Orders chart',
            'Recommendations',
        ]);
    });

    test('shows unavailable content without leaking the server error', async () => {
        mocks.api.mockRejectedValue({
            error: { message: 'Internal detail', statusCode: 404 },
        });
        renderPage();
        expect(
            await screen.findByText('Document unavailable'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Internal detail')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Back' }));
        expect(await screen.findByText('Document list')).toBeInTheDocument();
    });

    test('shows report contents linked to the document sections', async () => {
        renderPage();
        const heading = await screen.findByRole('heading', {
            name: 'Findings',
        });
        expect(
            screen.getByRole('navigation', { name: 'Report contents' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Findings' }),
        ).toBeInTheDocument();
        expect(heading).toHaveAttribute('id', 'document-heading-intro-0');
        expect(heading).toHaveClass(reportStyles.reportFindingTitle);
        expect(heading.closest('section')).toHaveClass(
            reportStyles.reportFinding,
        );
        expect(
            screen.getByRole('heading', { name: 'Recommendations' }),
        ).toHaveAttribute('id', 'document-heading-end-0');
    });

    test('indexes chart names and Markdown headings in the contents', async () => {
        mocks.api.mockResolvedValue({
            ...document,
            version: {
                ...document.version,
                content: {
                    cells: [
                        {
                            id: 'untitled',
                            type: 'markdown',
                            content: { markdown: '## Embedded heading' },
                        },
                        {
                            ...chart,
                            content: {
                                ...chart.content,
                                chart: {
                                    ...chart.content.chart,
                                    name: 'Chart section',
                                },
                            },
                        },
                    ],
                },
            },
        });
        renderPage();
        expect(
            await screen.findByRole('heading', {
                name: 'Chart section',
                level: 2,
            }),
        ).toHaveAttribute('id', 'document-chart-chart');
        expect(
            screen.getByRole('button', { name: 'Chart section' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Embedded heading' }),
        ).toHaveAttribute('data-report-heading');
        expect(
            screen.getByRole('button', { name: 'Embedded heading' }),
        ).toBeInTheDocument();
    });

    test('preserves the chart section title and navigation when its renderer throws', async () => {
        mocks.chartFails = true;
        const errorLog = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        mocks.api.mockResolvedValue({
            ...document,
            version: {
                ...document.version,
                content: {
                    cells: [
                        {
                            ...chart,
                            content: {
                                ...chart.content,
                                chart: {
                                    ...chart.content.chart,
                                    name: 'Failed chart section',
                                },
                            },
                        },
                        document.version.content.cells[0],
                    ],
                },
            },
        });
        try {
            renderPage();
            expect(
                await screen.findByRole('heading', {
                    name: 'Failed chart section',
                    level: 2,
                }),
            ).toHaveAttribute('id', 'document-chart-chart');
            expect(
                screen.getByRole('button', { name: 'Failed chart section' }),
            ).toBeInTheDocument();
            const title = screen.getByRole('heading', {
                name: 'Failed chart section',
            });
            title.scrollIntoView = vi.fn();
            fireEvent.click(
                screen.getByRole('button', { name: 'Failed chart section' }),
            );
            expect(title.scrollIntoView).toHaveBeenCalledWith({
                block: 'start',
            });
            expect(
                screen.getByRole('heading', { name: 'Findings' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByTestId('document-chart'),
            ).not.toBeInTheDocument();
        } finally {
            errorLog.mockRestore();
        }
    });

    test('renders section titles as literal text rather than Markdown or HTML', async () => {
        const title = '<img src=x onerror=alert(1)> **Results**';
        mocks.api.mockResolvedValue({
            ...document,
            version: {
                ...document.version,
                content: {
                    cells: [
                        {
                            id: 'safe-title',
                            type: 'chart',
                            content: {
                                ...chart.content,
                                chart: { ...chart.content.chart, name: title },
                            },
                        },
                    ],
                },
            },
        });
        const { container } = renderPage();
        expect(
            await screen.findByRole('heading', { name: title }),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: title })).toBeInTheDocument();
        expect(container.querySelector('img, [onerror], strong')).toBeNull();
    });

    test('renders an empty document explicitly', async () => {
        mocks.api.mockResolvedValue({
            ...document,
            version: { ...document.version, content: { cells: [] } },
        });
        renderPage();
        expect(
            await screen.findByText('This document is empty.'),
        ).toBeInTheDocument();
    });

    test('uses a placeholder for an unsupported cell and preserves neighboring content', async () => {
        mocks.api.mockResolvedValue({
            ...document,
            version: {
                ...document.version,
                content: {
                    cells: [
                        document.version.content.cells[0],
                        { id: 'widget', type: 'widget', content: {} },
                    ],
                },
            },
        });
        renderPage();
        expect(
            await screen.findByRole('heading', { name: 'Findings' }),
        ).toBeInTheDocument();
        expect(
            screen.getAllByText('This content type is not supported yet.'),
        ).toHaveLength(1);
        expect(screen.queryByTestId('document-chart')).not.toBeInTheDocument();
    });

    test('returns to a validated internal research location', async () => {
        mocks.api.mockRejectedValue({ error: { statusCode: 404 } });
        const { router } = renderPage(
            '/projects/project-uuid/research?run=123#report',
        );
        fireEvent.click(await screen.findByRole('link', { name: 'Back' }));
        expect(await screen.findByText('Research run')).toBeInTheDocument();
        expect(router.state.location.search).toBe('?run=123');
        expect(router.state.location.hash).toBe('#report');
    });

    test('replaces an external return location with the canonical document list', async () => {
        mocks.api.mockRejectedValue({ error: { statusCode: 404 } });
        renderPage('https://example.com/projects/project-uuid/research');
        expect(
            await screen.findByRole('link', { name: 'Back' }),
        ).toHaveAttribute('href', '/projects/project-uuid/documents');
    });

    test.each(['Weekly review', 'A long document name '.repeat(20)])(
        'shows the document name in the toolbar without Back: %s',
        async (name) => {
            mocks.api.mockResolvedValue({ ...document, name });
            renderPage('/projects/project-uuid/research');
            expect(
                await screen.findByRole('heading', {
                    name: name.trim(),
                    level: 6,
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('heading', { name: name.trim(), level: 1 }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('heading', { name: name.trim(), level: 6 })
                    .parentElement,
            ).toHaveClass(reportStyles.reportControls);
            expect(
                screen.queryByRole('link', { name: 'Back' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Back' }),
            ).not.toBeInTheDocument();
        },
    );

    test('renders real markdown without raw HTML or unsafe URL schemes', async () => {
        mocks.api.mockResolvedValue({
            ...document,
            version: {
                ...document.version,
                content: {
                    cells: [
                        {
                            id: 'unsafe',
                            type: 'markdown',
                            content: {
                                markdown: [
                                    '## Safe heading',
                                    '<iframe src="https://example.com"></iframe>',
                                    '<script>alert(1)</script>',
                                    '<img src=x onerror="alert(1)">',
                                    '[unsafe](javascript:alert%281%29)',
                                    '[data link](data:text/html,test)',
                                    '[safe link](https://example.com/report)',
                                ].join('\n\n'),
                            },
                        },
                    ],
                },
            },
        });
        const { container } = renderPage();
        expect(
            await screen.findByRole('heading', { name: 'Safe heading' }),
        ).toBeInTheDocument();
        expect(container.querySelector('iframe, script, [onerror]')).toBeNull();
        expect(
            container.querySelector('a[href^="javascript:"], a[href^="data:"]'),
        ).toBeNull();
        expect(screen.getByRole('link', { name: 'safe link' })).toHaveAttribute(
            'href',
            'https://example.com/report',
        );
    });
});
