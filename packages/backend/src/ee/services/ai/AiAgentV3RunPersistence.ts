import { assertUnreachable, ConflictError } from '@lightdash/common';
import { APICallError, type LanguageModelUsage } from 'ai';
import {
    type AiCanonicalPart,
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
          type: 'text-start' | 'text-end' | 'reasoning-start' | 'reasoning-end';
          id: string;
          providerMetadata?: Record<string, unknown>;
      }
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
          type: 'tool-input-end';
          id: string;
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
    | {
          type: 'tool-error';
          toolCallId: string;
          toolName: string;
          input: unknown;
          error: unknown;
          providerMetadata?: Record<string, unknown>;
          providerExecuted?: boolean;
          dynamic?: boolean;
          title?: string;
      }
    | {
          type: 'tool-approval-request';
          approvalId: string;
          signature: string | null;
          toolCall: {
              toolCallId: string;
              toolName: string;
              input: unknown;
              providerMetadata?: Record<string, unknown>;
              providerExecuted?: boolean;
              dynamic?: boolean;
          };
      }
    | ({ type: 'source' } & Record<string, unknown>)
    | { type: 'raw'; rawValue: unknown };

type UiPersistenceChunk =
    | Extract<
          StreamChunk,
          {
              type:
                  | 'text-start'
                  | 'text-end'
                  | 'reasoning-start'
                  | 'reasoning-end';
          }
      >
    | {
          type: 'tool-approval-request';
          approvalId: string;
          toolCallId: string;
          signature: string | null;
      }
    | {
          type: 'tool-output-error';
          toolCallId: string;
          errorText: string;
          providerMetadata?: Record<string, unknown>;
          providerExecuted?: boolean;
          dynamic?: boolean;
          title?: string;
      };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const withoutDurableApprovalMetadata = (
    payload: Record<string, unknown>,
): Record<string, unknown> => {
    if (!isRecord(payload.approval)) return payload;
    const {
        reason: _reason,
        decidedByUserUuid: _decidedByUserUuid,
        decidedAt: _decidedAt,
        ...approval
    } = payload.approval;
    return { ...payload, approval };
};

const isUiPersistenceChunk = (value: unknown): value is UiPersistenceChunk => {
    if (!isRecord(value) || typeof value.type !== 'string') return false;
    const hasProviderMetadata =
        value.providerMetadata === undefined ||
        isRecord(value.providerMetadata);
    switch (value.type) {
        case 'text-start':
        case 'text-end':
        case 'reasoning-start':
        case 'reasoning-end':
            return typeof value.id === 'string' && hasProviderMetadata;
        case 'tool-approval-request':
            return (
                typeof value.approvalId === 'string' &&
                typeof value.toolCallId === 'string' &&
                (value.signature == null || typeof value.signature === 'string')
            );
        case 'tool-output-error':
            return (
                typeof value.toolCallId === 'string' &&
                typeof value.errorText === 'string' &&
                hasProviderMetadata &&
                (value.providerExecuted === undefined ||
                    typeof value.providerExecuted === 'boolean') &&
                (value.dynamic === undefined ||
                    typeof value.dynamic === 'boolean') &&
                (value.title === undefined || typeof value.title === 'string')
            );
        default:
            return false;
    }
};

type Model = Pick<
    AiAgentV3Model,
    | 'appendParts'
    | 'updatePart'
    | 'finishAssistantMessage'
    | 'refreshAssistantMessageHeartbeat'
    | 'suspendAssistantMessage'
>;

const UI_CHUNK_ACK_TIMEOUT_MS = 30_000;

type ToolPartMetadata = {
    providerMetadata?: Record<string, unknown>;
    providerExecuted?: boolean;
    dynamic?: boolean;
    title?: string;
};

const toolPartMetadata = (
    chunk: ToolPartMetadata,
    providerMetadataKey:
        | 'providerMetadata'
        | 'resultProviderMetadata' = 'providerMetadata',
): Record<string, unknown> => ({
    ...(chunk.providerMetadata
        ? { [providerMetadataKey]: chunk.providerMetadata }
        : {}),
    ...(chunk.providerExecuted !== undefined
        ? { providerExecuted: chunk.providerExecuted }
        : {}),
    ...(chunk.dynamic !== undefined ? { dynamic: chunk.dynamic } : {}),
    ...(chunk.title ? { title: chunk.title } : {}),
});

const toolErrorData = (error: Record<string, unknown>) =>
    typeof error.code === 'string' || typeof error.code === 'number'
        ? { code: error.code }
        : null;

