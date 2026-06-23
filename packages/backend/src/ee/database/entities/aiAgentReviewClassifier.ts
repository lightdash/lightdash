import type {
    AiAgentConfigSnapshot,
    AiAgentEvidenceExcerpt,
    AiAgentFixTarget,
    AiAgentImplicitSignalSource,
    AiAgentInteractionSource,
    AiAgentJudgeProjectContextEntry,
    AiAgentModelMetadata,
    AiAgentRecommendation,
    AiAgentReviewClassifierConfidence,
    AiAgentReviewClassifierRunScope,
    AiAgentReviewClassifierRunStatus,
    AiAgentReviewItemDismissedReason,
    AiAgentReviewItemOwnerType,
    AiAgentReviewItemPrState,
    AiAgentReviewItemStatus,
    AiAgentReviewItemWritebackStatus,
    AiAgentReviewRemediationEventDetail,
    AiAgentReviewRemediationEventType,
    AiAgentReviewRemediationStatus,
    AiAgentRootCause,
    AiAgentRuntimeContextSnapshot,
    AiAgentTargetRef,
    AiAgentTurnSignal,
    AiAgentTurnSignalSourceRef,
} from '@lightdash/common';
import { Knex } from 'knex';

export const AiAgentReviewClassifierRunTableName = 'ai_agent_review_run';

