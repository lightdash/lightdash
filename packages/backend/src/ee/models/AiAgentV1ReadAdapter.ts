import {
    ConflictError,
    type AiAgentThreadFirstMessage,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { v5 as uuidv5 } from 'uuid';
import {
    AiAgentReasoningTableName,
    type DbAiAgentReasoning,
} from '../../database/entities/aiAgentReasoning';
import {
    AiAgentToolCallErrorTableName,
    AiAgentToolCallTableName,
    AiAgentToolResultTableName,
    AiPromptContextTableName,
    AiPromptInterruptTableName,
    AiPromptSteerTableName,
    AiPromptTableName,
    isAiAgentToolResultError,
    type DbAiAgentToolCall,
    type DbAiAgentToolCallError,
    type DbAiAgentToolResult,
    type DbAiPrompt,
    type DbAiPromptContext,
    type DbAiPromptInterrupt,
    type DbAiPromptSteer,
    type DbAiThread,
} from '../database/entities/ai';
import {
    type AiAssistantMessageStatus,
    type AiCanonicalContext,
    type AiCanonicalMessage,
    type AiCanonicalPart,
    type AiCanonicalThread,
} from '../database/entities/aiAgentV3';
import {
    AiArtifactsTableName,
    AiArtifactVersionsTableName,
    AiPromptArtifactReferencesTableName,
    type DbAiArtifact,
    type DbAiArtifactVersion,
    type DbAiPromptArtifactReference,
} from '../database/entities/aiArtifacts';

const V1_READ_ADAPTER_NAMESPACE = '8858350c-5ca8-4ad6-bfa8-43b4f8d04ad7';

type V1Prompt = Pick<
    DbAiPrompt,
    | 'ai_prompt_uuid'
    | 'created_at'
    | 'created_by_user_uuid'
    | 'prompt'
    | 'response'
    | 'error_message'
    | 'responded_at'
    | 'model_config'
    | 'token_usage'
    | 'viz_config_output'
    | 'filters_output'
    | 'metric_query'
    | 'saved_query_uuid'
    | 'human_score'
    | 'human_feedback'
    | 'hidden'
>;

type V1Artifact = Pick<
    DbAiArtifactVersion,
    | 'ai_artifact_version_uuid'
    | 'ai_artifact_uuid'
    | 'ai_prompt_uuid'
    | 'created_at'
    | 'version_number'
    | 'title'
    | 'description'
> &
    Pick<DbAiArtifact, 'artifact_type'>;

type V1ReferencedArtifact = Pick<
    DbAiPromptArtifactReference,
    | 'ai_prompt_uuid'
    | 'ai_artifact_version_uuid'
    | 'project_uuid'
    | 'similarity_score'
    | 'created_at'
> &
    Pick<
        DbAiArtifactVersion,
        'ai_artifact_uuid' | 'version_number' | 'title' | 'description'
    > &
    Pick<DbAiArtifact, 'artifact_type'>;

export type V1ThreadRows = {
    thread: Pick<
        DbAiThread,
        | 'ai_thread_uuid'
        | 'organization_uuid'
        | 'project_uuid'
        | 'agent_uuid'
        | 'created_at'
        | 'updated_at'
        | 'created_from'
        | 'title'
        | 'storage_version'
    >;
    prompts: V1Prompt[];
    reasonings: DbAiAgentReasoning[];
    toolCalls: DbAiAgentToolCall[];
    toolResults: DbAiAgentToolResult[];
    toolCallErrors: DbAiAgentToolCallError[];
    steers: Array<
        Pick<
            DbAiPromptSteer,
            | 'ai_prompt_steer_uuid'
            | 'ai_prompt_uuid'
            | 'created_by_user_uuid'
            | 'message'
            | 'created_at'
            | 'consumed_at'
            | 'consumed_step'
        >
    >;
    interrupts: Array<
        Pick<
            DbAiPromptInterrupt,
            | 'ai_prompt_interrupt_uuid'
            | 'ai_prompt_uuid'
            | 'created_by_user_uuid'
            | 'created_at'
        >
    >;
    artifacts: V1Artifact[];
    contexts: DbAiPromptContext[];
    referencedArtifacts: V1ReferencedArtifact[];
};

type V1AssistantRows = Pick<
    V1ThreadRows,
    'toolCalls' | 'toolResults' | 'toolCallErrors' | 'reasonings' | 'artifacts'
>;

type OrderedPart = {
    createdAt: Date;
    uuid: string;
    part: AiCanonicalPart;
};

const syntheticUuid = (kind: string, sourceUuid: string) =>
    uuidv5(`${kind}:${sourceUuid}`, V1_READ_ADAPTER_NAMESPACE);

const byDateAndUuid =
    <T>(getDate: (row: T) => Date, getUuid: (row: T) => string) =>
    (left: T, right: T) =>
        getDate(left).getTime() - getDate(right).getTime() ||
        (getUuid(left) < getUuid(right)
            ? -1
            : Number(getUuid(left) > getUuid(right)));

const sortedByDateAndUuid = <T>(
    rows: T[],
    getDate: (row: T) => Date,
    getUuid: (row: T) => string,
) => [...rows].sort(byDateAndUuid(getDate, getUuid));

const assertV1Storage = (thread: V1ThreadRows['thread']) => {
    if (thread.storage_version !== 1) {
        throw new ConflictError('Thread is not storage version 1');
    }
};

const groupByPromptUuid = <T extends { ai_prompt_uuid: string | null }>(
    rows: T[],
) => {
    const grouped = new Map<string, T[]>();
    rows.forEach((row) => {
        if (row.ai_prompt_uuid === null) return;
        const promptRows = grouped.get(row.ai_prompt_uuid) ?? [];
        promptRows.push(row);
        grouped.set(row.ai_prompt_uuid, promptRows);
    });
    return grouped;
};

const toCanonicalContext = (context: DbAiPromptContext): AiCanonicalContext => {
    const base = {
        uuid: context.ai_prompt_context_uuid,
        entityUuid: context.entity_uuid,
        entityRef: context.entity_ref,
        pinnedVersionUuid: context.pinned_version_uuid,
        displayName: context.display_name,
        createdAt: context.created_at.toISOString(),
    };
    switch (context.entity_type) {
        case 'chart':
            return {
                ...base,
                entityType: context.entity_type,
                runtimeOverrides: context.runtime_overrides,
            };
        case 'dashboard':
            return {
                ...base,
                entityType: context.entity_type,
                runtimeOverrides: context.runtime_overrides,
            };
        default:
            return {
                ...base,
                entityType: context.entity_type,
                runtimeOverrides: null,
            };
    }
};

const getPromptStatus = ({
    prompt,
    interrupted,
}: {
    prompt: V1Prompt;
    interrupted: boolean;
}): AiAssistantMessageStatus => {
    if (interrupted) return 'canceled';
    if (prompt.error_message !== null) return 'error';
    if (prompt.response === null || prompt.responded_at === null) {
        return 'in_progress';
    }
    return 'completed';
};

const canonicalPart = (
    uuid: string,
    type: AiCanonicalPart['type'],
    payload: Record<string, unknown>,
    attributes: Pick<AiCanonicalPart, 'toolCallId' | 'artifactVersionUuid'> = {
        toolCallId: null,
        artifactVersionUuid: null,
    },
): AiCanonicalPart => ({
    uuid,
    type,
    payloadVersion: 1,
    payload,
    ...attributes,
});

const baseMetadata = ({
    createdAt,
    createdByUserUuid,
    hidden,
}: {
    createdAt: Date;
    createdByUserUuid: string | null;
    hidden: boolean;
}): AiCanonicalMessage['metadata'] => ({
    createdAt: createdAt.toISOString(),
    createdByUserUuid,
    status: null,
    lastHeartbeatAt: null,
    modelConfig: null,
    tokenUsage: null,
    error: null,
    hidden,
    context: [],
    legacy: null,
});

const projectAssistantParts = (
    rows: V1AssistantRows,
    prompt: V1Prompt,
    status: AiAssistantMessageStatus,
): AiCanonicalPart[] => {
    const sortedResults = sortedByDateAndUuid(
        rows.toolResults,
        (result) => result.created_at,
        (result) => result.ai_agent_tool_result_uuid,
    );
    const resultsByCallId = new Map<string, DbAiAgentToolResult[]>();
    sortedResults.forEach((result) => {
        const results = resultsByCallId.get(result.tool_call_id) ?? [];
        results.push(result);
        resultsByCallId.set(result.tool_call_id, results);
    });
    const ordered: OrderedPart[] = [];
    const sortedToolCalls = sortedByDateAndUuid(
        rows.toolCalls,
        (call) => call.created_at,
        (call) => call.ai_agent_tool_call_uuid,
    );
    const persistedToolCallIds = new Set(
        sortedToolCalls.map((call) => call.tool_call_id),
    );
    const claimedToolCallIds = new Set<string>();
    // Canonical tool call IDs stay unique even when legacy rows collide.
    const uniqueToolCallId = (toolCallId: string, sourceUuid: string) => {
        if (!claimedToolCallIds.has(toolCallId)) {
            claimedToolCallIds.add(toolCallId);
            return toolCallId;
        }
        const uniqueId = syntheticUuid('legacy-tool-call-id', sourceUuid);
        claimedToolCallIds.add(uniqueId);
        return uniqueId;
    };
    const toLegacyResult = (result: DbAiAgentToolResult) => ({
        uuid: result.ai_agent_tool_result_uuid,
        toolName: result.tool_name,
        result: result.result,
        metadata: result.metadata,
        createdAt: result.created_at.toISOString(),
    });

    sortedToolCalls.forEach((call) => {
        const results = resultsByCallId.get(call.tool_call_id) ?? [];
        // The latest row is the terminal view; legacyResults preserves all rows.
        const result = results.at(-1);
        const resultIsError = isAiAgentToolResultError(
            result?.metadata ?? null,
        );
        const basePayload = {
            toolName: call.tool_name,
            input: call.tool_args,
            parentToolCallId: call.parent_tool_call_id,
            mcpServerUuid: call.ai_mcp_server_uuid,
            legacyResults: results.map(toLegacyResult),
        };
        let payload: Record<string, unknown>;
        if (result === undefined) {
            payload =
                status === 'in_progress'
                    ? {
                          ...basePayload,
                          state: 'input-available',
                      }
                    : {
                          ...basePayload,
                          state: 'output-error',
                          errorText: 'Tool execution did not complete',
                      };
        } else if (resultIsError) {
            payload = {
                ...basePayload,
                state: 'output-error',
                errorText: result.result,
                metadata: result.metadata,
            };
        } else {
            payload = {
                ...basePayload,
                state: 'output-available',
                output: result.result,
                metadata: result.metadata,
            };
        }
        ordered.push({
            createdAt: call.created_at,
            uuid: call.ai_agent_tool_call_uuid,
            part: canonicalPart(call.ai_agent_tool_call_uuid, 'tool', payload, {
                toolCallId: uniqueToolCallId(
                    call.tool_call_id,
                    call.ai_agent_tool_call_uuid,
                ),
                artifactVersionUuid: null,
            }),
        });
    });

    sortedResults
        .filter((result) => !persistedToolCallIds.has(result.tool_call_id))
        .forEach((result) => {
            const resultIsError = isAiAgentToolResultError(result.metadata);
            ordered.push({
                createdAt: result.created_at,
                uuid: result.ai_agent_tool_result_uuid,
                part: canonicalPart(
                    result.ai_agent_tool_result_uuid,
                    'tool',
                    {
                        state: resultIsError
                            ? 'output-error'
                            : 'output-available',
                        toolName: result.tool_name,
                        input: null,
                        ...(resultIsError
                            ? { errorText: result.result }
                            : { output: result.result }),
                        metadata: result.metadata,
                        legacyResultUuid: result.ai_agent_tool_result_uuid,
                    },
                    {
                        toolCallId: uniqueToolCallId(
                            result.tool_call_id,
                            result.ai_agent_tool_result_uuid,
                        ),
                        artifactVersionUuid: null,
                    },
                ),
            });
        });

    rows.reasonings.forEach((reasoning) => {
        ordered.push({
            createdAt: reasoning.created_at,
            uuid: reasoning.ai_agent_reasoning_uuid,
            part: canonicalPart(
                reasoning.ai_agent_reasoning_uuid,
                'reasoning',
                {
                    reasoningId: reasoning.reasoning_id,
                    text: reasoning.text,
                },
            ),
        });
    });

    sortedByDateAndUuid(
        rows.toolCallErrors,
        (error) => error.created_at,
        (error) => error.ai_agent_tool_call_error_uuid,
    ).forEach((error) => {
        ordered.push({
            createdAt: error.created_at,
            uuid: error.ai_agent_tool_call_error_uuid,
            part: canonicalPart(
                error.ai_agent_tool_call_error_uuid,
                'tool',
                {
                    state: 'output-error',
                    toolName: error.tool_name,
                    input: error.raw_args,
                    errorText: error.error_message,
                    legacyToolCallId: error.tool_call_id,
                },
                {
                    toolCallId: uniqueToolCallId(
                        error.tool_call_id,
                        error.ai_agent_tool_call_error_uuid,
                    ),
                    artifactVersionUuid: null,
                },
            ),
        });
    });

    ordered.sort(
        byDateAndUuid(
            (row) => row.createdAt,
            (row) => row.uuid,
        ),
    );

    const parts = ordered.map(({ part }) => part);
    if (prompt.response !== null) {
        parts.push(
            canonicalPart(
                syntheticUuid('assistant-text', prompt.ai_prompt_uuid),
                'text',
                { text: prompt.response },
            ),
        );
    }
    sortedByDateAndUuid(
        rows.artifacts,
        (row) => row.created_at,
        (row) => row.ai_artifact_version_uuid,
    ).forEach((artifact) => {
        parts.push(
            canonicalPart(
                artifact.ai_artifact_version_uuid,
                'artifact',
                {
                    artifactUuid: artifact.ai_artifact_uuid,
                    versionNumber: artifact.version_number,
                    title: artifact.title,
                    description: artifact.description,
                    artifactType: artifact.artifact_type,
                },
                {
                    toolCallId: null,
                    artifactVersionUuid: artifact.ai_artifact_version_uuid,
                },
            ),
        );
    });
    return parts;
};

export const projectV1Thread = (rows: V1ThreadRows): AiCanonicalThread => {
    assertV1Storage(rows.thread);
    const messages: AiCanonicalMessage[] = [];
    const toolCallsByPromptUuid = groupByPromptUuid(rows.toolCalls);
    const toolResultsByPromptUuid = groupByPromptUuid(rows.toolResults);
    const toolCallErrorsByPromptUuid = groupByPromptUuid(rows.toolCallErrors);
    const reasoningsByPromptUuid = groupByPromptUuid(rows.reasonings);
    const artifactsByPromptUuid = groupByPromptUuid(rows.artifacts);
    const contextsByPromptUuid = groupByPromptUuid(rows.contexts);
    const steersByPromptUuid = groupByPromptUuid(rows.steers);
    const referencesByPromptUuid = groupByPromptUuid(rows.referencedArtifacts);
    const interruptsByPromptUuid = groupByPromptUuid(rows.interrupts);

    sortedByDateAndUuid(
        rows.prompts,
        (row) => row.created_at,
        (row) => row.ai_prompt_uuid,
    ).forEach((prompt) => {
        messages.push({
            uuid: prompt.ai_prompt_uuid,
            role: 'user',
            parts: [
                canonicalPart(
                    syntheticUuid('user-text', prompt.ai_prompt_uuid),
                    'text',
                    { text: prompt.prompt },
                ),
            ],
            metadata: {
                ...baseMetadata({
                    createdAt: prompt.created_at,
                    createdByUserUuid: prompt.created_by_user_uuid,
                    hidden: prompt.hidden,
                }),
                context: sortedByDateAndUuid(
                    contextsByPromptUuid.get(prompt.ai_prompt_uuid) ?? [],
                    (context) => context.created_at,
                    (context) => context.ai_prompt_context_uuid,
                ).map(toCanonicalContext),
            },
        });

        const interrupts = sortedByDateAndUuid(
            interruptsByPromptUuid.get(prompt.ai_prompt_uuid) ?? [],
            (row) => row.created_at,
            (row) => row.ai_prompt_interrupt_uuid,
        );
        const status = getPromptStatus({
            prompt,
            interrupted: interrupts.length > 0,
        });
        messages.push({
            uuid: syntheticUuid('assistant', prompt.ai_prompt_uuid),
            role: 'assistant',
            parts: projectAssistantParts(
                {
                    toolCalls:
                        toolCallsByPromptUuid.get(prompt.ai_prompt_uuid) ?? [],
                    toolResults:
                        toolResultsByPromptUuid.get(prompt.ai_prompt_uuid) ??
                        [],
                    toolCallErrors:
                        toolCallErrorsByPromptUuid.get(prompt.ai_prompt_uuid) ??
                        [],
                    reasonings:
                        reasoningsByPromptUuid.get(prompt.ai_prompt_uuid) ?? [],
                    artifacts:
                        artifactsByPromptUuid.get(prompt.ai_prompt_uuid) ?? [],
                },
                prompt,
                status,
            ),
            metadata: {
                ...baseMetadata({
                    createdAt: prompt.responded_at ?? prompt.created_at,
                    createdByUserUuid: null,
                    hidden: false,
                }),
                status,
                modelConfig: prompt.model_config
                    ? {
                          version: 1,
                          ...prompt.model_config,
                          reasoning: {
                              enabled: false,
                              effort: null,
                              budgetTokens: null,
                          },
                          limits: {
                              maxSteps: null,
                              maxOutputTokens: null,
                          },
                          sampling: { temperature: null, topP: null },
                          providerOptions: null,
                      }
                    : null,
                tokenUsage: prompt.token_usage
                    ? {
                          version: 1,
                          inputTokens: null,
                          outputTokens: null,
                          totalTokens: prompt.token_usage.totalTokens,
                          reasoningTokens: null,
                          cachedInputTokens: null,
                      }
                    : null,
                error:
                    status === 'error'
                        ? {
                              version: 1,
                              name: 'legacy_error',
                              message:
                                  prompt.error_message ?? 'Legacy run failed',
                              data: null,
                          }
                        : null,
                legacy: {
                    type: 'response',
                    vizConfigOutput: prompt.viz_config_output,
                    filtersOutput: prompt.filters_output,
                    metricQuery: prompt.metric_query,
                    savedQueryUuid: prompt.saved_query_uuid,
                    humanScore: prompt.human_score,
                    humanFeedback: prompt.human_feedback,
                    referencedArtifacts: sortedByDateAndUuid(
                        referencesByPromptUuid.get(prompt.ai_prompt_uuid) ?? [],
                        (reference) => reference.created_at,
                        (reference) => reference.ai_artifact_version_uuid,
                    ).map((reference) => ({
                        artifactVersionUuid: reference.ai_artifact_version_uuid,
                        artifactUuid: reference.ai_artifact_uuid,
                        projectUuid: reference.project_uuid,
                        similarityScore: reference.similarity_score,
                        versionNumber: reference.version_number,
                        title: reference.title,
                        description: reference.description,
                        artifactType: reference.artifact_type,
                        createdAt: reference.created_at.toISOString(),
                    })),
                    interrupts: interrupts.map((interrupt) => ({
                        createdByUserUuid: interrupt.created_by_user_uuid,
                        createdAt: interrupt.created_at.toISOString(),
                    })),
                },
            },
        });

        sortedByDateAndUuid(
            steersByPromptUuid.get(prompt.ai_prompt_uuid) ?? [],
            (row) => row.created_at,
            (row) => row.ai_prompt_steer_uuid,
        ).forEach((steer) => {
            messages.push({
                uuid: steer.ai_prompt_steer_uuid,
                role: 'user',
                parts: [
                    canonicalPart(
                        syntheticUuid('steer-text', steer.ai_prompt_steer_uuid),
                        'text',
                        { text: steer.message },
                    ),
                ],
                metadata: {
                    ...baseMetadata({
                        createdAt: steer.created_at,
                        createdByUserUuid: steer.created_by_user_uuid,
                        hidden: prompt.hidden,
                    }),
                    legacy: {
                        type: 'steer',
                        consumedAt: steer.consumed_at?.toISOString() ?? null,
                        consumedStep: steer.consumed_step,
                    },
                },
            });
        });
    });

    return {
        uuid: rows.thread.ai_thread_uuid,
        storageVersion: 1,
        organizationUuid: rows.thread.organization_uuid,
        projectUuid: rows.thread.project_uuid,
        agentUuid: rows.thread.agent_uuid,
        createdAt: rows.thread.created_at.toISOString(),
        updatedAt: rows.thread.updated_at?.toISOString() ?? null,
        createdFrom: rows.thread.created_from,
        title: rows.thread.title,
        lineage: null,
        messages,
    };
};

export class AiAgentV1ReadAdapter {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async listFirstMessages(
        threadUuids: string[],
    ): Promise<Map<string, AiAgentThreadFirstMessage>> {
        if (threadUuids.length === 0) return new Map();
        const rows = await this.database(AiPromptTableName)
            .select('ai_thread_uuid', 'ai_prompt_uuid', 'prompt')
            .whereIn('ai_thread_uuid', threadUuids)
            .distinctOn('ai_thread_uuid')
            .orderBy([
                { column: 'ai_thread_uuid' },
                { column: 'created_at' },
                { column: 'ai_prompt_uuid' },
            ]);
        return new Map(
            rows.map((row) => [
                row.ai_thread_uuid,
                { uuid: row.ai_prompt_uuid, message: row.prompt },
            ]),
        );
    }

    async getThread(
        thread: V1ThreadRows['thread'],
    ): Promise<AiCanonicalThread> {
        assertV1Storage(thread);
        const prompts = await this.database(AiPromptTableName)
            .where('ai_thread_uuid', thread.ai_thread_uuid)
            .orderBy([{ column: 'created_at' }, { column: 'ai_prompt_uuid' }]);
        const promptUuids = prompts.map((prompt) => prompt.ai_prompt_uuid);
        if (promptUuids.length === 0) {
            return projectV1Thread({
                thread,
                prompts,
                reasonings: [],
                toolCalls: [],
                toolResults: [],
                toolCallErrors: [],
                steers: [],
                interrupts: [],
                artifacts: [],
                contexts: [],
                referencedArtifacts: [],
            });
        }

        const [
            reasonings,
            toolCalls,
            toolResults,
            toolCallErrors,
            steers,
            interrupts,
            contexts,
            artifacts,
            referencedArtifacts,
        ] = await Promise.all([
            this.database(AiAgentReasoningTableName).whereIn(
                'ai_prompt_uuid',
                promptUuids,
            ),
            this.database(AiAgentToolCallTableName).whereIn(
                'ai_prompt_uuid',
                promptUuids,
            ),
            this.database(AiAgentToolResultTableName).whereIn(
                'ai_prompt_uuid',
                promptUuids,
            ),
            this.database(AiAgentToolCallErrorTableName).whereIn(
                'ai_prompt_uuid',
                promptUuids,
            ),
            this.database(AiPromptSteerTableName).whereIn(
                'ai_prompt_uuid',
                promptUuids,
            ),
            this.database(AiPromptInterruptTableName).whereIn(
                'ai_prompt_uuid',
                promptUuids,
            ),
            this.database(AiPromptContextTableName).whereIn(
                'ai_prompt_uuid',
                promptUuids,
            ),
            this.database(AiArtifactVersionsTableName)
                .join(
                    AiArtifactsTableName,
                    `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
                    `${AiArtifactsTableName}.ai_artifact_uuid`,
                )
                .whereIn(
                    `${AiArtifactVersionsTableName}.ai_prompt_uuid`,
                    promptUuids,
                )
                .select<V1Artifact[]>(
                    `${AiArtifactVersionsTableName}.ai_artifact_version_uuid`,
                    `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
                    `${AiArtifactVersionsTableName}.ai_prompt_uuid`,
                    `${AiArtifactVersionsTableName}.created_at`,
                    `${AiArtifactVersionsTableName}.version_number`,
                    `${AiArtifactVersionsTableName}.title`,
                    `${AiArtifactVersionsTableName}.description`,
                    `${AiArtifactsTableName}.artifact_type`,
                ),
            this.database(AiPromptArtifactReferencesTableName)
                .join(
                    AiArtifactVersionsTableName,
                    `${AiPromptArtifactReferencesTableName}.ai_artifact_version_uuid`,
                    `${AiArtifactVersionsTableName}.ai_artifact_version_uuid`,
                )
                .join(
                    AiArtifactsTableName,
                    `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
                    `${AiArtifactsTableName}.ai_artifact_uuid`,
                )
                .whereIn(
                    `${AiPromptArtifactReferencesTableName}.ai_prompt_uuid`,
                    promptUuids,
                )
                .select<V1ReferencedArtifact[]>({
                    ai_prompt_uuid: `${AiPromptArtifactReferencesTableName}.ai_prompt_uuid`,
                    ai_artifact_version_uuid: `${AiPromptArtifactReferencesTableName}.ai_artifact_version_uuid`,
                    project_uuid: `${AiPromptArtifactReferencesTableName}.project_uuid`,
                    similarity_score: `${AiPromptArtifactReferencesTableName}.similarity_score`,
                    created_at: `${AiPromptArtifactReferencesTableName}.created_at`,
                    ai_artifact_uuid: `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
                    version_number: `${AiArtifactVersionsTableName}.version_number`,
                    title: `${AiArtifactVersionsTableName}.title`,
                    description: `${AiArtifactVersionsTableName}.description`,
                    artifact_type: `${AiArtifactsTableName}.artifact_type`,
                }),
        ]);

        return projectV1Thread({
            thread,
            prompts,
            reasonings,
            toolCalls,
            toolResults,
            toolCallErrors,
            steers,
            interrupts,
            artifacts,
            contexts,
            referencedArtifacts,
        });
    }
}
