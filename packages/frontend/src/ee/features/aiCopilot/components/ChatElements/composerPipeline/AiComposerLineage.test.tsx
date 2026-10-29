import {
    FilterOperator,
    QuerySourceType,
    VizIndexType,
    type SourceQuery,
} from '@lightdash/common';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useCompiledSqlFromMetricQuery } from '../../../../../../hooks/useCompiledSql';
import mockIntersectingObserver from '../../../../../../testing/intersectingObserver';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { type ComposerRunNodeStatus } from '../useComposerRunNodeStatuses';
import { AiComposerLineage } from './AiComposerLineage';
import { type PipelineNode } from './groupPipeline';

vi.mock('../../../../../../hooks/useCompiledSql', () => ({
    useCompiledSqlFromMetricQuery: vi.fn(() => ({ data: undefined })),
}));
const compiledSql = vi.mocked(useCompiledSqlFromMetricQuery);
vi.mock('../../../../../../hooks/useExplore', () => ({
    useExploreByProjectUuid: vi.fn(() => ({ data: undefined })),
}));

beforeAll(mockIntersectingObserver);

const queries: SourceQuery[] = [
    {
        sourceType: QuerySourceType.SQL,
        nodeId: 'orders',
        title: 'Orders by status',
        sql: 'select 1',
    },
    {
        sourceType: QuerySourceType.SQL,
        nodeId: 'amounts',
        title: 'Average amount',
        sql: 'select 2',
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'joined',
        title: 'Orders with amounts',
        sql: 'select 3',
        references: ['orders', 'amounts'],
    },
];

const renderPanel = (props: {
    queries?: SourceQuery[];
    displayableNodeIds?: Set<string>;
    nodeStatuses?: Record<string, ComposerRunNodeStatus>;
    chatNodeIds?: Set<string>;
    onAddToChat?: ((node: PipelineNode) => void) | null;
}) =>
    renderWithProviders(
        <AiComposerLineage
            projectUuid="project"
            queries={queries}
            terminalNodeId="joined"
            displayableNodeIds={new Set(['orders', 'amounts', 'joined'])}
            nodeStatuses={{}}
            renderNodeResult={(nodeId) => <div>rows of {nodeId}</div>}
            chatNodeIds={new Set()}
            onAddToChat={null}
            {...props}
        />,
    );

// React Flow hides nodes until measured (never in jsdom) and hidden elements
// get no accessible name, so match the aria-label attribute directly.
const nodeButtons = () => screen.getAllByLabelText(/^Focus /);
const nodeButton = (title: string) => screen.getByLabelText(`Focus ${title}`);

const cell = (nodeId: string) =>
    within(document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)!);
const linkedNodeIds = () =>
    [...document.querySelectorAll('[data-lineage-role="related"]')].map((el) =>
        el.querySelector('[data-node-id]')!.getAttribute('data-node-id'),
    );
const resultsToggle = (nodeId: string) =>
    cell(nodeId).getByRole('button', { name: /^(View results|[\d,]+ rows?)/ });

describe('AiComposerLineage graph', () => {
    it('renders one node per pipeline node and marks the terminal', () => {
        renderPanel({});
        expect(nodeButtons()).toHaveLength(3);
        expect(nodeButton('Orders with amounts')).toHaveAttribute(
            'data-terminal',
            'true',
        );
        expect(nodeButton('Orders by status')).toHaveAttribute(
            'data-terminal',
            'false',
        );
    });

    it('flashes a node cell when its graph box is clicked', () => {
        renderPanel({});
        fireEvent.click(nodeButton('Average amount'));
        expect(
            document.querySelector('[data-node-id="amounts"] [data-flash]'),
        ).toHaveAttribute('data-flash', 'true');
    });

    it('links the hovered graph node to its cells and dims unlinked nodes', async () => {
        renderPanel({
            queries: [
                ...queries,
                {
                    sourceType: QuerySourceType.SQL,
                    nodeId: 'unrelated',
                    title: 'Unrelated',
                    sql: 'select 4',
                },
            ],
        });
        const flowNode = (title: string) =>
            nodeButton(title).closest('.react-flow__node')!;
        fireEvent.mouseEnter(flowNode('Orders by status'));
        await waitFor(() => expect(linkedNodeIds()).toEqual(['joined']));
        expect(nodeButton('Unrelated')).toHaveAttribute('data-dimmed', 'true');
        expect(nodeButton('Average amount')).toHaveAttribute(
            'data-dimmed',
            'true',
        );
        expect(nodeButton('Orders with amounts')).toHaveAttribute(
            'data-dimmed',
            'false',
        );
        fireEvent.mouseLeave(flowNode('Orders by status'));
        expect(linkedNodeIds()).toEqual([]);
        expect(nodeButton('Unrelated')).toHaveAttribute('data-dimmed', 'false');
    });

    it("shows each node's row count, or its status while not done", () => {
        renderPanel({
            nodeStatuses: {
                orders: {
                    status: 'success',
                    error: null,
                    totalRowCount: 20,
                    durationMs: null,
                },
                amounts: {
                    status: 'running',
                    error: null,
                    totalRowCount: null,
                    durationMs: null,
                },
            },
        });
        expect(
            within(nodeButton('Orders by status')).getByText('20 rows'),
        ).toBeInTheDocument();
        expect(
            within(nodeButton('Average amount')).getByText('Running'),
        ).toBeInTheDocument();
    });

    it('marks a node whose row count reached its limit, in the graph and its step', () => {
        const done = (totalRowCount: number): ComposerRunNodeStatus => ({
            status: 'success',
            error: null,
            totalRowCount,
            durationMs: null,
        });
        renderPanel({
            queries: [{ ...queries[0], limit: 1000 }, queries[1], queries[2]],
            nodeStatuses: { orders: done(1000), amounts: done(20) },
        });
        expect(
            within(nodeButton('Orders by status')).getByText(
                '1,000 rows · reached limit',
            ),
        ).toBeInTheDocument();
        expect(
            cell('orders').getByText('1,000 rows · reached limit'),
        ).toBeInTheDocument();
        expect(
            within(nodeButton('Average amount')).getByText('20 rows'),
        ).toBeInTheDocument();
        expect(cell('amounts').getByText('20 rows')).toBeInTheDocument();
    });
});

