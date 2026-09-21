import {
    ChartType,
    MergeJoinType,
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
import { supportsRichTextEditing } from './documentMarkdown';
import DocumentMarkdownEditor from './DocumentMarkdownEditor';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    close: vi.fn(),
    chart: vi.fn(),
    canAuthorCharts: true,
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
            <button
                onClick={() => {
                    const original = report.version.content.cells[1];
                    if (original.type === 'chart') {
                        onApply({
                            ...(chart ?? original.content.chart),
                            name: 'Edited chart',
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
    default: () => <div>Draft preview</div>,
}));
vi.mock('../../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../../hooks/useContent', () => ({ invalidateContent: vi.fn() }));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError: vi.fn() }),
}));
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
vi.mock('./DocumentChart', () => ({
    default: (props: unknown) => {
        mocks.chart(props);
        return <div>Live chart</div>;
    },
}));

const report: Document = {
    pinnedListUuid: null,
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
            ],
        },
    },
};

const clients: QueryClient[] = [];
const renderEditor = (document = report) => {
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
                <DocumentEditor document={document} onClose={mocks.close} />
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

beforeEach(() => {
    vi.clearAllMocks();
    mocks.canAuthorCharts = true;
    mocks.api.mockResolvedValue({
        ...report,
        version: { ...report.version, versionUuid: 'saved' },
    });
});

it('applies chart changes only to the draft while preserving unsaved text and order', async () => {
    renderEditor();
    fireEvent.change(
        screen.getByRole('textbox', { name: 'Section Markdown' }),
        { target: { value: '# Unsaved text' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move section 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit chart 1' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Apply to Document' }),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.getByText('Draft preview')).toBeInTheDocument();
    expect(
        screen.getByRole('textbox', { name: 'Section Markdown' }),
    ).toHaveValue('# Unsaved text');
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    const cells = JSON.parse(mocks.api.mock.calls[0][0].body).content.cells;
    expect(cells[0].content.chart.name).toBe('Edited chart');
    expect(cells[1].content.markdown).toBe('# Unsaved text');
});

it('leaves a chart unchanged when its modal is cancelled', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit chart 2' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Cancel chart' }),
    );
    expect(
        screen.getByRole('button', { name: 'Save document' }),
    ).toBeDisabled();
    expect(mocks.api).not.toHaveBeenCalled();
});

it('adds a draft chart without creating a saved chart', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add chart' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Apply to Document' }),
    );
    expect(
        screen.getByRole('button', { name: 'Remove section 3' }),
    ).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
});

it('hides chart authoring when independent Explore permission is absent', () => {
    mocks.canAuthorCharts = false;
    renderEditor();
    expect(
        screen.queryByRole('button', { name: 'Add chart' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Edit chart 2' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Add text' }),
    ).toBeInTheDocument();
});

it('keeps merge cells read-only and unchanged when saving text', async () => {
    const document = structuredClone(report);
    const original = document.version.content.cells[1];
    if (original.type !== 'chart' || original.content.source !== 'semantic') {
        throw new Error('Expected semantic chart fixture');
    }
    document.version.content.cells[1] = {
        type: 'chart',
        content: {
            source: 'merge',
            chart: {
                ...original.content.chart,
                merge: {
                    primarySourceId: 'a',
                    sources: [{ id: 'a', kind: 'chart' }],
                    joinKey: [],
                    joinType: MergeJoinType.LEFT,
                    tableCalculations: [],
                },
            },
        },
    };
    renderEditor(document);
    expect(screen.getByRole('button', { name: 'Edit chart 2' })).toBeDisabled();
    fireEvent.change(
        screen.getByRole('textbox', { name: 'Section Markdown' }),
        {
            target: { value: '# Changed narrative' },
        },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    expect(
        JSON.parse(mocks.api.mock.calls[0][0].body).content.cells[1],
    ).toEqual(document.version.content.cells[1]);
});

it('discards applied chart changes when cancelling the Document', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit chart 2' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Apply to Document' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
});
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

