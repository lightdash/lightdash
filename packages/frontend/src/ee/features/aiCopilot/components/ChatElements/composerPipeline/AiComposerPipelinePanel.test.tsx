import {
    FilterOperator,
    QuerySourceType,
    VizIndexType,
    type SourceQuery,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useCompiledSqlFromMetricQuery } from '../../../../../../hooks/useCompiledSql';
import mockIntersectingObserver from '../../../../../../testing/intersectingObserver';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { type ComposerRunNodeStatus } from '../useComposerRunNodeStatuses';
import { AiComposerPipelinePanel } from './AiComposerPipelinePanel';
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
    defaultExpanded?: boolean;
    defaultMode?: 'list' | 'graph';
    displayedNodeId?: string;
    displayableNodeIds?: Set<string>;
    onDisplayNode?: (nodeId: string) => void;
    nodeStatuses?: Record<string, ComposerRunNodeStatus>;
    chatNodeIds?: Set<string>;
    onAddToChat?: ((node: PipelineNode) => void) | null;
}) =>
    renderWithProviders(
        <AiComposerPipelinePanel
            projectUuid="project"
            queries={queries}
            terminalNodeId="joined"
            displayedNodeId="joined"
            displayableNodeIds={new Set(['orders', 'amounts', 'joined'])}
            onDisplayNode={() => {}}
            nodeStatuses={{}}
            renderNodeResult={(nodeId) => <div>rows of {nodeId}</div>}
            chatNodeIds={new Set()}
            onAddToChat={null}
            defaultMode="list"
            {...props}
        >
            <div>results</div>
        </AiComposerPipelinePanel>,
    );

// React Flow hides nodes until measured (never in jsdom) and hidden elements
// get no accessible name, so match the aria-label attribute directly.
const nodeButtons = () => screen.getAllByLabelText(/^Display /);
const nodeButton = (title: string) => screen.getByLabelText(`Display ${title}`);

describe('AiComposerPipelinePanel graph mode', () => {
    it('shows the List / Graph switch only when expanded, defaulting to List', () => {
        renderPanel({ defaultMode: undefined });
        expect(screen.queryByRole('radio', { name: 'List' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /queries/i }));
        expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
    });

    it('renders one node button per pipeline node and marks the terminal', () => {
        renderPanel({ defaultExpanded: true, defaultMode: 'graph' });
        expect(nodeButtons()).toHaveLength(3);
        expect(nodeButton('Orders with amounts')).toHaveAttribute(
            'data-terminal',
            'true',
        );
        expect(nodeButton('Orders by status')).toHaveAttribute(
            'data-terminal',
            'false',
        );
        expect(screen.queryByText('Sources')).toBeNull();
    });

    it('displays a node when its graph box is clicked and stays in Graph mode', () => {
        const onDisplayNode = vi.fn();
        renderPanel({
            defaultExpanded: true,
            defaultMode: 'graph',
            onDisplayNode,
        });
        fireEvent.click(nodeButton('Average amount'));
        expect(onDisplayNode).toHaveBeenCalledWith('amounts');
        expect(screen.getByRole('radio', { name: 'Graph' })).toBeChecked();
    });

    it('marks the displayed node and disables nodes without a stored result', () => {
        renderPanel({
            defaultExpanded: true,
            defaultMode: 'graph',
            displayedNodeId: 'amounts',
            displayableNodeIds: new Set(['amounts']),
        });
        expect(nodeButton('Average amount')).toHaveAttribute(
            'data-displayed',
            'true',
        );
        expect(nodeButton('Orders by status')).toHaveAttribute(
            'aria-disabled',
            'true',
        );
    });
});

const cell = (nodeId: string) =>
    within(document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)!);

describe('AiComposerPipelinePanel list mode', () => {
    it("shows a node's status only while queued or on error, with the error in its cell", () => {
        renderPanel({
            defaultExpanded: true,
            nodeStatuses: {
                orders: { status: 'success', error: null, totalRowCount: null },
                amounts: {
                    status: 'error',
                    error: 'column "amount" does not exist',
                    totalRowCount: null,
                },
                joined: { status: 'pending', error: null, totalRowCount: null },
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
            defaultExpanded: true,
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

    it('renders the rows of nodes with a result only, never those still running or failed', () => {
        renderPanel({
            defaultExpanded: true,
            displayableNodeIds: new Set(['orders', 'amounts']),
            nodeStatuses: {
                orders: { status: 'success', error: null, totalRowCount: null },
                amounts: {
                    status: 'running',
                    error: null,
                    totalRowCount: null,
                },
            },
        });
        expect(cell('orders').getByText('rows of orders')).toBeInTheDocument();
        expect(cell('amounts').queryByText('rows of amounts')).toBeNull();
        expect(cell('joined').queryByText('rows of joined')).toBeNull();
    });

    it('collapses the whole cell, and jumping to a collapsed reader expands it', () => {
        renderPanel({ defaultExpanded: true });
        const toggle = (nodeId: string) =>
            cell(nodeId).getAllByRole('button', { name: /step$/ })[0];
        fireEvent.click(toggle('joined'));
        expect(toggle('joined')).toHaveAccessibleName('Expand step');
        expect(cell('joined').queryByText('rows of joined')).toBeNull();

        fireEvent.click(
            cell('orders').getByRole('button', { name: 'Orders with amounts' }),
        );
        expect(toggle('joined')).toHaveAccessibleName('Collapse step');
        expect(cell('joined').getByText('rows of joined')).toBeInTheDocument();
    });

    it('adds a node to the chat until it is attached', () => {
        const onAddToChat = vi.fn();
        renderPanel({
            defaultExpanded: true,
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

describe('AiComposerPipelinePanel semantic nodes', () => {
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

    it("shows a semantic node's filters and sort inline", () => {
        renderPanel({
            defaultExpanded: true,
            queries: [semanticOrders, queries[1], queries[2]],
        });
        expect(cell('orders').getByText('completed')).toBeInTheDocument();
        expect(
            cell('orders').getByTestId('semantic-node-sort'),
        ).toHaveTextContent('Orders count');
    });

    it('compiles a semantic node query only once Compiled SQL is opened', () => {
        compiledSql.mockReturnValue({
            data: { query: 'SELECT status FROM orders' },
        } as unknown as ReturnType<typeof useCompiledSqlFromMetricQuery>);
        renderPanel({
            defaultExpanded: true,
            queries: [semanticOrders, queries[1], queries[2]],
        });
        expect(compiledSql).not.toHaveBeenCalled();
        fireEvent.click(
            cell('orders').getByRole('button', { name: 'Compiled SQL' }),
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

describe('AiComposerPipelinePanel python nodes', () => {
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
            defaultExpanded: true,
            queries: pythonQueries,
        });
        expect(
            document
                .querySelector('[data-node-id="simulated"]')!
                .querySelector('code'),
        ).toHaveTextContent(/def run\(inputs, params\):/);
    });

    it('labels a python node in graph mode', () => {
        renderPanel({
            defaultExpanded: true,
            defaultMode: 'graph',
            queries: pythonQueries,
            displayedNodeId: 'simulated',
            displayableNodeIds: new Set(['simulated']),
        });
        expect(
            within(
                screen.getByLabelText('Display Simulated amounts'),
            ).getByText('Python'),
        ).toBeInTheDocument();
    });
});
