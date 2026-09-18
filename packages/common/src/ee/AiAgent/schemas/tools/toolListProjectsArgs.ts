import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_LIST_PROJECTS_DESCRIPTION = [
    'List the Lightdash projects in this organization that the current user has access to.',
    'Use this when the user asks what projects exist, which projects they can access, or wants to know about other projects in their organization.',
    'This is read-only and only returns projects the user is allowed to view. It does not switch the project you are currently working in.',
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
