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

const renderPanel = (props: {
    defaultExpanded?: boolean;
    defaultMode?: 'list' | 'graph';
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

// React Flow hides nodes until measured (never in jsdom) and hidden elements
// get no accessible name, so match the aria-label attribute directly.
const nodeButtons = () => screen.getAllByLabelText(/^Go to /);
const nodeButton = (title: string) => screen.getByLabelText(`Go to ${title}`);

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

    it('jumps to the selected row in List mode when a graph node is clicked', () => {
        renderPanel({ defaultExpanded: true, defaultMode: 'graph' });
        fireEvent.click(nodeButton('Average amount'));
        expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
        const row = document.getElementById('composer-pipeline-node-amounts');
        expect(row).toHaveAttribute('data-selected', 'true');
        expect(
            document.getElementById('composer-pipeline-node-orders'),
        ).toHaveAttribute('data-selected', 'false');
    });
});
