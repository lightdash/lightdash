import type { AiAgentToolCall, AiAgentToolResult } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { ToolResults } from './ToolResults';

const toolCall = {
    uuid: 'tool-call-uuid',
    promptUuid: 'prompt-uuid',
    toolCallId: 'tool-call-id',
    parentToolCallId: null,
    createdAt: new Date('2026-08-04T16:56:32.774Z'),
    toolArgs: {},
    toolType: 'built-in',
    toolName: 'generateVisualization',
} satisfies AiAgentToolCall;

const toolResult = {
    uuid: 'tool-result-uuid',
    promptUuid: 'prompt-uuid',
    toolCallId: 'tool-call-id',
    createdAt: new Date('2026-08-04T16:56:32.774Z'),
    result: 'Problem: "greaterThan" is not available for string fields.',
    toolType: 'built-in',
    toolName: 'generateVisualization',
    metadata: { status: 'error' },
} satisfies AiAgentToolResult;

describe('ToolResults', () => {
    it('renders the raw result for a failed tool call', () => {
        renderWithProviders(
            <ToolResults toolCall={toolCall} toolResult={toolResult} />,
        );

        expect(screen.getByText('Error')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Problem: "greaterThan" is not available for string fields.',
            ),
        ).toBeInTheDocument();
    });
});
