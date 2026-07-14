import Anthropic from '@anthropic-ai/sdk';
import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents';
import type { EnvironmentCreateParams } from '@anthropic-ai/sdk/resources/beta/environments';
import type { BetaManagedAgentsSessionEvent } from '@anthropic-ai/sdk/resources/beta/sessions/events';
import type { CredentialCreateParams } from '@anthropic-ai/sdk/resources/beta/vaults/credentials';
import type { VaultCreateParams } from '@anthropic-ai/sdk/resources/beta/vaults/vaults';
import { ParameterError } from '@lightdash/common';
import { createHash } from 'crypto';
import type { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';

const FEATURE_METADATA = {
    lightdash_feature: 'ai-deep-research',
};
const CONFIG_HASH_METADATA_KEY = 'lightdash_config_hash';
const MAX_STREAM_RECONNECTS = 3;

export type AiDeepResearchProgressEvent =
    | { type: 'session_running' }
    | { type: 'session_rescheduled' }
    | { type: 'retrying' }
    | { type: 'thinking' }
    | { type: 'context_compacted' }
    | { type: 'tool_use'; source: 'built_in' | 'mcp' | 'custom'; name: string }
    | {
          type: 'model_usage';
          inputTokens: number;
          outputTokens: number;
          cacheCreationInputTokens: number;
          cacheReadInputTokens: number;
      };

export type AiDeepResearchFailureReason =
    | 'setup_failed'
    | 'session_id_persistence_failed'
    | 'claude_error'
    | 'retries_exhausted'
    | 'terminated'
    | 'unexpected_eof'
    | 'transport_error'
    | 'timed_out'
    | 'interrupt_failed'
    | 'vault_cleanup_failed';

export type AiDeepResearchClientResult =
    | { status: 'completed'; sessionId: string }
    | { status: 'cancelled'; sessionId: string | null }
    | {
          status: 'failed';
          sessionId: string | null;
          reason: AiDeepResearchFailureReason;
          errorMessage: string;
      };

export type AiDeepResearchSessionConfig = {
    agent: AgentCreateParams;
    environment: EnvironmentCreateParams;
    vault: VaultCreateParams;
    credentials: CredentialCreateParams[];
    sessionTitle: string;
    prompt: string;
    timeoutMs: number;
    interruptTimeoutMs: number;
    signal: AbortSignal;
    onSessionCreated: (sessionId: string, signal: AbortSignal) => Promise<void>;
    onCustomToolUse: (args: {
        toolName: string;
        input: Record<string, unknown>;
        signal: AbortSignal;
    }) => Promise<string>;
    onProgress?: (event: AiDeepResearchProgressEvent) => Promise<void>;
};

type AiDeepResearchClientConfig = {
    lightdashConfig: LightdashConfig;
    anthropicClient?: Anthropic;
};

type TerminalResult =
    | { status: 'completed' }
    | {
          status: 'failed';
          reason: Extract<
              AiDeepResearchFailureReason,
              | 'claude_error'
              | 'retries_exhausted'
              | 'terminated'
              | 'unexpected_eof'
              | 'transport_error'
          >;
          errorMessage: string;
      };

type SessionEventStream = Awaited<
    ReturnType<Anthropic['beta']['sessions']['events']['stream']>
>;

type CustomToolOutcome = { content: string; isError: boolean };
type CustomToolState = {
    outcomes: Map<string, CustomToolOutcome>;
    deliveredIds: Set<string>;
    progressEventIds: Set<string>;
};

const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, canonicalize(entry)]),
        );
    }
    return value;
};

const getConfigHash = (value: unknown): string =>
    createHash('sha256')
        .update(JSON.stringify(canonicalize(value)))
        .digest('hex');

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Unknown error';

const failed = (
    sessionId: string | null,
    reason: AiDeepResearchFailureReason,
    errorMessage: string,
): AiDeepResearchClientResult => ({
    status: 'failed',
    sessionId,
    reason,
    errorMessage,
});

const waitForAbort = (signal: AbortSignal): Promise<never> =>
    new Promise((_, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
        });
    });

export class AiDeepResearchClient {
    private readonly config: AiDeepResearchClientConfig;

    constructor(config: AiDeepResearchClientConfig) {
        this.config = config;
    }

    private getAnthropicClient(): Anthropic {
        if (this.config.anthropicClient) {
            return this.config.anthropicClient;
        }

        const { anthropicApiKey } = this.config.lightdashConfig.managedAgent;
        if (!anthropicApiKey) {
            throw new ParameterError(
                'ANTHROPIC_API_KEY is required for Deep Research',
            );
        }
        return new Anthropic({ apiKey: anthropicApiKey });
    }

