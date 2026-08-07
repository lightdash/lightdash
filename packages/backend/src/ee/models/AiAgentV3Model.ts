import {
    assertUnreachable,
    ConflictError,
    NotFoundError,
    ParameterError,
    UnexpectedServerError,
    type AiAgentThreadFirstMessage,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AiThreadTableName,
    AiWebAppThreadTableName,
    type DbAiThread,
} from '../database/entities/ai';
import {
    AI_ASSISTANT_MESSAGE_TERMINAL_STATUSES,
    AI_TOOL_PART_INTERRUPTED_STATE,
    AI_TOOL_PART_TERMINAL_STATES,
    AiMessagePartTableName,
    AiThreadMessageSequenceTableName,
    AiThreadMessageTableName,
    AiToolApprovalTableName,
    getAiToolApprovalPayload,
    MODEL_VISIBLE_AI_MESSAGE_PART_TYPES,
    NON_USER_AI_MESSAGE_PART_TYPES,
    type AiAssistantMessageTerminalStatus,
    type AiCanonicalPart,
    type AiCanonicalThread,
    type AiModelConfigEnvelope,
    type AiRunErrorEnvelope,
    type AiTokenUsageEnvelope,
    type AiToolApprovalDecision,
    type AiV3PartWrite,
    type AiV3ThreadLineage,
    type CreateAiV3Thread,
    type DbAiMessagePart,
    type DbAiThreadMessage,
    type DbAiToolApproval,
} from '../database/entities/aiAgentV3';

type Dependencies = {
    database: Knex;
};

type CreatedMessage = {
    uuid: string;
    threadSeq: number;
};

type ToolApprovalDecisionResult = {
    decision: AiToolApprovalDecision;
    messageUuid: string;
    partUuid: string;
    recorded: boolean;
    shouldResume: boolean;
};

const TERMINAL_TOOL_STATE_PLACEHOLDERS = AI_TOOL_PART_TERMINAL_STATES.map(
    () => '?',
).join(', ');

export class AiAgentV3Model {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    async listFirstMessages(
        threadUuids: string[],
    ): Promise<Map<string, AiAgentThreadFirstMessage>> {
        if (threadUuids.length === 0) return new Map();
        const rows = await this.database(AiThreadMessageTableName)
            .innerJoin(
                AiMessagePartTableName,
                `${AiMessagePartTableName}.ai_thread_message_uuid`,
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
            )
            .select<
                {
                    ai_thread_uuid: string;
                    ai_thread_message_uuid: string;
                    payload: Record<string, unknown>;
                }[]
            >(
                `${AiThreadMessageTableName}.ai_thread_uuid`,
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                `${AiMessagePartTableName}.payload`,
            )
            .whereIn(`${AiThreadMessageTableName}.ai_thread_uuid`, threadUuids)
            .where(`${AiThreadMessageTableName}.role`, 'user')
            .where(`${AiMessagePartTableName}.type`, 'text')
            .distinctOn(`${AiThreadMessageTableName}.ai_thread_uuid`)
            .orderBy([
                { column: `${AiThreadMessageTableName}.ai_thread_uuid` },
                { column: `${AiThreadMessageTableName}.thread_seq` },
                { column: `${AiMessagePartTableName}.part_index` },
            ]);
        return new Map(
            rows.flatMap((row) =>
                typeof row.payload.text === 'string'
                    ? [
                          [
                              row.ai_thread_uuid,
                              {
                                  uuid: row.ai_thread_message_uuid,
                                  message: row.payload.text,
                              },
                          ] as const,
                      ]
                    : [],
            ),
        );
    }

    private static toLineage(row: DbAiThread): AiV3ThreadLineage {
        switch (row.lineage_kind) {
            case null:
                return null;
            case 'spawn':
                if (
                    row.parent_thread_uuid === null ||
                    row.parent_message_uuid === null ||
                    row.parent_tool_call_id === null
                ) {
                    throw new UnexpectedServerError('Invalid spawn lineage');
                }
                return {
                    kind: 'spawn',
                    parentThreadUuid: row.parent_thread_uuid,
                    parentMessageUuid: row.parent_message_uuid,
                    parentToolCallId: row.parent_tool_call_id,
                };
            case 'fork':
                if (
                    row.parent_thread_uuid === null ||
                    row.fork_boundary_seq === null
                ) {
                    throw new UnexpectedServerError('Invalid fork lineage');
                }
                return {
                    kind: 'fork',
                    parentThreadUuid: row.parent_thread_uuid,
                    forkBoundarySeq: row.fork_boundary_seq,
                };
            default:
                return assertUnreachable(
                    row.lineage_kind,
                    'Invalid lineage kind',
                );
        }
    }

