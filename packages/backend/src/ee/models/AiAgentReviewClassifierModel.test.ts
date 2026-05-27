import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    AiAgentReviewClassifierRunTableName,
    AiAgentTurnSignalTableName,
} from '../database/entities/aiAgentReviewClassifier';
import { AiAgentReviewClassifierModel } from './AiAgentReviewClassifierModel';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';
const AGENT_UUID = '00000000-0000-0000-0000-000000000003';
const RUN_UUID = '00000000-0000-0000-0000-000000000006';
const THREAD_UUID = '00000000-0000-0000-0000-000000000007';
const PROMPT_UUID = '00000000-0000-0000-0000-000000000008';
const TURN_SIGNAL_UUID = '00000000-0000-0000-0000-000000000009';
const SEEN_AT = new Date('2026-05-26T10:00:00.000Z');
const FINGERPRINT = 'ai_agent_review_item:fingerprint';

const snapshot = {
    capturedAt: '2026-05-26T10:00:00.000Z',
    agentUpdatedAt: '2026-05-26T09:00:00.000Z',
    settings: ['instructions' as const],
    availableCapabilities: ['semantic_query' as const],
    instructionHash: 'hash',
    instructionSummary: 'Use finance definitions.',
    knowledgeDocuments: [],
};

const makeRunRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    ai_agent_review_run_uuid: RUN_UUID,
    organization_uuid: ORGANIZATION_UUID,
    status: 'queued',
    review_agent_version: 'v1',
    judge_prompt_hash: 'prompt-hash',
    agent_config_snapshot_hash: null,
    agent_config_snapshot: null,
    agent_config_snapshot_agent_updated_at: null,
    run_scope: {
        type: 'backfill',
        startedAt: '2026-05-26T00:00:00.000Z',
        endedAt: '2026-05-27T00:00:00.000Z',
    },
    total_turns: 0,
    processed_turns: 0,
    signal_count: 0,
    finding_count: 0,
    review_item_count: 0,
    error_message: null,
    completed_at: null,
    created_at: SEEN_AT,
    updated_at: SEEN_AT,
    ...overrides,
});

const makeTurnSignalRow = (
    overrides: Partial<Record<string, unknown>> = {},
) => ({
    ai_agent_review_turn_signal_uuid: TURN_SIGNAL_UUID,
    ai_agent_review_run_uuid: RUN_UUID,
    ai_prompt_uuid: PROMPT_UUID,
    ai_thread_uuid: THREAD_UUID,
    organization_uuid: ORGANIZATION_UUID,
    project_uuid: PROJECT_UUID,
    agent_uuid: AGENT_UUID,
    interaction_source: 'app',
    source_ref: {
        source: 'app',
        threadUuid: THREAD_UUID,
        promptUuid: PROMPT_UUID,
        appUrl: null,
    },
    signal: 'implicit_correction',
    implicit_signal_sources: ['next_user_correction'],
    confidence: 'high',
    promoted_to_finding: true,
    promotion_reason: 'User corrected the answer.',
    tool_evidence_refs: [],
    fingerprint: FINGERPRINT,
    primary_root_cause: 'semantic_layer',
    secondary_root_causes: ['project_context'],
    subcategories: ['wrong_metric'],
    fix_targets: ['semantic_yaml_patch'],
    target_refs: [
        {
            type: 'metric',
            modelName: 'orders',
            metricName: 'total_completed_order_amount',
        },
    ],
    evidence_excerpts: [
        {
            source: 'next_user_prompt',
            text: 'No, use revenue not order count.',
            redacted: false,
        },
    ],
    recommendation: {
        actionType: 'update_semantic_yaml',
        title: 'Add revenue metric guidance',
        rationale: 'The user corrected the metric choice.',
        targetRefs: [],
    },
    owner_type: 'semantic_layer_owner',
    review_item_title: 'Review revenue metric',
    review_item_description: 'The agent selected order count for revenue.',
    runtime_context_snapshot: {
        userUuid: null,
        canRunSql: false,
        canManageAgent: false,
    },
    model_metadata: {
        provider: 'openai',
        model: 'gpt-5',
    },
    created_at: SEEN_AT,
    ...overrides,
});

