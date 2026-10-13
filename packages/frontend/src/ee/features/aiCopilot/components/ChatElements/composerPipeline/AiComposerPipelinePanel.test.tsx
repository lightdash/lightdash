import {
    QuerySourceType,
    VizIndexType,
    type SourceQuery,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCompiledSqlFromMetricQuery } from '../../../../../../hooks/useCompiledSql';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { type ComposerRunNodeStatus } from '../useComposerRunNodeStatuses';
import { AiComposerPipelinePanel } from './AiComposerPipelinePanel';

vi.mock('../../../../../../hooks/useCompiledSql', () => ({
    useCompiledSqlFromMetricQuery: vi.fn(() => ({ data: undefined })),
}));
const compiledSql = vi.mocked(useCompiledSqlFromMetricQuery);

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
    it('shows the List / Graph switch only when expanded', () => {
        renderPanel({});
        expect(screen.queryByRole('radio', { name: 'Graph' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /queries/i }));
        expect(
            screen.getByRole('radio', { name: 'Graph' }),
        ).toBeInTheDocument();
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

describe('AiComposerPipelinePanel list mode', () => {
    it("shows each node's status in the run and a failed node's error on its row", () => {
        renderPanel({
            defaultExpanded: true,
            nodeStatuses: {
                orders: { status: 'success', error: null },
                amounts: {
                    status: 'error',
                    error: 'column "amount" does not exist',
                },
                joined: { status: 'pending', error: null },
            },
        });
        const row = (nodeId: string) =>
            within(
                document.getElementById(`composer-pipeline-node-${nodeId}`)!,
            );
        expect(row('orders').getByLabelText('Completed')).toBeInTheDocument();
        expect(row('amounts').getByLabelText('Failed')).toBeInTheDocument();
        expect(
            row('amounts').getByText('column "amount" does not exist'),
        ).toBeInTheDocument();
        expect(row('joined').getByLabelText('Queued')).toBeInTheDocument();
        expect(
            row('orders').queryByText('column "amount" does not exist'),
        ).toBeNull();
    });

    it('shows no status before the run has node results', () => {
        renderPanel({ defaultExpanded: true });
        expect(screen.queryByLabelText('Queued')).toBeNull();
        expect(screen.queryByLabelText('Completed')).toBeNull();
    });

    it('displays a node when its title is clicked', () => {
        const onDisplayNode = vi.fn();
        renderPanel({ defaultExpanded: true, onDisplayNode });
        fireEvent.click(
            screen.getByRole('button', { name: 'Display Average amount' }),
        );
        expect(onDisplayNode).toHaveBeenCalledWith('amounts');
    });

    it('marks the displayed row and leaves legacy nodes without a button', () => {
        renderPanel({
            defaultExpanded: true,
            displayedNodeId: 'amounts',
            displayableNodeIds: new Set(['amounts']),
        });
        expect(
            document.getElementById('composer-pipeline-node-amounts'),
        ).toHaveAttribute('data-displayed', 'true');
        expect(
            screen.getByRole('button', { name: 'Display Average amount' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.queryByRole('button', { name: 'Display Orders by status' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Orders by status')).toBeInTheDocument();
    });
});

describe('AiComposerPipelinePanel query details', () => {
    it('keeps the query collapsed until View query is clicked, without displaying the node', () => {
        const onDisplayNode = vi.fn();
        renderPanel({ defaultExpanded: true, onDisplayNode });
        const row = () =>
            document.getElementById('composer-pipeline-node-amounts')!;
        const toggle = (name: string) =>
            within(row()).getByRole('button', { name });
        expect(toggle('View query')).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(toggle('View query'));
        expect(toggle('Hide query')).toHaveAttribute('aria-expanded', 'true');
        expect(row().querySelector('code')).toHaveTextContent(/select\s+2/i);
        expect(onDisplayNode).not.toHaveBeenCalled();
        fireEvent.click(toggle('Hide query'));
        expect(toggle('View query')).toHaveAttribute('aria-expanded', 'false');
    });

    it('displays a node from the keyboard', () => {
        const onDisplayNode = vi.fn();
        renderPanel({ defaultExpanded: true, onDisplayNode });
        fireEvent.keyDown(
            screen.getByRole('button', { name: 'Display Average amount' }),
            { key: 'Enter' },
        );
        expect(onDisplayNode).toHaveBeenCalledWith('amounts');
    });

    it('compiles a semantic node query only once View query is opened', () => {
        compiledSql.mockReturnValue({
            data: { query: 'SELECT status FROM orders' },
        } as unknown as ReturnType<typeof useCompiledSqlFromMetricQuery>);
        renderPanel({
            defaultExpanded: true,
            queries: [
                {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    nodeId: 'orders',
                    title: 'Orders by status',
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_count'],
                    pivotConfiguration: {
                        indexColumn: [
                            {
                                reference: 'orders_status',
                                type: VizIndexType.CATEGORY,
                            },
                        ],
                        valuesColumns: [],
                        groupByColumns: undefined,
                        sortBy: undefined,
                    },
                },
                queries[1],
                queries[2],
            ],
        });
        const row = document.getElementById('composer-pipeline-node-orders')!;
        expect(compiledSql).not.toHaveBeenCalled();
        fireEvent.click(
            within(row).getByRole('button', { name: 'View query' }),
        );
        expect(compiledSql).toHaveBeenCalledWith(
            expect.objectContaining({
                tableName: 'orders',
                projectUuid: 'project',
                metricQuery: expect.objectContaining({
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_count'],
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
        expect(row.querySelector('code')).toHaveTextContent(
            /select\s+status\s+from\s+orders/i,
        );
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

    it('lists a python node as a transformation with its code behind View code', () => {
        renderWithProviders(
            <AiComposerPipelinePanel
                projectUuid="project"
                queries={pythonQueries}
                terminalNodeId="summary"
                displayedNodeId="summary"
                displayableNodeIds={new Set(['orders', 'simulated', 'summary'])}
                onDisplayNode={() => {}}
                nodeStatuses={{}}
                defaultExpanded
            >
                <div>results</div>
            </AiComposerPipelinePanel>,
        );
        expect(screen.getByText('Transformation')).toBeInTheDocument();
        const row = document.getElementById(
            'composer-pipeline-node-simulated',
        )!;
        expect(within(row).getByText('Python')).toBeInTheDocument();
        expect(
            within(row).getByText('Monte Carlo draws per status.'),
        ).toBeInTheDocument();
        expect(within(row).getByText('Reads Orders by status')).toBeVisible();
        fireEvent.click(within(row).getByRole('button', { name: 'View code' }));
        expect(row.querySelector('code')).toHaveTextContent(
            /def run\(inputs, params\):/,
        );
        expect(
            within(
                document.getElementById('composer-pipeline-node-summary')!,
            ).getByText('Reads Simulated amounts'),
        ).toBeInTheDocument();
    });

    it('labels a python node in graph mode', () => {
        renderWithProviders(
            <AiComposerPipelinePanel
                projectUuid="project"
                queries={pythonQueries}
                terminalNodeId="simulated"
                displayedNodeId="simulated"
                displayableNodeIds={new Set(['simulated'])}
                onDisplayNode={() => {}}
                nodeStatuses={{}}
                defaultExpanded
                defaultMode="graph"
            >
                <div>results</div>
            </AiComposerPipelinePanel>,
        );
        expect(
            within(
                screen.getByLabelText('Display Simulated amounts'),
            ).getByText('Python'),
        ).toBeInTheDocument();
    });
});