    private static withConfigMetadata<
        T extends AgentCreateParams | EnvironmentCreateParams,
    >(config: T): T {
        return {
            ...config,
            metadata: {
                ...config.metadata,
                ...FEATURE_METADATA,
                [CONFIG_HASH_METADATA_KEY]: getConfigHash(config),
            },
        };
    }

    private static async findByConfigHash<
        T extends { metadata?: Record<string, string> },
    >(resources: AsyncIterable<T>, hash: string): Promise<T | null> {
        for await (const resource of resources) {
            if (
                resource.metadata?.lightdash_feature ===
                    FEATURE_METADATA.lightdash_feature &&
                resource.metadata?.[CONFIG_HASH_METADATA_KEY] === hash
            ) {
                return resource;
            }
        }
        return null;
    }

    // eslint-disable-next-line class-methods-use-this
    private async ensureResources(
        client: Anthropic,
        config: AiDeepResearchSessionConfig,
        signal: AbortSignal,
        onVaultCreated: (vaultId: string) => void,
    ): Promise<{
        agentId: string;
        agentVersion: number;
        environmentId: string;
        vaultId: string;
    }> {
        const agentHash = getConfigHash(config.agent);
        const desiredAgent = AiDeepResearchClient.withConfigMetadata(
            config.agent,
        );
        const existingAgent = await AiDeepResearchClient.findByConfigHash(
            client.beta.agents.list({}, { signal }),
            agentHash,
        );
        const agent =
            existingAgent ??
            (await client.beta.agents.create(desiredAgent, { signal }));

        const environmentHash = getConfigHash(config.environment);
        const desiredEnvironment = AiDeepResearchClient.withConfigMetadata(
            config.environment,
        );
        const existingEnvironment = await AiDeepResearchClient.findByConfigHash(
            client.beta.environments.list({}, { signal }),
            environmentHash,
        );
        const environment =
            existingEnvironment ??
            (await client.beta.environments.create(desiredEnvironment, {
                signal,
            }));

        const vault = await client.beta.vaults.create(
            {
                ...config.vault,
                metadata: {
                    ...config.vault.metadata,
                    ...FEATURE_METADATA,
                },
            },
            { signal },
        );
        onVaultCreated(vault.id);
        await Promise.all(
            config.credentials.map((credential) =>
                client.beta.vaults.credentials.create(vault.id, credential, {
                    signal,
                }),
            ),
        );

        if (
            !('id' in agent) ||
            !('version' in agent) ||
            !('id' in environment)
        ) {
            throw new Error('Claude returned an invalid managed resource');
        }

        return {
            agentId: agent.id,
            agentVersion: agent.version,
            environmentId: environment.id,
            vaultId: vault.id,
        };
    }

    private static classifyTerminalEvent(
        event: BetaManagedAgentsSessionEvent,
    ): TerminalResult | null {
        if (event.type === 'session.status_idle') {
            if (event.stop_reason.type === 'end_turn') {
                return { status: 'completed' };
            }
            if (event.stop_reason.type === 'retries_exhausted') {
                return {
                    status: 'failed',
                    reason: 'retries_exhausted',
                    errorMessage: 'Claude exhausted its retry budget',
                };
            }
        }
        if (event.type === 'session.error') {
            const retryStatus = event.error.retry_status.type;
            if (retryStatus === 'exhausted') {
                return {
                    status: 'failed',
                    reason: 'retries_exhausted',
                    errorMessage: event.error.message,
                };
            }
            if (retryStatus === 'terminal') {
                return {
                    status: 'failed',
                    reason: 'claude_error',
                    errorMessage: event.error.message,
                };
            }
        }
        if (
            event.type === 'session.status_terminated' ||
            event.type === 'session.deleted'
        ) {
            return {
                status: 'failed',
                reason: 'terminated',
                errorMessage: 'Claude terminated the session',
            };
        }
        return null;
    }