    private static assertLineageScope(
        parent: DbAiThread,
        data: CreateAiV3Thread,
    ): void {
        if (
            parent.organization_uuid !== data.organizationUuid ||
            parent.project_uuid !== data.projectUuid ||
            parent.agent_uuid !== data.agentUuid
        ) {
            throw new ParameterError('Lineage scope must match its parent');
        }
        if (parent.storage_version !== 3) {
            throw new ParameterError(
                'Lineage parent must use storage version 3',
            );
        }
    }

    private static async allocateThreadSeq(
        trx: Knex.Transaction,
        threadUuid: string,
    ): Promise<number> {
        const [row] = await trx(AiThreadMessageSequenceTableName)
            .where('ai_thread_uuid', threadUuid)
            .increment('next_thread_seq', 1)
            .returning('next_thread_seq');
        if (row === undefined) {
            const thread = await trx(AiThreadTableName)
                .where('ai_thread_uuid', threadUuid)
                .first();
            if (thread === undefined) {
                throw new NotFoundError('Thread not found');
            }
            throw new ConflictError('Thread is not writable v3 storage');
        }
        return row.next_thread_seq - 1;
    }

    private static assertPartWrites(
        parts: AiV3PartWrite[],
        role: 'user' | 'assistant',
    ): void {
        parts.forEach((part) => {
            if (
                role === 'user' &&
                NON_USER_AI_MESSAGE_PART_TYPES.some(
                    (partType) => partType === part.type,
                )
            ) {
                throw new ParameterError(
                    `${part.type} parts are not valid on user messages`,
                );
            }
            if (role === 'assistant' && part.type === 'compaction') {
                throw new ParameterError(
                    'compaction parts are not valid on assistant messages',
                );
            }
            if (part.type === 'tool' && !part.toolCallId) {
                throw new ParameterError('Tool part requires a tool call id');
            }
            if (part.type === 'artifact' && !part.artifactVersionUuid) {
                throw new ParameterError(
                    'Artifact part requires an artifact version uuid',
                );
            }
            if (
                part.type !== 'tool' &&
                'toolCallId' in part &&
                part.toolCallId !== undefined
            ) {
                throw new ParameterError(
                    'Tool call id is only valid on tool parts',
                );
            }
            if (
                part.type !== 'artifact' &&
                'artifactVersionUuid' in part &&
                part.artifactVersionUuid !== undefined
            ) {
                throw new ParameterError(
                    'Artifact version uuid is only valid on artifact parts',
                );
            }
        });
    }

    private static async insertParts(
        trx: Knex.Transaction,
        messageUuid: string,
        parts: AiV3PartWrite[],
    ): Promise<AiCanonicalPart[]> {
        if (parts.length === 0) return [];
        const rows = await trx(AiMessagePartTableName)
            .insert(
                parts.map((part) => ({
                    ai_thread_message_uuid: messageUuid,
                    part_index: part.partIndex,
                    type: part.type,
                    payload_version: part.payloadVersion,
                    payload: part.payload,
                    tool_call_id: part.toolCallId,
                    ai_artifact_version_uuid: part.artifactVersionUuid,
                })),
            )
            .returning('*');
        return rows.map((row) => AiAgentV3Model.toCanonicalPart(row));
    }

    private static toCanonicalPart(
        part: DbAiMessagePart,
        approval?: DbAiToolApproval,
    ): AiCanonicalPart {
        const persistedApproval =
            part.type === 'tool'
                ? getAiToolApprovalPayload(part.payload)
                : null;
        return {
            uuid: part.ai_message_part_uuid,
            type: part.type,
            payloadVersion: part.payload_version,
            payload: approval
                ? {
                      ...part.payload,
                      approval: {
                          id: approval.approval_id,
                          signature: persistedApproval?.signature ?? null,
                          approved: approval.decision === 'approved',
                          reason: approval.reason,
                          decidedByUserUuid: approval.decided_by_user_uuid,
                          decidedAt: approval.decided_at.toISOString(),
                      },
                  }
                : part.payload,
            toolCallId: part.tool_call_id,
            artifactVersionUuid: part.ai_artifact_version_uuid,
        };
    }

