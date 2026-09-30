import {
    ChartType,
    type Document,
    type SemanticChartAsCode,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import DocumentEditor from './DocumentEditor';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    close: vi.fn(),
    chart: vi.fn(),
    track: vi.fn(),
    canAuthorCharts: true,
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: mocks.track }),
}));
vi.mock('../../hooks/useContextMenuPermissions', () => ({
    useContextMenuPermissions: () => ({ canDrillInto: mocks.canAuthorCharts }),
}));
vi.mock('./DocumentChartEditorModal', () => ({
    default: ({
        chart,
        onApply,
        onClose,
    }: {
        chart: SemanticChartAsCode | null;
        onApply: (chart: SemanticChartAsCode) => void;
        onClose: () => void;
    }) => (
        <div role="dialog" aria-label="Chart editor">
            <output data-testid="editing-chart">{chart?.name ?? ''}</output>
            <button
                onClick={() => {
                    const original = report.version.content.cells[1];
                    if (original.type === 'chart') {
                        onApply({
                            ...(chart ?? original.content.chart),
                            name: chart ? 'Edited chart' : 'New chart',
                        });
                    }
                }}
            >
                Apply to Document
            </button>
            <button onClick={onClose}>Cancel chart</button>
        </div>
    ),
}));
vi.mock('./DocumentDraftChart', () => ({
    default: ({
        chart,
        actions,
    }: {
        chart: SemanticChartAsCode;
        actions: ReactNode;
    }) => (
        <div>
            Draft preview: {chart.name}
            {actions}
        </div>
    ),
}));
vi.mock('./DocumentChart', () => ({
    default: (props: {
        cell: { content: { chart: { name: string } } };
        actions: ReactNode;
    }) => {
        mocks.chart(props);
        return (
            <div>
                Live chart: {props.cell.content.chart.name}
                {props.actions}
            </div>
        );
    },
}));
vi.mock('../../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../../hooks/useContent', () => ({ invalidateContent: vi.fn() }));
vi.mock('./DocumentPageLayout', () => ({
    default: ({
        actions,
        children,
    }: {
        actions: ReactNode;
        children: ReactNode;
    }) => (
        <>
            {actions}
            {children}
        </>
    ),
}));

const report: Document = {
    pinnedListUuid: null,
    createdBy: null,
    owner: null,
    ownerUserUuid: null,
    documentUuid: 'document',
    projectUuid: 'project',
    organizationUuid: 'organization',
    spaceUuid: 'space',
    name: 'Report',
    slug: 'report',
    description: '',
    createdByUserUuid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: {
        versionUuid: 'version',
        versionNumber: 1,
        schemaVersion: 1,
        createdByUserUuid: null,
        createdAt: new Date(),
        content: {
            cells: [
                {
                    type: 'markdown',
                    content: {
                        markdown:
                            '# Findings\n\n| Metric | Value |\n| --- | --- |\n| Orders | 10 |',
                    },
                },
                {
                    type: 'chart',
                    content: {
                        source: 'semantic',
                        chart: {
                            name: 'Orders',
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
                },
                {
                    type: 'markdown',
                    content: { markdown: '# Recommendations\n\nShip it.' },
                },
            ],
        },
    },
};

// ProseMirror measures the caret when focusing; jsdom has no layout.
beforeAll(() => {
    const emptyRects = () =>
        ({ length: 0, item: () => null }) as unknown as DOMRectList;
    const emptyRect = () =>
        ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
        }) as DOMRect;
    Range.prototype.getClientRects = emptyRects;
    Range.prototype.getBoundingClientRect = emptyRect;
    Element.prototype.getClientRects = emptyRects;
});

const clients: QueryClient[] = [];
const renderEditor = (document = report, newerVersionSaved = false) => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    clients.push(client);
    const router = createMemoryRouter([
        {
            path: '/',
            element: (
                <DocumentEditor
                    document={document}
                    newerVersionSaved={newerVersionSaved}
                    onClose={mocks.close}
                />
            ),
        },
        { path: '/away', element: <div>Away</div> },
    ]);
    return {
        router,
        ...render(
            <QueryClientProvider client={client}>
                <MantineProvider env="test">
                    <RouterProvider router={router} />
                </MantineProvider>
            </QueryClientProvider>,
        ),
    };
};

const savedCells = () =>
    JSON.parse(mocks.api.mock.calls[0][0].body).content.cells;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.canAuthorCharts = true;
    mocks.api.mockResolvedValue({
        ...report,
        version: { ...report.version, versionUuid: 'saved' },
    });
});
afterEach(() => clients.forEach((client) => client.clear()));

