import { toolProposeChangeArgsSchema } from '@lightdash/common';
import { tool } from 'ai';

import { toolErrorHandler } from '../utils/toolErrorHandler';

export const getProposeChange = () =>
    tool({
        description: toolProposeChangeArgsSchema.description,
        inputSchema: toolProposeChangeArgsSchema,
        execute: async (toolArgs) => {
            try {
                console.dir(toolArgs, { depth: null });
                return `Success`;
            } catch (error) {
                return toolErrorHandler(error, 'Error proposing change');
            }
        },
    });