export type DbAiAgentReviewClassifierRun = {
    ai_agent_review_run_uuid: string;
    organization_uuid: string;
    status: AiAgentReviewClassifierRunStatus;
    review_agent_version: string;
    judge_prompt_hash: string;
    agent_config_snapshot_hash: string | null;
    agent_config_snapshot: AiAgentConfigSnapshot | null;
    agent_config_snapshot_agent_updated_at: Date | null;
    run_scope: AiAgentReviewClassifierRunScope;
    total_turns: number;
    processed_turns: number;
    signal_count: number;
    finding_count: number;
    review_item_count: number;
    error_message: string | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentReviewClassifierRunTable = Knex.CompositeTableType<
    DbAiAgentReviewClassifierRun,
    Pick<
        DbAiAgentReviewClassifierRun,
        | 'organization_uuid'
        | 'review_agent_version'
        | 'judge_prompt_hash'
        | 'run_scope'
    > &
        Partial<
            Pick<
                DbAiAgentReviewClassifierRun,
                | 'agent_config_snapshot_hash'
                | 'agent_config_snapshot'
                | 'agent_config_snapshot_agent_updated_at'
                | 'status'
                | 'total_turns'
                | 'processed_turns'
                | 'signal_count'
                | 'finding_count'
                | 'review_item_count'
                | 'error_message'
                | 'completed_at'
            >
        >,
    Partial<
        Pick<
            DbAiAgentReviewClassifierRun,
            | 'status'
            | 'total_turns'
            | 'processed_turns'
            | 'signal_count'
            | 'finding_count'
            | 'review_item_count'
            | 'error_message'
            | 'completed_at'
        >
    > & {
        updated_at?: Date | Knex.Raw;
    }
>;

export const AiAgentTurnSignalTableName = 'ai_agent_review_turn_signal';

export type DbAiAgentTurnSignal = {
    ai_agent_review_turn_signal_uuid: string;
    ai_agent_review_run_uuid: string;
    ai_prompt_uuid: string;
    ai_thread_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    agent_uuid: string;
    interaction_source: AiAgentInteractionSource;
    source_ref: AiAgentTurnSignalSourceRef;
    signal: AiAgentTurnSignal;
    implicit_signal_sources: AiAgentImplicitSignalSource[];
    confidence: AiAgentReviewClassifierConfidence;
    promoted_to_finding: boolean;
    promotion_reason: string | null;
    tool_evidence_refs: string[];
    fingerprint: string | null;
    primary_root_cause: AiAgentRootCause | null;
    secondary_root_causes: AiAgentRootCause[] | null;
    subcategories: string[] | null;
    fix_targets: AiAgentFixTarget[] | null;
    target_refs: AiAgentTargetRef[] | null;
    evidence_excerpts: AiAgentEvidenceExcerpt[] | null;
    recommendation: AiAgentRecommendation | null;
    project_context_entry: AiAgentJudgeProjectContextEntry | null;
    owner_type: AiAgentReviewItemOwnerType | null;
    review_item_title: string | null;
    review_item_description: string | null;
    runtime_context_snapshot: AiAgentRuntimeContextSnapshot;
    model_metadata: AiAgentModelMetadata;
    created_at: Date;
};

export type AiAgentTurnSignalTable = Knex.CompositeTableType<
    DbAiAgentTurnSignal,
    Omit<
        DbAiAgentTurnSignal,
        | 'ai_agent_review_turn_signal_uuid'
        | 'created_at'
        | 'promoted_to_finding'
        | 'promotion_reason'
        | 'fingerprint'
        | 'primary_root_cause'
        | 'secondary_root_causes'
        | 'subcategories'
        | 'fix_targets'
        | 'target_refs'
        | 'evidence_excerpts'
        | 'recommendation'
        | 'project_context_entry'
        | 'owner_type'
        | 'review_item_title'
        | 'review_item_description'
    > &
        Partial<
            Pick<
                DbAiAgentTurnSignal,
                | 'promoted_to_finding'
                | 'promotion_reason'
                | 'fingerprint'
                | 'primary_root_cause'
                | 'secondary_root_causes'
                | 'subcategories'
                | 'fix_targets'
                | 'target_refs'
                | 'evidence_excerpts'
                | 'recommendation'
                | 'project_context_entry'
                | 'owner_type'
                | 'review_item_title'
                | 'review_item_description'
            >
        >,
    Partial<
        Pick<DbAiAgentTurnSignal, 'promoted_to_finding' | 'promotion_reason'>
    >
>;

export const AiAgentReviewItemTableName = 'ai_agent_review_item';
export const AiAgentReviewRemediationTableName = 'ai_agent_review_remediation';
export const AiAgentReviewRemediationEventsTableName =
    'ai_agent_review_remediation_events';

export type DbAiAgentReviewRemediationEvent = {
    ai_agent_review_remediation_event_uuid: string;
    ai_agent_review_remediation_uuid: string;
    organization_uuid: string;
    event_type: AiAgentReviewRemediationEventType;
    occurred_at: Date;
    payload: AiAgentReviewRemediationEventDetail['payload'];
    created_by_user_uuid: string | null;
    created_at: Date;
};

export type AiAgentReviewRemediationEventsTable = Knex.CompositeTableType<
    DbAiAgentReviewRemediationEvent,
    Pick<
        DbAiAgentReviewRemediationEvent,
        | 'ai_agent_review_remediation_uuid'
        | 'organization_uuid'
        | 'event_type'
        | 'occurred_at'
    > &
        Partial<
            Pick<
                DbAiAgentReviewRemediationEvent,
                'payload' | 'created_by_user_uuid'
            >
        >,
    never
>;

export type DbAiAgentReviewItem = {
    ai_agent_review_item_uuid: string;
    fingerprint: string;
    organization_uuid: string;
    project_uuid: string | null;
    agent_uuid: string | null;
    status: AiAgentReviewItemStatus;
    dismissed_reason: AiAgentReviewItemDismissedReason | null;
    assigned_to_user_uuid: string | null;
    linked_issue_url: string | null;
    linked_pr_url: string | null;
    pr_writeback_thread_uuid: string | null;
    pr_state: AiAgentReviewItemPrState | null;
    pr_writeback_status: AiAgentReviewItemWritebackStatus | null;
    pr_writeback_message: string | null;
    status_updated_at: Date | null;
    status_updated_by_user_uuid: string | null;
    board_position: number | null;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentReviewItemTable = Knex.CompositeTableType<
    DbAiAgentReviewItem,
    Pick<
        DbAiAgentReviewItem,
        'fingerprint' | 'organization_uuid' | 'project_uuid' | 'agent_uuid'
    > &
        Partial<
            Omit<
                DbAiAgentReviewItem,
                | 'ai_agent_review_item_uuid'
                | 'created_at'
                | 'updated_at'
                | 'fingerprint'
                | 'organization_uuid'
                | 'project_uuid'
                | 'agent_uuid'
            >
        >,
    Partial<
        Omit<
            DbAiAgentReviewItem,
            'ai_agent_review_item_uuid' | 'fingerprint' | 'created_at'
        >
    >
>;

export type DbAiAgentReviewRemediation = {
    ai_agent_review_remediation_uuid: string;
    fingerprint: string;
    organization_uuid: string;
    source_ai_agent_review_turn_signal_uuid: string;
    source_prompt_uuid: string;
    source_thread_uuid: string;
    source_project_uuid: string;
    source_agent_uuid: string;
    work_thread_uuid: string | null;
    pull_request_uuid: string | null;
    preview_project_uuid: string | null;
    preview_agent_uuid: string | null;
    preview_thread_uuid: string | null;
    status: AiAgentReviewRemediationStatus;
    error_message: string | null;
    retry_prompt: string | null;
    created_by_user_uuid: string | null;
    resolved_by_user_uuid: string | null;
    resolved_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentReviewRemediationTable = Knex.CompositeTableType<
    DbAiAgentReviewRemediation,
    Pick<
        DbAiAgentReviewRemediation,
        | 'fingerprint'
        | 'organization_uuid'
        | 'source_ai_agent_review_turn_signal_uuid'
        | 'source_prompt_uuid'
        | 'source_thread_uuid'
        | 'source_project_uuid'
        | 'source_agent_uuid'
    > &
        Partial<
            Omit<
                DbAiAgentReviewRemediation,
                | 'ai_agent_review_remediation_uuid'
                | 'created_at'
                | 'updated_at'
                | 'fingerprint'
                | 'organization_uuid'
                | 'source_ai_agent_review_turn_signal_uuid'
                | 'source_prompt_uuid'
                | 'source_thread_uuid'
                | 'source_project_uuid'
                | 'source_agent_uuid'
            >
        >,
    Partial<
        Omit<
            DbAiAgentReviewRemediation,
            'ai_agent_review_remediation_uuid' | 'fingerprint' | 'created_at'
        >
    >
>;
