import {
    listDataAppConnectionsToolDefinition,
    type ToolListDataAppConnectionsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    DataAppConnectionSummary,
    ListDataAppConnectionsFn,
} from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listDataAppConnections: ListDataAppConnectionsFn;
};

const toolDefinition = listDataAppConnectionsToolDefinition.for('agent');

const renderConnection = (connection: DataAppConnectionSummary) => (
    <connection
        slug={connection.slug}
        authType={connection.authType}
        origin={connection.origin}
        linkedAs={
            connection.linkedAliases.length === 0
                ? null
                : connection.linkedAliases.join(',')
        }
    >
        <name>{connection.name}</name>
        {connection.instructions === null ? null : (
            <instructions>{connection.instructions}</instructions>
        )}
    </connection>
);

const renderConnections = (connections: DataAppConnectionSummary[]) =>
    connections.length === 0
        ? 'No external connections are available to link in this project. Omit externalConnectionSlugs; tell the user if they asked for one.'
        : (
              <connections count={connections.length}>
                  {connections.map(renderConnection)}
              </connections>
          ).toString();

export const getListDataAppConnections = ({
    listDataAppConnections,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            appSlug,
        }): Promise<
            | ExecuteStructuredToolResult<ToolListDataAppConnectionsStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const connections = await listDataAppConnections({ appSlug });
                return {
                    result: renderConnections(connections),
                    metadata: { status: 'success' },
                    structuredContent: { connections },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error listing connections.');
            }
        },
    });
