import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

const duckdb = (
    nodeId: string,
    title: string,
    references: string[],
): SourceQuery => ({
    sourceType: QuerySourceType.DUCKDB,
    nodeId,
    title,
    sql: 'select 1',
    references,
});

const renderPanel = (props: {
    defaultExpanded?: boolean;
    defaultMode?: 'list' | 'graph';
    queries?: SourceQuery[];
    terminalNodeId?: string;
}) =>
    renderWithProviders(
        <AiComposerPipelinePanel
            queries={queries}
            terminalNodeId="joined"
            {...props}
        >
            <div>results</div>
        </AiComposerPipelinePanel>,
    );

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

    it('renders one graph node per pipeline node and one edge per reference', () => {
        renderPanel({ defaultExpanded: true, defaultMode: 'graph' });
        expect(screen.getAllByRole('button', { name: /^Go to / })).toHaveLength(
            3,
        );
        expect(
            screen.getByRole('button', { name: 'Go to Orders with amounts' }),
        ).toHaveAttribute('data-terminal', 'true');
        expect(screen.getAllByTestId('composer-pipeline-edge')).toHaveLength(2);
        expect(screen.queryByText('Sources')).toBeNull();
    });

    it('jumps to the selected row in List mode when a graph node is clicked', () => {
        renderPanel({ defaultExpanded: true, defaultMode: 'graph' });
        fireEvent.click(
            screen.getByRole('button', { name: 'Go to Average amount' }),
        );
        expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
        const row = document.getElementById('composer-pipeline-node-amounts');
        expect(row).toHaveAttribute('data-selected', 'true');
        expect(
            document.getElementById('composer-pipeline-node-orders'),
        ).toHaveAttribute('data-selected', 'false');
    });

    it('puts the terminal in the last column of a multi-sink pipeline', () => {
        renderPanel({
            defaultExpanded: true,
            defaultMode: 'graph',
            queries: [
                queries[0],
                duckdb('x', 'X', ['orders']),
                duckdb('y', 'Y', ['x']),
            ],
            terminalNodeId: 'x',
        });
        const columnOf = (name: string) =>
            Number(
                screen
                    .getByRole('button', { name: `Go to ${name}` })
                    .getAttribute('transform')
                    ?.match(/translate\((\d+)/)?.[1],
            );
        expect(columnOf('Orders by status')).toBeLessThan(columnOf('Y'));
        expect(columnOf('Y')).toBeLessThan(columnOf('X'));
    });

    it('renders an empty pipeline without NaN geometry', () => {
        const { container } = renderPanel({
            defaultExpanded: true,
            defaultMode: 'graph',
            queries: [],
            terminalNodeId: 'none',
        });
        expect(container.innerHTML).not.toContain('NaN');
        expect(screen.queryByRole('button', { name: /^Go to / })).toBeNull();
    });

    it('scopes clip path ids per panel instance', () => {
        renderPanel({ defaultExpanded: true, defaultMode: 'graph' });
        renderPanel({ defaultExpanded: true, defaultMode: 'graph' });
        const ids = [...document.querySelectorAll('clipPath')].map(
            (element) => element.id,
        );
        expect(ids).toHaveLength(6);
        expect(new Set(ids).size).toBe(6);
    });
});