it('renders the saved document in one editable body with the contents rail', async () => {
    renderEditor();
    expect(await screen.findByText('Live chart: Orders')).toBeInTheDocument();
    const body = screen.getByRole('textbox', { name: 'Document body' });
    expect(body).toHaveAttribute('contenteditable', 'true');
    expect(
        screen.getByRole('heading', { name: 'Findings' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Findings' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Recommendations' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Save document' }),
    ).toBeDisabled();
});

it('applies chart edits in place, keeps the surrounding text, and saves them as cells', async () => {
    renderEditor();
    fireEvent.click(
        await screen.findByRole('button', { name: 'Edit chart Orders' }),
    );
    expect(await screen.findByTestId('editing-chart')).toHaveTextContent(
        'Orders',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Document' }));
    expect(
        await screen.findByText('Draft preview: Edited chart'),
    ).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
        name: 'document_chart.applied',
        properties: {
            projectUuid: report.projectUuid,
            documentUuid: report.documentUuid,
            chartType: ChartType.TABLE,
            isCustomChart: false,
            mode: 'edit',
        },
    });
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    const cells = savedCells();
    expect(cells.map((cell: { type: string }) => cell.type)).toEqual([
        'markdown',
        'chart',
        'markdown',
    ]);
    expect(cells[0].content.markdown).toContain('# Findings');
    expect(cells[0].content.markdown).toContain('| Orders | 10 |');
    expect(cells[1].content.chart.name).toBe('Edited chart');
    expect(cells[2].content.markdown).toBe('# Recommendations\n\nShip it.');
    expect(JSON.parse(mocks.api.mock.calls[0][0].body).baseVersionUuid).toBe(
        'version',
    );
    await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
});

it('leaves the chart unchanged when its editor is cancelled', async () => {
    renderEditor();
    fireEvent.click(
        await screen.findByRole('button', { name: 'Edit chart Orders' }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Cancel chart' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Live chart: Orders')).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Save document' }),
    ).toBeDisabled();
    // Keyboard users land back in the document, not at the top of the page
    await waitFor(() =>
        expect(document.activeElement).toHaveClass('ProseMirror'),
    );
});

it('adds a chart as a draft node without touching saved charts', async () => {
    renderEditor();
    await screen.findByText('Live chart: Orders');
    fireEvent.click(screen.getByRole('button', { name: 'Add chart' }));
    expect(await screen.findByTestId('editing-chart')).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Document' }));
    expect(
        await screen.findByText('Draft preview: New chart'),
    ).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
        name: 'document_chart.applied',
        properties: {
            projectUuid: report.projectUuid,
            documentUuid: report.documentUuid,
            chartType: ChartType.TABLE,
            isCustomChart: false,
            mode: 'add',
        },
    });
    expect(screen.getByText('Live chart: Orders')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    expect(
        savedCells().filter((cell: { type: string }) => cell.type === 'chart'),
    ).toHaveLength(2);
});