    private static getProgressEvent(
        event: BetaManagedAgentsSessionEvent,
    ): AiDeepResearchProgressEvent | null {
        switch (event.type) {
            case 'session.status_running':
                return { type: 'session_running' };
            case 'session.status_rescheduled':
                return { type: 'session_rescheduled' };
            case 'session.error':
                return event.error.retry_status.type === 'retrying'
                    ? { type: 'retrying' }
                    : null;
            case 'agent.thinking':
                return { type: 'thinking' };
            case 'agent.thread_context_compacted':
                return { type: 'context_compacted' };
            case 'agent.tool_use':
                return {
                    type: 'tool_use',
                    source: 'built_in',
                    name: event.name,
                };
            case 'agent.mcp_tool_use':
                return { type: 'tool_use', source: 'mcp', name: event.name };
            case 'agent.custom_tool_use':
                return {
                    type: 'tool_use',
                    source: 'custom',
                    name: event.name,
                };
            case 'span.model_request_end':
                return {
                    type: 'model_usage',
                    inputTokens: event.model_usage.input_tokens,
                    outputTokens: event.model_usage.output_tokens,
                    cacheCreationInputTokens:
                        event.model_usage.cache_creation_input_tokens,
                    cacheReadInputTokens:
                        event.model_usage.cache_read_input_tokens,
                };
            default:
                return null;
        }
    }

    private static async emitProgress(
        event: BetaManagedAgentsSessionEvent,
        callback: AiDeepResearchSessionConfig['onProgress'],
        state: CustomToolState,
    ): Promise<void> {
        if (state.progressEventIds.has(event.id)) {
            return;
        }
        const progress = AiDeepResearchClient.getProgressEvent(event);
        if (progress && callback) {
            await callback(progress);
        }
        state.progressEventIds.add(event.id);
    }

    private static async handleCustomToolUse(
        client: Anthropic,
        sessionId: string,
        event: Extract<
            BetaManagedAgentsSessionEvent,
            { type: 'agent.custom_tool_use' }
        >,
        config: AiDeepResearchSessionConfig,
        signal: AbortSignal,
        state: CustomToolState,
    ): Promise<void> {
        if (state.deliveredIds.has(event.id)) {
            return;
        }

        let outcome = state.outcomes.get(event.id);
        if (!outcome) {
            try {
                outcome = {
                    content: await config.onCustomToolUse({
                        toolName: event.name,
                        input: event.input,
                        signal,
                    }),
                    isError: false,
                };
            } catch (error) {
                outcome = {
                    content: JSON.stringify({ error: getErrorMessage(error) }),
                    isError: true,
                };
            }
            state.outcomes.set(event.id, outcome);
        }
        signal.throwIfAborted();
        await client.beta.sessions.events.send(
            sessionId,
            {
                events: [
                    {
                        type: 'user.custom_tool_result',
                        custom_tool_use_id: event.id,
                        content: [{ type: 'text', text: outcome.content }],
                        is_error: outcome.isError,
                    },
                ],
            },
            { signal },
        );
        state.deliveredIds.add(event.id);
    }

    // eslint-disable-next-line class-methods-use-this
    private async inspectPersistedEvents(
        client: Anthropic,
        sessionId: string,
        config: AiDeepResearchSessionConfig,
        signal: AbortSignal,
        customToolState: CustomToolState,
    ): Promise<TerminalResult | null> {
        const events: BetaManagedAgentsSessionEvent[] = [];
        for await (const event of client.beta.sessions.events.list(
            sessionId,
            {},
            { signal },
        )) {
            events.push(event);
            await AiDeepResearchClient.emitProgress(
                event,
                config.onProgress,
                customToolState,
            );
            const terminal = AiDeepResearchClient.classifyTerminalEvent(event);
            if (terminal) {
                return terminal;
            }
        }

        const resolvedCustomToolUseIds = new Set(
            events
                .filter(
                    (
                        event,
                    ): event is Extract<
                        BetaManagedAgentsSessionEvent,
                        { type: 'user.custom_tool_result' }
                    > => event.type === 'user.custom_tool_result',
                )
                .map((event) => event.custom_tool_use_id),
        );
        for (const resolvedId of resolvedCustomToolUseIds) {
            customToolState.deliveredIds.add(resolvedId);
        }
        for (const event of events) {
            if (
                event.type === 'agent.custom_tool_use' &&
                !customToolState.deliveredIds.has(event.id) &&
                !resolvedCustomToolUseIds.has(event.id)
            ) {
                // Persisted tool calls must be handled sequentially to preserve
                // the agent's event ordering after a stream reconnect.
                // eslint-disable-next-line no-await-in-loop
                await AiDeepResearchClient.handleCustomToolUse(
                    client,
                    sessionId,
                    event,
                    config,
                    signal,
                    customToolState,
                );
            }
        }
        return null;
    }

