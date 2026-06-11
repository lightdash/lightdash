import Anthropic from '@anthropic-ai/sdk';
import type {
    AgentCreateParams,
    AgentUpdateParams,
    BetaManagedAgentsAgent,
} from '@anthropic-ai/sdk/resources/beta/agents';
import { ParameterError } from '@lightdash/common';
import type { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import {
    getManagedAgentConfigHash,
    renderManagedAgentConfig,
} from '../services/ManagedAgentService/config/agent';

type ManagedAgentClientConfig = {
    lightdashConfig: LightdashConfig;
};

export type ManagedAgentSessionConfig = {
    serviceAccountPat: string;
    resourceName: string;
    skillIds: string[];
    toolSettings: Record<string, boolean>;
    persistedAgentId: string | null;
    persistedAgentConfigHash: string | null;
    persistedAgentVersion: number | null;
    persistedEnvironmentId: string | null;
    persistedVaultId: string | null;
    onAgentSynced: (
        agentId: string,
        agentConfigHash: string,
        agentVersion: number,
    ) => Promise<void>;
    onResourcesCreated: (
        environmentId: string,
        vaultId: string,
    ) => Promise<void>;
};

type CustomToolHandler = (
    toolName: string,
    input: Record<string, unknown>,
) => Promise<string>;

export class ManagedAgentClient {
    private readonly config: ManagedAgentClientConfig;

    constructor(config: ManagedAgentClientConfig) {
        this.config = config;
    }

    private getAnthropicClient(): Anthropic {
        const { anthropicApiKey } = this.config.lightdashConfig.managedAgent;
        if (!anthropicApiKey) {
            throw new ParameterError(
                'ANTHROPIC_API_KEY is required for managed agent',
            );
        }

        return new Anthropic({ apiKey: anthropicApiKey });
    }

    private getRenderedAgentConfig(
        resourceName: string,
        skillIds: string[],
        toolSettings: Record<string, boolean>,
    ): AgentCreateParams {
        const renderedAgentConfig = renderManagedAgentConfig({
            lightdashSiteUrl: this.config.lightdashConfig.siteUrl,
            skillIds,
            toolSettings,
        });
        return {
            ...renderedAgentConfig,
            name: `${renderedAgentConfig.name} (${resourceName})`,
            metadata: {
                ...renderedAgentConfig.metadata,
                lightdash_resource: resourceName,
            },
        };
    }

    private async ensureAgent(
        beta: Anthropic.Beta,
        sessionConfig: ManagedAgentSessionConfig,
    ): Promise<string> {
        const desiredAgent = this.getRenderedAgentConfig(
            sessionConfig.resourceName,
            sessionConfig.skillIds,
            sessionConfig.toolSettings,
        );
        const desiredHash = getManagedAgentConfigHash(desiredAgent);

        if (
            sessionConfig.persistedAgentId &&
            sessionConfig.persistedAgentConfigHash === desiredHash &&
            sessionConfig.persistedAgentVersion
        ) {
            Logger.info(
                `[ManagedAgent] Reusing persisted agent: ${sessionConfig.persistedAgentId}`,
            );
            return sessionConfig.persistedAgentId;
        }

        if (sessionConfig.persistedAgentId) {
            try {
                const current = await beta.agents.retrieve(
                    sessionConfig.persistedAgentId,
                );
                const updated = await this.updateAgent(
                    beta,
                    current,
                    desiredAgent,
                );
                await sessionConfig.onAgentSynced(
                    updated.id,
                    desiredHash,
                    updated.version,
                );
                Logger.info(
                    `[ManagedAgent] Updated agent ${updated.id} to version ${updated.version}`,
                );
                return updated.id;
            } catch (error) {
                Logger.warn(
                    `[ManagedAgent] Could not update persisted agent ${sessionConfig.persistedAgentId}, creating a new one: ${error instanceof Error ? error.message : 'Unknown'}`,
                );
            }
        }

        const created = await beta.agents.create(desiredAgent);
        await sessionConfig.onAgentSynced(
            created.id,
            desiredHash,
            created.version,
        );
        Logger.info(
            `[ManagedAgent] Created agent ${created.id} at version ${created.version}`,
        );
        return created.id;
    }

    async syncAgent(sessionConfig: ManagedAgentSessionConfig): Promise<string> {
        const client = this.getAnthropicClient();
        return this.ensureAgent(client.beta, sessionConfig);
    }

    // eslint-disable-next-line class-methods-use-this
    private async updateAgent(
        beta: Anthropic.Beta,
        current: BetaManagedAgentsAgent,
        desiredAgent: AgentCreateParams,
    ): Promise<BetaManagedAgentsAgent> {
        const update: AgentUpdateParams = {
            version: current.version,
            description: desiredAgent.description,
            mcp_servers: desiredAgent.mcp_servers ?? [],
            metadata: desiredAgent.metadata ?? {},
            model: desiredAgent.model,
            name: desiredAgent.name,
            skills: desiredAgent.skills ?? [],
            system: desiredAgent.system,
            tools: desiredAgent.tools ?? [],
        };

        return beta.agents.update(current.id, update);
    }

    private async ensureAgentAndEnvironment(
        client: Anthropic,
        sessionConfig: ManagedAgentSessionConfig,
    ): Promise<{
        agentId: string;
        environmentId: string;
        vaultId: string;
    }> {
        const agentId = await this.ensureAgent(client.beta, sessionConfig);

        // Reuse persisted Anthropic resource IDs when available to avoid
        // creating duplicate environments and vaults on every restart.
        const { persistedEnvironmentId, persistedVaultId } = sessionConfig;

        if (persistedEnvironmentId && persistedVaultId) {
            Logger.info(
                `[ManagedAgent] Reusing persisted resources: env=${persistedEnvironmentId}, vault=${persistedVaultId}`,
            );
            return {
                agentId,
                environmentId: persistedEnvironmentId,
                vaultId: persistedVaultId,
            };
        }

        // Reuse existing environment if one exists, otherwise create
        const environment = await this.findOrCreateEnvironment(
            client.beta,
            sessionConfig.resourceName,
        );

        // Reuse existing vault if one exists, otherwise create with credentials
        const vault = await this.createVault(client.beta, sessionConfig);

        // Persist the IDs so they survive service restarts
        await sessionConfig.onResourcesCreated(environment.id, vault.id);

        Logger.info(
            `Managed agent ready: agentId=${agentId}, environmentId=${environment.id}, vaultId=${vault.id}`,
        );

        return {
            agentId,
            environmentId: environment.id,
            vaultId: vault.id,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    private async findOrCreateEnvironment(
        beta: Anthropic.Beta,
        resourceName: string,
    ): Promise<{ id: string }> {
        const envName = `Env ${resourceName}`;
        try {
            const list = await beta.environments.list();
            const existing = list?.data?.find(
                (e: { name: string }) => e.name === envName,
            );
            if (existing) {
                Logger.info(
                    `[ManagedAgent] Reusing existing environment: ${existing.id}`,
                );
                return existing;
            }
        } catch (error) {
            Logger.warn(
                `[ManagedAgent] Could not list environments, creating new: ${error instanceof Error ? error.message : 'Unknown'}`,
            );
        }

        Logger.info('[ManagedAgent] Creating new environment');
        return beta.environments.create({
            name: envName,
            config: {
                type: 'cloud',
                networking: { type: 'limited', allow_mcp_servers: true },
            },
        });
    }

    private async createVault(
        beta: Anthropic.Beta,
        sessionConfig: Pick<
            ManagedAgentSessionConfig,
            'resourceName' | 'serviceAccountPat'
        >,
    ): Promise<{ id: string }> {
        const vaultName = `Vault ${sessionConfig.resourceName}`;
        const credPayload = {
            display_name: 'Lightdash PAT',
            auth: {
                type: 'static_bearer' as const,
                mcp_server_url: `${this.config.lightdashConfig.siteUrl}/api/v1/mcp`,
                token: sessionConfig.serviceAccountPat,
            },
        };

        // Always create a new vault with fresh credentials.
        // The Anthropic credentials API doesn't support reliable
        // delete+recreate, so we create a new vault each time
        // instead of trying to update an existing one's credentials.
        Logger.info('[ManagedAgent] Creating new vault');
        const vault = await beta.vaults.create({
            display_name: vaultName,
        });

        await beta.vaults.credentials.create(vault.id, credPayload);

        return vault;
    }

    async runSession(
        sessionConfig: ManagedAgentSessionConfig,
        projectName: string,
        onCustomToolUse: CustomToolHandler,
        onSessionCreated?: (sessionId: string) => void,
    ): Promise<{
        sessionId: string;
        slackSummary: string | null;
    }> {
        const client = this.getAnthropicClient();
        const { agentId, environmentId, vaultId } =
            await this.ensureAgentAndEnvironment(client, sessionConfig);

        const session = await client.beta.sessions.create({
            agent: agentId,
            environment_id: environmentId,
            vault_ids: [vaultId],
            title: `Health check: ${projectName} — ${new Date().toISOString()}`,
        });

        Logger.info(`[ManagedAgent] Session created: ${session.id}`);
        onSessionCreated?.(session.id);

        const stream = await client.beta.sessions.events.stream(session.id);

        await client.beta.sessions.events.send(session.id, {
            events: [
                {
                    type: 'user.message',
                    content: [
                        {
                            type: 'text',
                            text: `Today's date is ${new Date().toISOString().split('T')[0]}. Analyze project "${projectName}". Follow your checklist.`,
                        },
                    ],
                },
            ],
        });

        const { sessionTimeoutMs } = this.config.lightdashConfig.managedAgent;

        // Wrap the event loop in a timeout to prevent the scheduler from
        // blocking indefinitely if the agent stalls or loops.
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
                () =>
                    reject(
                        new Error(
                            `[ManagedAgent] Session timed out after ${sessionTimeoutMs}ms`,
                        ),
                    ),
                sessionTimeoutMs,
            );
        });

        let slackSummary: string | null = null;

        const eventLoop = async () => {
            for await (const event of stream) {
                if (event.type === 'agent.message') {
                    for (const block of event.content) {
                        if ('text' in block) {
                            Logger.debug(`[ManagedAgent] ${block.text}`);
                        }
                    }
                } else if (event.type === 'agent.tool_use') {
                    Logger.info(`[ManagedAgent] Built-in tool: ${event.name}`);
                } else if (event.type === 'agent.mcp_tool_use') {
                    Logger.info(`[ManagedAgent] MCP tool: ${event.name}`);
                } else if (event.type === 'agent.custom_tool_use') {
                    Logger.info(
                        `[ManagedAgent] Tool call: ${event.name} (event_id: ${event.id})`,
                    );
                    if (event.name === 'write_slack_summary') {
                        const summary =
                            typeof event.input.summary === 'string'
                                ? event.input.summary.trim()
                                : null;
                        if (summary) {
                            slackSummary = summary;
                            Logger.info(
                                `[ManagedAgent] Captured dedicated Slack summary (${summary.length} chars)`,
                            );
                        } else {
                            Logger.warn(
                                '[ManagedAgent] write_slack_summary called without a valid summary',
                            );
                        }
                        await client.beta.sessions.events.send(session.id, {
                            events: [
                                {
                                    type: 'user.custom_tool_result',
                                    custom_tool_use_id: event.id,
                                    content: [
                                        {
                                            type: 'text',
                                            text: JSON.stringify({
                                                ok: true,
                                                summary_length:
                                                    summary?.length ?? 0,
                                            }),
                                        },
                                    ],
                                },
                            ],
                        });
                        // eslint-disable-next-line no-continue
                        continue;
                    }
                    try {
                        const result = await onCustomToolUse(
                            event.name,
                            event.input as Record<string, unknown>,
                        );
                        Logger.info(
                            `[ManagedAgent] Sending result for: ${event.name} (event_id: ${event.id})`,
                        );
                        await client.beta.sessions.events.send(session.id, {
                            events: [
                                {
                                    type: 'user.custom_tool_result',
                                    custom_tool_use_id: event.id,
                                    content: [{ type: 'text', text: result }],
                                },
                            ],
                        });
                    } catch (error) {
                        const errorMessage =
                            error instanceof Error
                                ? error.message
                                : 'Unknown error';
                        Logger.error(
                            `[ManagedAgent] Tool error: ${event.name}: ${errorMessage}`,
                        );
                        await client.beta.sessions.events.send(session.id, {
                            events: [
                                {
                                    type: 'user.custom_tool_result',
                                    custom_tool_use_id: event.id,
                                    content: [
                                        {
                                            type: 'text',
                                            text: JSON.stringify({
                                                error: errorMessage,
                                            }),
                                        },
                                    ],
                                    is_error: true,
                                },
                            ],
                        });
                    }
                } else if (event.type === 'session.status_idle') {
                    const stopReason = event.stop_reason?.type;
                    const eventIds =
                        event.stop_reason?.type === 'requires_action'
                            ? event.stop_reason.event_ids
                            : [];
                    if (stopReason === 'end_turn') {
                        Logger.info(
                            '[ManagedAgent] Session complete (end_turn)',
                        );
                        break;
                    }
                    Logger.info(
                        `[ManagedAgent] Session idle: ${stopReason ?? 'unknown'}, event_ids: ${JSON.stringify(eventIds)}`,
                    );
                }
            }
        };

        try {
            await Promise.race([eventLoop(), timeoutPromise]);
        } catch (error) {
            // Always return the session ID even on timeout so the caller
            // can still look up actions recorded before the error.
            Logger.error(
                `[ManagedAgent] Session ${session.id} error: ${error instanceof Error ? error.message : 'Unknown'}`,
            );
        }

        return {
            sessionId: session.id,
            slackSummary,
        };
    }
}
