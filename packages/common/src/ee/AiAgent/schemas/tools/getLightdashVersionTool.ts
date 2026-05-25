import { z } from 'zod';
import { defineTool } from '../defineTool';

export const getLightdashVersionTool = defineTool({
    name: 'getLightdashVersion',
    title: 'Get Lightdash Version',
    description: 'Get the current Lightdash version',
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
