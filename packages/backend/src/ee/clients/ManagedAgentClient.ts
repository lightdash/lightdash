import Anthropic from '@anthropic-ai/sdk';
import Logger from '../../logging/logger';
import { CUSTOM_TOOL_DEFINITIONS } from '../services/ManagedAgentService/managedAgentTools';

type ManagedAgentClientConfig = {
    anthropicApiKey: string;
    siteUrl: string;
    serviceAccountPat: string;
    sessionTimeoutMs: number;
    agentId: string | null;
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

    private client: Anthropic;

    private agentId: string | null = null;

    private environmentId: string | null = null;

    private vaultId: string | null = null;

    constructor(config: ManagedAgentClientConfig) {
        this.config = config;
        this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    }

    private async ensureAgentAndEnvironment(): Promise<{
        agentId: string;
        environmentId: string;
        vaultId: string;
    }> {
        if (this.agentId && this.environmentId && this.vaultId) {
            return {
                agentId: this.agentId,
                environmentId: this.environmentId,
                vaultId: this.vaultId,
            };
        }

        const { agentId: configAgentId } = this.config;
        if (!configAgentId) {
            throw new Error(
                'MANAGED_AGENT_AGENT_ID is required. Create an agent at https://platform.claude.com and set the ID.',
            );
        }

        Logger.info(`[ManagedAgent] Using agent: ${configAgentId}`);

        // Reuse persisted Anthropic resource IDs when available to avoid
        // creating duplicate environments and vaults on every restart.
        const { persistedEnvironmentId, persistedVaultId } = this.config;

        if (persistedEnvironmentId && persistedVaultId) {
            Logger.info(
                `[ManagedAgent] Reusing persisted resources: env=${persistedEnvironmentId}, vault=${persistedVaultId}`,
            );
            this.agentId = configAgentId;
            this.environmentId = persistedEnvironmentId;
            this.vaultId = persistedVaultId;
            return {
                agentId: configAgentId,
                environmentId: persistedEnvironmentId,
                vaultId: persistedVaultId,
            };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const betaAny = this.client.beta as any;

        const environment = await betaAny.environments.create({
            name: 'lightdash-agent-env',
            config: {
                type: 'cloud',
                networking: { type: 'limited', allow_mcp_servers: true },
            },
        });

        // Create a vault and add a static bearer credential for MCP auth
        const vault = await betaAny.vaults.create({
            display_name: 'Lightdash MCP Auth',
        });

        await betaAny.vaults.credentials.create(vault.id, {
            display_name: 'Lightdash PAT',
            auth: {
                type: 'static_bearer',
                mcp_server_url: `${this.config.siteUrl}/api/v1/mcp`,
                token: this.config.serviceAccountPat,
            },
        });

        this.agentId = configAgentId;
        this.environmentId = environment.id;
        this.vaultId = vault.id;

        // Persist the new IDs so they survive service restarts
        await this.config.onResourcesCreated(environment.id, vault.id);

        Logger.info(
            `Managed agent ready: agentId=${configAgentId}, environmentId=${environment.id}, vaultId=${vault.id}`,
        );

        return {
            agentId: configAgentId,
            environmentId: environment.id,
            vaultId: vault.id,
        };
    }

    async runSession(
        projectName: string,
        onCustomToolUse: CustomToolHandler,
    ): Promise<string> {
        const { agentId, environmentId, vaultId } =
            await this.ensureAgentAndEnvironment();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const betaAny = this.client.beta as any;

        const session = await betaAny.sessions.create({
            agent: agentId,
            environment_id: environmentId,
            vault_ids: [vaultId],
            title: `Health check: ${projectName} — ${new Date().toISOString()}`,
        });

        Logger.info(`[ManagedAgent] Session created: ${session.id}`);

        const stream = await betaAny.sessions.events.stream(session.id);

        await betaAny.sessions.events.send(session.id, {
            events: [
                {
                    type: 'user.message',
                    content: [
                        {
                            type: 'text',
                            text: `Analyze project "${projectName}". Follow your checklist.`,
                        },
                    ],
                },
            ],
        });

        const { sessionTimeoutMs } = this.config;

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
                    try {
                        const result = await onCustomToolUse(
                            event.name,
                            event.input as Record<string, unknown>,
                        );
                        Logger.info(
                            `[ManagedAgent] Sending result for: ${event.name} (event_id: ${event.id})`,
                        );
                        await betaAny.sessions.events.send(session.id, {
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
                        await betaAny.sessions.events.send(session.id, {
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
                    const eventIds = event.stop_reason?.event_ids ?? [];
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

        await Promise.race([eventLoop(), timeoutPromise]);

        return session.id;
    }
}