const turnSignal = {
    subject: {
        type: 'turn_review' as const,
        assistantPromptUuid: PROMPT_UUID,
        threadUuid: THREAD_UUID,
        agentUuid: AGENT_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
    },
    interactionSource: 'app' as const,
    sourceRef: {
        source: 'app' as const,
        threadUuid: THREAD_UUID,
        promptUuid: PROMPT_UUID,
        appUrl: null,
    },
    signal: 'implicit_correction' as const,
    implicitSignalSources: ['next_user_correction' as const],
    confidence: 'medium' as const,
    promotedToFinding: true,
    promotionReason: 'User corrected the requested grouping.',
    toolEvidenceRefs: [],
    runtimeContextSnapshot: {
        userUuid: null,
        canRunSql: false,
        canManageAgent: false,
    },
    modelMetadata: {
        provider: 'openai',
        model: 'gpt-5',
    },
};

describe('AiAgentReviewClassifierModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AiAgentReviewClassifierModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('createRun', () => {
        it('creates a review agent run with run-level config snapshot', async () => {
            tracker.on
                .insert(AiAgentReviewClassifierRunTableName)
                .responseOnce([
                    makeRunRow({
                        agent_config_snapshot_hash: 'snapshot-hash',
                        agent_config_snapshot: snapshot,
                        agent_config_snapshot_agent_updated_at: SEEN_AT,
                    }),
                ]);

            const result = await model.createRun({
                organizationUuid: ORGANIZATION_UUID,
                reviewAgentVersion: 'v1',
                judgePromptHash: 'prompt-hash',
                runScope: {
                    type: 'backfill',
                    startedAt: '2026-05-26T00:00:00.000Z',
                    endedAt: '2026-05-27T00:00:00.000Z',
                },
                agentConfigSnapshotHash: 'snapshot-hash',
                agentConfigSnapshot: snapshot,
                agentConfigSnapshotAgentUpdatedAt: SEEN_AT,
            });

            expect(result.uuid).toBe(RUN_UUID);
            expect(result.agentConfigSnapshotHash).toBe('snapshot-hash');
            expect(result.agentConfigSnapshot).toEqual(snapshot);
        });
    });

    describe('updateRun', () => {
        it('updates run progress and completion fields', async () => {
            tracker.on
                .update(AiAgentReviewClassifierRunTableName)
                .responseOnce([
                    makeRunRow({
                        status: 'completed',
                        total_turns: 4,
                        processed_turns: 4,
                        signal_count: 2,
                        finding_count: 1,
                        review_item_count: 1,
                        completed_at: SEEN_AT,
                    }),
                ]);

            const result = await model.updateRun({
                runUuid: RUN_UUID,
                status: 'completed',
                totalTurns: 4,
                processedTurns: 4,
                signalCount: 2,
                findingCount: 1,
                reviewItemCount: 1,
                completedAt: SEEN_AT,
            });

            expect(result.status).toBe('completed');
            expect(result.processedTurns).toBe(4);
            expect(result.completedAt).toEqual(SEEN_AT);
        });
    });

    describe('mapTurnReviewCandidate', () => {
        it('maps app turns into review agent candidate input', () => {
            const result = AiAgentReviewClassifierModel.mapTurnReviewCandidate({
                ai_prompt_uuid: PROMPT_UUID,
                ai_thread_uuid: THREAD_UUID,
                organization_uuid: ORGANIZATION_UUID,
                project_uuid: PROJECT_UUID,
                agent_uuid: AGENT_UUID,
                created_from: 'web_app',
                prompt: 'Show airport volume by country',
                response: 'Country is not available.',
                error_message: null,
                human_score: null,
                human_feedback: null,
                prompt_created_at: SEEN_AT,
                responded_at: SEEN_AT,
                model_config: {
                    modelName: 'gpt-5',
                    modelProvider: 'openai',
                },
                token_usage: { totalTokens: 123 },
                next_user_prompt_uuid: null,
                next_user_prompt: null,
                previous_turn_context: [
                    {
                        relation: 'previous',
                        promptUuid: '00000000-0000-0000-0000-000000000012',
                        userPrompt: 'Show total airport volume',
                        assistantResponse:
                            'Airport volume is calculated from scheduled flights.',
                        errorMessage: null,
                        createdAt: SEEN_AT.toISOString(),
                        respondedAt: SEEN_AT.toISOString(),
                    },
                ],
                slack_channel_id: null,
                slack_thread_ts: null,
                prompt_slack_ts: null,
                query_history_summaries: [],
                supporting_evidence_summaries: [],
            });

            expect(result.subject.assistantPromptUuid).toBe(PROMPT_UUID);
            expect(result.interactionSource).toBe('app');
            expect(result.tokenUsageTotal).toBe(123);
        });
    });

    describe('listReviewItems', () => {
        it('groups actionable signals into review item projections', async () => {
            tracker.on.select(AiAgentTurnSignalTableName).responseOnce([
                makeTurnSignalRow(),
                makeTurnSignalRow({
                    ai_agent_review_turn_signal_uuid:
                        '00000000-0000-0000-0000-000000000011',
                    created_at: new Date('2026-05-26T09:00:00.000Z'),
                }),
            ]);

            const result = await model.listReviewItems({
                organizationUuid: ORGANIZATION_UUID,
            });

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(
                expect.objectContaining({
                    uuid: FINGERPRINT,
                    fingerprint: FINGERPRINT,
                    title: 'Review revenue metric',
                    status: 'open',
                    findingCount: 2,
                }),
            );
            expect(result[0].latestFinding).toEqual(
                expect.objectContaining({
                    uuid: TURN_SIGNAL_UUID,
                    promptUuid: PROMPT_UUID,
                    targetRefs: [
                        {
                            type: 'metric',
                            modelName: 'orders',
                            metricName: 'total_completed_order_amount',
                        },
                    ],
                }),
            );
        });
    });

    describe('listReviewSignals', () => {
        it('returns recent classifier signals with inline finding context', async () => {
            tracker.on.select(AiAgentTurnSignalTableName).responseOnce([
                {
                    ...makeTurnSignalRow(),
                    signal_created_at: SEEN_AT,
                    run_scope: {
                        type: 'live_event',
                        eventType: 'response_saved',
                        promptUuid: PROMPT_UUID,
                        threadUuid: THREAD_UUID,
                        projectUuid: PROJECT_UUID,
                        agentUuid: AGENT_UUID,
                    },
                    prompt: 'Show revenue',
                    response: 'Revenue is order count.',
                    error_message: null,
                },
            ]);

            const result = await model.listReviewSignals({
                organizationUuid: ORGANIZATION_UUID,
            });

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(
                expect.objectContaining({
                    uuid: TURN_SIGNAL_UUID,
                    runUuid: RUN_UUID,
                    promptUuid: PROMPT_UUID,
                    signal: 'implicit_correction',
                    promotedToFinding: true,
                    prompt: 'Show revenue',
                    responsePreview: 'Revenue is order count.',
                    finding: expect.objectContaining({
                        uuid: TURN_SIGNAL_UUID,
                        reviewItemUuid: FINGERPRINT,
                        primaryRootCause: 'semantic_layer',
                    }),
                }),
            );
        });
    });

    describe('createTurnSignal', () => {
        it('persists a classified signal with inline finding fields', async () => {
            tracker.on.insert(AiAgentTurnSignalTableName).responseOnce([
                {
                    ai_agent_review_turn_signal_uuid: TURN_SIGNAL_UUID,
                },
            ]);

            const result = await model.createTurnSignal({
                runUuid: RUN_UUID,
                turnSignal,
                finding: {
                    primaryRootCause: 'semantic_layer',
                    secondaryRootCauses: ['project_context'],
                    subcategories: ['missing_dimension'],
                    fixTargets: ['semantic_yaml_patch'],
                    targetRefs: [
                        {
                            type: 'dimension',
                            modelName: 'airports',
                            dimensionName: 'country',
                        },
                    ],
                    evidenceExcerpts: [
                        {
                            source: 'next_user_prompt',
                            text: 'Country is not available here.',
                            redacted: false,
                        },
                    ],
                    recommendation: null,
                    reviewItem: {
                        fingerprint: FINGERPRINT,
                        title: 'Review airports.country',
                        description: 'Country needs semantic clarification.',
                        ownerType: 'semantic_layer_owner',
                    },
                },
            });

            expect(result).toBe(TURN_SIGNAL_UUID);
            expect(tracker.history.insert).toHaveLength(1);
        });
    });
});
