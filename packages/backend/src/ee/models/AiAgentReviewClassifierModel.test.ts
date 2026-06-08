import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    AiAgentReviewClassifierRunTableName,
    AiAgentReviewItemTableName,
    AiAgentReviewRemediationTableName,
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
const REMEDIATION_UUID = '00000000-0000-0000-0000-000000000010';
const PULL_REQUEST_UUID = '00000000-0000-0000-0000-000000000011';
const PREVIEW_PROJECT_UUID = '00000000-0000-0000-0000-000000000012';
const PREVIEW_AGENT_UUID = '00000000-0000-0000-0000-000000000013';
const PREVIEW_THREAD_UUID = '00000000-0000-0000-0000-000000000014';
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

const makeRemediationRow = (
    overrides: Partial<Record<string, unknown>> = {},
) => ({
    ai_agent_review_remediation_uuid: REMEDIATION_UUID,
    fingerprint: FINGERPRINT,
    organization_uuid: ORGANIZATION_UUID,
    source_ai_agent_review_turn_signal_uuid: TURN_SIGNAL_UUID,
    source_prompt_uuid: PROMPT_UUID,
    source_thread_uuid: THREAD_UUID,
    source_project_uuid: PROJECT_UUID,
    source_agent_uuid: AGENT_UUID,
    pull_request_uuid: PULL_REQUEST_UUID,
    linked_pr_url: 'https://github.com/acme/dbt/pull/42',
    preview_project_uuid: PREVIEW_PROJECT_UUID,
    preview_agent_uuid: PREVIEW_AGENT_UUID,
    preview_thread_uuid: PREVIEW_THREAD_UUID,
    status: 'preview_ready',
    error_message: null,
    retry_prompt: 'Show revenue',
    created_by_user_uuid: null,
    resolved_by_user_uuid: null,
    resolved_at: null,
    created_at: SEEN_AT,
    updated_at: SEEN_AT,
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
                {
                    fingerprint: FINGERPRINT,
                    first_seen_at: new Date('2026-05-26T09:00:00.000Z'),
                    last_seen_at: SEEN_AT,
                    finding_count: '2',
                },
            ]);
            tracker.on
                .select(AiAgentTurnSignalTableName)
                .responseOnce([makeTurnSignalRow()]);
            tracker.on.select(AiAgentReviewItemTableName).responseOnce([]);
            tracker.on
                .select(AiAgentReviewRemediationTableName)
                .responseOnce([]);

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
                    linkedPrUrl: null,
                    prState: null,
                    remediation: null,
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

        it('overlays persisted human state and PR linkage onto the projection', async () => {
            tracker.on.select(AiAgentTurnSignalTableName).responseOnce([
                {
                    fingerprint: FINGERPRINT,
                    first_seen_at: SEEN_AT,
                    last_seen_at: SEEN_AT,
                    finding_count: '1',
                },
            ]);
            tracker.on
                .select(AiAgentTurnSignalTableName)
                .responseOnce([makeTurnSignalRow()]);
            tracker.on.select(AiAgentReviewItemTableName).responseOnce([
                {
                    ai_agent_review_item_uuid:
                        '00000000-0000-0000-0000-000000000099',
                    fingerprint: FINGERPRINT,
                    organization_uuid: ORGANIZATION_UUID,
                    project_uuid: PROJECT_UUID,
                    agent_uuid: AGENT_UUID,
                    status: 'resolved',
                    dismissed_reason: null,
                    assigned_to_user_uuid: null,
                    linked_issue_url: null,
                    linked_pr_url: 'https://github.com/acme/dbt/pull/42',
                    pr_writeback_thread_uuid: null,
                    pr_state: 'merged',
                    status_updated_at: new Date('2026-05-28T10:00:00.000Z'),
                    status_updated_by_user_uuid: null,
                    created_at: SEEN_AT,
                    updated_at: SEEN_AT,
                },
            ]);
            tracker.on
                .select(AiAgentReviewRemediationTableName)
                .responseOnce([]);

            const result = await model.listReviewItems({
                organizationUuid: ORGANIZATION_UUID,
            });

            expect(result[0]).toEqual(
                expect.objectContaining({
                    status: 'resolved',
                    linkedPrUrl: 'https://github.com/acme/dbt/pull/42',
                    prState: 'merged',
                    remediation: null,
                }),
            );
        });

        it('overlays the latest remediation onto the projection', async () => {
            tracker.on.select(AiAgentTurnSignalTableName).responseOnce([
                {
                    fingerprint: FINGERPRINT,
                    first_seen_at: SEEN_AT,
                    last_seen_at: SEEN_AT,
                    finding_count: '1',
                },
            ]);
            tracker.on
                .select(AiAgentTurnSignalTableName)
                .responseOnce([makeTurnSignalRow()]);
            tracker.on.select(AiAgentReviewItemTableName).responseOnce([]);
            tracker.on
                .select(AiAgentReviewRemediationTableName)
                .responseOnce([makeRemediationRow()]);

            const result = await model.listReviewItems({
                organizationUuid: ORGANIZATION_UUID,
            });

            expect(result[0].remediation).toEqual(
                expect.objectContaining({
                    uuid: REMEDIATION_UUID,
                    fingerprint: FINGERPRINT,
                    status: 'preview_ready',
                    pullRequestUuid: PULL_REQUEST_UUID,
                    linkedPrUrl: 'https://github.com/acme/dbt/pull/42',
                    previewProjectUuid: PREVIEW_PROJECT_UUID,
                    previewAgentUuid: PREVIEW_AGENT_UUID,
                    previewThreadUuid: PREVIEW_THREAD_UUID,
                    retryPrompt: 'Show revenue',
                }),
            );
        });

        it('filters by overlaid status', async () => {
            tracker.on.select(AiAgentTurnSignalTableName).responseOnce([]);

            const result = await model.listReviewItems({
                organizationUuid: ORGANIZATION_UUID,
                statuses: ['resolved'],
            });

            expect(result).toHaveLength(0);
        });
    });

    describe('review remediations', () => {
        it('creates a remediation for a review item finding', async () => {
            tracker.on.insert(AiAgentReviewRemediationTableName).responseOnce([
                makeRemediationRow({
                    pull_request_uuid: null,
                    linked_pr_url: undefined,
                }),
            ]);

            const result = await model.createReviewRemediation({
                fingerprint: FINGERPRINT,
                organizationUuid: ORGANIZATION_UUID,
                sourceFindingUuid: TURN_SIGNAL_UUID,
                sourcePromptUuid: PROMPT_UUID,
                sourceThreadUuid: THREAD_UUID,
                sourceProjectUuid: PROJECT_UUID,
                sourceAgentUuid: AGENT_UUID,
                retryPrompt: 'Show revenue',
                createdByUserUuid: null,
            });

            expect(result).toEqual(
                expect.objectContaining({
                    uuid: REMEDIATION_UUID,
                    fingerprint: FINGERPRINT,
                    sourceFindingUuid: TURN_SIGNAL_UUID,
                    sourcePromptUuid: PROMPT_UUID,
                    sourceThreadUuid: THREAD_UUID,
                    sourceProjectUuid: PROJECT_UUID,
                    sourceAgentUuid: AGENT_UUID,
                    linkedPrUrl: null,
                    retryPrompt: 'Show revenue',
                }),
            );
        });

        it('links PR and preview thread state onto a remediation', async () => {
            tracker.on
                .update(AiAgentReviewRemediationTableName)
                .responseOnce([]);
            tracker.on
                .update(AiAgentReviewRemediationTableName)
                .responseOnce([]);

            await model.setReviewRemediationPullRequest({
                remediationUuid: REMEDIATION_UUID,
                organizationUuid: ORGANIZATION_UUID,
                pullRequestUuid: PULL_REQUEST_UUID,
            });
            await model.setReviewRemediationPreviewThread({
                remediationUuid: REMEDIATION_UUID,
                organizationUuid: ORGANIZATION_UUID,
                previewProjectUuid: PREVIEW_PROJECT_UUID,
                previewAgentUuid: PREVIEW_AGENT_UUID,
                previewThreadUuid: PREVIEW_THREAD_UUID,
            });

            expect(tracker.history.update).toHaveLength(2);
            expect(tracker.history.update[0].bindings).toContain(
                PULL_REQUEST_UUID,
            );
            expect(tracker.history.update[1].bindings).toEqual(
                expect.arrayContaining([
                    PREVIEW_PROJECT_UUID,
                    PREVIEW_AGENT_UUID,
                    PREVIEW_THREAD_UUID,
                ]),
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
            tracker.on.any(/pg_advisory_xact_lock/).response([]);
            tracker.on.select(AiAgentTurnSignalTableName).responseOnce([]);
            tracker.on.delete(AiAgentTurnSignalTableName).responseOnce(0);
            tracker.on.insert(AiAgentTurnSignalTableName).responseOnce([
                {
                    ai_agent_review_turn_signal_uuid: TURN_SIGNAL_UUID,
                },
            ]);
            tracker.on.insert(AiAgentReviewItemTableName).responseOnce([]);

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
                    projectContextEntry: null,
                    reviewItem: {
                        fingerprint: FINGERPRINT,
                        title: 'Review airports.country',
                        description: 'Country needs semantic clarification.',
                        ownerType: 'semantic_layer_owner',
                    },
                },
            });

            expect(result).toBe(TURN_SIGNAL_UUID);
            // Supersede: the turn's prior signal is deleted before the new one
            // is inserted (one current signal per turn).
            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.delete[0].sql).toContain(
                AiAgentTurnSignalTableName,
            );
            expect(tracker.history.insert).toHaveLength(2);
            expect(tracker.history.insert[1].sql).toContain(
                AiAgentReviewItemTableName,
            );
            // The supersede + item write are serialized behind a per-turn
            // advisory lock so concurrent re-reviews cannot clobber each other.
            expect(
                [
                    ...tracker.history.select,
                    ...(tracker.history.any ?? []),
                ].some((q) => q.sql.includes('pg_advisory_xact_lock')),
            ).toBe(true);
        });

        it('does not upsert a review item when the turn is not promoted', async () => {
            tracker.on.any(/pg_advisory_xact_lock/).response([]);
            tracker.on.select(AiAgentTurnSignalTableName).responseOnce([]);
            tracker.on.delete(AiAgentTurnSignalTableName).responseOnce(0);
            tracker.on.insert(AiAgentTurnSignalTableName).responseOnce([
                {
                    ai_agent_review_turn_signal_uuid: TURN_SIGNAL_UUID,
                },
            ]);

            await model.createTurnSignal({
                runUuid: RUN_UUID,
                turnSignal: { ...turnSignal, promotedToFinding: false },
                finding: null,
            });

            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.insert[0].sql).toContain(
                AiAgentTurnSignalTableName,
            );
        });

        it('removes a now-orphaned pristine review item when a re-review drops the finding', async () => {
            const ORPHAN_FINGERPRINT = 'ai_agent_review_item:orphan';
            tracker.on.any(/pg_advisory_xact_lock/).response([]);
            const supersededSelect = tracker.on.select(
                AiAgentTurnSignalTableName,
            );
            // 1st select: fingerprints being superseded. 2nd: which remain backed.
            supersededSelect.responseOnce([
                { fingerprint: ORPHAN_FINGERPRINT },
            ]);
            supersededSelect.responseOnce([]);
            tracker.on.delete(AiAgentTurnSignalTableName).responseOnce(1);
            tracker.on
                .insert(AiAgentTurnSignalTableName)
                .responseOnce([
                    { ai_agent_review_turn_signal_uuid: TURN_SIGNAL_UUID },
                ]);
            tracker.on.delete(AiAgentReviewItemTableName).responseOnce(1);

            await model.createTurnSignal({
                runUuid: RUN_UUID,
                turnSignal: { ...turnSignal, promotedToFinding: false },
                finding: null,
            });

            // No new item is written (the re-review is not a finding) ...
            expect(tracker.history.insert).toHaveLength(1);
            // ... and the orphaned item is deleted, guarded to pristine rows.
            const itemDeletes = tracker.history.delete.filter((q) =>
                q.sql.includes(AiAgentReviewItemTableName),
            );
            expect(itemDeletes).toHaveLength(1);
            expect(itemDeletes[0].sql).toContain('status');
            expect(itemDeletes[0].sql).toContain('assigned_to_user_uuid');
            expect(itemDeletes[0].sql).toContain('linked_pr_url');
            expect(itemDeletes[0].bindings).toContain(ORPHAN_FINGERPRINT);
        });

        it('keeps the review item when the finding is unchanged across a re-review', async () => {
            tracker.on.any(/pg_advisory_xact_lock/).response([]);
            // Superseded fingerprint equals the new one → not an orphan.
            tracker.on
                .select(AiAgentTurnSignalTableName)
                .responseOnce([{ fingerprint: FINGERPRINT }]);
            tracker.on.delete(AiAgentTurnSignalTableName).responseOnce(1);
            tracker.on
                .insert(AiAgentTurnSignalTableName)
                .responseOnce([
                    { ai_agent_review_turn_signal_uuid: TURN_SIGNAL_UUID },
                ]);
            tracker.on.insert(AiAgentReviewItemTableName).responseOnce([]);

            await model.createTurnSignal({
                runUuid: RUN_UUID,
                turnSignal,
                finding: {
                    primaryRootCause: 'semantic_layer',
                    secondaryRootCauses: [],
                    subcategories: [],
                    fixTargets: [],
                    targetRefs: [],
                    evidenceExcerpts: [],
                    recommendation: null,
                    projectContextEntry: null,
                    reviewItem: {
                        fingerprint: FINGERPRINT,
                        title: 'Review airports.country',
                        description: 'Country needs semantic clarification.',
                        ownerType: 'semantic_layer_owner',
                    },
                },
            });

            // The item is re-touched (upsert), never deleted, since the
            // fingerprint is stable across the re-review.
            expect(
                tracker.history.delete.filter((q) =>
                    q.sql.includes(AiAgentReviewItemTableName),
                ),
            ).toHaveLength(0);
        });
    });

    describe('getPromotedFingerprintScope', () => {
        it('returns the latest promoted signal scope for a fingerprint', async () => {
            tracker.on
                .select(AiAgentTurnSignalTableName)
                .responseOnce([
                    { project_uuid: PROJECT_UUID, agent_uuid: AGENT_UUID },
                ]);

            const scope = await model.getPromotedFingerprintScope(
                ORGANIZATION_UUID,
                FINGERPRINT,
            );

            expect(scope).toEqual({
                projectUuid: PROJECT_UUID,
                agentUuid: AGENT_UUID,
            });
        });

        it('returns null when no promoted signal matches', async () => {
            tracker.on.select(AiAgentTurnSignalTableName).responseOnce([]);

            const scope = await model.getPromotedFingerprintScope(
                ORGANIZATION_UUID,
                FINGERPRINT,
            );

            expect(scope).toBeNull();
        });
    });

    describe('upsertReviewItemState', () => {
        it('upserts state by fingerprint with an on-conflict merge', async () => {
            tracker.on.insert(AiAgentReviewItemTableName).responseOnce([]);

            await model.upsertReviewItemState({
                fingerprint: FINGERPRINT,
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
                agentUuid: AGENT_UUID,
                status: 'dismissed',
                dismissedReason: 'expected_behavior',
                statusUpdatedByUserUuid: '00000000-0000-0000-0000-0000000000aa',
            });

            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.insert[0].sql).toContain('on conflict');
            expect(tracker.history.insert[0].sql).toContain(
                AiAgentReviewItemTableName,
            );
        });
    });

    describe('setReviewItemWritebackStatus', () => {
        it('upserts writeback status and message by fingerprint', async () => {
            tracker.on.insert(AiAgentReviewItemTableName).responseOnce([]);

            await model.setReviewItemWritebackStatus({
                fingerprint: FINGERPRINT,
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
                agentUuid: AGENT_UUID,
                status: 'running',
                message: 'Discovering models',
            });

            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.insert[0].sql).toContain('on conflict');
            expect(tracker.history.insert[0].bindings).toContain(
                'Discovering models',
            );
        });
    });

    describe('updateReviewItemWritebackProgress', () => {
        it('guards against resurrecting a terminal row', async () => {
            tracker.on.update(AiAgentReviewItemTableName).responseOnce(0);

            await model.updateReviewItemWritebackProgress({
                fingerprint: FINGERPRINT,
                organizationUuid: ORGANIZATION_UUID,
                message: 'Starting sandbox',
            });

            expect(tracker.history.update).toHaveLength(1);
            const sql = tracker.history.update[0].sql.toLowerCase();
            expect(sql).toContain('not in');
            expect(tracker.history.update[0].bindings).toContain('completed');
            expect(tracker.history.update[0].bindings).toContain('failed');
        });
    });

    describe('reconcileReviewItemPrState', () => {
        it('updates status and pr_state for a fingerprint in the org', async () => {
            tracker.on.update(AiAgentReviewItemTableName).responseOnce(1);

            await model.reconcileReviewItemPrState({
                fingerprint: FINGERPRINT,
                organizationUuid: ORGANIZATION_UUID,
                status: 'resolved',
                prState: 'merged',
            });

            expect(tracker.history.update).toHaveLength(1);
            expect(tracker.history.update[0].sql).toContain(
                AiAgentReviewItemTableName,
            );
            expect(tracker.history.update[0].bindings).toContain('resolved');
            expect(tracker.history.update[0].bindings).toContain('merged');
        });
    });
});
