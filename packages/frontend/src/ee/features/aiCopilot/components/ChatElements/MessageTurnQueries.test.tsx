import {
    QuerySourceType,
    type AiAgentMessageQueryPipeline,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { MessageQueriesList } from './MessageTurnQueries';

const pipeline: AiAgentMessageQueryPipeline = {
    queryUuid: 'q1',
    title: 'Net orders',
    terminalNodeId: 'net',
    nodes: [
        {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'orders',
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_count'],
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'net',
            sql: 'select 1',
            references: ['orders'],
        },
    ],
};

describe('MessageQueriesList', () => {
    it('shows a card per pipeline and passes the clicked pipeline to onSelect', () => {
        const onSelect = vi.fn();
        renderWithProviders(
            <MessageQueriesList pipelines={[pipeline]} onSelect={onSelect} />,
        );

        expect(screen.getByText('2 steps · Semantic layer')).toBeVisible();
        fireEvent.click(
            screen.getByRole('button', { name: 'Show query Net orders' }),
        );
        expect(onSelect).toHaveBeenCalledWith(pipeline);
    });
});
