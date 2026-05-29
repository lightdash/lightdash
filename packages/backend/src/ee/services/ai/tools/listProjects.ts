import { listProjectsToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { ListProjectsFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    listProjects: ListProjectsFn;
};

const toolDefinition = listProjectsToolDefinition.for('agent');

export const getListProjects = ({ listProjects }: Dependencies) =>
    tool({
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema,
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
                    ...projects.map(
                        (p) =>
                            `• ${p.name}${p.isActive ? ' (the project you are currently working in)' : ''}`,
                    ),
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