it('removes a chart from the body and the saved cells', async () => {
    renderEditor();
    fireEvent.click(
        await screen.findByRole('button', { name: 'Remove chart Orders' }),
    );
    await waitFor(() =>
        expect(
            screen.queryByText('Live chart: Orders'),
        ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    expect(savedCells()).toStrictEqual([
        {
            type: 'markdown',
            content: {
                markdown:
                    '# Findings\n\n| Metric | Value |\n| --- | --- |\n| Orders | 10 |\n\n# Recommendations\n\nShip it.',
            },
        },
    ]);
});

it('hides chart authoring without independent Explore permission', async () => {
    mocks.canAuthorCharts = false;
    renderEditor();
    expect(await screen.findByText('Live chart: Orders')).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Add chart' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Edit chart Orders' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Remove chart Orders' }),
    ).toBeInTheDocument();
});

it('warns before saving when a newer version was saved elsewhere', async () => {
    renderEditor(report, true);
    expect(
        await screen.findByText(/A newer version of this document was saved/),
    ).toBeInTheDocument();
});

it('shows no newer-version warning while the draft is current', async () => {
    renderEditor();
    expect(await screen.findByText('Live chart: Orders')).toBeInTheDocument();
    expect(
        screen.queryByText(/A newer version of this document was saved/),
    ).not.toBeInTheDocument();
});

it('keeps the draft on a stale save and explains the conflict', async () => {
    mocks.api.mockRejectedValue({
        error: { statusCode: 409, message: 'Stale version' },
    });
    renderEditor();
    fireEvent.click(
        await screen.findByRole('button', { name: 'Remove chart Orders' }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Save document' }),
    );
    expect(
        await screen.findByText(/This document changed while you were editing/),
    ).toBeInTheDocument();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(screen.queryByText('Live chart: Orders')).not.toBeInTheDocument();
});

it('confirms before discarding and blocks navigation while dirty', async () => {
    const { router } = renderEditor();
    fireEvent.click(
        await screen.findByRole('button', { name: 'Remove chart Orders' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
        await screen.findByText('Discard unsaved changes?'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() =>
        expect(
            screen.queryByText('Discard unsaved changes?'),
        ).not.toBeInTheDocument(),
    );
    expect(mocks.close).not.toHaveBeenCalled();
    await act(async () => {
        await router.navigate('/away');
    });
    expect(
        await screen.findByText('Discard unsaved changes?'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/away'));
});

it('closes without confirmation when nothing changed', async () => {
    renderEditor();
    await screen.findByText('Live chart: Orders');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.close).toHaveBeenCalledOnce();
});

describe('title', () => {
    const titleInput = () =>
        screen.getByRole('textbox', { name: 'Document name' });

    it('renames without writing a new version when only the title changed', async () => {
        renderEditor();
        await screen.findByText('Live chart: Orders');
        expect(titleInput()).toHaveValue('Report');
        fireEvent.change(titleInput(), { target: { value: '  Renamed ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
        await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
        expect(mocks.api).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                url: '/projects/project/documents/document',
                method: 'PATCH',
                body: JSON.stringify({ name: 'Renamed' }),
            }),
        );
    });

    it('renames before saving content against the loaded version', async () => {
        renderEditor();
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Remove chart Orders',
            }),
        );
        fireEvent.change(titleInput(), { target: { value: 'Renamed' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
        await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
        expect(mocks.api.mock.calls.map(([call]) => call.method)).toEqual([
            'PATCH',
            'POST',
        ]);
        expect(
            JSON.parse(mocks.api.mock.calls[1][0].body).baseVersionUuid,
        ).toBe('version');
    });

    it('blocks saving an empty title', async () => {
        renderEditor();
        await screen.findByText('Live chart: Orders');
        fireEvent.change(titleInput(), { target: { value: '   ' } });
        expect(
            screen.getByRole('button', { name: 'Save document' }),
        ).toBeDisabled();
    });

    it('keeps editing and skips the content write when the rename fails', async () => {
        mocks.api.mockRejectedValueOnce({
            error: {
                statusCode: 400,
                message: 'Document name must contain 1–255 characters',
            },
        });
        renderEditor();
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Remove chart Orders',
            }),
        );
        fireEvent.change(titleInput(), { target: { value: 'Renamed' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
        expect(
            await screen.findByText(
                'Document name must contain 1–255 characters',
            ),
        ).toBeInTheDocument();
        expect(mocks.api).toHaveBeenCalledOnce();
        expect(mocks.close).not.toHaveBeenCalled();
    });

    it('treats a title change as unsaved when cancelling', async () => {
        renderEditor();
        await screen.findByText('Live chart: Orders');
        fireEvent.change(titleInput(), { target: { value: 'Renamed' } });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(
            await screen.findByText('Discard unsaved changes?'),
        ).toBeInTheDocument();
        expect(mocks.close).not.toHaveBeenCalled();
    });

    it('never puts a line break in the title', async () => {
        renderEditor();
        await screen.findByText('Live chart: Orders');
        fireEvent.change(titleInput(), { target: { value: 'Two\nlines' } });
        expect(titleInput()).toHaveValue('Twolines');
    });
});

it('moves focus to Cancel when editing an existing document', async () => {
    renderEditor();
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel).toHaveFocus());
});

it('puts the caret in the body of an empty document', async () => {
    renderEditor({
        ...report,
        version: { ...report.version, content: { cells: [] } },
    });
    await waitFor(() =>
        expect(document.activeElement).toHaveClass('ProseMirror'),
    );
});

describe('drag handle', () => {
    it('offers a drag handle on each chart while editing', async () => {
        renderEditor();
        const handle = await screen.findByRole('button', {
            name: 'Drag chart Orders',
        });
        expect(handle).toHaveAttribute('draggable', 'true');
        expect(handle).toHaveAttribute('data-drag-handle');
    });

    it('lets editors without Explore permission move charts', async () => {
        mocks.canAuthorCharts = false;
        renderEditor();
        expect(
            await screen.findByRole('button', { name: 'Drag chart Orders' }),
        ).toBeInTheDocument();
    });
});
