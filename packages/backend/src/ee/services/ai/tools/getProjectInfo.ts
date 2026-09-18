import {
    DbtProjectTypeLabels,
    getProjectInfoToolDefinition,
    type ToolGetProjectInfoStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetProjectInfoFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    getProjectInfo: GetProjectInfoFn;
};

const toolDefinition = getProjectInfoToolDefinition.for('agent');

const toProjectDetails = (
    info: Awaited<ReturnType<GetProjectInfoFn>>,
): ToolGetProjectInfoStructuredContent => ({
    projectName: info.projectName,
    projectType: info.projectType,
    dbtConnectionType: info.dbtConnectionType,
    dbtConnectionLabel: DbtProjectTypeLabels[info.dbtConnectionType],
    dbtVersion: info.dbtVersion,
    warehouseType: info.warehouseType,
    git: info.git
        ? {
              repository: info.git.repository,
              branch: info.git.branch,
              projectSubPath:
                  info.git.projectSubPath && info.git.projectSubPath !== '/'
                      ? info.git.projectSubPath
                      : null,
              hostDomain: info.git.hostDomain,
          }
        : null,
    previewDeployCi: info.previewDeployCi,
});

const renderProjectDetails = (
    details: ToolGetProjectInfoStructuredContent,
): string => {
    const lines = [
        `Lightdash project: *${details.projectName}* (${details.projectType})`,
        `dbt connection: ${details.dbtConnectionLabel}`,
        `dbt version: ${details.dbtVersion}`,
    ];

    if (details.warehouseType) {
        lines.push(`Warehouse: ${details.warehouseType}`);
    }

    if (details.git) {
        lines.push(
            `Git repository: ${details.git.repository} (branch \`${details.git.branch}\`)`,
        );
        if (details.git.projectSubPath) {
            lines.push(`dbt project sub-path: ${details.git.projectSubPath}`);
        }
        if (details.git.hostDomain) {
            lines.push(`Git host: ${details.git.hostDomain}`);
        }
    }

    // Preview-deploy GitHub Actions status — lets the assistant
    // answer "are preview deploys set up?" from the git-backed repo.
    // This only detects the Lightdash GitHub Actions workflow (the
    // only setup the agent automates today); preview deploys wired
    // via another CI aren't detected. Null when undeterminable.
    if (details.previewDeployCi) {
        lines.push(
            details.previewDeployCi.hasPreviewDeployWorkflow
                ? `Preview-deploy GitHub Actions: configured${
                      details.previewDeployCi.workflowPath
                          ? ` (${details.previewDeployCi.workflowPath})`
                          : ''
                  }`
                : 'Preview-deploy GitHub Actions: not found — no Lightdash preview-deploy workflow in the repo. You can offer to add one with the `setupPreviewDeploy` tool (GitHub Actions only).',
        );
    }

    return lines.join('\n');
};

export const getGetProjectInfo = ({ getProjectInfo }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (): Promise<
            | ExecuteStructuredToolResult<ToolGetProjectInfoStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const details = toProjectDetails(await getProjectInfo());

                return {
                    result: renderProjectDetails(details),
                    metadata: { status: 'success' },
                    structuredContent: details,
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error getting project details.');
            }
        },
    });
