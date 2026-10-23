import {
    QuerySourceType,
    type AiAgentMessageQueryPipeline,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { MessageQueriesList } from './MessageQueryPipelines';

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
            <MessageQueriesList
                pipelines={[pipeline]}
                onSelect={onSelect}
                selectedQueryUuid={null}
            />,
        );

        expect(screen.getByText('2 steps · Semantic layer')).toBeVisible();
        fireEvent.click(
            screen.getByRole('button', { name: 'Show query Net orders' }),
        );
        expect(onSelect).toHaveBeenCalledWith(pipeline);
    });

    it('marks the open pipeline as pressed', () => {
        renderWithProviders(
            <MessageQueriesList
                pipelines={[
                    pipeline,
                    { ...pipeline, queryUuid: 'q2', title: 'Other' },
                ]}
                onSelect={vi.fn()}
                selectedQueryUuid="q2"
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Show query Other' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('button', { name: 'Show query Net orders' }),
        ).toHaveAttribute('aria-pressed', 'false');
    });
});
