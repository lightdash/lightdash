import {
    listProjectsToolDefinition,
    type ToolListProjectsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListProjectsFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    listProjects: ListProjectsFn;
};

type ListProjectsOutput =
    | ExecuteStructuredToolResult<ToolListProjectsStructuredContent>
    | ExecuteToolErrorResult;

const renderProjects = ({
    projects,
}: ToolListProjectsStructuredContent): string => {
    if (projects.length === 0) {
        return "You don't have access to any projects in this organization.";
    }
    return [
        `You have access to ${projects.length} project(s):`,
        ...projects.map(
            (p) =>
                `• ${p.name}${p.isActive ? ' (the project you are currently working in)' : ''}`,
        ),
    ].join('\n');
};

const toolDefinition = listProjectsToolDefinition.for('agent');

export const getListProjects = ({ listProjects }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (): Promise<ListProjectsOutput> => {
            try {
                const projects = await listProjects();
                const structuredContent = {
                    projects: projects.map(({ name, isActive }) => ({
                        name,
                        isActive,
                    })),
                };

                return {
                    result: renderProjects(structuredContent),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error listing projects.');
            }
        },
    });