    // eslint-disable-next-line class-methods-use-this
    private async consumeStream(
        client: Anthropic,
        sessionId: string,
        config: AiDeepResearchSessionConfig,
        signal: AbortSignal,
        customToolState: CustomToolState,
        existingStream?: SessionEventStream,
    ): Promise<TerminalResult | null> {
        const stream =
            existingStream ??
            (await client.beta.sessions.events.stream(
                sessionId,
                {},
                { signal },
            ));
        const abortStream = () => stream.controller.abort(signal.reason);
        signal.addEventListener('abort', abortStream, { once: true });
        try {
            for await (const streamedEvent of stream) {
                const event = streamedEvent as BetaManagedAgentsSessionEvent;
                signal.throwIfAborted();
                await AiDeepResearchClient.emitProgress(
                    event,
                    config.onProgress,
                    customToolState,
                );
                const terminal =
                    AiDeepResearchClient.classifyTerminalEvent(event);
                if (terminal) {
                    return terminal;
                }
                if (event.type === 'agent.custom_tool_use') {
                    await AiDeepResearchClient.handleCustomToolUse(
                        client,
                        sessionId,
                        event,
                        config,
                        signal,
                        customToolState,
                    );
                }
            }
            return null;
        } finally {
            signal.removeEventListener('abort', abortStream);
            stream.controller.abort();
        }
    }

    private async awaitTerminalResult(
        client: Anthropic,
        sessionId: string,
        config: AiDeepResearchSessionConfig,
        signal: AbortSignal,
        initialStream: SessionEventStream,
    ): Promise<TerminalResult> {
        const customToolState: CustomToolState = {
            outcomes: new Map(),
            deliveredIds: new Set(),
            progressEventIds: new Set(),
        };
        let lastTransportError: unknown = null;
        for (let attempt = 0; attempt <= MAX_STREAM_RECONNECTS; attempt += 1) {
            try {
                // Streams must be consumed and classified before reconnecting.
                // eslint-disable-next-line no-await-in-loop
                const result = await this.consumeStream(
                    client,
                    sessionId,
                    config,
                    signal,
                    customToolState,
                    attempt === 0 ? initialStream : undefined,
                );
                if (result) {
                    return result;
                }
            } catch (error) {
                signal.throwIfAborted();
                lastTransportError = error;
            }

            // eslint-disable-next-line no-await-in-loop
            const persistedResult = await this.inspectPersistedEvents(
                client,
                sessionId,
                config,
                signal,
                customToolState,
            );
            if (persistedResult) {
                return persistedResult;
            }
        }

        if (lastTransportError) {
            return {
                status: 'failed',
                reason: 'transport_error',
                errorMessage: getErrorMessage(lastTransportError),
            };
        }
        return {
            status: 'failed',
            reason: 'unexpected_eof',
            errorMessage:
                'Claude event stream ended without a terminal session event',
        };
    }

    private static async interruptSession(
        client: Anthropic,
        sessionId: string,
        timeoutMs: number,
    ): Promise<void> {
        const controller = new AbortController();
        const timer = setTimeout(
            () => controller.abort(new Error('Claude interrupt timed out')),
            timeoutMs,
        );
        try {
            await client.beta.sessions.events.send(
                sessionId,
                { events: [{ type: 'user.interrupt' }] },
                {
                    signal: controller.signal,
                    timeout: timeoutMs,
                    maxRetries: 0,
                },
            );
        } finally {
            clearTimeout(timer);
        }
    }

    private static async deleteVault(
        client: Anthropic,
        vaultId: string,
        timeoutMs: number,
    ): Promise<void> {
        const controller = new AbortController();
        const timer = setTimeout(
            () => controller.abort(new Error('Claude vault cleanup timed out')),
            timeoutMs,
        );
        try {
            await client.beta.vaults.delete(
                vaultId,
                {},
                {
                    signal: controller.signal,
                    timeout: timeoutMs,
                    maxRetries: 2,
                },
            );
        } finally {
            clearTimeout(timer);
        }
    }

