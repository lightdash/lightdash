import { listProjectsToolDefinition } from '@lightdash/common';
import type { ListProjectsFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    listProjects: ListProjectsFn;
};

const toolDefinition = listProjectsToolDefinition.for('ai-sdk');

export const getListProjects = ({ listProjects }: Dependencies) =>
    toolDefinition.build({
        execute: async () => {
            try {
                const projects = await listProjects();

                if (projects.length === 0) {
                    return {
                        status: 'success' as const,
                        type: 'string' as const,
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
                    status: 'success' as const,
                    type: 'string' as const,
                    result: lines.join('\n'),
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(error, 'Error listing projects.'),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
