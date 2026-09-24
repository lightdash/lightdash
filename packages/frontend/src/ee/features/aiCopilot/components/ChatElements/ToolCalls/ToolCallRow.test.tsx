import { QuerySourceType, type AiAgentToolResult } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { ToolCallRow, type ToolCallRowStatus } from './ToolCallRow';
import { type ToolCallSummary } from './utils/types';

const toolCall: ToolCallSummary = {
    toolCallId: 'call-1',
    toolName: 'runComposerQueries',
    toolArgs: {
        queries: [
            {
                sourceType: QuerySourceType.SQL,
                nodeId: 'orders',
                title: 'Orders by status',
                description: null,
                sql: 'select 1',
                limit: 500,
            },
        ],
    },
};

const result = (status: 'success' | 'error'): AiAgentToolResult => ({
    uuid: 'result-1',
    promptUuid: 'prompt-1',
    createdAt: new Date(),
    toolCallId: 'call-1',
    toolType: 'built-in',
    toolName: 'runComposerQueries',
    result: '',
    metadata: { status },
});

const renderRow = (props: {
    status: ToolCallRowStatus;
    toolResults?: AiAgentToolResult[];
    call?: ToolCallSummary;
}) =>
    renderWithProviders(
        <ToolCallRow
            toolName="runComposerQueries"
            toolCalls={[props.call ?? toolCall]}
            status={props.status}
            toolResults={props.toolResults}
        />,
    );

describe('ToolCallRow for runComposerQueries', () => {
    it('keeps the pipeline card while running', () => {
        renderRow({ status: 'running' });
        expect(screen.getByRole('button', { expanded: false })).toBeVisible();
    });

    it('keeps the pipeline card when the run failed', () => {
        renderRow({ status: 'error', toolResults: [result('error')] });
        expect(screen.getByRole('button', { expanded: false })).toBeVisible();
    });

    it('keeps the pipeline expandable once the run produced an artifact', async () => {
        renderRow({ status: 'done', toolResults: [result('success')] });
        const row = screen.getByRole('button', { name: /composer/i });
        expect(row).toHaveAttribute('aria-expanded', 'false');
        await userEvent.click(row);
        expect(row).toHaveAttribute('aria-expanded', 'true');
        await waitFor(() =>
            expect(screen.getByText('Orders by status')).toBeVisible(),
        );
        expect(screen.queryByLabelText('Completed')).not.toBeInTheDocument();
        expect(screen.queryByText('queued')).not.toBeInTheDocument();
    });

    it('keeps the pipeline expandable on a live final success output', () => {
        renderRow({
            status: 'done',
            call: {
                ...toolCall,
                toolOutput: { result: '', metadata: { status: 'success' } },
                isPreliminary: false,
            },
        });
        expect(
            screen.getByRole('button', { name: /composer/i }),
        ).toHaveAttribute('aria-expanded', 'false');
    });
});
