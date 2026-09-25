import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { AiComposerPipelinePanel } from './AiComposerPipelinePanel';

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
    defaultExpanded?: boolean;
    defaultMode?: 'list' | 'graph';
    displayedNodeId?: string;
    displayableNodeIds?: Set<string>;
    onDisplayNode?: (nodeId: string) => void;
}) =>
    renderWithProviders(
        <AiComposerPipelinePanel
            queries={queries}
            terminalNodeId="joined"
            displayedNodeId="joined"
            displayableNodeIds={new Set(['orders', 'amounts', 'joined'])}
            onDisplayNode={() => {}}
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

describe('AiComposerPipelinePanel earlier result placeholder', () => {
    it('lists the placeholder by alias without counting it or showing the uuid', () => {
        const uuid = 'bcf89bb4-c964-4c1e-9a55-0d6a3f1a2b3c';
        renderWithProviders(
            <AiComposerPipelinePanel
                queries={[
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'ranked',
                        title: 'Ranked orders',
                        sql: 'select 1',
                        references: { prev: uuid },
                    },
                ]}
                terminalNodeId="ranked"
                displayedNodeId="ranked"
                displayableNodeIds={new Set(['ranked'])}
                onDisplayNode={() => {}}
                defaultExpanded
            >
                <div>results</div>
            </AiComposerPipelinePanel>,
        );
        expect(screen.getByText('1 step')).toBeInTheDocument();
        expect(screen.getByText('prev')).toBeInTheDocument();
        expect(screen.getByText('Earlier result')).toBeInTheDocument();
        expect(screen.getByText('Reads prev')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain(uuid);
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
});
