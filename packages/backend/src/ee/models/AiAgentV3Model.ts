import {
    AiDuplicateSlackPromptError,
    assertUnreachable,
    ConflictError,
    EE_SCHEDULER_TASKS,
    NotFoundError,
    ParameterError,
    SLACK_PROMPT_JOB_UUID_PAYLOAD_KEY,
    UnexpectedServerError,
    type AiAgentThreadFirstMessage,
    type CreateSlackThread,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { z } from 'zod';
import type { AiAgentObservabilityMetrics } from '../../prometheus/PrometheusMetrics';
import {
    AiSlackThreadTableName,
    AiThreadTableName,
    AiWebAppThreadTableName,
    type DbAiThread,
} from '../database/entities/ai';
import {
    AI_ASSISTANT_MESSAGE_TERMINAL_STATUSES,
    AI_MESSAGE_ANNOTATION_TYPE_FEEDBACK,
    AI_TOOL_PART_APPROVAL_REQUESTED_STATE,
    AI_TOOL_PART_INTERRUPTED_STATE,
    AI_TOOL_PART_TERMINAL_STATES,
    AiMessageAnnotationTableName,
    AiMessagePartTableName,
    AiSlackMessageTableName,
    AiThreadMessageSequenceTableName,
    AiThreadMessageTableName,
    AiToolApprovalTableName,
    getAiToolApprovalPayload,
    MODEL_VISIBLE_AI_MESSAGE_PART_TYPES,
    NON_USER_AI_MESSAGE_PART_TYPES,
    type AiAssistantMessageTerminalStatus,
    type AiCanonicalPart,
    type AiCanonicalThread,
    type AiCompactionPreservedContext,
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
import { lockSlackChannel, toSlackPromptWriteError } from './slackThreadWrites';
import {
    compareSlackTimestamps,
    slackTimestampToDate,
} from './slackTimestamps';

type Dependencies = {
    database: Knex;
    prometheusMetrics: AiAgentObservabilityMetrics | null;
};

type CreatedMessage = {
    uuid: string;
    threadSeq: number;
};

type V3SlackUserMessage = {
    uuid: string;
    threadUuid: string;
    threadSeq: number;
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string | null;
    createdByUserUuid: string | null;
    text: string;
    response: string | null;
    createdAt: Date;
    responseSlackTs: string | null;
    slackUserId: string;
    slackChannelId: string;
    promptSlackTs: string;
    slackThreadTs: string;
    humanScore: number | null;
    modelConfig: AiModelConfigEnvelope | null;
};

type ToolApprovalDecisionResult = {
    decision: AiToolApprovalDecision;
    messageUuid: string;
    partUuid: string;
    recorded: boolean;
    shouldResume: boolean;
};

type SlackMessageInput = {
    text: string;
    slackUserId: string;
    promptSlackTs: string;
};

type SlackFeedbackTarget = {
    ai_thread_message_uuid: string;
    ai_thread_uuid: string;
    thread_seq: number;
    organization_uuid: string;
    project_uuid: string;
    agent_uuid: string | null;
};

type SlackFeedbackLookup =
    | {
          kind: 'response';
          slackChannelId: string;
          responseSlackTs: string;
      }
    | { kind: 'message'; userMessageUuid: string };

type SlackFeedbackResult = {
    userMessageUuid: string;
    assistantMessageUuid: string;
    threadUuid: string;
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string | null;
};

type MessageFeedbackResult = Omit<SlackFeedbackResult, 'userMessageUuid'>;

const TERMINAL_TOOL_STATE_PLACEHOLDERS = AI_TOOL_PART_TERMINAL_STATES.map(
    () => '?',
).join(', ');
const NEGATIVE_FEEDBACK_SCORE = -1;

const slackRunSqlToolPayloadSchema = z.object({
    toolName: z.literal('runSql'),
    input: z.object({ sql: z.string() }),
});
const slackRunSqlApprovalPayloadSchema = slackRunSqlToolPayloadSchema.extend({
    state: z.literal(AI_TOOL_PART_APPROVAL_REQUESTED_STATE),
});
const feedbackAnnotationPayloadSchema = z.object({
    humanScore: z.number(),
    humanFeedback: z.string().nullable(),
});

export class AiAgentV3Model {
    private readonly database: Knex;

    private readonly prometheusMetrics: Dependencies['prometheusMetrics'];

    constructor({ database, prometheusMetrics }: Dependencies) {
        this.database = database;
        this.prometheusMetrics = prometheusMetrics;
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

    private static async allocateSlackThreadSeq(
        trx: Knex.Transaction,
        {
            threadUuid,
            promptSlackTs,
            count,
        }: {
            threadUuid: string;
            promptSlackTs: string;
            count: 1 | 2;
        },
    ): Promise<number> {
        if (slackTimestampToDate(promptSlackTs) === null) {
            throw new ParameterError('Invalid Slack timestamp');
        }
        const sequence = await trx(AiThreadMessageSequenceTableName)
            .where('ai_thread_uuid', threadUuid)
            .forUpdate()
            .first('next_thread_seq');
        if (!sequence) {
            throw new ConflictError('Thread is not writable v3 storage');
        }
        const latestCompaction = await trx(AiThreadMessageTableName)
            .where('ai_thread_uuid', threadUuid)
            .where('role', 'compaction')
            .orderBy('thread_seq', 'desc')
            .first('thread_seq');
        const laterSlackMessageQuery = trx(AiSlackMessageTableName)
            .innerJoin(
                AiThreadMessageTableName,
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                `${AiSlackMessageTableName}.ai_thread_message_uuid`,
            )
            .where(`${AiThreadMessageTableName}.ai_thread_uuid`, threadUuid)
            .whereRaw('??::numeric > ?::numeric', [
                `${AiSlackMessageTableName}.prompt_slack_ts`,
                promptSlackTs,
            ])
            .orderBy(`${AiThreadMessageTableName}.thread_seq`);
        if (latestCompaction) {
            laterSlackMessageQuery.where(
                `${AiThreadMessageTableName}.thread_seq`,
                '>',
                latestCompaction.thread_seq,
            );
        }
        const laterSlackMessage = await laterSlackMessageQuery.first(
            `${AiThreadMessageTableName}.thread_seq`,
        );
        const threadSeq =
            laterSlackMessage?.thread_seq ??
            Math.max(
                sequence.next_thread_seq,
                (latestCompaction?.thread_seq ?? 0) + 1,
            );

        if (laterSlackMessage) {
            // Move rows negative first to avoid collisions on the unique sequence index.
            await trx(AiThreadMessageTableName)
                .where('ai_thread_uuid', threadUuid)
                .where('thread_seq', '>=', threadSeq)
                .update({ thread_seq: trx.raw('-thread_seq - 1') });
            await trx(AiThreadMessageTableName)
                .where('ai_thread_uuid', threadUuid)
                .where('thread_seq', '<', 0)
                .update({
                    thread_seq: trx.raw('-thread_seq - 1 + ?', [count]),
                });
            await trx(AiThreadTableName)
                .where('parent_thread_uuid', threadUuid)
                .where('fork_boundary_seq', '>=', threadSeq)
                .increment('fork_boundary_seq', count);
        }
        await trx(AiThreadMessageSequenceTableName)
            .where('ai_thread_uuid', threadUuid)
            .increment('next_thread_seq', count);
        return threadSeq;
    }

    private static async findAdjacentAssistantMessage(
        trx: Knex | Knex.Transaction,
        threadUuid: string,
        userThreadSeq: number,
        { forUpdate = false }: { forUpdate?: boolean } = {},
    ): Promise<DbAiThreadMessage | undefined> {
        const query = trx(AiThreadMessageTableName)
            .where('ai_thread_uuid', threadUuid)
            .where('thread_seq', userThreadSeq + 1)
            .where('role', 'assistant');
        if (forUpdate) query.forUpdate();
        return query.first();
    }

    private static async findAdjacentSlackUserMessage(
        database: Knex | Knex.Transaction,
        threadUuid: string,
        assistantThreadSeq: number,
    ) {
        return database(AiThreadMessageTableName)
            .innerJoin(
                AiSlackMessageTableName,
                `${AiSlackMessageTableName}.ai_thread_message_uuid`,
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
            )
            .where(`${AiThreadMessageTableName}.ai_thread_uuid`, threadUuid)
            .where(
                `${AiThreadMessageTableName}.thread_seq`,
                assistantThreadSeq - 1,
            )
            .where(`${AiThreadMessageTableName}.role`, 'user')
            .first(
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                `${AiThreadMessageTableName}.created_by_user_uuid`,
                `${AiSlackMessageTableName}.slack_channel_id`,
            );
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

    private static async insertSlackUserMessage(
        trx: Knex.Transaction,
        {
            threadUuid,
            createdByUserUuid,
            createdAt,
            text,
            slackUserId,
            slackChannelId,
            promptSlackTs,
            threadSeq,
        }: SlackMessageInput & {
            threadUuid: string;
            createdByUserUuid: string | null;
            createdAt: Date;
            slackChannelId: string;
            threadSeq: number;
        },
    ): Promise<CreatedMessage> {
        const [message] = await trx(AiThreadMessageTableName)
            .insert({
                ai_thread_uuid: threadUuid,
                thread_seq: threadSeq,
                role: 'user',
                created_by_user_uuid: createdByUserUuid,
                created_at: createdAt,
            })
            .returning(['ai_thread_message_uuid', 'created_at']);
        if (!message) {
            throw new UnexpectedServerError('Failed to append Slack message');
        }
        await AiAgentV3Model.insertParts(trx, message.ai_thread_message_uuid, [
            {
                partIndex: 0,
                type: 'text',
                payloadVersion: 1,
                payload: { text },
            },
        ]);
        await trx(AiSlackMessageTableName).insert({
            ai_thread_message_uuid: message.ai_thread_message_uuid,
            slack_user_id: slackUserId,
            slack_channel_id: slackChannelId,
            prompt_slack_ts: promptSlackTs,
        });
        await trx(AiThreadTableName)
            .where('ai_thread_uuid', threadUuid)
            .update({
                updated_at: trx.raw('GREATEST(??, ?)', [
                    'updated_at',
                    message.created_at,
                ]),
            });
        return { uuid: message.ai_thread_message_uuid, threadSeq };
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
        messageUuids: string[],
    ): Promise<void> {
        if (messageUuids.length === 0) return;
        await trx(AiMessagePartTableName)
            .whereIn('ai_thread_message_uuid', messageUuids)
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
        const created = await this.database.transaction(async (trx) => {
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
        this.prometheusMetrics?.incrementAiAgentThreadCreated(3);
        return created;
    }

    private static async insertSlackThread(
        trx: Knex.Transaction,
        data: CreateSlackThread,
    ): Promise<string> {
        const [thread] = await trx(AiThreadTableName)
            .insert({
                organization_uuid: data.organizationUuid,
                project_uuid: data.projectUuid,
                agent_uuid: data.agentUuid,
                created_from: data.createdFrom,
                storage_version: 3,
            })
            .returning('*');
        if (!thread) {
            throw new UnexpectedServerError('Failed to create v3 Slack thread');
        }
        await trx(AiThreadMessageSequenceTableName).insert({
            ai_thread_uuid: thread.ai_thread_uuid,
        });
        await trx(AiSlackThreadTableName).insert({
            ai_thread_uuid: thread.ai_thread_uuid,
            slack_user_id: data.slackUserId,
            slack_channel_id: data.slackChannelId,
            slack_thread_ts: data.slackThreadTs,
        });
        return thread.ai_thread_uuid;
    }

    async createSlackThread(data: CreateSlackThread) {
        try {
            const created = await this.database.transaction(async (trx) => {
                const threadUuid = await AiAgentV3Model.insertSlackThread(
                    trx,
                    data,
                );
                return {
                    uuid: threadUuid,
                    storageVersion: 3 as const,
                    lineage: null,
                };
            });
            this.prometheusMetrics?.incrementAiAgentThreadCreated(3);
            return created;
        } catch (error) {
            throw toSlackPromptWriteError(error);
        }
    }

    // Thread and first message commit together: a partial commit leaves a Slack
    // thread with no messages that redelivery of the root event can never fill.
    async createSlackThreadWithUserMessage({
        thread,
        message,
    }: {
        thread: CreateSlackThread;
        message: SlackMessageInput & {
            createdByUserUuid: string;
            modelConfig: AiModelConfigEnvelope;
        };
    }): Promise<{
        threadUuid: string;
        storageVersion: 3;
        message: CreatedMessage;
    }> {
        const createdAt = slackTimestampToDate(message.promptSlackTs);
        if (!createdAt) {
            throw new ParameterError('Invalid Slack timestamp');
        }
        try {
            const created = await this.database.transaction(async (trx) => {
                await lockSlackChannel(trx, thread.slackChannelId);
                const threadUuid = await AiAgentV3Model.insertSlackThread(
                    trx,
                    thread,
                );
                const userMessage = await AiAgentV3Model.insertSlackUserTurn(
                    trx,
                    {
                        ...message,
                        threadUuid,
                        createdAt,
                        slackChannelId: thread.slackChannelId,
                    },
                );
                return {
                    threadUuid,
                    storageVersion: 3 as const,
                    message: userMessage,
                };
            });
            this.prometheusMetrics?.incrementAiAgentThreadCreated(3);
            return created;
        } catch (error) {
            throw toSlackPromptWriteError(error);
        }
    }

    async createSlackContextMessages({
        threadUuid,
        slackChannelId,
        messages,
    }: {
        threadUuid: string;
        slackChannelId: string;
        messages: SlackMessageInput[];
    }): Promise<CreatedMessage[]> {
        if (messages.length === 0) return [];
        const ordered = messages
            .map((message) => {
                const createdAt = slackTimestampToDate(message.promptSlackTs);
                if (!createdAt) {
                    throw new ParameterError('Invalid Slack timestamp');
                }
                return { message, createdAt };
            })
            .sort((left, right) =>
                compareSlackTimestamps(
                    left.message.promptSlackTs,
                    right.message.promptSlackTs,
                ),
            );
        return this.database.transaction(async (trx) => {
            await lockSlackChannel(trx, slackChannelId);
            const existing = await trx(AiSlackMessageTableName)
                .select('prompt_slack_ts')
                .where('slack_channel_id', slackChannelId)
                .whereIn(
                    'prompt_slack_ts',
                    ordered.map(({ message }) => message.promptSlackTs),
                );
            const existingTimestamps = new Set(
                existing.map(({ prompt_slack_ts: timestamp }) => timestamp),
            );
            const pending = ordered.filter(
                ({ message }) => !existingTimestamps.has(message.promptSlackTs),
            );
            const created: CreatedMessage[] = [];
            for (const { message, createdAt } of pending) {
                const threadSeq =
                    // eslint-disable-next-line no-await-in-loop -- Slack chronology is serialized
                    await AiAgentV3Model.allocateSlackThreadSeq(trx, {
                        threadUuid,
                        promptSlackTs: message.promptSlackTs,
                        count: 1,
                    });
                created.push(
                    // eslint-disable-next-line no-await-in-loop -- Slack chronology is serialized
                    await AiAgentV3Model.insertSlackUserMessage(trx, {
                        threadUuid,
                        createdByUserUuid: null,
                        createdAt,
                        slackChannelId,
                        threadSeq,
                        ...message,
                    }),
                );
            }
            return created;
        });
    }

    // Writes the user message plus its in-progress assistant placeholder.
    // Caller must already hold the channel advisory lock.
    private static async insertSlackUserTurn(
        trx: Knex.Transaction,
        {
            threadUuid,
            createdByUserUuid,
            createdAt,
            text,
            slackUserId,
            slackChannelId,
            promptSlackTs,
            modelConfig,
        }: SlackMessageInput & {
            threadUuid: string;
            createdByUserUuid: string;
            createdAt: Date;
            slackChannelId: string;
            modelConfig: AiModelConfigEnvelope;
        },
    ): Promise<CreatedMessage> {
        const existing = await trx(AiSlackMessageTableName)
            .where('slack_channel_id', slackChannelId)
            .where('prompt_slack_ts', promptSlackTs)
            .first('ai_thread_message_uuid');
        if (existing) {
            throw new AiDuplicateSlackPromptError(
                'Slack prompt already exists',
            );
        }
        const userThreadSeq = await AiAgentV3Model.allocateSlackThreadSeq(trx, {
            threadUuid,
            promptSlackTs,
            count: 2,
        });
        const userMessage = await AiAgentV3Model.insertSlackUserMessage(trx, {
            threadUuid,
            createdByUserUuid,
            createdAt,
            text,
            slackUserId,
            slackChannelId,
            promptSlackTs,
            threadSeq: userThreadSeq,
        });
        await trx(AiThreadMessageTableName).insert({
            ai_thread_uuid: threadUuid,
            thread_seq: userThreadSeq + 1,
            role: 'assistant',
            status: 'in_progress',
            last_heartbeat_at: null,
            model_config: modelConfig,
        });
        return userMessage;
    }

    async createSlackUserMessage({
        threadUuid,
        createdByUserUuid,
        text,
        slackUserId,
        slackChannelId,
        promptSlackTs,
        modelConfig,
    }: SlackMessageInput & {
        threadUuid: string;
        createdByUserUuid: string;
        slackChannelId: string;
        modelConfig: AiModelConfigEnvelope;
    }): Promise<CreatedMessage> {
        const createdAt = slackTimestampToDate(promptSlackTs);
        if (!createdAt) {
            throw new ParameterError('Invalid Slack timestamp');
        }
        return this.database.transaction(async (trx) => {
            await lockSlackChannel(trx, slackChannelId);
            return AiAgentV3Model.insertSlackUserTurn(trx, {
                threadUuid,
                createdByUserUuid,
                createdAt,
                text,
                slackUserId,
                slackChannelId,
                promptSlackTs,
                modelConfig,
            });
        });
    }

    async findSlackUserMessage(
        userMessageUuid: string,
    ): Promise<V3SlackUserMessage | undefined> {
        const userMessage = await this.database(AiSlackMessageTableName)
            .innerJoin(
                AiThreadMessageTableName,
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                `${AiSlackMessageTableName}.ai_thread_message_uuid`,
            )
            .innerJoin(
                AiMessagePartTableName,
                `${AiMessagePartTableName}.ai_thread_message_uuid`,
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
            )
            .innerJoin(
                AiSlackThreadTableName,
                `${AiSlackThreadTableName}.ai_thread_uuid`,
                `${AiThreadMessageTableName}.ai_thread_uuid`,
            )
            .innerJoin(
                AiThreadTableName,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiThreadMessageTableName}.ai_thread_uuid`,
            )
            .where(
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                userMessageUuid,
            )
            .where(`${AiThreadMessageTableName}.role`, 'user')
            .where(`${AiMessagePartTableName}.type`, 'text')
            .orderBy(`${AiMessagePartTableName}.part_index`)
            .first({
                organizationUuid: `${AiThreadTableName}.organization_uuid`,
                projectUuid: `${AiThreadTableName}.project_uuid`,
                uuid: `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                threadUuid: `${AiThreadMessageTableName}.ai_thread_uuid`,
                threadSeq: `${AiThreadMessageTableName}.thread_seq`,
                agentUuid: `${AiThreadTableName}.agent_uuid`,
                createdByUserUuid: `${AiThreadMessageTableName}.created_by_user_uuid`,
                text: this.database.raw(`??->>'text'`, [
                    `${AiMessagePartTableName}.payload`,
                ]),
                createdAt: `${AiThreadMessageTableName}.created_at`,
                responseSlackTs: `${AiSlackMessageTableName}.response_slack_ts`,
                slackUserId: `${AiSlackMessageTableName}.slack_user_id`,
                slackChannelId: `${AiSlackMessageTableName}.slack_channel_id`,
                promptSlackTs: `${AiSlackMessageTableName}.prompt_slack_ts`,
                slackThreadTs: `${AiSlackThreadTableName}.slack_thread_ts`,
            });
        if (!userMessage) return undefined;
        const assistant = await AiAgentV3Model.findAdjacentAssistantMessage(
            this.database,
            userMessage.threadUuid,
            userMessage.threadSeq,
        );
        const responseParts = assistant
            ? await this.database(AiMessagePartTableName)
                  .where(
                      'ai_thread_message_uuid',
                      assistant.ai_thread_message_uuid,
                  )
                  .where('type', 'text')
                  .orderBy('part_index')
                  .select('payload')
            : [];
        const annotation = assistant
            ? await this.database(AiMessageAnnotationTableName)
                  .where(
                      'ai_thread_message_uuid',
                      assistant.ai_thread_message_uuid,
                  )
                  .where('type', AI_MESSAGE_ANNOTATION_TYPE_FEEDBACK)
                  .first('payload')
            : undefined;
        const modelConfig = assistant?.model_config;
        return {
            ...userMessage,
            response:
                responseParts.length > 0
                    ? responseParts
                          .map(({ payload }) => String(payload.text ?? ''))
                          .join('')
                    : null,
            humanScore:
                feedbackAnnotationPayloadSchema.safeParse(annotation?.payload)
                    .data?.humanScore ?? null,
            modelConfig,
        };
    }

    async hasSlackUserMessageByChannelAndTs(
        slackChannelId: string,
        promptSlackTs: string,
    ): Promise<boolean> {
        return Boolean(
            await this.database(AiSlackMessageTableName)
                .where('slack_channel_id', slackChannelId)
                .where('prompt_slack_ts', promptSlackTs)
                .first('ai_thread_message_uuid'),
        );
    }

    async findExistingSlackMessageTimestamps(
        slackChannelId: string,
        timestamps: string[],
    ): Promise<string[]> {
        if (timestamps.length === 0) return [];
        const rows = await this.database(AiSlackMessageTableName)
            .select('prompt_slack_ts')
            .where('slack_channel_id', slackChannelId)
            .whereIn('prompt_slack_ts', timestamps);
        return rows.map(({ prompt_slack_ts: timestamp }) => timestamp);
    }

    async setSlackResponseTs({
        userMessageUuid,
        responseSlackTs,
    }: {
        userMessageUuid: string;
        responseSlackTs: string;
    }): Promise<boolean> {
        const updated = await this.database(AiSlackMessageTableName)
            .where('ai_thread_message_uuid', userMessageUuid)
            .update({ response_slack_ts: responseSlackTs });
        return updated === 1;
    }

    async startSlackRun({
        userMessageUuid,
        modelConfig,
    }: {
        userMessageUuid: string;
        modelConfig: AiModelConfigEnvelope;
    }): Promise<{
        assistantMessage: CreatedMessage;
        state: 'resumed' | 'active' | 'terminal' | 'blocked' | 'deferred';
    }> {
        let canceledPreviousApproval = false;
        const result: {
            assistantMessage: CreatedMessage;
            state: 'resumed' | 'active' | 'terminal' | 'blocked' | 'deferred';
        } = await this.database.transaction(async (trx) => {
            const userMessage = await trx(AiThreadMessageTableName)
                .where('ai_thread_message_uuid', userMessageUuid)
                .where('role', 'user')
                .forUpdate()
                .first();
            if (!userMessage) {
                throw new NotFoundError('Slack user message not found');
            }
            const previousRun = await trx(AiThreadMessageTableName)
                .where('ai_thread_uuid', userMessage.ai_thread_uuid)
                .where('role', 'assistant')
                .where('status', 'in_progress')
                .where('thread_seq', '<', userMessage.thread_seq)
                .orderBy('thread_seq', 'desc')
                .forUpdate()
                .first();
            if (previousRun) {
                const pendingApproval = await trx(AiMessagePartTableName)
                    .where(
                        'ai_thread_message_uuid',
                        previousRun.ai_thread_message_uuid,
                    )
                    .where('type', 'tool')
                    .whereRaw("payload->>'state' = ?", [
                        AI_TOOL_PART_APPROVAL_REQUESTED_STATE,
                    ])
                    .first('ai_message_part_uuid');
                if (pendingApproval) {
                    await AiAgentV3Model.healNonTerminalToolParts(trx, [
                        previousRun.ai_thread_message_uuid,
                    ]);
                    const updated = await trx(AiThreadMessageTableName)
                        .where(
                            'ai_thread_message_uuid',
                            previousRun.ai_thread_message_uuid,
                        )
                        .update({ status: 'canceled' });
                    canceledPreviousApproval = updated === 1;
                } else {
                    const hasParts = await trx(AiMessagePartTableName)
                        .where(
                            'ai_thread_message_uuid',
                            previousRun.ai_thread_message_uuid,
                        )
                        .first('ai_message_part_uuid');
                    return {
                        assistantMessage: {
                            uuid: previousRun.ai_thread_message_uuid,
                            threadSeq: previousRun.thread_seq,
                        },
                        state:
                            previousRun.last_heartbeat_at === null && !hasParts
                                ? 'deferred'
                                : 'blocked',
                    };
                }
            }
            const nextMessage =
                await AiAgentV3Model.findAdjacentAssistantMessage(
                    trx,
                    userMessage.ai_thread_uuid,
                    userMessage.thread_seq,
                    { forUpdate: true },
                );
            if (nextMessage) {
                const assistantMessage = {
                    uuid: nextMessage.ai_thread_message_uuid,
                    threadSeq: nextMessage.thread_seq,
                };
                if (nextMessage.status !== 'in_progress') {
                    return { assistantMessage, state: 'terminal' };
                }
                if (nextMessage.last_heartbeat_at !== null) {
                    return { assistantMessage, state: 'active' };
                }
                await trx(AiThreadMessageTableName)
                    .where(
                        'ai_thread_message_uuid',
                        nextMessage.ai_thread_message_uuid,
                    )
                    .whereNull('last_heartbeat_at')
                    .update({
                        last_heartbeat_at: trx.fn.now(),
                        model_config: modelConfig,
                    });
                return { assistantMessage, state: 'resumed' };
            }
            throw new ConflictError('Slack assistant reservation is missing');
        });
        if (canceledPreviousApproval) {
            this.prometheusMetrics?.incrementAiAgentRunTerminal(3, 'canceled');
        }
        return result;
    }

    async cancelSlackRunPlaceholder(userMessageUuid: string): Promise<boolean> {
        const canceled = await this.database.transaction(async (trx) => {
            const userMessage = await trx(AiThreadMessageTableName)
                .where('ai_thread_message_uuid', userMessageUuid)
                .where('role', 'user')
                .first(['ai_thread_uuid', 'thread_seq']);
            if (!userMessage) return false;
            const assistant = await AiAgentV3Model.findAdjacentAssistantMessage(
                trx,
                userMessage.ai_thread_uuid,
                userMessage.thread_seq,
                { forUpdate: true },
            );
            if (!assistant) return false;
            const updated = await trx(AiThreadMessageTableName)
                .where(
                    'ai_thread_message_uuid',
                    assistant.ai_thread_message_uuid,
                )
                .where('status', 'in_progress')
                .whereNull('last_heartbeat_at')
                .whereNotExists(
                    trx(AiMessagePartTableName)
                        .select(trx.raw('1'))
                        .whereRaw(
                            `${AiMessagePartTableName}.ai_thread_message_uuid = ${AiThreadMessageTableName}.ai_thread_message_uuid`,
                        ),
                )
                .update({ status: 'canceled' });
            return updated === 1;
        });
        if (canceled) {
            this.prometheusMetrics?.incrementAiAgentRunTerminal(3, 'canceled');
        }
        return canceled;
    }

    async cancelClaimedSlackRun(
        assistantMessageUuid: string,
    ): Promise<boolean> {
        const canceled = await this.database.transaction(async (trx) => {
            const assistant = await trx(AiThreadMessageTableName)
                .where('ai_thread_message_uuid', assistantMessageUuid)
                .where('role', 'assistant')
                .where('status', 'in_progress')
                .forUpdate()
                .first('ai_thread_message_uuid');
            if (!assistant) return false;
            await AiAgentV3Model.healNonTerminalToolParts(trx, [
                assistantMessageUuid,
            ]);
            const updated = await trx(AiThreadMessageTableName)
                .where('ai_thread_message_uuid', assistantMessageUuid)
                .where('status', 'in_progress')
                .update({ status: 'canceled' });
            return updated === 1;
        });
        if (canceled) {
            this.prometheusMetrics?.incrementAiAgentRunTerminal(3, 'canceled');
        }
        return canceled;
    }

    async upsertSlackFeedback({
        lookup,
        humanScore,
        humanFeedback,
    }: {
        lookup: SlackFeedbackLookup;
        humanScore: number;
        humanFeedback: string | null;
    }): Promise<SlackFeedbackResult | null> {
        return this.database.transaction(async (trx) => {
            const query = trx(AiSlackMessageTableName)
                .innerJoin(
                    AiThreadMessageTableName,
                    `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                    `${AiSlackMessageTableName}.ai_thread_message_uuid`,
                )
                .innerJoin(
                    AiThreadTableName,
                    `${AiThreadTableName}.ai_thread_uuid`,
                    `${AiThreadMessageTableName}.ai_thread_uuid`,
                );
            if (lookup.kind === 'response') {
                query
                    .where(
                        `${AiSlackMessageTableName}.slack_channel_id`,
                        lookup.slackChannelId,
                    )
                    .where(
                        `${AiSlackMessageTableName}.response_slack_ts`,
                        lookup.responseSlackTs,
                    );
            } else {
                query.where(
                    `${AiSlackMessageTableName}.ai_thread_message_uuid`,
                    lookup.userMessageUuid,
                );
            }
            const userMessage = await query
                .forUpdate()
                .first<SlackFeedbackTarget>(
                    `${AiSlackMessageTableName}.ai_thread_message_uuid`,
                    `${AiThreadMessageTableName}.ai_thread_uuid`,
                    `${AiThreadMessageTableName}.thread_seq`,
                    `${AiThreadTableName}.organization_uuid`,
                    `${AiThreadTableName}.project_uuid`,
                    `${AiThreadTableName}.agent_uuid`,
                );
            if (!userMessage) return null;
            return AiAgentV3Model.upsertSlackFeedbackForUserMessage(trx, {
                userMessage,
                humanScore,
                humanFeedback,
            });
        });
    }

    private static async upsertSlackFeedbackForUserMessage(
        trx: Knex.Transaction,
        {
            userMessage,
            humanScore,
            humanFeedback,
        }: {
            userMessage: SlackFeedbackTarget;
            humanScore: number;
            humanFeedback: string | null;
        },
    ) {
        const assistant = await AiAgentV3Model.findAdjacentAssistantMessage(
            trx,
            userMessage.ai_thread_uuid,
            userMessage.thread_seq,
        );
        if (!assistant) return null;
        await AiAgentV3Model.upsertFeedbackAnnotation(trx, {
            assistantMessageUuid: assistant.ai_thread_message_uuid,
            humanScore,
            humanFeedback,
        });
        return {
            userMessageUuid: userMessage.ai_thread_message_uuid,
            assistantMessageUuid: assistant.ai_thread_message_uuid,
            threadUuid: userMessage.ai_thread_uuid,
            organizationUuid: userMessage.organization_uuid,
            projectUuid: userMessage.project_uuid,
            agentUuid: userMessage.agent_uuid,
        };
    }

    private static async upsertFeedbackAnnotation(
        trx: Knex.Transaction,
        {
            assistantMessageUuid,
            humanScore,
            humanFeedback,
        }: {
            assistantMessageUuid: string;
            humanScore: number;
            humanFeedback: string | null;
        },
    ): Promise<void> {
        const payload = {
            humanScore,
            humanFeedback:
                humanScore === NEGATIVE_FEEDBACK_SCORE ? humanFeedback : null,
        };
        await trx(AiMessageAnnotationTableName)
            .insert({
                ai_thread_message_uuid: assistantMessageUuid,
                type: AI_MESSAGE_ANNOTATION_TYPE_FEEDBACK,
                payload_version: 1,
                payload,
            })
            .onConflict(['ai_thread_message_uuid', 'type'])
            .merge({
                payload_version: 1,
                payload,
                updated_at: trx.fn.now(),
            });
    }

    async upsertMessageFeedback({
        assistantMessageUuid,
        humanScore,
        humanFeedback,
    }: {
        assistantMessageUuid: string;
        humanScore: number;
        humanFeedback: string | null;
    }): Promise<MessageFeedbackResult | null> {
        return this.database.transaction(async (trx) => {
            const assistant = await trx(AiThreadMessageTableName)
                .innerJoin(
                    AiThreadTableName,
                    `${AiThreadTableName}.ai_thread_uuid`,
                    `${AiThreadMessageTableName}.ai_thread_uuid`,
                )
                .where(
                    `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                    assistantMessageUuid,
                )
                .where(`${AiThreadMessageTableName}.role`, 'assistant')
                .first({
                    assistantMessageUuid: `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                    threadUuid: `${AiThreadMessageTableName}.ai_thread_uuid`,
                    organizationUuid: `${AiThreadTableName}.organization_uuid`,
                    projectUuid: `${AiThreadTableName}.project_uuid`,
                    agentUuid: `${AiThreadTableName}.agent_uuid`,
                });
            if (!assistant) return null;
            await AiAgentV3Model.upsertFeedbackAnnotation(trx, {
                assistantMessageUuid,
                humanScore,
                humanFeedback,
            });
            return assistant;
        });
    }

    async findSlackRunSqlApprovalContext({
        threadUuid,
        toolCallId,
    }: {
        threadUuid: string;
        toolCallId: string;
    }): Promise<{
        userMessageUuid: string;
        assistantMessageUuid: string;
        threadUuid: string;
        organizationUuid: string;
        projectUuid: string;
        agentUuid: string | null;
        createdByUserUuid: string;
        toolName: string;
    } | null> {
        const tool = await this.database(AiMessagePartTableName)
            .innerJoin(
                AiThreadMessageTableName,
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                `${AiMessagePartTableName}.ai_thread_message_uuid`,
            )
            .innerJoin(
                AiThreadTableName,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiThreadMessageTableName}.ai_thread_uuid`,
            )
            .where(`${AiThreadMessageTableName}.ai_thread_uuid`, threadUuid)
            .where(`${AiMessagePartTableName}.tool_call_id`, toolCallId)
            .where(`${AiMessagePartTableName}.type`, 'tool')
            .first<{
                assistant_message_uuid: string;
                thread_seq: number;
                organization_uuid: string;
                project_uuid: string;
                agent_uuid: string | null;
                payload: Record<string, unknown>;
            }>(
                `${AiThreadMessageTableName}.ai_thread_message_uuid as assistant_message_uuid`,
                `${AiThreadMessageTableName}.thread_seq`,
                `${AiThreadTableName}.organization_uuid`,
                `${AiThreadTableName}.project_uuid`,
                `${AiThreadTableName}.agent_uuid`,
                `${AiMessagePartTableName}.payload`,
            );
        if (!tool) return null;
        const toolPayload = slackRunSqlToolPayloadSchema.safeParse(
            tool.payload,
        );
        if (!toolPayload.success) return null;
        const userMessage = await AiAgentV3Model.findAdjacentSlackUserMessage(
            this.database,
            threadUuid,
            tool.thread_seq,
        );
        if (!userMessage?.created_by_user_uuid) return null;
        return {
            userMessageUuid: userMessage.ai_thread_message_uuid,
            assistantMessageUuid: tool.assistant_message_uuid,
            threadUuid,
            organizationUuid: tool.organization_uuid,
            projectUuid: tool.project_uuid,
            agentUuid: tool.agent_uuid,
            createdByUserUuid: userMessage.created_by_user_uuid,
            toolName: toolPayload.data.toolName,
        };
    }

    async findPendingSlackRunSqlApproval(
        assistantMessageUuid: string,
    ): Promise<{ toolCallId: string; sql: string } | null> {
        const row = await this.database(AiMessagePartTableName)
            .where('ai_thread_message_uuid', assistantMessageUuid)
            .where('type', 'tool')
            .whereRaw("payload->>'state' = ?", [
                AI_TOOL_PART_APPROVAL_REQUESTED_STATE,
            ])
            .whereRaw("payload->>'toolName' = ?", ['runSql'])
            .orderBy('part_index', 'desc')
            .first<Pick<DbAiMessagePart, 'tool_call_id' | 'payload'>>(
                'tool_call_id',
                'payload',
            );
        if (!row) return null;
        if (!row.tool_call_id) {
            throw new UnexpectedServerError(
                'Pending runSql approval has no tool call id',
            );
        }
        const payload = slackRunSqlApprovalPayloadSchema.safeParse(row.payload);
        if (!payload.success) {
            throw new UnexpectedServerError(
                'Pending runSql approval payload is malformed',
            );
        }
        return { toolCallId: row.tool_call_id, sql: payload.data.input.sql };
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

    async createCompactionMessage({
        threadUuid,
        beforeMessageUuid,
        summary,
        serializedInput,
        preservedContext,
        modelConfig,
        tokenUsage,
    }: {
        threadUuid: string;
        beforeMessageUuid?: string;
        summary: string;
        serializedInput: string;
        preservedContext: AiCompactionPreservedContext;
        modelConfig: AiModelConfigEnvelope;
        tokenUsage: AiTokenUsageEnvelope;
    }): Promise<CreatedMessage> {
        if (!summary.trim() || !serializedInput.trim()) {
            throw new ParameterError(
                'Compaction requires a summary and serialized input',
            );
        }
        return this.database.transaction(async (trx) => {
            let threadSeq: number;
            if (beforeMessageUuid) {
                const sequence = await trx(AiThreadMessageSequenceTableName)
                    .where('ai_thread_uuid', threadUuid)
                    .forUpdate()
                    .first('next_thread_seq');
                if (!sequence) {
                    throw new ConflictError(
                        'Thread is not writable v3 storage',
                    );
                }
                const boundary = await trx(AiThreadMessageTableName)
                    .where('ai_thread_uuid', threadUuid)
                    .where('ai_thread_message_uuid', beforeMessageUuid)
                    .forUpdate()
                    .first('thread_seq');
                if (!boundary) {
                    throw new NotFoundError('Compaction boundary not found');
                }
                const existing = await trx(AiThreadMessageTableName)
                    .where('ai_thread_uuid', threadUuid)
                    .where('thread_seq', boundary.thread_seq - 1)
                    .where('role', 'compaction')
                    .first('ai_thread_message_uuid', 'thread_seq');
                if (existing) {
                    return {
                        uuid: existing.ai_thread_message_uuid,
                        threadSeq: existing.thread_seq,
                    };
                }
                threadSeq = boundary.thread_seq;
                await trx(AiThreadMessageTableName)
                    .where('ai_thread_uuid', threadUuid)
                    .where('thread_seq', '>=', threadSeq)
                    .update({ thread_seq: trx.raw('-thread_seq - 1') });
                await trx(AiThreadMessageTableName)
                    .where('ai_thread_uuid', threadUuid)
                    .where('thread_seq', '<', 0)
                    .update({
                        thread_seq: trx.raw('-thread_seq'),
                    });
                await trx(AiThreadMessageSequenceTableName)
                    .where('ai_thread_uuid', threadUuid)
                    .increment('next_thread_seq', 1);
                await trx(AiThreadTableName)
                    .where('parent_thread_uuid', threadUuid)
                    .where('fork_boundary_seq', '>=', threadSeq)
                    .increment('fork_boundary_seq', 1);
            } else {
                threadSeq = await AiAgentV3Model.allocateThreadSeq(
                    trx,
                    threadUuid,
                );
            }
            const [message] = await trx(AiThreadMessageTableName)
                .insert({
                    ai_thread_uuid: threadUuid,
                    thread_seq: threadSeq,
                    role: 'compaction',
                    model_config: modelConfig,
                    token_usage: tokenUsage,
                })
                .returning(['ai_thread_message_uuid', 'created_at']);
            if (message === undefined) {
                throw new UnexpectedServerError(
                    'Failed to create compaction message',
                );
            }
            await AiAgentV3Model.insertParts(
                trx,
                message.ai_thread_message_uuid,
                [
                    {
                        partIndex: 0,
                        type: 'compaction',
                        payloadVersion: 1,
                        payload: {
                            summary,
                            serializedInput,
                            preservedContext,
                        },
                    },
                ],
            );
            await trx(AiThreadTableName)
                .where('ai_thread_uuid', threadUuid)
                .update({ updated_at: message.created_at });
            return { uuid: message.ai_thread_message_uuid, threadSeq };
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
            .whereNotExists(
                this.database(AiSlackMessageTableName)
                    .select(this.database.raw('1'))
                    .whereRaw(
                        `${AiSlackMessageTableName}.ai_thread_message_uuid = ${AiThreadMessageTableName}.ai_thread_message_uuid`,
                    ),
            )
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
            if (payload.state === AI_TOOL_PART_APPROVAL_REQUESTED_STATE) {
                update.whereRaw("payload->>'state' IN (?, ?, ?)", [
                    'input-streaming',
                    'input-available',
                    AI_TOOL_PART_APPROVAL_REQUESTED_STATE,
                ]);
            }
            const [part] = await update
                .update({
                    payload_version: payloadVersion,
                    payload,
                })
                .returning('*');
            if (part === undefined) {
                if (payload.state === AI_TOOL_PART_APPROVAL_REQUESTED_STATE) {
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
            if (row.payload.state !== AI_TOOL_PART_APPROVAL_REQUESTED_STATE) {
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
                .whereRaw("payload->>'state' = ?", [
                    AI_TOOL_PART_APPROVAL_REQUESTED_STATE,
                ])
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

            await AiAgentV3Model.healNonTerminalToolParts(trx, [messageUuid]);
            await trx(AiThreadMessageTableName)
                .where('ai_thread_message_uuid', messageUuid)
                .update({
                    status,
                    token_usage: tokenUsage,
                    error,
                });
        });
        this.prometheusMetrics?.incrementAiAgentRunTerminal(3, status);
    }

    async sweepStaleAssistantMessages(staleAfterMs: number): Promise<string[]> {
        const messageUuids = await this.database.transaction(async (trx) => {
            const staleBefore = trx.raw(
                "CURRENT_TIMESTAMP - (? * INTERVAL '1 millisecond')",
                [staleAfterMs],
            );
            const staleMessages = await trx(AiThreadMessageTableName)
                .select('ai_thread_message_uuid')
                .where('role', 'assistant')
                .where('status', 'in_progress')
                .where((query) =>
                    query
                        .where((active) =>
                            active
                                .whereNotNull('last_heartbeat_at')
                                .where('last_heartbeat_at', '<', staleBefore),
                        )
                        .orWhere((parked) =>
                            parked
                                .whereNull('last_heartbeat_at')
                                .where('created_at', '<', staleBefore)
                                .whereNotExists(
                                    trx(AiMessagePartTableName)
                                        .select(trx.raw('1'))
                                        .whereRaw(
                                            `${AiMessagePartTableName}.ai_thread_message_uuid = ${AiThreadMessageTableName}.ai_thread_message_uuid`,
                                        )
                                        .where('type', 'tool')
                                        .whereRaw("payload->>'state' = ?", [
                                            AI_TOOL_PART_APPROVAL_REQUESTED_STATE,
                                        ]),
                                )
                                .whereNotExists(
                                    trx(AiMessagePartTableName)
                                        .innerJoin(
                                            AiToolApprovalTableName,
                                            `${AiToolApprovalTableName}.ai_message_part_uuid`,
                                            `${AiMessagePartTableName}.ai_message_part_uuid`,
                                        )
                                        .select(trx.raw('1'))
                                        .whereRaw(
                                            `${AiMessagePartTableName}.ai_thread_message_uuid = ${AiThreadMessageTableName}.ai_thread_message_uuid`,
                                        )
                                        .where(
                                            `${AiToolApprovalTableName}.decided_at`,
                                            '>=',
                                            staleBefore,
                                        ),
                                )
                                .whereNotExists(
                                    trx('graphile_worker.jobs')
                                        .select(trx.raw('1'))
                                        .where(
                                            'task_identifier',
                                            EE_SCHEDULER_TASKS.SLACK_AI_PROMPT,
                                        )
                                        .where((job) =>
                                            job
                                                .whereNotNull('locked_at')
                                                .orWhereRaw(
                                                    'attempts < max_attempts',
                                                ),
                                        )
                                        .whereRaw(
                                            `payload->>'${SLACK_PROMPT_JOB_UUID_PAYLOAD_KEY}' = (
                                                SELECT queued_user.ai_thread_message_uuid::text
                                                FROM ?? AS queued_user
                                                WHERE queued_user.ai_thread_uuid = ??.ai_thread_uuid
                                                  AND queued_user.thread_seq = ??.thread_seq - 1
                                                  AND queued_user.role = 'user'
                                            )`,
                                            [
                                                AiThreadMessageTableName,
                                                AiThreadMessageTableName,
                                                AiThreadMessageTableName,
                                            ],
                                        ),
                                ),
                        ),
                )
                .forUpdate()
                .skipLocked();
            const staleMessageUuids = staleMessages.map(
                ({ ai_thread_message_uuid: messageUuid }) => messageUuid,
            );
            if (staleMessageUuids.length === 0) return [];

            await AiAgentV3Model.healNonTerminalToolParts(
                trx,
                staleMessageUuids,
            );
            await trx(AiThreadMessageTableName)
                .whereIn('ai_thread_message_uuid', staleMessageUuids)
                .where('status', 'in_progress')
                .update({
                    status: 'error',
                    error: {
                        version: 1,
                        name: 'interrupted',
                        message: 'Run interrupted after its heartbeat expired',
                        data: null,
                    },
                });

            return staleMessageUuids;
        });
        this.prometheusMetrics?.incrementAiAgentRunTerminal(
            3,
            'error',
            messageUuids.length,
        );
        this.prometheusMetrics?.incrementAiAgentStaleRunHealed(
            messageUuids.length,
        );
        return messageUuids;
    }

    async findSlackRunLocator(assistantMessageUuid: string): Promise<{
        organizationUuid: string;
        slackChannelId: string;
        slackThreadTs: string;
    } | null> {
        const assistant = await this.database(AiThreadMessageTableName)
            .innerJoin(
                AiSlackThreadTableName,
                `${AiSlackThreadTableName}.ai_thread_uuid`,
                `${AiThreadMessageTableName}.ai_thread_uuid`,
            )
            .innerJoin(
                AiThreadTableName,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiThreadMessageTableName}.ai_thread_uuid`,
            )
            .where(
                `${AiThreadMessageTableName}.ai_thread_message_uuid`,
                assistantMessageUuid,
            )
            .where(`${AiThreadMessageTableName}.role`, 'assistant')
            .first({
                organizationUuid: `${AiThreadTableName}.organization_uuid`,
                slackThreadTs: `${AiSlackThreadTableName}.slack_thread_ts`,
                threadUuid: `${AiThreadMessageTableName}.ai_thread_uuid`,
                threadSeq: `${AiThreadMessageTableName}.thread_seq`,
            });
        if (!assistant) return null;
        const userMessage = await AiAgentV3Model.findAdjacentSlackUserMessage(
            this.database,
            assistant.threadUuid,
            assistant.threadSeq,
        );
        if (!userMessage) return null;
        return {
            organizationUuid: assistant.organizationUuid,
            slackChannelId: userMessage.slack_channel_id,
            slackThreadTs: assistant.slackThreadTs,
        };
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
        const [slackMessages, annotations] = await Promise.all([
            messageUuids.length === 0
                ? Promise.resolve([])
                : this.database(AiSlackMessageTableName).whereIn(
                      'ai_thread_message_uuid',
                      messageUuids,
                  ),
            messageUuids.length === 0
                ? Promise.resolve([])
                : this.database(AiMessageAnnotationTableName)
                      .whereIn('ai_thread_message_uuid', messageUuids)
                      .orderBy('created_at'),
        ]);
        const slackByMessageUuid = new Map(
            slackMessages.map((slackMessage) => [
                slackMessage.ai_thread_message_uuid,
                slackMessage,
            ]),
        );
        const annotationsByMessageUuid = new Map<string, typeof annotations>();
        annotations.forEach((annotation) => {
            const messageAnnotations =
                annotationsByMessageUuid.get(
                    annotation.ai_thread_message_uuid,
                ) ?? [];
            messageAnnotations.push(annotation);
            annotationsByMessageUuid.set(
                annotation.ai_thread_message_uuid,
                messageAnnotations,
            );
        });
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
            messages: messages.map((message) => {
                const slack = slackByMessageUuid.get(
                    message.ai_thread_message_uuid,
                );
                return {
                    uuid: message.ai_thread_message_uuid,
                    role: message.role,
                    parts:
                        partsByMessageUuid.get(
                            message.ai_thread_message_uuid,
                        ) ?? [],
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
                        annotations: (
                            annotationsByMessageUuid.get(
                                message.ai_thread_message_uuid,
                            ) ?? []
                        ).map((annotation) => ({
                            uuid: annotation.ai_message_annotation_uuid,
                            type: annotation.type,
                            payloadVersion: annotation.payload_version,
                            payload: annotation.payload,
                            createdAt: annotation.created_at.toISOString(),
                            updatedAt: annotation.updated_at.toISOString(),
                        })),
                        slack: slack
                            ? {
                                  userId: slack.slack_user_id,
                                  channelId: slack.slack_channel_id,
                                  promptTs: slack.prompt_slack_ts,
                                  responseTs: slack.response_slack_ts,
                              }
                            : null,
                        legacy: null,
                    },
                };
            }),
        };
    }
}
