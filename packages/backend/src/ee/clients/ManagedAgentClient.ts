import Anthropic from '@anthropic-ai/sdk';
import type {
    AgentCreateParams,
    AgentUpdateParams,
    BetaManagedAgentsAgent,
} from '@anthropic-ai/sdk/resources/beta/agents';
import type { BetaManagedAgentsStreamSessionEvents } from '@anthropic-ai/sdk/resources/beta/sessions/events';
import { ParameterError } from '@lightdash/common';
import { createHash } from 'crypto';
import type { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { traceSpan, type TraceSpan } from '../../tracing/tracing';

type ManagedAgentClientConfig = {
    lightdashConfig: LightdashConfig;
    anthropicClient?: Anthropic;
};

export type ManagedAgentSessionConfig = {
    agentConfig: AgentCreateParams;
    serviceAccountPat: string;
    resourceName: string;
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

export type ManagedAgentProgressEvent =
    | {
          type: 'message';
      }
    | {
          type: 'tool_use';
          source: 'builtin' | 'mcp' | 'custom';
          toolName: string;
      }
    | {
          type: 'idle';
          stopReason: string | null;
      };

type ManagedAgentCustomToolHandler = (
    toolName: string,
    input: Record<string, unknown>,
) => Promise<string>;

export type ManagedAgentRunConfig = {
    projectName: string;
    sessionTitle: string;
    initialPrompt: string;
    onCustomToolUse: ManagedAgentCustomToolHandler;
    onSessionCreated?: (sessionId: string) => Promise<void> | void;
    onProgress?: (
        progressEvent: ManagedAgentProgressEvent,
    ) => Promise<void> | void;
    abortSignal?: AbortSignal;
    timeoutMs?: number;
};

export type ManagedAgentSessionResult =
    | {
          status: 'completed';
          sessionId: string;
      }
    | {
          status: 'cancelled' | 'failed' | 'timed_out';
          sessionId: string;
          error: string;
      };

class ManagedAgentSessionTimeoutError extends Error {}

const renderAgentConfigForResource = (
    resourceName: string,
    agentConfig: AgentCreateParams,
): AgentCreateParams => ({
    ...agentConfig,
    name: `${agentConfig.name} (${resourceName})`,
    metadata: {
        ...agentConfig.metadata,
        lightdash_resource: resourceName,
    },
});

export class ManagedAgentClient {
    private readonly config: ManagedAgentClientConfig;

    constructor(config: ManagedAgentClientConfig) {
        this.config = config;
    }

    private getAnthropicClient(): Anthropic {
        if (this.config.anthropicClient) {
            return this.config.anthropicClient;
        }

        const { anthropicApiKey } = this.config.lightdashConfig.managedAgent;
        if (!anthropicApiKey) {
            throw new ParameterError(
                'ANTHROPIC_API_KEY is required for managed agent',
            );
        }

        return new Anthropic({ apiKey: anthropicApiKey });
    }

    private async ensureAgent(
        beta: Anthropic.Beta,
        sessionConfig: ManagedAgentSessionConfig,
    ): Promise<string> {
        const desiredAgent = renderAgentConfigForResource(
            sessionConfig.resourceName,
            sessionConfig.agentConfig,
        );
        const desiredHash = createHash('md5')
            .update(JSON.stringify(desiredAgent))
            .digest('hex');

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
        runConfig: ManagedAgentRunConfig,
    ): Promise<ManagedAgentSessionResult> {
        runConfig.abortSignal?.throwIfAborted();

        // Managed-agent sessions run on Anthropic's Agents API (not the Vercel
        // AI SDK), so they need a manual span to show up in tracing alongside
        // the auto-instrumented AI-SDK calls. Token usage isn't surfaced in the
        // session event stream — attribution + latency only for now.
        return traceSpan(
            {
                name: 'managed_agent.session',
                op: 'ai.managed_agent',
                attributes: {
                    feature: 'managed-agent',
                    'gen_ai.system': 'anthropic',
                    'lightdash.resource_name': sessionConfig.resourceName,
                    'lightdash.project_name': runConfig.projectName,
                },
            },
            (span) =>
                this.runManagedAgentSession(sessionConfig, runConfig, span),
        );
    }

    private async runManagedAgentSession(
        sessionConfig: ManagedAgentSessionConfig,
        runConfig: ManagedAgentRunConfig,
        span: TraceSpan,
    ): Promise<ManagedAgentSessionResult> {
        runConfig.abortSignal?.throwIfAborted();

        const client = this.getAnthropicClient();
        const { agentId, environmentId, vaultId } =
            await this.ensureAgentAndEnvironment(client, sessionConfig);
        runConfig.abortSignal?.throwIfAborted();

        const session = await client.beta.sessions.create({
            agent: agentId,
            environment_id: environmentId,
            vault_ids: [vaultId],
            title: runConfig.sessionTitle,
        });
        runConfig.abortSignal?.throwIfAborted();

        Logger.info(`[ManagedAgent] Session created: ${session.id}`);
        span.setAttributes({
            'gen_ai.agent.id': agentId,
            'gen_ai.session.id': session.id,
        });
        await runConfig.onSessionCreated?.(session.id);
        runConfig.abortSignal?.throwIfAborted();

        const stream = await client.beta.sessions.events.stream(session.id);
        if (runConfig.abortSignal?.aborted) {
            await this.interruptSession(client, session.id, stream.controller);
            return {
                status: 'cancelled',
                sessionId: session.id,
                error: this.getErrorMessage(runConfig.abortSignal.reason),
            };
        }

        await client.beta.sessions.events.send(session.id, {
            events: [
                {
                    type: 'user.message',
                    content: [
                        {
                            type: 'text',
                            text: runConfig.initialPrompt,
                        },
                    ],
                },
            ],
        });
        if (runConfig.abortSignal?.aborted) {
            await this.interruptSession(client, session.id, stream.controller);
            return {
                status: 'cancelled',
                sessionId: session.id,
                error: this.getErrorMessage(runConfig.abortSignal.reason),
            };
        }

        const sessionTimeoutMs =
            runConfig.timeoutMs ??
            this.config.lightdashConfig.managedAgent.sessionTimeoutMs;

        const eventLoop = async () => {
            for await (const event of stream) {
                try {
                    await this.emitProgress(event, runConfig.onProgress);
                } catch (error) {
                    Logger.warn(
                        `[ManagedAgent] Progress callback failed: ${this.getErrorMessage(error)}`,
                    );
                }

                if (event.type === 'agent.message') {
                    Logger.debug('[ManagedAgent] Agent message received');
                } else if (event.type === 'agent.tool_use') {
                    Logger.info(`[ManagedAgent] Built-in tool: ${event.name}`);
                } else if (event.type === 'agent.mcp_tool_use') {
                    Logger.info(`[ManagedAgent] MCP tool: ${event.name}`);
                } else if (event.type === 'agent.custom_tool_use') {
                    Logger.info(
                        `[ManagedAgent] Tool call: ${event.name} (event_id: ${event.id})`,
                    );
                    try {
                        const result = await runConfig.onCustomToolUse(
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

        let timeoutId: NodeJS.Timeout | undefined;
        let removeAbortListener: (() => void) | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                const error = new ManagedAgentSessionTimeoutError(
                    `[ManagedAgent] Session timed out after ${sessionTimeoutMs}ms`,
                );
                void this.interruptSession(
                    client,
                    session.id,
                    stream.controller,
                ).then(
                    () => reject(error),
                    () => reject(error),
                );
            }, sessionTimeoutMs);
        });
        const abortPromise = runConfig.abortSignal
            ? new Promise<never>((_, reject) => {
                  const abort = () => {
                      const error =
                          runConfig.abortSignal?.reason ??
                          new Error('[ManagedAgent] Session aborted');
                      void this.interruptSession(
                          client,
                          session.id,
                          stream.controller,
                      ).then(
                          () => reject(error),
                          () => reject(error),
                      );
                  };

                  if (runConfig.abortSignal?.aborted) {
                      abort();
                      return;
                  }

                  runConfig.abortSignal?.addEventListener('abort', abort, {
                      once: true,
                  });
                  removeAbortListener = () =>
                      runConfig.abortSignal?.removeEventListener(
                          'abort',
                          abort,
                      );
              })
            : null;

        try {
            await Promise.race(
                [eventLoop(), timeoutPromise, abortPromise].filter(
                    (promise): promise is Promise<void> | Promise<never> =>
                        promise !== null,
                ),
            );
            return { status: 'completed', sessionId: session.id };
        } catch (error) {
            Logger.error(
                `[ManagedAgent] Session ${session.id} error: ${this.getErrorMessage(error)}`,
            );
            if (!stream.controller.signal.aborted) {
                await this.interruptSession(
                    client,
                    session.id,
                    stream.controller,
                );
            }

            return {
                status: this.getTerminalStatus(error, runConfig.abortSignal),
                sessionId: session.id,
                error: this.getErrorMessage(error),
            };
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            removeAbortListener?.();
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private async emitProgress(
        event: BetaManagedAgentsStreamSessionEvents,
        onProgress: ManagedAgentRunConfig['onProgress'],
    ): Promise<void> {
        if (!onProgress) {
            return;
        }

        if (event.type === 'agent.message') {
            await onProgress({ type: 'message' });
            return;
        }

        if (event.type === 'agent.tool_use') {
            await onProgress({
                type: 'tool_use',
                source: 'builtin',
                toolName: event.name,
            });
            return;
        }

        if (event.type === 'agent.mcp_tool_use') {
            await onProgress({
                type: 'tool_use',
                source: 'mcp',
                toolName: event.name,
            });
            return;
        }

        if (event.type === 'agent.custom_tool_use') {
            await onProgress({
                type: 'tool_use',
                source: 'custom',
                toolName: event.name,
            });
            return;
        }

        if (event.type === 'session.status_idle') {
            await onProgress({
                type: 'idle',
                stopReason: event.stop_reason?.type ?? null,
            });
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private async interruptSession(
        client: Anthropic,
        sessionId: string,
        streamController: AbortController,
    ): Promise<void> {
        try {
            await client.beta.sessions.events.send(sessionId, {
                events: [{ type: 'user.interrupt' }],
            });
        } catch (error) {
            Logger.error(
                `[ManagedAgent] Failed to interrupt session ${sessionId}: ${this.getErrorMessage(error)}`,
            );
        } finally {
            streamController.abort();
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : 'Unknown error';
    }

    // eslint-disable-next-line class-methods-use-this
    private getTerminalStatus(
        error: unknown,
        abortSignal?: AbortSignal,
    ): 'cancelled' | 'failed' | 'timed_out' {
        if (abortSignal?.aborted) {
            return 'cancelled';
        }
        if (error instanceof ManagedAgentSessionTimeoutError) {
            return 'timed_out';
        }
        return 'failed';
    }
}
