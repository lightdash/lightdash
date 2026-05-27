import {
    toolListProjectsArgsSchema,
    toolListProjectsOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListProjectsFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    listProjects: ListProjectsFn;
};

export const getListProjects = ({ listProjects }: Dependencies) =>
    tool({
        description: toolListProjectsArgsSchema.description,
        inputSchema: toolListProjectsArgsSchema,
        outputSchema: toolListProjectsOutputSchema,
        execute: async () => {
            try {
                const projects = await listProjects();

                if (projects.length === 0) {
                    return {
                        result: "You don't have access to any projects in this organization.",
                        metadata: { status: 'success' as const },
                    };
                }

                const lines = [
                    `You have access to ${projects.length} project(s):`,
                    ...projects.map((p) => `• ${p.name}`),
                ];

                return {
                    result: lines.join('\n'),
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error listing projects.'),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
