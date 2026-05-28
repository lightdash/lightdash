import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_LIST_PROJECTS_DESCRIPTION = [
    'List the Lightdash projects in this organization that the current user has access to.',
    'Use this when the user asks what projects exist, which projects they can access, or wants to know about other projects in their organization.',
    'This is read-only and only returns projects the user is allowed to view. It does not switch the project you are currently working in.',
].join(' ');

export const toolListProjectsArgsSchema = z.object({});

export type ToolListProjectsArgs = z.infer<typeof toolListProjectsArgsSchema>;

export const toolListProjectsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolListProjectsOutput = z.infer<
    typeof toolListProjectsOutputSchema
>;
