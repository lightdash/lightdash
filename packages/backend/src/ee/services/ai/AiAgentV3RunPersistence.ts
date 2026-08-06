import { ConflictError } from '@lightdash/common';
import { APICallError, type LanguageModelUsage } from 'ai';
import {
    type AiRunErrorEnvelope,
    type AiTokenUsageEnvelope,
    type AiV3PartWrite,
} from '../../database/entities/aiAgentV3';
import { type AiAgentV3Model } from '../../models/AiAgentV3Model';

type PersistedPart = {
    uuid: string;
    partIndex: number;
    type: AiV3PartWrite['type'];
    toolCallId?: string;
    payload: Record<string, unknown>;
};

type StreamChunk =
    | {
          type: 'text-delta' | 'reasoning-delta';
          id: string;
          text: string;
          providerMetadata?: Record<string, unknown>;
      }
    | {
          type: 'tool-input-start';
          id: string;
          toolName: string;
          providerMetadata?: Record<string, unknown>;
          providerExecuted?: boolean;
          dynamic?: boolean;
          title?: string;
      }
    | {
          type: 'tool-input-delta';
          id: string;
          delta: string;
          providerMetadata?: Record<string, unknown>;
      }
    | {
          type: 'tool-call';
          toolCallId: string;
          toolName: string;
          input: unknown;
          providerMetadata?: Record<string, unknown>;
          providerExecuted?: boolean;
          dynamic?: boolean;
          invalid?: boolean;
          error?: unknown;
      }
    | {
          type: 'tool-result';
          toolCallId: string;
          toolName: string;
          output: unknown;
          providerMetadata?: Record<string, unknown>;
          preliminary?: boolean;
      }
    | ({ type: 'source' } & Record<string, unknown>)
    | { type: 'raw'; rawValue: unknown };

type Model = Pick<
    AiAgentV3Model,
    | 'appendParts'
    | 'updatePart'
    | 'finishAssistantMessage'
    | 'refreshAssistantMessageHeartbeat'
>;

const UI_CHUNK_ACK_TIMEOUT_MS = 30_000;

const usageEnvelope = (
    usage: LanguageModelUsage | undefined,
): AiTokenUsageEnvelope | null =>
    usage
        ? {
              version: 1,
              inputTokens: usage.inputTokens ?? null,
              outputTokens: usage.outputTokens ?? null,
              totalTokens: usage.totalTokens ?? null,
              reasoningTokens: usage.reasoningTokens ?? null,
              cachedInputTokens: usage.cachedInputTokens ?? null,
          }
        : null;

export const getAiRunErrorEnvelope = (
    error: unknown,
    message: string,
): AiRunErrorEnvelope => {
    let name = 'stream_error';
    if (APICallError.isInstance(error)) name = 'provider_error';
    if (error instanceof Error && error.name === 'AiAgentStepCapReachedError') {
        name = 'step_cap_reached';
    }
    if (error instanceof Error && error.name === 'AiAgentEmptyResponseError') {
        name = 'empty_response';
    }
    if (
        error instanceof Error &&
        /context.{0,20}(length|window)|maximum context/i.test(error.message)
    ) {
        name = 'context_overflow';
    }
    return { version: 1, name, message, data: null };
};

export class AiAgentV3RunPersistence {
    private readonly parts = new Map<string, PersistedPart>();

    private nextPartIndex = 0;

    private queue: Promise<void> = Promise.resolve();

    private terminal = false;

    private heartbeat: ReturnType<typeof setInterval> | undefined;

    private tokenUsage: AiTokenUsageEnvelope | null = null;

    private resolveTerminal!: () => void;

    private readonly terminalPromise = new Promise<void>((resolve) => {
        this.resolveTerminal = resolve;
    });

    private readonly chunkAckResults = new Map<string, boolean[]>();

    private readonly chunkAckWaiters = new Map<
        string,
        Array<(persisted: boolean) => void>
    >();

