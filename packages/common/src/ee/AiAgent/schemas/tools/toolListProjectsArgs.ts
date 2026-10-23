import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_LIST_PROJECTS_DESCRIPTION = [
    'List the projects in this organization that the user can access.',
    'Use it when the user asks which projects exist, which they can access, or about other projects in their organization.',
    'It does not switch the project you are working in.',
].join(' ');

export const toolListProjectsArgsSchema = z.object({});

export type ToolListProjectsArgs = z.infer<typeof toolListProjectsArgsSchema>;

export const toolListProjectsStructuredContentSchema = z.object({
    projects: z
        .array(
            z.object({
                name: z.string(),
                isActive: z
                    .boolean()
                    .describe(
                        'True for the project the agent is currently working in.',
                    ),
            }),
        )
        .describe(
            'Projects the current user can access, in the order they were listed; empty when the user has access to none.',
        ),
});

export type ToolListProjectsStructuredContent = z.infer<
    typeof toolListProjectsStructuredContentSchema
>;

export const toolListProjectsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolListProjectsStructuredContentSchema,
});

export type ToolListProjectsOutput = z.infer<
    typeof toolListProjectsOutputSchema
>;
