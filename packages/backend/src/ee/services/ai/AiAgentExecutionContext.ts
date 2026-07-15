import { type AiDeepResearchExecutionContextSnapshot } from '@lightdash/common';
import { type ToolSet } from 'ai';
import { getAiAgentModelName } from './agents/telemetry';
import { type AiAgentArgs } from './types/aiAgent';
import { getLanguageModelAttribution } from './utils/aiCallTelemetry';

export type AiAgentExecutionContext<Dependencies, McpToolSetup> = {
    args: AiAgentArgs;
    tools: ToolSet;
    dependencies: Dependencies;
    mcpToolSetup: McpToolSetup;
    snapshot: AiDeepResearchExecutionContextSnapshot;
};

export class AiAgentExecutionContextFactory {
    static create<Dependencies, McpToolSetup>(
        args: AiAgentArgs,
        tools: ToolSet,
        dependencies: Dependencies,
        mcpToolSetup: McpToolSetup,
    ): AiAgentExecutionContext<Dependencies, McpToolSetup> {
        const modelName = getAiAgentModelName(args.model);
        const { provider: modelProvider } = getLanguageModelAttribution(
            args.model,
        );

        const snapshot: AiDeepResearchExecutionContextSnapshot = {
            schemaVersion: 1,
            userUuid: args.userId,
            projectUuid: args.agentSettings.projectUuid,
            agentUuid: args.agentSettings.uuid,
            threadUuid: args.threadUuid,
            promptUuid: args.promptUuid,
            agentName: args.agentSettings.name,
            agentInstruction: args.agentSettings.instruction,
            agentVersion: args.agentSettings.version,
            agentTags: args.agentSettings.tags ?? [],
            executionMode: args.executionMode,
            enableDataAccess: args.enableDataAccess,
            enableContentTools: args.enableContentTools,
            enableSelfImprovement: args.enableSelfImprovement,
            modelProvider: modelProvider ?? null,
            modelName,
            enabledTools: Object.keys(tools).sort(),
            mcpServers: args.mcpServers.map((server) => ({
                uuid: server.uuid,
                name: server.name,
                authType: server.authType,
            })),
            knowledgeDocumentUuids: args.knowledgeDocuments.map(
                (document) => document.uuid,
            ),
            knowledgeDocuments: args.knowledgeDocuments.map((document) => ({
                uuid: document.uuid,
                name: document.name,
                updatedAt: document.updatedAt.toISOString(),
            })),
            projectContextEnabled: args.projectContextEnabled,
            projectContextEntryCount: args.projectContext.length,
            repositoryAccessEnabled: args.enableRepoDiscovery,
            repositoryRoot: args.repoFsRoot,
            repositorySupportsCodeSearch: args.repoFsSupportsCodeSearch,
            canRunSql: args.canRunSql,
            permissions: {
                canManageAgent: args.canManageAgent,
                canRunSql: args.canRunSql,
                canUseContentTools: args.enableContentTools,
                canUseDataTools: args.enableDataAccess,
                canUseRepository: args.enableRepoDiscovery,
                canUseWriteback: args.enableAiWriteback,
            },
            resolvedAt: new Date().toISOString(),
        };

        return { args, tools, dependencies, mcpToolSetup, snapshot };
    }
}
