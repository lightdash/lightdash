import { z } from 'zod';
import { defineTool } from '../defineTool';

export const listProjectsTool = defineTool({
    name: 'listProjects',
    title: 'List Projects',
    description:
        'List all accessible projects in the organization. Projects contain explores, fields, and content. Use this to discover available projects before calling set_project to select one as the active context for subsequent operations.',
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
