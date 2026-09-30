import {
    loadAgentToolsToolDefinition,
    type ToolLoadAgentToolsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

const toolDefinition = loadAgentToolsToolDefinition.for('agent');

export const getLoadAgentTools = (
    onLoad: () => void = () => {},
    deferredInstructions = '',
) =>
    tool({
        ...toolDefinition,
        execute: async (): Promise<
            | ExecuteStructuredToolResult<ToolLoadAgentToolsStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                onLoad();
                return {
                    result: [
                        'The remaining available agent tools are now loaded. Use their actual schemas; all existing access and action requirements still apply.',
                        deferredInstructions,
                    ]
                        .filter(Boolean)
                        .join('\n\n'),
                    metadata: { status: 'success' },
                    structuredContent: {
                        toolsLoaded: true,
                        deferredInstructions: deferredInstructions || null,
                    },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error loading agent tools.');
            }
        },
    });