    private static async getWritableAssistantMessage(
        trx: Knex.Transaction,
        messageUuid: string,
    ): Promise<DbAiThreadMessage> {
        const message = await trx(AiThreadMessageTableName)
            .where('ai_thread_message_uuid', messageUuid)
            .forUpdate()
            .first();
        if (message === undefined) {
            throw new NotFoundError('Assistant message not found');
        }
        if (message.role !== 'assistant') {
            throw new ConflictError('Message is not an assistant message');
        }
        if (message.status !== 'in_progress') {
            throw new ConflictError('Assistant message is frozen');
        }
        return message;
    }

    private static async assertHasVisibleMessagePart(
        trx: Knex.Transaction,
        messageUuid: string,
    ): Promise<void> {
        const visiblePart = await trx(AiMessagePartTableName)
            .where('ai_thread_message_uuid', messageUuid)
            .whereIn('type', [...MODEL_VISIBLE_AI_MESSAGE_PART_TYPES])
            .first();
        if (visiblePart === undefined) {
            throw new ConflictError(
                'Completed assistant message requires content',
            );
        }
    }

    private static async healNonTerminalToolParts(
        trx: Knex.Transaction,
        messageUuid: string,
    ): Promise<void> {
        await trx(AiMessagePartTableName)
            .where('ai_thread_message_uuid', messageUuid)
            .where('type', 'tool')
            .whereRaw(
                `COALESCE(payload->>'state', '') NOT IN (${TERMINAL_TOOL_STATE_PLACEHOLDERS})`,
                [...AI_TOOL_PART_TERMINAL_STATES],
            )
            .update({
                payload: trx.raw('payload || ?::jsonb', [
                    JSON.stringify({
                        state: AI_TOOL_PART_INTERRUPTED_STATE,
                        error: {
                            name: 'interrupted',
                            message: 'Tool execution was interrupted',
                        },
                    }),
                ]),
            });
    }

    private static existingToolApprovalResult(
        part: DbAiMessagePart,
        approval: DbAiToolApproval,
    ): ToolApprovalDecisionResult {
        return {
            decision: approval.decision,
            messageUuid: part.ai_thread_message_uuid,
            partUuid: part.ai_message_part_uuid,
            recorded: false,
            shouldResume: false,
        };
    }

    async createThread(data: CreateAiV3Thread) {
        return this.database.transaction(async (trx) => {
            let parent: DbAiThread | undefined;
            if (data.lineage !== null) {
                parent = await trx(AiThreadTableName)
                    .where('ai_thread_uuid', data.lineage.parentThreadUuid)
                    .first();
                if (parent === undefined) {
                    throw new NotFoundError('Lineage parent thread not found');
                }
                AiAgentV3Model.assertLineageScope(parent, data);

                switch (data.lineage.kind) {
                    case 'spawn': {
                        const anchor = await trx(AiThreadMessageTableName)
                            .innerJoin(
                                AiMessagePartTableName,
                                `${AiMessagePartTableName}.ai_thread_message_uuid`,
                                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                            )
                            .where(
                                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                                data.lineage.parentMessageUuid,
                            )
                            .where(
                                `${AiThreadMessageTableName}.ai_thread_uuid`,
                                data.lineage.parentThreadUuid,
                            )
                            .where(
                                `${AiThreadMessageTableName}.role`,
                                'assistant',
                            )
                            .where(`${AiMessagePartTableName}.type`, 'tool')
                            .where(
                                `${AiMessagePartTableName}.tool_call_id`,
                                data.lineage.parentToolCallId,
                            )
                            .first();
                        if (anchor === undefined) {
                            throw new ParameterError(
                                'Spawn anchor does not exist',
                            );
                        }
                        break;
                    }
                    case 'fork': {
                        if (parent.lineage_kind === 'spawn') {
                            throw new ParameterError(
                                'Spawn threads cannot be forked',
                            );
                        }
                        const boundary = await trx(AiThreadMessageTableName)
                            .where(
                                'ai_thread_uuid',
                                data.lineage.parentThreadUuid,
                            )
                            .where('thread_seq', data.lineage.forkBoundarySeq)
                            .first();
                        if (boundary === undefined) {
                            throw new ParameterError(
                                'Fork boundary does not exist',
                            );
                        }
                        if (
                            boundary.role === 'assistant' &&
                            !AI_ASSISTANT_MESSAGE_TERMINAL_STATUSES.some(
                                (status) => status === boundary.status,
                            )
                        ) {
                            throw new ParameterError(
                                'Fork boundary assistant message must be frozen',
                            );
                        }
                        const activeAssistantInPrefix = await trx(
                            AiThreadMessageTableName,
                        )
                            .where(
                                'ai_thread_uuid',
                                data.lineage.parentThreadUuid,
                            )
                            .where(
                                'thread_seq',
                                '<=',
                                data.lineage.forkBoundarySeq,
                            )
                            .where('role', 'assistant')
                            .where('status', 'in_progress')
                            .first();
                        if (activeAssistantInPrefix !== undefined) {
                            throw new ParameterError(
                                'Fork prefix contains an active assistant message',
                            );
                        }
                        break;
                    }
                    default:
                        assertUnreachable(data.lineage, 'Invalid lineage');
                }
            }

            const { lineage } = data;
            const [thread] = await trx(AiThreadTableName)
                .insert({
                    organization_uuid: data.organizationUuid,
                    project_uuid: data.projectUuid,
                    agent_uuid: data.agentUuid,
                    created_from: data.createdFrom,
                    storage_version: 3,
                    parent_thread_uuid: lineage?.parentThreadUuid,
                    lineage_kind: lineage?.kind,
                    parent_message_uuid:
                        lineage?.kind === 'spawn'
                            ? lineage.parentMessageUuid
                            : undefined,
                    parent_tool_call_id:
                        lineage?.kind === 'spawn'
                            ? lineage.parentToolCallId
                            : undefined,
                    fork_boundary_seq:
                        lineage?.kind === 'fork'
                            ? lineage.forkBoundarySeq
                            : undefined,
                })
                .returning('*');
            if (thread === undefined) {
                throw new UnexpectedServerError('Failed to create v3 thread');
            }
            await trx(AiThreadMessageSequenceTableName).insert({
                ai_thread_uuid: thread.ai_thread_uuid,
            });
            if (data.ownerUserUuid) {
                await trx(AiWebAppThreadTableName).insert({
                    ai_thread_uuid: thread.ai_thread_uuid,
                    user_uuid: data.ownerUserUuid,
                    embed_space_uuid: null,
                });
            }

            return {
                uuid: thread.ai_thread_uuid,
                storageVersion: 3 as const,
                lineage: AiAgentV3Model.toLineage(thread),
            };
        });
    }