describe('AiComposerLineage steps', () => {
    it("shows a node's status only while queued or on error, with the error in its cell", () => {
        renderPanel({
            nodeStatuses: {
                orders: {
                    status: 'success',
                    error: null,
                    totalRowCount: null,
                    durationMs: null,
                },
                amounts: {
                    status: 'error',
                    error: 'column "amount" does not exist',
                    totalRowCount: null,
                    durationMs: null,
                },
                joined: {
                    status: 'pending',
                    error: null,
                    totalRowCount: null,
                    durationMs: null,
                },
            },
        });
        expect(cell('orders').queryByLabelText('Completed')).toBeNull();
        expect(cell('amounts').getByLabelText('Failed')).toBeInTheDocument();
        expect(
            cell('amounts').getByText('column "amount" does not exist'),
        ).toBeInTheDocument();
        expect(cell('joined').getByLabelText('Queued')).toBeInTheDocument();
        expect(
            cell('joined').getByText('Queued, waiting on the steps it reads'),
        ).toBeInTheDocument();
    });

    it('shows each cell with its title, description and code inline', () => {
        renderPanel({
            queries: [
                { ...queries[0], description: 'Order count per status.' },
                queries[1],
                queries[2],
            ],
        });
        expect(
            cell('orders').getByText('Orders by status'),
        ).toBeInTheDocument();
        expect(
            cell('orders').getByText(/Order count per status\./),
        ).toBeInTheDocument();
        expect(
            document
                .querySelector('[data-node-id="amounts"]')!
                .querySelector('code'),
        ).toHaveTextContent(/select\s+2/i);
    });

    it('hides rows until opened, and only offers them for nodes with a result', () => {
        renderPanel({
            displayableNodeIds: new Set(['orders', 'amounts']),
            nodeStatuses: {
                orders: {
                    status: 'success',
                    error: null,
                    totalRowCount: null,
                    durationMs: null,
                },
                amounts: {
                    status: 'running',
                    error: null,
                    totalRowCount: null,
                    durationMs: null,
                },
            },
        });
        expect(cell('orders').queryByText('rows of orders')).toBeNull();
        fireEvent.click(resultsToggle('orders'));
        expect(resultsToggle('orders')).toHaveAttribute(
            'aria-expanded',
            'true',
        );
        expect(cell('orders').getByText('rows of orders')).toBeInTheDocument();
        expect(
            cell('amounts').queryByRole('button', { name: /^View results/ }),
        ).toBeNull();
        expect(cell('joined').queryByText('rows of joined')).toBeNull();
    });

    it("shows a finished node's row count and run time on its results toggle", () => {
        renderPanel({
            nodeStatuses: {
                orders: {
                    status: 'success',
                    error: null,
                    totalRowCount: 120,
                    durationMs: 1500,
                },
                amounts: {
                    status: 'success',
                    error: null,
                    totalRowCount: 1,
                    durationMs: null,
                },
            },
        });
        expect(resultsToggle('orders')).toHaveTextContent('120 rows · 1.5 s');
        expect(resultsToggle('amounts')).toHaveTextContent('1 row');
    });

    it('links a cell to the cells it reads and feeds while its title is hovered', async () => {
        renderPanel({});
        const title = (nodeId: string, text: string) =>
            cell(nodeId).getByText(text);
        fireEvent.mouseEnter(title('joined', 'Orders with amounts'));
        await waitFor(() =>
            expect(linkedNodeIds()).toEqual(['orders', 'amounts']),
        );
        expect(document.querySelector('svg[data-lineage]')).toHaveAttribute(
            'data-visible',
            'true',
        );
        fireEvent.mouseLeave(title('joined', 'Orders with amounts'));
        expect(linkedNodeIds()).toEqual([]);
        expect(document.querySelector('svg[data-lineage]')).toHaveAttribute(
            'data-visible',
            'false',
        );
    });

    it('ignores a pointer sweeping across a cell title', async () => {
        renderPanel({});
        const title = cell('orders').getByText('Orders by status');
        fireEvent.mouseEnter(title);
        fireEvent.mouseLeave(title);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(linkedNodeIds()).toEqual([]);
    });

    it('marks only the terminal node as the final result', () => {
        renderPanel({});
        expect(cell('joined').getByText('Final result')).toBeInTheDocument();
        expect(cell('orders').queryByText('Final result')).toBeNull();
    });

    it('adds a node to the chat until it is attached', () => {
        const onAddToChat = vi.fn();
        renderPanel({
            onAddToChat,
            chatNodeIds: new Set(['orders']),
        });
        expect(
            cell('orders').queryByRole('button', { name: 'Add to chat' }),
        ).toBeNull();
        fireEvent.click(
            cell('amounts').getByRole('button', { name: 'Add to chat' }),
        );
        expect(onAddToChat).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'amounts' }),
        );
    });
});

