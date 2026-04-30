import Anthropic from '@anthropic-ai/sdk';
import { ParameterError } from '@lightdash/common/src';
import type { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { CUSTOM_TOOL_DEFINITIONS } from '../services/ManagedAgentService/managedAgentTools';

type ManagedAgentClientConfig = {
    lightdashConfig: LightdashConfig;
};

export type ManagedAgentSessionConfig = {
    serviceAccountPat: string;
    resourceName: string;
    persistedEnvironmentId: string | null;
    persistedVaultId: string | null;
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

    private async ensureAgentAndEnvironment(
        client: Anthropic,
        sessionConfig: ManagedAgentSessionConfig,
    ): Promise<{
        agentId: string;
        environmentId: string;
        vaultId: string;
    }> {
        const { agentId: configAgentId } =
            this.config.lightdashConfig.managedAgent;
        if (!configAgentId) {
            throw new Error(
                'MANAGED_AGENT_AGENT_ID is required. Create an agent at https://platform.claude.com and set the ID.',
            );
        }

        Logger.info(`[ManagedAgent] Using agent: ${configAgentId}`);

        // Reuse persisted Anthropic resource IDs when available to avoid
        // creating duplicate environments and vaults on every restart.
        const { persistedEnvironmentId, persistedVaultId } = sessionConfig;

        if (persistedEnvironmentId && persistedVaultId) {
            Logger.info(
                `[ManagedAgent] Reusing persisted resources: env=${persistedEnvironmentId}, vault=${persistedVaultId}`,
            );
            return {
                agentId: configAgentId,
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
            `Managed agent ready: agentId=${configAgentId}, environmentId=${environment.id}, vaultId=${vault.id}`,
        );

        return {
            agentId: configAgentId,
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
    ): Promise<{ sessionId: string; summary: string }> {
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

        // Capture the agent's final summary text from message events
        let lastAgentMessage = '';

        const eventLoop = async () => {
            for await (const event of stream) {
                if (event.type === 'agent.message') {
                    for (const block of event.content) {
                        if ('text' in block) {
                            Logger.debug(`[ManagedAgent] ${block.text}`);
                            lastAgentMessage = block.text;
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

        return { sessionId: session.id, summary: lastAgentMessage };
    }
}