    async appendUserMessage({
        threadUuid,
        createdByUserUuid,
        createdAt,
        parts,
    }: {
        threadUuid: string;
        createdByUserUuid: string | null;
        createdAt?: Date;
        parts: AiV3PartWrite[];
    }): Promise<CreatedMessage> {
        if (parts.length === 0) {
            throw new ParameterError('User message requires content');
        }
        AiAgentV3Model.assertPartWrites(parts, 'user');
        return this.database.transaction(async (trx) => {
            const threadSeq = await AiAgentV3Model.allocateThreadSeq(
                trx,
                threadUuid,
            );
            const [message] = await trx(AiThreadMessageTableName)
                .insert({
                    ai_thread_uuid: threadUuid,
                    thread_seq: threadSeq,
                    role: 'user',
                    created_by_user_uuid: createdByUserUuid,
                    created_at: createdAt,
                })
                .returning(['ai_thread_message_uuid', 'created_at']);
            if (message === undefined) {
                throw new UnexpectedServerError(
                    'Failed to append user message',
                );
            }
            await AiAgentV3Model.insertParts(
                trx,
                message.ai_thread_message_uuid,
                parts,
            );
            await trx(AiThreadTableName)
                .where('ai_thread_uuid', threadUuid)
                .update({
                    updated_at: trx.raw('GREATEST(??, ?)', [
                        'updated_at',
                        message.created_at,
                    ]),
                });
            return {
                uuid: message.ai_thread_message_uuid,
                threadSeq,
            };
        });
    }

    async appendSteer({
        threadUuid,
        assistantMessageUuid,
        createdByUserUuid,
        parts,
    }: {
        threadUuid: string;
        assistantMessageUuid: string;
        createdByUserUuid: string;
        parts: AiV3PartWrite[];
    }): Promise<CreatedMessage> {
        if (parts.length === 0) {
            throw new ParameterError('Steer message requires content');
        }
        AiAgentV3Model.assertPartWrites(parts, 'user');
        return this.database.transaction(async (trx) => {
            const assistant = await AiAgentV3Model.getWritableAssistantMessage(
                trx,
                assistantMessageUuid,
            );
            if (assistant.ai_thread_uuid !== threadUuid) {
                throw new NotFoundError('Assistant message not found');
            }
            const threadSeq = await AiAgentV3Model.allocateThreadSeq(
                trx,
                threadUuid,
            );
            const [message] = await trx(AiThreadMessageTableName)
                .insert({
                    ai_thread_uuid: threadUuid,
                    thread_seq: threadSeq,
                    role: 'user',
                    created_by_user_uuid: createdByUserUuid,
                })
                .returning(['ai_thread_message_uuid', 'created_at']);
            if (message === undefined) {
                throw new UnexpectedServerError(
                    'Failed to append steer message',
                );
            }
            await AiAgentV3Model.insertParts(
                trx,
                message.ai_thread_message_uuid,
                parts,
            );
            await trx(AiThreadTableName)
                .where('ai_thread_uuid', threadUuid)
                .update({ updated_at: message.created_at });
            return { uuid: message.ai_thread_message_uuid, threadSeq };
        });
    }

