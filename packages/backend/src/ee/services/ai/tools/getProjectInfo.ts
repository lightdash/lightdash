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
    connections: info.connections.map((connection) => ({
        name: connection.name,
        warehouseConnectionUuid: connection.warehouseConnectionUuid,
        warehouseType: connection.warehouseType,
        isOriginal: connection.isOriginal,
    })),
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

    details.connections.forEach((connection) => {
        lines.push(
            `Connection ${JSON.stringify(connection.name)} (${connection.warehouseConnectionUuid ?? 'original'}): ${connection.warehouseType}${connection.isOriginal ? ' (original; raw SQL tools use this connection)' : ''}`,
        );
    });

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
