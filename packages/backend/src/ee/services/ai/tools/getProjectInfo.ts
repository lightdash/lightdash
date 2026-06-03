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

                // Preview-deploy CI status — lets the assistant answer "is
                // preview-deploy set up?" straight from the git-backed project.
                // Only meaningful for git projects; null means undeterminable.
                if (info.previewDeployCi) {
                    lines.push(
                        info.previewDeployCi.hasPreviewDeployWorkflow
                            ? `Preview deploys: configured via GitHub Actions${
                                  info.previewDeployCi.workflowPath
                                      ? ` (${info.previewDeployCi.workflowPath})`
                                      : ''
                              }`
                            : 'Preview deploys: NOT set up — no Lightdash preview-deploy GitHub Actions workflow found in the repo. Offer to add one with the `setupPreviewDeploy` tool.',
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