    async createAssistantMessage({
        threadUuid,
        modelConfig,
    }: {
        threadUuid: string;
        modelConfig: AiModelConfigEnvelope;
    }): Promise<CreatedMessage> {
        return this.database.transaction(async (trx) => {
            const threadSeq = await AiAgentV3Model.allocateThreadSeq(
                trx,
                threadUuid,
            );
            const [message] = await trx(AiThreadMessageTableName)
                .insert({
                    ai_thread_uuid: threadUuid,
                    thread_seq: threadSeq,
                    role: 'assistant',
                    status: 'in_progress',
                    last_heartbeat_at: trx.fn.now(),
                    model_config: modelConfig,
                })
                .returning('ai_thread_message_uuid');
            if (message === undefined) {
                throw new UnexpectedServerError(
                    'Failed to create assistant message',
                );
            }
            return {
                uuid: message.ai_thread_message_uuid,
                threadSeq,
            };
        });
    }

    async startRun({
        threadUuid,
        createdByUserUuid,
        userParts,
        modelConfig,
    }: {
        threadUuid: string;
        createdByUserUuid: string;
        userParts: AiV3PartWrite[];
        modelConfig: AiModelConfigEnvelope;
    }): Promise<{
        userMessage: CreatedMessage;
        assistantMessage: CreatedMessage;
    }> {
        if (userParts.length === 0) {
            throw new ParameterError('User message requires content');
        }
        AiAgentV3Model.assertPartWrites(userParts, 'user');
        return this.database.transaction(async (trx) => {
            await trx(AiThreadMessageSequenceTableName)
                .where('ai_thread_uuid', threadUuid)
                .forUpdate()
                .first();
            const activeAssistant = await trx(AiThreadMessageTableName)
                .where('ai_thread_uuid', threadUuid)
                .where('role', 'assistant')
                .where('status', 'in_progress')
                .first();
            if (activeAssistant !== undefined) {
                throw new ConflictError(
                    'This thread already has an active run',
                );
            }

            const userThreadSeq = await AiAgentV3Model.allocateThreadSeq(
                trx,
                threadUuid,
            );
            const [userMessage] = await trx(AiThreadMessageTableName)
                .insert({
                    ai_thread_uuid: threadUuid,
                    thread_seq: userThreadSeq,
                    role: 'user',
                    created_by_user_uuid: createdByUserUuid,
                })
                .returning(['ai_thread_message_uuid', 'created_at']);
            if (userMessage === undefined) {
                throw new UnexpectedServerError(
                    'Failed to append user message',
                );
            }
            await AiAgentV3Model.insertParts(
                trx,
                userMessage.ai_thread_message_uuid,
                userParts,
            );

            const assistantThreadSeq = await AiAgentV3Model.allocateThreadSeq(
                trx,
                threadUuid,
            );
            const [assistantMessage] = await trx(AiThreadMessageTableName)
                .insert({
                    ai_thread_uuid: threadUuid,
                    thread_seq: assistantThreadSeq,
                    role: 'assistant',
                    status: 'in_progress',
                    last_heartbeat_at: trx.fn.now(),
                    model_config: modelConfig,
                })
                .returning('ai_thread_message_uuid');
            if (assistantMessage === undefined) {
                throw new UnexpectedServerError(
                    'Failed to create assistant message',
                );
            }
            await trx(AiThreadTableName)
                .where('ai_thread_uuid', threadUuid)
                .update({ updated_at: userMessage.created_at });

            return {
                userMessage: {
                    uuid: userMessage.ai_thread_message_uuid,
                    threadSeq: userThreadSeq,
                },
                assistantMessage: {
                    uuid: assistantMessage.ai_thread_message_uuid,
                    threadSeq: assistantThreadSeq,
                },
            };
        });
    }

