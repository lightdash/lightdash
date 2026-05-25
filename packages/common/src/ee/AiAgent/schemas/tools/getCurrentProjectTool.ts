import { z } from 'zod';
import { defineTool } from '../defineTool';

export const getCurrentProjectTool = defineTool({
    name: 'getCurrentProject',
    title: 'Get Current Project',
    description:
        'Get the currently active project and its configuration. Returns the project UUID, name, and any selected tags. Use this to verify context before calling data tools.',
    availability: 'mcp',
    inputSchema: z.object({}),
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
});