    constructor(
        private readonly model: Model,
        private readonly messageUuid: string,
        private readonly isCanceled: () => boolean,
        private readonly onTerminal?: () => void,
        private readonly onFrozen?: () => void,
    ) {}

    private markTerminal(): void {
        if (this.terminal) return;
        this.terminal = true;
        this.stopHeartbeat();
        this.onTerminal?.();
        this.resolveTerminal();
    }

    waitForTerminal(): Promise<void> {
        return this.terminalPromise;
    }

    private static chunkAckKey(value: unknown): string | null {
        const chunk = value as {
            type?: unknown;
            id?: unknown;
            text?: unknown;
            delta?: unknown;
        };
        if (
            (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') ||
            typeof chunk.id !== 'string'
        ) {
            return null;
        }
        const content =
            typeof chunk.text === 'string' ? chunk.text : chunk.delta;
        return typeof content === 'string'
            ? `${chunk.type}:${chunk.id}:${content}`
            : null;
    }

    private acknowledgeChunk(key: string, persisted: boolean): void {
        const waiters = this.chunkAckWaiters.get(key);
        const waiter = waiters?.shift();
        if (waiter) {
            if (waiters?.length === 0) this.chunkAckWaiters.delete(key);
            waiter(persisted);
            return;
        }
        const results = this.chunkAckResults.get(key) ?? [];
        results.push(persisted);
        this.chunkAckResults.set(key, results);
    }

    waitForUiChunk(value: unknown): Promise<boolean> {
        const key = AiAgentV3RunPersistence.chunkAckKey(value);
        if (!key) return Promise.resolve(true);
        const results = this.chunkAckResults.get(key);
        const result = results?.shift();
        if (result !== undefined) {
            if (results?.length === 0) this.chunkAckResults.delete(key);
            return Promise.resolve(result);
        }
        return new Promise<boolean>((resolve) => {
            const waiters = this.chunkAckWaiters.get(key) ?? [];
            const state: { timeout?: ReturnType<typeof setTimeout> } = {};
            const waiter = (persisted: boolean) => {
                if (state.timeout) clearTimeout(state.timeout);
                resolve(persisted);
            };
            state.timeout = setTimeout(() => {
                const pending = this.chunkAckWaiters.get(key);
                const index = pending?.indexOf(waiter) ?? -1;
                if (index >= 0) pending?.splice(index, 1);
                if (pending?.length === 0) this.chunkAckWaiters.delete(key);
                resolve(false);
            }, UI_CHUNK_ACK_TIMEOUT_MS);
            waiters.push(waiter);
            this.chunkAckWaiters.set(key, waiters);
        });
    }

    recordUsage(usage: LanguageModelUsage): void {
        const next = usageEnvelope(usage);
        if (!next) return;
        const previous = this.tokenUsage;
        const sum = (left: number | null, right: number | null) =>
            left === null && right === null ? null : (left ?? 0) + (right ?? 0);
        this.tokenUsage = previous
            ? {
                  version: 1,
                  inputTokens: sum(previous.inputTokens, next.inputTokens),
                  outputTokens: sum(previous.outputTokens, next.outputTokens),
                  totalTokens: sum(previous.totalTokens, next.totalTokens),
                  reasoningTokens: sum(
                      previous.reasoningTokens,
                      next.reasoningTokens,
                  ),
                  cachedInputTokens: sum(
                      previous.cachedInputTokens,
                      next.cachedInputTokens,
                  ),
              }
            : next;
    }

    startHeartbeat(intervalMs: number): void {
        this.heartbeat = setInterval(() => {
            void this.model
                .refreshAssistantMessageHeartbeat(this.messageUuid)
                .then((updated) => {
                    if (!updated) this.stopHeartbeat();
                })
                .catch(() => this.stopHeartbeat());
        }, intervalMs);
    }

    private stopHeartbeat(): void {
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = undefined;
    }

    private enqueue(operation: () => Promise<void>): Promise<void> {
        const result = this.queue.then(async () => {
            try {
                await operation();
            } catch (error) {
                if (
                    error instanceof ConflictError &&
                    error.message === 'Assistant message is frozen'
                ) {
                    this.onFrozen?.();
                    this.markTerminal();
                    return;
                }
                throw error;
            }
        });
        this.queue = result.catch(() => undefined);
        return result;
    }

    private async createPart(
        key: string,
        type: AiV3PartWrite['type'],
        payload: Record<string, unknown>,
        toolCallId?: string,
        artifactVersionUuid?: string,
    ): Promise<PersistedPart> {
        const partIndex = this.nextPartIndex;
        this.nextPartIndex += 1;
        const write = {
            partIndex,
            type,
            payloadVersion: 1,
            payload,
            ...(toolCallId ? { toolCallId } : {}),
            ...(artifactVersionUuid ? { artifactVersionUuid } : {}),
        } as AiV3PartWrite;
        const [created] = await this.model.appendParts({
            messageUuid: this.messageUuid,
            parts: [write],
        });
        const part = {
            uuid: created.uuid,
            partIndex,
            type,
            toolCallId,
            payload,
        };
        this.parts.set(key, part);
        return part;
    }

    private async updatePart(
        part: PersistedPart,
        payload: Record<string, unknown>,
    ): Promise<void> {
        await this.model.updatePart({
            messageUuid: this.messageUuid,
            partUuid: part.uuid,
            payloadVersion: 1,
            payload,
        });
        const stored = [...this.parts.values()].find(
            ({ uuid }) => uuid === part.uuid,
        );
        if (stored) stored.payload = payload;
    }

    async onChunk(value: unknown): Promise<void> {
        const chunk = value as StreamChunk;
        const ackKey = AiAgentV3RunPersistence.chunkAckKey(chunk);
        let persisted = false;
        try {
            await this.enqueue(async () => {
                if (this.terminal) return;
                switch (chunk.type) {
                    case 'text-delta':
                    case 'reasoning-delta': {
                        const type =
                            chunk.type === 'text-delta' ? 'text' : 'reasoning';
                        const part = this.parts.get(chunk.id);
                        const payload = {
                            ...(part?.payload ?? {}),
                            text: `${String(part?.payload.text ?? '')}${chunk.text}`,
                            ...(chunk.providerMetadata
                                ? { providerMetadata: chunk.providerMetadata }
                                : {}),
                        };
                        if (part) await this.updatePart(part, payload);
                        else await this.createPart(chunk.id, type, payload);
                        persisted = true;
                        return;
                    }
                    case 'tool-input-start': {
                        await this.createPart(
                            chunk.id,
                            'tool',
                            {
                                state: 'input-streaming',
                                toolName: chunk.toolName,
                                rawInput: '',
                                ...(chunk.providerMetadata
                                    ? {
                                          providerMetadata:
                                              chunk.providerMetadata,
                                      }
                                    : {}),
                                ...(chunk.providerExecuted !== undefined
                                    ? {
                                          providerExecuted:
                                              chunk.providerExecuted,
                                      }
                                    : {}),
                                ...(chunk.dynamic !== undefined
                                    ? { dynamic: chunk.dynamic }
                                    : {}),
                                ...(chunk.title ? { title: chunk.title } : {}),
                            },
                            chunk.id,
                        );
                        return;
                    }
                    case 'tool-input-delta': {
                        const part = this.parts.get(chunk.id);
                        if (!part) return;
                        await this.updatePart(part, {
                            ...part.payload,
                            rawInput: `${String(part.payload.rawInput ?? '')}${chunk.delta}`,
                            ...(chunk.providerMetadata
                                ? { providerMetadata: chunk.providerMetadata }
                                : {}),
                        });
                        return;
                    }
                    case 'tool-call': {
                        const part = this.parts.get(chunk.toolCallId);
                        const payload = chunk.invalid
                            ? {
                                  state: 'output-error',
                                  toolName: chunk.toolName,
                                  input: chunk.input,
                                  error: {
                                      name: 'invalid_tool_call',
                                      message:
                                          chunk.error instanceof Error
                                              ? chunk.error.message
                                              : String(
                                                    chunk.error ??
                                                        'Invalid tool call',
                                                ),
                                  },
                              }
                            : {
                                  state: 'input-available',
                                  toolName: chunk.toolName,
                                  input: chunk.input,
                              };
                        const enriched = {
                            ...payload,
                            ...(chunk.providerMetadata
                                ? { providerMetadata: chunk.providerMetadata }
                                : {}),
                            ...(chunk.providerExecuted !== undefined
                                ? { providerExecuted: chunk.providerExecuted }
                                : {}),
                            ...(chunk.dynamic !== undefined
                                ? { dynamic: chunk.dynamic }
                                : {}),
                        };
                        if (part) await this.updatePart(part, enriched);
                        else
                            await this.createPart(
                                chunk.toolCallId,
                                'tool',
                                enriched,
                                chunk.toolCallId,
                            );
                        return;
                    }
                    case 'tool-result': {
                        if (chunk.preliminary) return;
                        const part = this.parts.get(chunk.toolCallId);
                        const payload = {
                            ...(part?.payload ?? { toolName: chunk.toolName }),
                            state: 'output-available',
                            output: chunk.output,
                            ...(chunk.providerMetadata
                                ? { providerMetadata: chunk.providerMetadata }
                                : {}),
                        };
                        if (part) await this.updatePart(part, payload);
                        else
                            await this.createPart(
                                chunk.toolCallId,
                                'tool',
                                payload,
                                chunk.toolCallId,
                            );
                        return;
                    }
                    case 'source': {
                        const { type: _type, ...source } = chunk;
                        await this.createPart(
                            `source:${this.nextPartIndex}`,
                            'source',
                            source,
                        );
                        return;
                    }
                    case 'raw':
                        return;
                    default:
                        return;
                }
            });
        } finally {
            if (ackKey) this.acknowledgeChunk(ackKey, persisted);
        }
    }

    async appendArtifact(artifactVersionUuid: string): Promise<void> {
        return this.enqueue(async () => {
            if (this.terminal) return;
            await this.createPart(
                `artifact:${artifactVersionUuid}`,
                'artifact',
                {},
                undefined,
                artifactVersionUuid,
            );
        });
    }

    async complete(usage?: LanguageModelUsage): Promise<void> {
        const canceled = this.isCanceled();
        return this.enqueue(async () => {
            if (this.terminal) return;
            try {
                await this.model.finishAssistantMessage({
                    messageUuid: this.messageUuid,
                    status: canceled ? 'canceled' : 'completed',
                    tokenUsage: usageEnvelope(usage) ?? this.tokenUsage,
                    error: null,
                });
            } finally {
                this.markTerminal();
            }
        });
    }

    async cancel(): Promise<void> {
        return this.enqueue(async () => {
            if (this.terminal) return;
            try {
                await this.model.finishAssistantMessage({
                    messageUuid: this.messageUuid,
                    status: 'canceled',
                    tokenUsage: this.tokenUsage,
                    error: null,
                });
            } finally {
                this.markTerminal();
            }
        });
    }

    async fail(error: unknown, message: string): Promise<void> {
        const canceled = this.isCanceled();
        return this.enqueue(async () => {
            if (this.terminal) return;
            try {
                await this.model.finishAssistantMessage({
                    messageUuid: this.messageUuid,
                    status: canceled ? 'canceled' : 'error',
                    tokenUsage: this.tokenUsage,
                    error: canceled
                        ? null
                        : getAiRunErrorEnvelope(error, message),
                });
            } finally {
                this.markTerminal();
            }
        });
    }
}