    async appendParts({
        messageUuid,
        parts,
    }: {
        messageUuid: string;
        parts: AiV3PartWrite[];
    }): Promise<AiCanonicalPart[]> {
        AiAgentV3Model.assertPartWrites(parts, 'assistant');
        return this.database.transaction(async (trx) => {
            await AiAgentV3Model.getWritableAssistantMessage(trx, messageUuid);
            return AiAgentV3Model.insertParts(trx, messageUuid, parts);
        });
    }

    async refreshAssistantMessageHeartbeat(
        messageUuid: string,
    ): Promise<boolean> {
        const updated = await this.database(AiThreadMessageTableName)
            .where('ai_thread_message_uuid', messageUuid)
            .where('role', 'assistant')
            .where('status', 'in_progress')
            .update({ last_heartbeat_at: this.database.fn.now() });
        return updated === 1;
    }

    async suspendAssistantMessage(
        messageUuid: string,
        tokenUsage: AiTokenUsageEnvelope | null,
    ): Promise<void> {
        const updated = await this.database(AiThreadMessageTableName)
            .where('ai_thread_message_uuid', messageUuid)
            .where('role', 'assistant')
            .where('status', 'in_progress')
            .update({
                token_usage: tokenUsage,
                last_heartbeat_at: null,
            });
        if (updated !== 1) {
            throw new ConflictError('Assistant message is frozen');
        }
    }

    async claimAssistantMessageResume(messageUuid: string): Promise<boolean> {
        const updated = await this.database(AiThreadMessageTableName)
            .where('ai_thread_message_uuid', messageUuid)
            .where('role', 'assistant')
            .where('status', 'in_progress')
            .whereNull('last_heartbeat_at')
            .update({ last_heartbeat_at: this.database.fn.now() });
        return updated === 1;
    }

    async isAssistantMessageInProgress(messageUuid: string): Promise<boolean> {
        const message = await this.database(AiThreadMessageTableName)
            .where('ai_thread_message_uuid', messageUuid)
            .where('role', 'assistant')
            .where('status', 'in_progress')
            .first('ai_thread_message_uuid');
        return message !== undefined;
    }

