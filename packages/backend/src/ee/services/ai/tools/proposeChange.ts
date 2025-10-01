import {
    NotImplementedError,
    ToolProposeChangeArgs,
    toolProposeChangeArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import { CreateChangeFn } from '../types/aiAgentDependencies';

import { toolErrorHandler } from '../utils/toolErrorHandler';

type GetProposeChangeArgs = {
    createChange: CreateChangeFn;
};

export const getProposeChange = ({ createChange }: GetProposeChangeArgs) =>
    tool({
        description: toolProposeChangeArgsSchema.description,
        inputSchema: toolProposeChangeArgsSchema,
        execute: async (toolArgs) => {
            try {
                console.dir(toolArgs, { depth: null });
                // createChange is now available but not used yet
                return `Success`;
            } catch (error) {
                return toolErrorHandler(error, 'Error proposing change');
            }
        },
    });
