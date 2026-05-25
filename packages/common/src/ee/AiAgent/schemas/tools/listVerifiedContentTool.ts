import { z } from 'zod';
import { defineTool } from '../defineTool';

export const listVerifiedContentTool = defineTool({
    name: 'listVerifiedContent',
    title: 'List Verified Content',
    description:
        'List all verified charts and dashboards in the active project. Verified content has been reviewed and marked as trusted — use this to discover reference examples of sanctioned metrics and visualizations when building new content. Requires an active project set via set_project. Each item includes contentType (chart or dashboard), contentUuid, name, space, and verification metadata (who verified it and when).',
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
