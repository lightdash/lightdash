import {
    DbtProjectTypeLabels,
    getProjectInfoToolDefinition,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetProjectInfoFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    getProjectInfo: GetProjectInfoFn;
};

const toolDefinition = getProjectInfoToolDefinition.for('agent');

export const getGetProjectInfo = ({ getProjectInfo }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async () => {
            try {
                const info = await getProjectInfo();

                const lines = [
                    `Lightdash project: *${info.projectName}* (${info.projectType})`,
                    `dbt connection: ${DbtProjectTypeLabels[info.dbtConnectionType]}`,
                    `dbt version: ${info.dbtVersion}`,
                ];

                if (info.warehouseType) {
                    lines.push(`Warehouse: ${info.warehouseType}`);
                }

                if (info.git) {
                    lines.push(
                        `Git repository: ${info.git.repository} (branch \`${info.git.branch}\`)`,
                    );
                    if (
                        info.git.projectSubPath &&
                        info.git.projectSubPath !== '/'
                    ) {
                        lines.push(
                            `dbt project sub-path: ${info.git.projectSubPath}`,
                        );
                    }
                    if (info.git.hostDomain) {
                        lines.push(`Git host: ${info.git.hostDomain}`);
                    }
                }

                // Preview-deploy GitHub Actions status — lets the assistant
                // answer "are preview deploys set up?" from the git-backed repo.
                // This only detects the Lightdash GitHub Actions workflow (the
                // only setup the agent automates today); preview deploys wired
                // via another CI aren't detected. Null when undeterminable.
                if (info.previewDeployCi) {
                    lines.push(
                        info.previewDeployCi.hasPreviewDeployWorkflow
                            ? `Preview-deploy GitHub Actions: configured${
                                  info.previewDeployCi.workflowPath
                                      ? ` (${info.previewDeployCi.workflowPath})`
                                      : ''
                              }`
                            : 'Preview-deploy GitHub Actions: not found — no Lightdash preview-deploy workflow in the repo. You can offer to add one with the `setupPreviewDeploy` tool (GitHub Actions only).',
                    );
                }

                return {
                    result: lines.join('\n'),
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error getting project details.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
