import { QuerySourceType, type AiAgentToolResult } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { ToolCallRow, type ToolCallRowStatus } from './ToolCallRow';
import { type ToolCallSummary } from './utils/types';

describe.each([
    { toolName: 'query', label: /ran query/i },
    // Calls persisted before the rename keep their name and label.
    { toolName: 'runComposerQueries', label: /ran composer queries/i },
] as const)('ToolCallRow for $toolName', ({ toolName, label }) => {
    const toolCall: ToolCallSummary = {
        toolCallId: 'call-1',
        toolName,
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

    const result = (status: 'success' | 'error'): AiAgentToolResult =>
        status === 'success'
            ? {
                  uuid: 'result-1',
                  promptUuid: 'prompt-1',
                  createdAt: new Date(),
                  toolCallId: 'call-1',
                  toolType: 'built-in',
                  toolName,
                  result: '',
                  metadata: { status: 'success' },
              }
            : {
                  uuid: 'result-1',
                  promptUuid: 'prompt-1',
                  createdAt: new Date(),
                  toolCallId: 'call-1',
                  toolType: 'built-in',
                  toolName,
                  result: '',
                  metadata: { status: 'error' },
              };

    const renderRow = (props: {
        status: ToolCallRowStatus;
        toolResults?: AiAgentToolResult[];
        call?: ToolCallSummary;
    }) =>
        renderWithProviders(
            <ToolCallRow
                toolName={toolName}
                toolCalls={[props.call ?? toolCall]}
                status={props.status}
                toolResults={props.toolResults}
            />,
        );

    it('keeps the pipeline card while running', () => {
        renderRow({ status: 'running' });
        expect(screen.getByRole('button', { expanded: false })).toBeVisible();
    });

    it('keeps the pipeline card when the run failed', () => {
        renderRow({ status: 'done', toolResults: [result('error')] });
        expect(screen.getByRole('button', { expanded: false })).toBeVisible();
    });

    it('keeps the pipeline expandable once the run produced an artifact', async () => {
        renderRow({ status: 'done', toolResults: [result('success')] });
        const row = screen.getByRole('button', { name: label });
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
        expect(screen.getByRole('button', { name: label })).toHaveAttribute(
            'aria-expanded',
            'false',
        );
    });
});

describe('ToolCallRow failure', () => {
    it('reads a failed step like a finished one, since the agent recovers', () => {
        renderWithProviders(
            <ToolCallRow
                toolName="runSql"
                toolCalls={[
                    {
                        toolCallId: 'call-1',
                        toolName: 'runSql',
                        toolArgs: { sql: 'select * from marketing.ad_spend' },
                    },
                ]}
                toolResults={[
                    {
                        uuid: 'result-1',
                        promptUuid: 'prompt-1',
                        createdAt: new Date(),
                        toolCallId: 'call-1',
                        toolType: 'built-in',
                        toolName: 'runSql',
                        result: 'Error running SQL.\n\n```\nrelation "marketing.ad_spend" does not exist\n```',
                        metadata: { status: 'error' },
                    },
                ]}
            />,
        );

        expect(
            screen.getByRole('button', { name: /ran sql query/i }),
        ).toBeVisible();
        expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
        expect(
            screen.queryByText('relation "marketing.ad_spend" does not exist'),
        ).not.toBeInTheDocument();
    });
});

describe.each(['findCustomChartTypes', 'visualize'] as const)(
    'ToolCallRow for %s',
    (toolName) => {
        it('renders no expand button when there is nothing to show', () => {
            renderWithProviders(
                <ToolCallRow
                    toolName={toolName}
                    toolCalls={[
                        { toolCallId: 'call-1', toolName, toolArgs: {} },
                    ]}
                />,
            );
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });
    },
);