    async getSteers({
        threadUuid,
        assistantMessageUuid,
    }: {
        threadUuid: string;
        assistantMessageUuid: string;
    }): Promise<Array<{ uuid: string; message: string; createdAt: string }>> {
        const assistant = await this.database(AiThreadMessageTableName)
            .where('ai_thread_message_uuid', assistantMessageUuid)
            .where('ai_thread_uuid', threadUuid)
            .where('role', 'assistant')
            .first('thread_seq');
        if (!assistant) throw new NotFoundError('Assistant message not found');
        const rows = await this.database(AiThreadMessageTableName)
            .innerJoin(
                AiMessagePartTableName,
                `${AiMessagePartTableName}.ai_thread_message_uuid`,
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
            )
            .where(`${AiThreadMessageTableName}.ai_thread_uuid`, threadUuid)
            .where(`${AiThreadMessageTableName}.role`, 'user')
            .where(
                `${AiThreadMessageTableName}.thread_seq`,
                '>',
                assistant.thread_seq,
            )
            .where(`${AiMessagePartTableName}.type`, 'text')
            .orderBy(`${AiThreadMessageTableName}.thread_seq`)
            .orderBy(`${AiMessagePartTableName}.part_index`)
            .select<
                Array<{
                    uuid: string;
                    created_at: Date;
                    payload: Record<string, unknown>;
                }>
            >({
                uuid: `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                created_at: `${AiThreadMessageTableName}.created_at`,
                payload: `${AiMessagePartTableName}.payload`,
            });
        const grouped = new Map<
            string,
            { uuid: string; message: string; createdAt: string }
        >();
        rows.forEach((row) => {
            const current = grouped.get(row.uuid);
            grouped.set(row.uuid, {
                uuid: row.uuid,
                message: `${current?.message ?? ''}${String(row.payload.text ?? '')}`,
                createdAt: row.created_at.toISOString(),
            });
        });
        return [...grouped.values()];
    }

    async updatePart({
        messageUuid,
        partUuid,
        payloadVersion,
        payload,
    }: {
        messageUuid: string;
        partUuid: string;
        payloadVersion: number;
        payload: Record<string, unknown>;
    }): Promise<AiCanonicalPart> {
        return this.database.transaction(async (trx) => {
            await AiAgentV3Model.getWritableAssistantMessage(trx, messageUuid);
            const update = trx(AiMessagePartTableName)
                .where('ai_message_part_uuid', partUuid)
                .where('ai_thread_message_uuid', messageUuid);
            if (payload.state === 'approval-requested') {
                update.whereRaw("payload->>'state' IN (?, ?, ?)", [
                    'input-streaming',
                    'input-available',
                    'approval-requested',
                ]);
            }
            const [part] = await update
                .update({
                    payload_version: payloadVersion,
                    payload,
                })
                .returning('*');
            if (part === undefined) {
                if (payload.state === 'approval-requested') {
                    const existing = await trx(AiMessagePartTableName)
                        .where('ai_message_part_uuid', partUuid)
                        .where('ai_thread_message_uuid', messageUuid)
                        .first();
                    if (existing !== undefined) {
                        return AiAgentV3Model.toCanonicalPart(existing);
                    }
                }
                throw new NotFoundError('Message part not found');
            }
            return AiAgentV3Model.toCanonicalPart(part);
        });
    }

    async decideToolApproval({
        threadUuid,
        messageUuid,
        toolCallId,
        decision,
        reason,
        decidedByUserUuid,
    }: {
        threadUuid: string;
        messageUuid: string;
        toolCallId: string;
        decision: AiToolApprovalDecision;
        reason: string | null;
        decidedByUserUuid: string;
    }): Promise<ToolApprovalDecisionResult> {
        return this.database.transaction(async (trx) => {
            const row = await trx(AiMessagePartTableName)
                .innerJoin(
                    AiThreadMessageTableName,
                    `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                    `${AiMessagePartTableName}.ai_thread_message_uuid`,
                )
                .where(`${AiThreadMessageTableName}.ai_thread_uuid`, threadUuid)
                .where(
                    `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                    messageUuid,
                )
                .where(`${AiMessagePartTableName}.tool_call_id`, toolCallId)
                .where(`${AiMessagePartTableName}.type`, 'tool')
                .forUpdate()
                .first<
                    DbAiMessagePart & {
                        message_status: DbAiThreadMessage['status'];
                    }
                >(
                    `${AiMessagePartTableName}.*`,
                    `${AiThreadMessageTableName}.status as message_status`,
                );
            if (!row) throw new NotFoundError('Tool call not found');
            if (row.message_status !== 'in_progress') {
                const existing = await trx(AiToolApprovalTableName)
                    .where('ai_message_part_uuid', row.ai_message_part_uuid)
                    .first();
                if (existing) {
                    return AiAgentV3Model.existingToolApprovalResult(
                        row,
                        existing,
                    );
                }
                throw new ConflictError('Assistant message is frozen');
            }
            const approval = getAiToolApprovalPayload(row.payload);
            if (!approval) {
                throw new ConflictError('Tool approval id is missing');
            }
            const existing = await trx(AiToolApprovalTableName)
                .where('ai_message_part_uuid', row.ai_message_part_uuid)
                .first();
            if (existing) {
                return AiAgentV3Model.existingToolApprovalResult(row, existing);
            }
            if (row.payload.state !== 'approval-requested') {
                throw new ConflictError('Tool call is not awaiting approval');
            }
            const [inserted] = await trx(AiToolApprovalTableName)
                .insert({
                    ai_message_part_uuid: row.ai_message_part_uuid,
                    approval_id: approval.id,
                    decision,
                    reason,
                    decided_by_user_uuid: decidedByUserUuid,
                })
                .onConflict('ai_message_part_uuid')
                .ignore()
                .returning('*');
            if (!inserted) {
                const racedDecision = await trx(AiToolApprovalTableName)
                    .where('ai_message_part_uuid', row.ai_message_part_uuid)
                    .first();
                if (!racedDecision) {
                    throw new UnexpectedServerError(
                        'Failed to read tool approval decision',
                    );
                }
                return AiAgentV3Model.existingToolApprovalResult(
                    row,
                    racedDecision,
                );
            }

            const state =
                decision === 'approved'
                    ? 'approval-responded'
                    : 'output-denied';
            await trx(AiMessagePartTableName)
                .where('ai_message_part_uuid', row.ai_message_part_uuid)
                .update({
                    payload: {
                        ...row.payload,
                        state,
                        approval: {
                            id: approval.id,
                            signature: approval.signature,
                            approved: decision === 'approved',
                        },
                    },
                });
            const remainingApproval = await trx(AiMessagePartTableName)
                .where('ai_thread_message_uuid', row.ai_thread_message_uuid)
                .where('type', 'tool')
                .whereRaw("payload->>'state' = ?", ['approval-requested'])
                .first('ai_message_part_uuid');
            return {
                decision,
                messageUuid: row.ai_thread_message_uuid,
                partUuid: row.ai_message_part_uuid,
                recorded: true,
                shouldResume: remainingApproval === undefined,
            };
        });
    }

    async finishAssistantMessage({
        messageUuid,
        status,
        tokenUsage,
        error,
    }: {
        messageUuid: string;
        status: AiAssistantMessageTerminalStatus;
        tokenUsage: AiTokenUsageEnvelope | null;
        error: AiRunErrorEnvelope | null;
    }): Promise<void> {
        if (status === 'error' && error === null) {
            throw new ParameterError('Error status requires an error envelope');
        }
        if (status !== 'error' && error !== null) {
            throw new ParameterError('Error envelope requires error status');
        }
        await this.database.transaction(async (trx) => {
            await AiAgentV3Model.getWritableAssistantMessage(trx, messageUuid);
            if (status === 'completed') {
                await AiAgentV3Model.assertHasVisibleMessagePart(
                    trx,
                    messageUuid,
                );
            }

            await AiAgentV3Model.healNonTerminalToolParts(trx, messageUuid);
            await trx(AiThreadMessageTableName)
                .where('ai_thread_message_uuid', messageUuid)
                .update({
                    status,
                    token_usage: tokenUsage,
                    error,
                });
        });
    }

    async getThread(threadUuid: string): Promise<AiCanonicalThread> {
        const thread = await this.database(AiThreadTableName)
            .where('ai_thread_uuid', threadUuid)
            .first();
        if (thread === undefined) {
            throw new NotFoundError('Thread not found');
        }
        return this.getThreadFromRow(thread);
    }

    async getThreadFromRow(thread: DbAiThread): Promise<AiCanonicalThread> {
        if (thread.storage_version !== 3) {
            throw new ConflictError('Thread is not storage version 3');
        }

        const messages = await this.database(AiThreadMessageTableName)
            .where('ai_thread_uuid', thread.ai_thread_uuid)
            .orderBy('thread_seq');
        const messageUuids = messages.map(
            (message) => message.ai_thread_message_uuid,
        );
        const parts =
            messageUuids.length === 0
                ? []
                : await this.database(AiMessagePartTableName)
                      .whereIn('ai_thread_message_uuid', messageUuids)
                      .orderBy([
                          { column: 'ai_thread_message_uuid' },
                          { column: 'part_index' },
                      ]);
        const approvals =
            parts.length === 0
                ? []
                : await this.database(AiToolApprovalTableName).whereIn(
                      'ai_message_part_uuid',
                      parts.map((part) => part.ai_message_part_uuid),
                  );
        const approvalsByPartUuid = new Map(
            approvals.map((approval) => [
                approval.ai_message_part_uuid,
                approval,
            ]),
        );
        const partsByMessageUuid = new Map<string, AiCanonicalPart[]>();
        parts.forEach((part) => {
            const messageParts =
                partsByMessageUuid.get(part.ai_thread_message_uuid) ?? [];
            messageParts.push(
                AiAgentV3Model.toCanonicalPart(
                    part,
                    approvalsByPartUuid.get(part.ai_message_part_uuid),
                ),
            );
            partsByMessageUuid.set(part.ai_thread_message_uuid, messageParts);
        });

        return {
            uuid: thread.ai_thread_uuid,
            storageVersion: 3,
            organizationUuid: thread.organization_uuid,
            projectUuid: thread.project_uuid,
            agentUuid: thread.agent_uuid,
            createdAt: thread.created_at.toISOString(),
            updatedAt: thread.updated_at?.toISOString() ?? null,
            createdFrom: thread.created_from,
            title: thread.title,
            lineage: AiAgentV3Model.toLineage(thread),
            messages: messages.map((message) => ({
                uuid: message.ai_thread_message_uuid,
                role: message.role,
                parts:
                    partsByMessageUuid.get(message.ai_thread_message_uuid) ??
                    [],
                metadata: {
                    createdAt: message.created_at.toISOString(),
                    createdByUserUuid: message.created_by_user_uuid,
                    status: message.status,
                    lastHeartbeatAt:
                        message.last_heartbeat_at?.toISOString() ?? null,
                    modelConfig: message.model_config,
                    tokenUsage: message.token_usage,
                    error: message.error,
                    hidden: false,
                    context: [],
                    legacy: null,
                },
            })),
        };
    }
}