    async runSession(
        config: AiDeepResearchSessionConfig,
    ): Promise<AiDeepResearchClientResult> {
        if (config.signal.aborted) {
            return { status: 'cancelled', sessionId: null };
        }

        let client: Anthropic;
        try {
            client = this.getAnthropicClient();
        } catch (error) {
            return failed(null, 'setup_failed', getErrorMessage(error));
        }

        const timeoutController = new AbortController();
        const timeout = setTimeout(
            () =>
                timeoutController.abort(
                    new Error(
                        `Deep Research timed out after ${config.timeoutMs}ms`,
                    ),
                ),
            config.timeoutMs,
        );
        const signal = AbortSignal.any([
            config.signal,
            timeoutController.signal,
        ]);
        let sessionId: string | null = null;
        let vaultId: string | null = null;
        let unconsumedStream: SessionEventStream | null = null;

        const finish = async (
            result: AiDeepResearchClientResult,
        ): Promise<AiDeepResearchClientResult> => {
            if (!vaultId) {
                return result;
            }
            try {
                await AiDeepResearchClient.deleteVault(
                    client,
                    vaultId,
                    config.interruptTimeoutMs,
                );
                return result;
            } catch (error) {
                return failed(
                    sessionId,
                    'vault_cleanup_failed',
                    `Could not remove Claude credentials: ${getErrorMessage(error)}`,
                );
            }
        };

        const interrupt =
            async (): Promise<AiDeepResearchClientResult | null> => {
                if (!sessionId) {
                    return null;
                }
                try {
                    await AiDeepResearchClient.interruptSession(
                        client,
                        sessionId,
                        config.interruptTimeoutMs,
                    );
                    return null;
                } catch (error) {
                    return failed(
                        sessionId,
                        'interrupt_failed',
                        `Could not confirm Claude stopped: ${getErrorMessage(error)}`,
                    );
                }
            };

        try {
            const resources = await this.ensureResources(
                client,
                config,
                signal,
                (createdVaultId) => {
                    vaultId = createdVaultId;
                },
            );
            const session = await client.beta.sessions.create(
                {
                    agent: {
                        type: 'agent',
                        id: resources.agentId,
                        version: resources.agentVersion,
                    },
                    environment_id: resources.environmentId,
                    vault_ids: [resources.vaultId],
                    title: config.sessionTitle,
                    metadata: FEATURE_METADATA,
                },
                { signal },
            );
            sessionId = session.id;

            try {
                await Promise.race([
                    config.onSessionCreated(sessionId, signal),
                    waitForAbort(signal),
                ]);
            } catch (error) {
                if (signal.aborted) {
                    throw error;
                }
                const interruptFailure = await interrupt();
                return await finish(
                    interruptFailure ??
                        failed(
                            sessionId,
                            'session_id_persistence_failed',
                            getErrorMessage(error),
                        ),
                );
            }

            unconsumedStream = await client.beta.sessions.events.stream(
                sessionId,
                {},
                { signal },
            );

            await client.beta.sessions.events.send(
                sessionId,
                {
                    events: [
                        {
                            type: 'user.message',
                            content: [{ type: 'text', text: config.prompt }],
                        },
                    ],
                },
                { signal },
            );

            const terminalResult = this.awaitTerminalResult(
                client,
                sessionId,
                config,
                signal,
                unconsumedStream,
            );
            unconsumedStream = null;
            const result = await Promise.race([
                terminalResult,
                waitForAbort(signal),
            ]);
            if (result.status === 'completed') {
                return await finish({ status: 'completed', sessionId });
            }
            if (
                result.reason === 'unexpected_eof' ||
                result.reason === 'transport_error'
            ) {
                const interruptFailure = await interrupt();
                if (interruptFailure) {
                    return await finish(interruptFailure);
                }
            }
            return await finish(
                failed(sessionId, result.reason, result.errorMessage),
            );
        } catch (error) {
            if (signal.aborted) {
                if (!sessionId) {
                    return await finish(
                        config.signal.aborted
                            ? { status: 'cancelled', sessionId: null }
                            : failed(
                                  null,
                                  'timed_out',
                                  getErrorMessage(signal.reason),
                              ),
                    );
                }
                const interruptFailure = await interrupt();
                if (interruptFailure) {
                    return await finish(interruptFailure);
                }
                return await finish(
                    config.signal.aborted
                        ? { status: 'cancelled', sessionId }
                        : failed(
                              sessionId,
                              'timed_out',
                              getErrorMessage(signal.reason),
                          ),
                );
            }

            if (sessionId) {
                const interruptFailure = await interrupt();
                if (interruptFailure) {
                    return await finish(interruptFailure);
                }
            }

            Logger.warn(
                `[AiDeepResearch] Session failed: ${getErrorMessage(error)}`,
            );
            return await finish(
                failed(
                    sessionId,
                    sessionId ? 'transport_error' : 'setup_failed',
                    getErrorMessage(error),
                ),
            );
        } finally {
            unconsumedStream?.controller.abort();
            clearTimeout(timeout);
        }
    }
}