const structuredToolError = (error: unknown) => {
    if (error instanceof Error) {
        return {
            name: error.name || 'tool_error',
            message: error.message,
            data: toolErrorData(error as Error & Record<string, unknown>),
        };
    }
    if (typeof error === 'object' && error !== null) {
        const value = error as Record<string, unknown>;
        return {
            name: typeof value.name === 'string' ? value.name : 'tool_error',
            message:
                typeof value.message === 'string'
                    ? value.message
                    : 'Tool execution failed',
            data: toolErrorData(value),
        };
    }
    return {
        name: 'tool_error',
        message: typeof error === 'string' ? error : 'Tool execution failed',
        data: null,
    };
};

const toolOutputError = (output: unknown) => {
    if (typeof output !== 'object' || output === null) return null;
    const value = output as Record<string, unknown>;
    const { metadata, result } = value;
    if (
        typeof metadata !== 'object' ||
        metadata === null ||
        (metadata as Record<string, unknown>).status !== 'error'
    ) {
        return null;
    }
    return {
        name: 'tool_error',
        message: typeof result === 'string' ? result : 'Tool execution failed',
        data: null,
    };
};

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

const sumUsage = (
    left: AiTokenUsageEnvelope | null,
    right: AiTokenUsageEnvelope | null,
): AiTokenUsageEnvelope | null => {
    if (!left) return right;
    if (!right) return left;
    const sum = (a: number | null, b: number | null) =>
        a === null && b === null ? null : (a ?? 0) + (b ?? 0);
    return {
        version: 1,
        inputTokens: sum(left.inputTokens, right.inputTokens),
        outputTokens: sum(left.outputTokens, right.outputTokens),
        totalTokens: sum(left.totalTokens, right.totalTokens),
        reasoningTokens: sum(left.reasoningTokens, right.reasoningTokens),
        cachedInputTokens: sum(left.cachedInputTokens, right.cachedInputTokens),
    };
};

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

    private heartbeatUpdate: Promise<void> | undefined;

    private tokenUsage: AiTokenUsageEnvelope | null = null;

    private readonly initialTokenUsage: AiTokenUsageEnvelope | null;

    private pendingApproval = false;

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
        initialParts: AiCanonicalPart[] = [],
        initialTokenUsage: AiTokenUsageEnvelope | null = null,
    ) {
        this.initialTokenUsage = initialTokenUsage;
        this.tokenUsage = initialTokenUsage;
        this.nextPartIndex = initialParts.length;
        initialParts.forEach((part, partIndex) => {
            if (part.type === 'tool' && part.toolCallId) {
                this.parts.set(part.toolCallId, {
                    uuid: part.uuid,
                    partIndex,
                    type: 'tool',
                    toolCallId: part.toolCallId,
                    payload: withoutDurableApprovalMetadata(part.payload),
                });
            }
        });
    }

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
        this.tokenUsage = sumUsage(this.tokenUsage, next);
    }

    hasPendingApproval(): boolean {
        return this.pendingApproval;
    }

    startHeartbeat(intervalMs: number): void {
        this.heartbeat = setInterval(() => {
            if (this.heartbeatUpdate) return;
            this.heartbeatUpdate = this.model
                .refreshAssistantMessageHeartbeat(this.messageUuid)
                .then((updated) => {
                    if (!updated) this.stopHeartbeat();
                })
                .catch(() => this.stopHeartbeat())
                .finally(() => {
                    this.heartbeatUpdate = undefined;
                });
        }, intervalMs);
    }

    private stopHeartbeat(): void {
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = undefined;
    }

    private async stopHeartbeatAndWait(): Promise<void> {
        this.stopHeartbeat();
        await this.heartbeatUpdate;
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

    private async upsertToolPart(
        toolCallId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const part = this.parts.get(toolCallId);
        if (part) {
            await this.updatePart(part, payload);
        } else {
            await this.createPart(toolCallId, 'tool', payload, toolCallId);
        }
    }

    async onChunk(value: unknown): Promise<void> {
        const chunk = value as StreamChunk;
        const ackKey = AiAgentV3RunPersistence.chunkAckKey(chunk);
        let persisted = false;
        try {
            await this.enqueue(async () => {
                if (this.terminal) return;
                switch (chunk.type) {
                    case 'text-start':
                    case 'reasoning-start': {
                        const type =
                            chunk.type === 'text-start' ? 'text' : 'reasoning';
                        await this.createPart(chunk.id, type, {
                            text: '',
                            ...(chunk.providerMetadata
                                ? { providerMetadata: chunk.providerMetadata }
                                : {}),
                        });
                        return;
                    }
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
                    case 'text-end':
                    case 'reasoning-end': {
                        const part = this.parts.get(chunk.id);
                        if (!part || !chunk.providerMetadata) return;
                        await this.updatePart(part, {
                            ...part.payload,
                            providerMetadata: chunk.providerMetadata,
                        });
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
                                ...toolPartMetadata(chunk),
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
                    case 'tool-input-end': {
                        const part = this.parts.get(chunk.id);
                        if (!part || !chunk.providerMetadata) return;
                        await this.updatePart(part, {
                            ...part.payload,
                            providerMetadata: chunk.providerMetadata,
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
                                  invalid: true,
                                  rawInput: chunk.input,
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
                            ...toolPartMetadata(chunk),
                        };
                        await this.upsertToolPart(chunk.toolCallId, enriched);
                        return;
                    }
                    case 'tool-approval-request': {
                        const { toolCall } = chunk;
                        const part = this.parts.get(toolCall.toolCallId);
                        const payload = {
                            ...(part?.payload ?? {
                                toolName: toolCall.toolName,
                                input: toolCall.input,
                            }),
                            state: 'approval-requested',
                            approval: {
                                id: chunk.approvalId,
                                ...(chunk.signature
                                    ? { signature: chunk.signature }
                                    : {}),
                            },
                            ...toolPartMetadata(toolCall),
                        };
                        await this.upsertToolPart(toolCall.toolCallId, payload);
                        this.pendingApproval = true;
                        return;
                    }
                    case 'tool-result': {
                        if (chunk.preliminary) return;
                        const part = this.parts.get(chunk.toolCallId);
                        const error = toolOutputError(chunk.output);
                        const payload = {
                            ...(part?.payload ?? { toolName: chunk.toolName }),
                            state: error ? 'output-error' : 'output-available',
                            output: chunk.output,
                            ...(error ? { error } : {}),
                            ...(chunk.providerMetadata
                                ? {
                                      resultProviderMetadata:
                                          chunk.providerMetadata,
                                  }
                                : {}),
                        };
                        await this.upsertToolPart(chunk.toolCallId, payload);
                        return;
                    }
                    case 'tool-error': {
                        const part = this.parts.get(chunk.toolCallId);
                        const payload = {
                            ...(part?.payload ?? {
                                toolName: chunk.toolName,
                                input: chunk.input,
                            }),
                            state: 'output-error',
                            error: structuredToolError(chunk.error),
                            ...toolPartMetadata(
                                chunk,
                                'resultProviderMetadata',
                            ),
                        };
                        await this.upsertToolPart(chunk.toolCallId, payload);
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

    async onUiChunk(value: unknown): Promise<void> {
        if (!isUiPersistenceChunk(value)) return;
        const chunk = value;
        switch (chunk.type) {
            case 'text-start':
            case 'text-end':
            case 'reasoning-start':
            case 'reasoning-end':
                await this.onChunk(chunk);
                return;
            case 'tool-approval-request': {
                const part = this.parts.get(chunk.toolCallId);
                const toolName = part?.payload.toolName;
                if (!part || typeof toolName !== 'string') return;
                await this.onChunk({
                    type: 'tool-approval-request',
                    approvalId: chunk.approvalId,
                    signature: chunk.signature ?? null,
                    toolCall: {
                        toolCallId: chunk.toolCallId,
                        toolName,
                        input: part.payload.input,
                    },
                });
                return;
            }
            case 'tool-output-error': {
                const part = this.parts.get(chunk.toolCallId);
                const toolName = part?.payload.toolName;
                if (!part || typeof toolName !== 'string') return;
                await this.onChunk({
                    type: 'tool-error',
                    toolCallId: chunk.toolCallId,
                    toolName,
                    input: part.payload.input,
                    error: chunk.errorText,
                    providerMetadata: chunk.providerMetadata,
                    providerExecuted: chunk.providerExecuted,
                    dynamic: chunk.dynamic,
                    title: chunk.title,
                });
                return;
            }
            default:
                return assertUnreachable(chunk, 'Unknown UI chunk');
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
        return this.enqueue(async () => {
            if (this.terminal) return;
            if (this.pendingApproval) {
                await this.stopHeartbeatAndWait();
                if (this.isCanceled()) {
                    await this.model.finishAssistantMessage({
                        messageUuid: this.messageUuid,
                        status: 'canceled',
                        tokenUsage: this.tokenUsage,
                        error: null,
                    });
                    this.markTerminal();
                    return;
                }
                await this.model.suspendAssistantMessage(
                    this.messageUuid,
                    this.tokenUsage,
                );
                if (this.isCanceled()) {
                    await this.model.finishAssistantMessage({
                        messageUuid: this.messageUuid,
                        status: 'canceled',
                        tokenUsage: this.tokenUsage,
                        error: null,
                    });
                }
                this.markTerminal();
                return;
            }
            try {
                const canceled = this.isCanceled();
                const finalUsage = usage
                    ? sumUsage(this.initialTokenUsage, usageEnvelope(usage))
                    : this.tokenUsage;
                await this.model.finishAssistantMessage({
                    messageUuid: this.messageUuid,
                    status: canceled ? 'canceled' : 'completed',
                    tokenUsage: finalUsage,
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
