import { z } from 'zod';
import {
    DbtProjectType,
    ProjectType,
    WarehouseTypes,
} from '../../../../types/projects';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_GET_PROJECT_INFO_DESCRIPTION = [
    'Get details about the Lightdash project you are currently working in and its underlying dbt project.',
    'Use this when the user asks what dbt project this is, which git repository/branch it connects to, what dbt version or warehouse it uses, or wants general context about the current project.',
    'This is read-only, applies to the project you are currently working in, and never returns credentials or secrets.',
].join(' ');

export const toolGetProjectInfoArgsSchema = z.object({});

export type ToolGetProjectInfoArgs = z.infer<
    typeof toolGetProjectInfoArgsSchema
>;

export const toolGetProjectInfoStructuredContentSchema = z.object({
    projectName: z.string(),
    projectType: z
        .enum(ProjectType)
        .describe('DEFAULT for a regular project, PREVIEW for a preview.'),
    dbtConnectionType: z
        .enum(DbtProjectType)
        .describe('How the dbt project is connected (git host, dbt Cloud, …).'),
    dbtConnectionLabel: z
        .string()
        .describe('Human-readable name of the dbt connection type.'),
    dbtVersion: z.string(),
    warehouseType: z
        .enum(WarehouseTypes)
        .nullable()
        .describe('Null when the project has no warehouse connection.'),
    git: z
        .object({
            repository: z.string(),
            branch: z.string(),
            projectSubPath: z
                .string()
                .nullable()
                .describe(
                    'Directory of the dbt project inside the repo; null when it is the repo root.',
                ),
            hostDomain: z
                .string()
                .nullable()
                .describe('Self-hosted git domain; null for the default host.'),
        })
        .nullable()
        .describe('Null when the dbt project is not git-backed.'),
    previewDeployCi: z
        .object({
            hasPreviewDeployWorkflow: z
                .boolean()
                .describe(
                    'Whether the repo has the Lightdash preview-deploy GitHub Actions workflow.',
                ),
            workflowPath: z
                .string()
                .nullable()
                .describe('Path of the workflow file when found.'),
        })
        .nullable()
        .describe(
            'Null when preview-deploy CI cannot be determined (not a git project or no GitHub App).',
        ),
});

export type ToolGetProjectInfoStructuredContent = z.infer<
    typeof toolGetProjectInfoStructuredContentSchema
>;

export const toolGetProjectInfoOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolGetProjectInfoStructuredContentSchema,
});

export type ToolGetProjectInfoOutput = z.infer<
    typeof toolGetProjectInfoOutputSchema
>;