describe('AiComposerLineage semantic nodes', () => {
    const semanticOrders: SourceQuery = {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'orders',
        title: 'Orders by status',
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {
            dimensions: {
                id: 'root',
                and: [
                    {
                        id: 'status',
                        target: { fieldId: 'orders_status' },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                    },
                ],
            },
        },
        sorts: [{ fieldId: 'orders_count', descending: true }],
        pivotConfiguration: {
            indexColumn: [
                { reference: 'orders_status', type: VizIndexType.CATEGORY },
            ],
            valuesColumns: [],
            groupByColumns: undefined,
            sortBy: undefined,
        },
    };

    it('heads a semantic node with its explore and its fields, filters and sort open', async () => {
        renderPanel({
            queries: [semanticOrders, queries[1], queries[2]],
        });
        const details = await cell('orders').findByRole('button', {
            name: 'Metric query',
        });
        expect(details).toHaveAttribute('aria-expanded', 'true');
        expect(
            await cell('orders').findByText('completed'),
        ).toBeInTheDocument();
        expect(cell('orders').queryByLabelText('Explore')).toBeNull();
        expect(
            cell('orders')
                .getAllByTestId('semantic-node-field')
                .map((chip) => chip.textContent),
        ).toEqual(['Orders status', 'Orders count']);
        expect(
            cell('orders').getByTestId('semantic-node-sort'),
        ).toHaveTextContent('Orders count');
    });

    it('compiles a semantic node query only once SQL query is opened', async () => {
        compiledSql.mockReturnValue({
            data: { query: 'SELECT status FROM orders' },
        } as unknown as ReturnType<typeof useCompiledSqlFromMetricQuery>);
        renderPanel({
            queries: [semanticOrders, queries[1], queries[2]],
        });
        expect(compiledSql).not.toHaveBeenCalled();
        fireEvent.click(
            await cell('orders').findByRole('button', { name: 'SQL query' }),
        );
        expect(compiledSql).toHaveBeenCalledWith(
            expect.objectContaining({
                tableName: 'orders',
                projectUuid: 'project',
                metricQuery: expect.objectContaining({
                    exploreName: 'orders',
                    limit: 500,
                }),
                pivotConfiguration: expect.objectContaining({
                    indexColumn: [
                        {
                            reference: 'orders_status',
                            type: VizIndexType.CATEGORY,
                        },
                    ],
                }),
            }),
        );
        expect(
            document
                .querySelector('[data-node-id="orders"]')!
                .querySelector('code'),
        ).toHaveTextContent(/select\s+status\s+from\s+orders/i);
    });
});

describe('AiComposerLineage python nodes', () => {
    const pythonQueries: SourceQuery[] = [
        queries[0],
        {
            sourceType: QuerySourceType.PYTHON,
            nodeId: 'simulated',
            title: 'Simulated amounts',
            description: 'Monte Carlo draws per status.',
            code: 'def run(inputs, params):\n    return inputs["orders"]',
            references: ['orders'],
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'summary',
            title: 'Simulation summary',
            sql: 'select * from simulated',
            references: ['simulated'],
        },
    ];

    it("shows a python node's code inline", () => {
        renderPanel({
            queries: pythonQueries,
        });
        expect(
            document
                .querySelector('[data-node-id="simulated"]')!
                .querySelector('code'),
        ).toHaveTextContent(/def run\(inputs, params\):/);
    });

    it('labels a python node in the graph', () => {
        renderPanel({ queries: pythonQueries });
        expect(
            within(nodeButton('Simulated amounts')).getByText('Python'),
        ).toBeInTheDocument();
    });
});