it('preserves tables on opening and saves text with unchanged charts only on Save', async () => {
    renderEditor();
    const input = screen.getByRole('textbox', { name: 'Section Markdown' });
    expect(input).toHaveValue(
        '# Findings\n\n| Metric | Value |\n| --- | --- |\n| Orders | 10 |',
    );
    expect(
        screen.getByRole('button', { name: 'Save document' }),
    ).toBeDisabled();
    fireEvent.change(input, {
        target: {
            value: '# Updated\n\n| Metric | Value |\n| --- | --- |\n| Orders | 20 |',
        },
    });
    expect(screen.getByRole('button', { name: 'Updated' })).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
    const request = mocks.api.mock.calls[0][0];
    const saved = JSON.parse(request.body);
    expect(request.url).toBe('/projects/project/documents/document/versions');
    expect(saved.baseVersionUuid).toBe('version');
    expect(saved.content.cells[0].content.markdown).toContain(
        '| Orders | 20 |',
    );
    expect(saved.content.cells[1]).toEqual(report.version.content.cells[1]);
    expect(report.version.content.cells[0]).toEqual({
        type: 'markdown',
        content: {
            markdown:
                '# Findings\n\n| Metric | Value |\n| --- | --- |\n| Orders | 10 |',
        },
    });
});

it('reorders cells without changing the persisted query index and removes cells', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Move section 2 up' }));
    expect(mocks.chart).toHaveBeenLastCalledWith(
        expect.objectContaining({ cellIndex: 1 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove section 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove section 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    expect(JSON.parse(mocks.api.mock.calls[0][0].body).content.cells).toEqual([
        report.version.content.cells[1],
    ]);
});

it('keeps draft changes after a stale save and never closes or overwrites them', async () => {
    mocks.api.mockRejectedValue({
        status: 'error',
        error: { statusCode: 409, message: 'Conflict' },
    });
    renderEditor();
    fireEvent.change(
        screen.getByRole('textbox', { name: 'Section Markdown' }),
        { target: { value: '# My work' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    expect(
        await screen.findByText(/This document changed while you were editing/),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('textbox', { name: 'Section Markdown' }),
    ).toHaveValue('# My work');
    expect(mocks.close).not.toHaveBeenCalled();
});

it('confirms cancel and blocks navigation without saving the draft', async () => {
    const { router } = renderEditor();
    fireEvent.change(
        screen.getByRole('textbox', { name: 'Section Markdown' }),
        { target: { value: '# Local' } },
    );
    await act(() => router.navigate('/away'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(router.state.location.pathname).toBe('/');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
});

it('adds an empty text cell without saving it', () => {
    const { container } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    expect(
        container.querySelector('[contenteditable="true"]'),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Remove section 3' }),
    ).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
});

it.each([
    'Before ![image](https://example.com/image.png) after',
    '```js title="example"\nconst x = 1;\n```',
    '- [x] Completed',
    'Text[^note]\n\n[^note]: Footnote',
    '<details>Details</details>',
])(
    'requires source editing to preserve unsupported Markdown: %s',
    (markdown) => {
        expect(supportsRichTextEditing(markdown)).toBe(false);
    },
);

it('locks rich text while a save is pending', async () => {
    mocks.api.mockReturnValue(new Promise(() => {}));
    const { container } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    expect(
        container.querySelector('[contenteditable="true"]'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() =>
        expect(
            container.querySelector('[contenteditable="true"]'),
        ).not.toBeInTheDocument(),
    );
    expect(
        container.querySelector('[contenteditable="false"]'),
    ).toBeInTheDocument();
});

it('attaches contents anchors to each rich-text heading without rewriting Markdown', async () => {
    const onChange = vi.fn();
    const router = createMemoryRouter([
        {
            path: '/',
            element: (
                <DocumentMarkdownEditor
                    markdown={'# First\n\nText\n\n# Second\n\nMore text'}
                    onChange={onChange}
                    disabled={false}
                    headings={[
                        { id: 'first', label: 'First' },
                        { id: 'second', label: 'Second' },
                    ]}
                />
            ),
        },
    ]);
    render(
        <MantineProvider env="test">
            <RouterProvider router={router} />
        </MantineProvider>,
    );
    await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Second' })).toHaveAttribute(
            'id',
            'second',
        ),
    );
    expect(screen.getByRole('heading', { name: 'First' })).toHaveAttribute(
        'id',
        'first',
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Text' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Markdown' }));
    expect(
        screen.getByRole('textbox', { name: 'Section Markdown' }),
    ).toHaveValue('# First\n\nText\n\n# Second\n\nMore text');
    fireEvent.click(screen.getByRole('radio', { name: 'Text' }));
    expect(
        await screen.findByRole('heading', { name: 'Second' }),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
});

it('keeps the icon-only text mode disabled for unsupported Markdown', () => {
    renderEditor();
    expect(screen.getByRole('radio', { name: 'Text' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Markdown' })).toBeChecked();
    expect(
        screen.getByRole('textbox', { name: 'Section Markdown' }),
    ).toHaveValue(
        report.version.content.cells[0].type === 'markdown'
            ? report.version.content.cells[0].content.markdown
            : '',
    );
});
