import { projectV1Thread, type V1ThreadRows } from './AiAgentV1ReadAdapter';

const threadUuid = '00000000-0000-4000-8000-000000000001';
const promptUuid = '00000000-0000-4000-8000-000000000002';

describe('projectV1Thread', () => {
    it('projects a legacy turn into deterministic canonical messages', () => {
        const rows: V1ThreadRows = {
            thread: {
                ai_thread_uuid: threadUuid,
                organization_uuid: '00000000-0000-4000-8000-000000000003',
                project_uuid: '00000000-0000-4000-8000-000000000004',
                agent_uuid: null,
                created_at: new Date('2026-01-01T00:00:00.000Z'),
                updated_at: new Date('2026-01-01T00:00:09.000Z'),
                created_from: 'web_app',
                title: 'Revenue thread',
                storage_version: 1,
            },
            prompts: [
                {
                    ai_prompt_uuid: promptUuid,
                    created_at: new Date('2026-01-01T00:00:01.000Z'),
                    created_by_user_uuid:
                        '00000000-0000-4000-8000-000000000005',
                    prompt: 'Show revenue',
                    response: 'Revenue is 42',
                    error_message: null,
                    responded_at: new Date('2026-01-01T00:00:09.000Z'),
                    model_config: {
                        modelName: 'claude-sonnet-4-5',
                        modelProvider: 'anthropic',
                    },
                    token_usage: { totalTokens: 12 },
                    viz_config_output: { type: 'bar' },
                    filters_output: { dimensions: ['orders.status'] },
                    metric_query: { metrics: ['orders.total'] },
                    saved_query_uuid: '00000000-0000-4000-8000-000000000006',
                    human_score: 1,
                    human_feedback: 'Useful answer',
                    hidden: false,
                },
            ],
            reasonings: [
                {
                    ai_agent_reasoning_uuid:
                        '00000000-0000-4000-8000-000000000012',
                    ai_prompt_uuid: promptUuid,
                    reasoning_id: 'reasoning-1',
                    text: 'I should query orders',
                    created_at: new Date('2026-01-01T00:00:02.000Z'),
                },
            ],
            toolCalls: [
                {
                    ai_agent_tool_call_uuid:
                        '00000000-0000-4000-8000-000000000011',
                    ai_prompt_uuid: promptUuid,
                    tool_call_id: 'call-success',
                    tool_name: 'runQuery',
                    tool_args: { metric: 'revenue' },
                    parent_tool_call_id: null,
                    ai_mcp_server_uuid: '00000000-0000-4000-8000-000000000007',
                    created_at: new Date('2026-01-01T00:00:02.000Z'),
                },
                {
                    ai_agent_tool_call_uuid:
                        '00000000-0000-4000-8000-000000000014',
                    ai_prompt_uuid: promptUuid,
                    tool_call_id: 'call-error',
                    tool_name: 'runSql',
                    tool_args: { sql: 'bad sql' },
                    parent_tool_call_id: null,
                    ai_mcp_server_uuid: null,
                    created_at: new Date('2026-01-01T00:00:04.000Z'),
                },
            ],
            toolResults: [
                {
                    ai_agent_tool_result_uuid:
                        '00000000-0000-4000-8000-000000000023',
                    ai_prompt_uuid: promptUuid,
                    tool_call_id: 'call-success',
                    tool_name: 'runQuery',
                    result: '{"rows":[{"revenue":43}]}',
                    metadata: { status: 'success' },
                    created_at: new Date('2026-01-01T00:00:03.500Z'),
                },
                {
                    ai_agent_tool_result_uuid:
                        '00000000-0000-4000-8000-000000000021',
                    ai_prompt_uuid: promptUuid,
                    tool_call_id: 'call-success',
                    tool_name: 'runQuery',
                    result: '{"rows":[{"revenue":42}]}',
                    metadata: { status: 'success' },
                    created_at: new Date('2026-01-01T00:00:03.000Z'),
                },
                {
                    ai_agent_tool_result_uuid:
                        '00000000-0000-4000-8000-000000000022',
                    ai_prompt_uuid: promptUuid,
                    tool_call_id: 'call-error',
                    tool_name: 'runSql',
                    result: 'syntax error',
                    metadata: { status: 'error', errorCode: 'invalid_sql' },
                    created_at: new Date('2026-01-01T00:00:05.000Z'),
                },
                {
                    ai_agent_tool_result_uuid:
                        '00000000-0000-4000-8000-000000000024',
                    ai_prompt_uuid: promptUuid,
                    tool_call_id: 'orphan-result',
                    tool_name: 'legacyTool',
                    result: 'orphan output',
                    metadata: { status: 'success' },
                    created_at: new Date('2026-01-01T00:00:05.500Z'),
                },
            ],
            toolCallErrors: [
                {
                    ai_agent_tool_call_error_uuid:
                        '00000000-0000-4000-8000-000000000013',
                    ai_prompt_uuid: promptUuid,
                    tool_call_id: 'invalid-call',
                    tool_name: 'runSql',
                    error_message: 'Invalid tool input',
                    raw_args: '{"sql":',
                    created_at: new Date('2026-01-01T00:00:03.000Z'),
                },
            ],
            steers: [
                {
                    ai_prompt_steer_uuid:
                        '00000000-0000-4000-8000-000000000031',
                    ai_prompt_uuid: promptUuid,
                    created_by_user_uuid:
                        '00000000-0000-4000-8000-000000000005',
                    message: 'Use gross revenue',
                    created_at: new Date('2026-01-01T00:00:06.000Z'),
                    consumed_at: new Date('2026-01-01T00:00:06.500Z'),
                    consumed_step: 2,
                },
            ],
            interrupts: [],
            artifacts: [
                {
                    ai_artifact_version_uuid:
                        '00000000-0000-4000-8000-000000000041',
                    ai_artifact_uuid: '00000000-0000-4000-8000-000000000042',
                    ai_prompt_uuid: promptUuid,
                    version_number: 1,
                    title: 'Revenue chart',
                    description: null,
                    artifact_type: 'chart' as const,
                    created_at: new Date('2026-01-01T00:00:07.000Z'),
                },
            ],
            contexts: [
                {
                    ai_prompt_context_uuid:
                        '00000000-0000-4000-8000-000000000051',
                    ai_prompt_uuid: promptUuid,
                    entity_type: 'chart',
                    entity_uuid: '00000000-0000-4000-8000-000000000052',
                    entity_ref: null,
                    pinned_version_uuid: '00000000-0000-4000-8000-000000000053',
                    display_name: 'Revenue chart',
                    runtime_overrides: {},
                    created_at: new Date('2026-01-01T00:00:08.000Z'),
                },
            ],
            referencedArtifacts: [
                {
                    ai_prompt_uuid: promptUuid,
                    ai_artifact_version_uuid:
                        '00000000-0000-4000-8000-000000000061',
                    ai_artifact_uuid: '00000000-0000-4000-8000-000000000062',
                    project_uuid: '00000000-0000-4000-8000-000000000004',
                    similarity_score: 0.9,
                    version_number: 2,
                    title: 'Prior revenue chart',
                    description: 'Referenced input',
                    artifact_type: 'chart',
                    created_at: new Date('2026-01-01T00:00:00.500Z'),
                },
            ],
            compactions: [],
        };

        const first = projectV1Thread(rows);
        const second = projectV1Thread({
            ...rows,
            toolCalls: [...rows.toolCalls].reverse(),
            toolResults: [...rows.toolResults].reverse(),
            toolCallErrors: [...rows.toolCallErrors].reverse(),
        });

        expect(second).toEqual(first);
        expect(() =>
            projectV1Thread({
                ...rows,
                thread: { ...rows.thread, storage_version: 3 },
            }),
        ).toThrow('Thread is not storage version 1');
        expect(first).toMatchObject({
            uuid: threadUuid,
            storageVersion: 1,
            createdFrom: 'web_app',
            title: 'Revenue thread',
            updatedAt: '2026-01-01T00:00:09.000Z',
            messages: [
                {
                    uuid: promptUuid,
                    role: 'user',
                    parts: [
                        { type: 'text', payload: { text: 'Show revenue' } },
                    ],
                    metadata: {
                        hidden: false,
                        context: [
                            {
                                uuid: '00000000-0000-4000-8000-000000000051',
                                entityType: 'chart',
                                entityUuid:
                                    '00000000-0000-4000-8000-000000000052',
                                entityRef: null,
                                pinnedVersionUuid:
                                    '00000000-0000-4000-8000-000000000053',
                                displayName: 'Revenue chart',
                                runtimeOverrides: {},
                                createdAt: '2026-01-01T00:00:08.000Z',
                            },
                        ],
                    },
                },
                {
                    role: 'assistant',
                    metadata: {
                        status: 'completed',
                        hidden: false,
                        legacy: {
                            vizConfigOutput: { type: 'bar' },
                            filtersOutput: {
                                dimensions: ['orders.status'],
                            },
                            metricQuery: { metrics: ['orders.total'] },
                            savedQueryUuid:
                                '00000000-0000-4000-8000-000000000006',
                            humanScore: 1,
                            humanFeedback: 'Useful answer',
                            referencedArtifacts: [
                                {
                                    artifactVersionUuid:
                                        '00000000-0000-4000-8000-000000000061',
                                    artifactUuid:
                                        '00000000-0000-4000-8000-000000000062',
                                    projectUuid:
                                        '00000000-0000-4000-8000-000000000004',
                                    similarityScore: 0.9,
                                    versionNumber: 2,
                                    title: 'Prior revenue chart',
                                    description: 'Referenced input',
                                    artifactType: 'chart',
                                    createdAt: '2026-01-01T00:00:00.500Z',
                                },
                            ],
                        },
                    },
                    parts: [
                        {
                            uuid: '00000000-0000-4000-8000-000000000011',
                            type: 'tool',
                            toolCallId: 'call-success',
                            payload: {
                                state: 'output-available',
                                toolName: 'runQuery',
                                input: { metric: 'revenue' },
                                output: '{"rows":[{"revenue":43}]}',
                                metadata: { status: 'success' },
                                mcpServerUuid:
                                    '00000000-0000-4000-8000-000000000007',
                                legacyResults: [
                                    {
                                        uuid: '00000000-0000-4000-8000-000000000021',
                                        result: '{"rows":[{"revenue":42}]}',
                                    },
                                    {
                                        uuid: '00000000-0000-4000-8000-000000000023',
                                        result: '{"rows":[{"revenue":43}]}',
                                    },
                                ],
                            },
                        },
                        {
                            uuid: '00000000-0000-4000-8000-000000000012',
                            type: 'reasoning',
                            payload: {
                                reasoningId: 'reasoning-1',
                                text: 'I should query orders',
                            },
                        },
                        {
                            uuid: '00000000-0000-4000-8000-000000000013',
                            type: 'tool',
                            toolCallId: 'invalid-call',
                            payload: {
                                state: 'output-error',
                                toolName: 'runSql',
                                input: '{"sql":',
                                errorText: 'Invalid tool input',
                            },
                        },
                        {
                            uuid: '00000000-0000-4000-8000-000000000014',
                            type: 'tool',
                            toolCallId: 'call-error',
                            payload: {
                                state: 'output-error',
                                toolName: 'runSql',
                                input: { sql: 'bad sql' },
                                errorText: 'syntax error',
                                metadata: {
                                    status: 'error',
                                    errorCode: 'invalid_sql',
                                },
                            },
                        },
                        {
                            uuid: '00000000-0000-4000-8000-000000000024',
                            type: 'tool',
                            toolCallId: 'orphan-result',
                            payload: {
                                state: 'output-available',
                                toolName: 'legacyTool',
                                input: null,
                                output: 'orphan output',
                                metadata: { status: 'success' },
                                legacyResultUuid:
                                    '00000000-0000-4000-8000-000000000024',
                            },
                        },
                        { type: 'text', payload: { text: 'Revenue is 42' } },
                        {
                            uuid: '00000000-0000-4000-8000-000000000041',
                            type: 'artifact',
                            artifactVersionUuid:
                                '00000000-0000-4000-8000-000000000041',
                        },
                    ],
                },
                {
                    uuid: '00000000-0000-4000-8000-000000000031',
                    role: 'user',
                    metadata: {
                        legacy: {
                            type: 'steer',
                            consumedAt: '2026-01-01T00:00:06.500Z',
                            consumedStep: 2,
                        },
                    },
                    parts: [
                        {
                            type: 'text',
                            payload: { text: 'Use gross revenue' },
                        },
                    ],
                },
            ],
        });
    });

    it('projects active, failed, canceled, and hidden legacy turns', () => {
        const activePromptUuid = '00000000-0000-4000-8000-000000000061';
        const failedPromptUuid = '00000000-0000-4000-8000-000000000062';
        const canceledPromptUuid = '00000000-0000-4000-8000-000000000063';
        const hiddenPromptUuid = '00000000-0000-4000-8000-000000000064';
        const prompt = (
            uuid: string,
            createdAt: string,
            overrides: Record<string, unknown> = {},
        ) => ({
            ai_prompt_uuid: uuid,
            created_at: new Date(createdAt),
            created_by_user_uuid: '00000000-0000-4000-8000-000000000005',
            prompt: uuid,
            response: null,
            error_message: null,
            responded_at: null,
            model_config: null,
            token_usage: null,
            viz_config_output: null,
            filters_output: null,
            metric_query: null,
            saved_query_uuid: null,
            human_score: null,
            human_feedback: null,
            hidden: false,
            ...overrides,
        });
        const rows: V1ThreadRows = {
            thread: {
                ai_thread_uuid: threadUuid,
                organization_uuid: '00000000-0000-4000-8000-000000000003',
                project_uuid: '00000000-0000-4000-8000-000000000004',
                agent_uuid: null,
                created_at: new Date('2026-01-01T00:00:00.000Z'),
                updated_at: null,
                created_from: 'web_app',
                title: null,
                storage_version: 1,
            },
            prompts: [
                prompt(activePromptUuid, '2026-01-01T00:00:01.000Z'),
                prompt(failedPromptUuid, '2026-01-01T00:00:02.000Z', {
                    error_message: 'Provider failed',
                }),
                prompt(canceledPromptUuid, '2026-01-01T00:00:03.000Z', {
                    error_message: 'Interrupted provider call',
                }),
                prompt(hiddenPromptUuid, '2026-01-01T00:00:04.000Z', {
                    response: 'Hidden response',
                    responded_at: new Date('2026-01-01T00:00:05.000Z'),
                    hidden: true,
                }),
            ],
            reasonings: [],
            toolCalls: [
                {
                    ai_agent_tool_call_uuid:
                        '00000000-0000-4000-8000-000000000071',
                    ai_prompt_uuid: activePromptUuid,
                    tool_call_id: 'unfinished-call',
                    tool_name: 'runSql',
                    tool_args: { sql: 'select 1' },
                    parent_tool_call_id: null,
                    ai_mcp_server_uuid: null,
                    created_at: new Date('2026-01-01T00:00:01.250Z'),
                },
                {
                    ai_agent_tool_call_uuid:
                        '00000000-0000-4000-8000-000000000065',
                    ai_prompt_uuid: activePromptUuid,
                    tool_call_id: 'unfinished-call',
                    tool_name: 'runSql',
                    tool_args: { sql: 'select 1' },
                    parent_tool_call_id: null,
                    ai_mcp_server_uuid: null,
                    created_at: new Date('2026-01-01T00:00:01.500Z'),
                },
            ],
            toolResults: [],
            toolCallErrors: [
                {
                    ai_agent_tool_call_error_uuid:
                        '00000000-0000-4000-8000-000000000069',
                    ai_prompt_uuid: failedPromptUuid,
                    tool_call_id: 'duplicate-invalid-call',
                    tool_name: 'runSql',
                    error_message: 'First invalid call',
                    raw_args: '{}',
                    created_at: new Date('2026-01-01T00:00:02.250Z'),
                },
                {
                    ai_agent_tool_call_error_uuid:
                        '00000000-0000-4000-8000-000000000070',
                    ai_prompt_uuid: failedPromptUuid,
                    tool_call_id: 'duplicate-invalid-call',
                    tool_name: 'runSql',
                    error_message: 'Second invalid call',
                    raw_args: '{}',
                    created_at: new Date('2026-01-01T00:00:02.500Z'),
                },
            ],
            steers: [
                {
                    ai_prompt_steer_uuid:
                        '00000000-0000-4000-8000-000000000066',
                    ai_prompt_uuid: hiddenPromptUuid,
                    created_by_user_uuid:
                        '00000000-0000-4000-8000-000000000005',
                    message: 'Hidden steer',
                    created_at: new Date('2026-01-01T00:00:04.500Z'),
                    consumed_at: null,
                    consumed_step: null,
                },
            ],
            interrupts: [
                {
                    ai_prompt_interrupt_uuid:
                        '00000000-0000-4000-8000-000000000067',
                    ai_prompt_uuid: canceledPromptUuid,
                    created_by_user_uuid:
                        '00000000-0000-4000-8000-000000000005',
                    created_at: new Date('2026-01-01T00:00:03.500Z'),
                },
                {
                    ai_prompt_interrupt_uuid:
                        '00000000-0000-4000-8000-000000000068',
                    ai_prompt_uuid: canceledPromptUuid,
                    created_by_user_uuid: null,
                    created_at: new Date('2026-01-01T00:00:03.750Z'),
                },
            ],
            artifacts: [],
            contexts: [],
            referencedArtifacts: [],
            compactions: [
                {
                    ai_thread_compaction_uuid:
                        '00000000-0000-4000-8000-000000000080',
                    ai_thread_uuid: threadUuid,
                    compacted_through_ai_prompt_uuid: activePromptUuid,
                    triggering_ai_prompt_uuid: failedPromptUuid,
                    serialized_input: 'legacy input is intentionally hidden',
                    summary: 'Legacy summary',
                    created_at: new Date('2026-01-01T00:00:01.900Z'),
                },
            ],
        };
        const projected = projectV1Thread(rows);
        const assistantFor = (uuid: string) => {
            const userIndex = projected.messages.findIndex(
                (message) => message.uuid === uuid,
            );
            return projected.messages[userIndex + 1];
        };

        expect(assistantFor(activePromptUuid)).toMatchObject({
            metadata: { status: 'in_progress', error: null },
            parts: [
                {
                    type: 'tool',
                    payload: {
                        state: 'input-available',
                        input: { sql: 'select 1' },
                    },
                },
                {
                    type: 'tool',
                    payload: {
                        state: 'input-available',
                        input: { sql: 'select 1' },
                    },
                },
            ],
        });
        expect(assistantFor(failedPromptUuid)).toMatchObject({
            metadata: {
                status: 'error',
                error: { name: 'legacy_error', message: 'Provider failed' },
            },
        });
        const failedUserIndex = projected.messages.findIndex(
            (message) => message.uuid === failedPromptUuid,
        );
        expect(projected.messages[failedUserIndex - 1]).toMatchObject({
            uuid: '00000000-0000-4000-8000-000000000080',
            role: 'compaction',
            parts: [
                {
                    type: 'compaction',
                    payload: { summary: 'Legacy summary' },
                },
            ],
        });
        expect(
            projected.messages[failedUserIndex - 1].parts[0].payload,
        ).not.toHaveProperty('serializedInput');
        const failedToolCallIds = assistantFor(failedPromptUuid)
            .parts.filter((part) => part.type === 'tool')
            .map((part) => part.toolCallId);
        expect(new Set(failedToolCallIds).size).toBe(failedToolCallIds.length);
        expect(assistantFor(canceledPromptUuid)).toMatchObject({
            metadata: {
                status: 'canceled',
                error: null,
                legacy: {
                    interrupts: [
                        {
                            createdByUserUuid:
                                '00000000-0000-4000-8000-000000000005',
                            createdAt: '2026-01-01T00:00:03.500Z',
                        },
                        {
                            createdByUserUuid: null,
                            createdAt: '2026-01-01T00:00:03.750Z',
                        },
                    ],
                },
            },
        });
        expect(assistantFor(hiddenPromptUuid)).toMatchObject({
            metadata: { hidden: false },
        });
        expect(
            projected.messages.find(
                (message) =>
                    message.uuid === '00000000-0000-4000-8000-000000000066',
            ),
        ).toMatchObject({ metadata: { hidden: true } });
        expect(
            projectV1Thread({
                ...rows,
                toolCalls: [...rows.toolCalls].reverse(),
                toolCallErrors: [...rows.toolCallErrors].reverse(),
            }),
        ).toEqual(projected);
    });
});
