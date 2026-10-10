import {
    AgentCapability,
    type AgentAccessPreviewActionId,
} from '@lightdash/common';
import {
    getRequiredAgentCapabilities,
    type MCP_TOOL_CAPABILITIES,
    type REST_OPERATION_CAPABILITIES,
} from '../../auth/agentPermissions/capabilityMap';
import { type ExplainAgentOperationArgs } from './AgentPermissionService';

type Binding =
    | { type: 'capability'; capability: AgentCapability }
    | {
          type: 'operation';
          kind: 'rest_operation';
          key: keyof typeof REST_OPERATION_CAPABILITIES;
      }
    | {
          type: 'operation';
          kind: 'mcp_tool';
          key: keyof typeof MCP_TOOL_CAPABILITIES;
      };

const capabilities = Object.fromEntries(
    Object.values(AgentCapability).map((capability) => [
        `capability:${capability}`,
        { type: 'capability', capability },
    ]),
) as Record<
    `capability:${AgentCapability}`,
    { type: 'capability'; capability: AgentCapability }
>;

export const AGENT_ACCESS_PREVIEW_BINDINGS = {
    ...capabilities,
    run_raw_sql: {
        type: 'operation',
        kind: 'rest_operation',
        key: 'QueryController.executeAsyncSqlQuery',
    },
    schedule_delivery: {
        type: 'operation',
        kind: 'rest_operation',
        key: 'SchedulerController.post',
    },
    export_results: {
        type: 'operation',
        kind: 'rest_operation',
        key: 'QueryController.scheduleDownloadResults',
    },
    create_edit_chart: {
        type: 'operation',
        kind: 'mcp_tool',
        key: 'create_content',
    },
    delete_content: {
        type: 'operation',
        kind: 'rest_operation',
        key: 'ContentController.deleteContent',
    },
    publish_dashboard: {
        type: 'operation',
        kind: 'rest_operation',
        key: 'DashboardController.promoteDashboard',
    },
    change_dbt_files: {
        type: 'operation',
        kind: 'rest_operation',
        key: 'GitFilesController.saveFile',
    },
    run_saved_sql_chart: {
        type: 'operation',
        kind: 'rest_operation',
        key: 'SqlRunnerController.getSavedSqlResultsJob',
    },
    delete_repository_file: {
        type: 'operation',
        kind: 'rest_operation',
        key: 'GitFilesController.deleteFile',
    },
    change_agent_permissions: {
        type: 'operation',
        kind: 'rest_operation',
        key: 'AgentPermissionController.saveCeiling',
    },
} satisfies Record<AgentAccessPreviewActionId, Binding>;

export const getAgentAccessPreviewCapabilities = (
    id: AgentAccessPreviewActionId,
): readonly AgentCapability[] | null => {
    const binding = AGENT_ACCESS_PREVIEW_BINDINGS[id];
    return binding.type === 'capability'
        ? [binding.capability]
        : getRequiredAgentCapabilities(
              binding.kind === 'rest_operation' ? 'rest' : 'mcp',
              binding.key,
          );
};

export const getAgentAccessPreviewActionId = (
    action: ExplainAgentOperationArgs['action'],
): AgentAccessPreviewActionId | null => {
    if (action.type === 'capability') return `capability:${action.capability}`;
    return (
        (
            Object.keys(
                AGENT_ACCESS_PREVIEW_BINDINGS,
            ) as AgentAccessPreviewActionId[]
        ).find((id) => {
            const binding = AGENT_ACCESS_PREVIEW_BINDINGS[id];
            return (
                binding.type === 'operation' &&
                binding.kind === action.kind &&
                binding.key === action.key
            );
        }) ?? null
    );
};
