import {
    type AiAgentRecommendationAction,
    type AiAgentReviewItemSummary,
    type AiAgentReviewItemWritebackBlockedReason,
    type AiAgentRootCause,
    type AiAgentTargetRef,
} from '@lightdash/common';

export const reviewRootCauseLabels: Record<AiAgentRootCause, string> = {
    semantic_layer: 'Semantic layer',
    project_context: 'Project context',
    agent_configuration: 'Agent config',
    data_gap: 'Data gap',
    product_capability: 'Product',
    runtime_reliability: 'Runtime',
    feedback_quality: 'Feedback',
    not_a_failure: 'Not failure',
    ambiguous: 'Ambiguous',
};

export const reviewRootCauseColors: Record<AiAgentRootCause, string> = {
    semantic_layer: 'indigo',
    project_context: 'violet',
    agent_configuration: 'cyan',
    data_gap: 'orange',
    product_capability: 'grape',
    runtime_reliability: 'red',
    feedback_quality: 'teal',
    not_a_failure: 'gray',
    ambiguous: 'gray',
};

export const writebackBlockedReasonLabels: Record<
    AiAgentReviewItemWritebackBlockedReason,
    string
> = {
    reviews_disabled: 'Reviews are not enabled for this organization',
    unsupported_root_cause: 'No writeback strategy for this root cause',
    missing_project: 'No project is linked to this finding',
    missing_project_context_entry: 'No project context entry was generated',
    project_context_disabled: 'Project context is not enabled',
    unsupported_source_control: 'Project is not connected to GitHub or GitLab',
    git_app_not_installed: 'Git app is not installed',
    missing_writeback_config: 'Writeback runtime is not configured',
    pull_request_open: 'A pull request is already open',
    terminal_state: 'Finding is already closed',
    writeback_in_progress: 'Writeback is already in progress',
};

export const shouldShowWritebackBlockedReason = (
    reason: AiAgentReviewItemWritebackBlockedReason | null,
): reason is Exclude<
    AiAgentReviewItemWritebackBlockedReason,
    'unsupported_root_cause'
> => reason !== null && reason !== 'unsupported_root_cause';

const actionLabels: Record<AiAgentRecommendationAction, string> = {
    update_semantic_yaml: 'Update semantic layer',
    update_agent_instructions: 'Update instructions',
    add_knowledge_document: 'Add knowledge doc',
    enable_data_access: 'Enable data access',
    enable_sql_mode: 'Enable SQL mode',
    enable_self_improvement: 'Enable self-improvement',
    configure_mcp_server: 'Configure MCP',
    adjust_explore_tags: 'Adjust explore tags',
    update_access: 'Update access',
    route_to_product_work: 'Route to product',
    request_more_evidence: 'Needs more evidence',
    no_action: 'No action',
};

export const getRecommendationActionLabel = (
    actionType: AiAgentRecommendationAction,
): string => actionLabels[actionType];

export const formatReviewDate = (date: Date): string => {
    const parsedDate = new Date(date);
    const now = new Date();
    const isCurrentYear = parsedDate.getFullYear() === now.getFullYear();

    return parsedDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(!isCurrentYear && { year: 'numeric' }),
    });
};

const getTargetLabel = (targetRefs: AiAgentTargetRef[]): string | null => {
    const targetRef = targetRefs[0];
    if (!targetRef) return null;

    switch (targetRef.type) {
        case 'dimension':
            return `${targetRef.modelName}.${targetRef.dimensionName}`;
        case 'metric':
            return `${targetRef.modelName}.${targetRef.metricName}`;
        case 'model':
            return targetRef.modelName;
        case 'explore':
            return `${targetRef.modelName}.${targetRef.exploreName}`;
        case 'join':
            return `${targetRef.modelName}.${targetRef.joinName}`;
        case 'agent_config':
            return targetRef.setting.replaceAll('_', ' ');
        case 'product_capability':
            return targetRef.capabilityKey;
        case 'runtime':
            return targetRef.key;
        default:
            return null;
    }
};

const isTriageReviewItem = (reviewItem: AiAgentReviewItemSummary): boolean =>
    reviewItem.primaryRootCause === 'ambiguous' ||
    reviewItem.latestFinding?.fixTargets.includes('feedback_needed') === true;

export const getIssueTitle = (reviewItem: AiAgentReviewItemSummary): string => {
    if (isTriageReviewItem(reviewItem)) {
        return 'Triage correction signal';
    }

    const targetLabel = getTargetLabel(
        reviewItem.latestFinding?.targetRefs ?? [],
    );
    if (targetLabel && reviewItem.primaryRootCause === 'semantic_layer') {
        return `Review ${targetLabel}`;
    }

    return reviewItem.latestFinding?.recommendation?.title ?? reviewItem.title;
};

export const getWhatHappened = (
    reviewItem: AiAgentReviewItemSummary,
): string => {
    const evidence = reviewItem.latestFinding?.evidenceExcerpts ?? [];
    const correction =
        evidence.find((excerpt) => excerpt.source === 'next_user_prompt')
            ?.text ??
        evidence.find((excerpt) => excerpt.source === 'user_prompt')?.text;

    return correction ?? reviewItem.description;
};

export const getCompactIssueTitle = (
    reviewItem: AiAgentReviewItemSummary,
): string => {
    const title = getIssueTitle(reviewItem).replace(/ join on .+$/i, '');
    return title.length > 72 ? `${title.slice(0, 69).trimEnd()}...` : title;
};

export const getWhyText = (reviewItem: AiAgentReviewItemSummary): string => {
    if (isTriageReviewItem(reviewItem)) {
        return 'Could be a real failure or a normal change in user intent.';
    }

    return (
        reviewItem.latestFinding?.recommendation?.rationale ??
        `Review agent judged this as ${reviewRootCauseLabels[reviewItem.primaryRootCause].toLowerCase()}.`
    );
};

export const getReviewReasoningText = (
    reviewItem: AiAgentReviewItemSummary,
): string => {
    const contextEntry = reviewItem.latestFinding?.projectContextEntry ?? null;

    if (contextEntry) {
        return `${
            contextEntry.op === 'update' ? 'Updates' : 'Adds'
        } project context: ${contextEntry.content}`;
    }

    return getWhyText(reviewItem);
};

export const getActionLabel = (
    reviewItem: AiAgentReviewItemSummary,
): string => {
    const recommendation = reviewItem.latestFinding?.recommendation;
    if (recommendation) {
        return getRecommendationActionLabel(recommendation.actionType);
    }

    const fixTarget = reviewItem.latestFinding?.fixTargets[0];
    if (fixTarget) {
        return fixTarget.replaceAll('_', ' ');
    }

    return 'Review';
};

export const getSuggestedNextStep = (
    reviewItem: AiAgentReviewItemSummary,
): string => {
    const action = getActionLabel(reviewItem);

    if (isTriageReviewItem(reviewItem)) {
        return 'Review the backing thread before deciding whether this is actionable.';
    }

    if (action === 'No action') {
        return 'No action suggested.';
    }

    return action;
};

export const getReviewSecondaryDetail = (
    reviewItem: AiAgentReviewItemSummary,
): string | null => {
    const contextEntry = reviewItem.latestFinding?.projectContextEntry ?? null;
    if (contextEntry) {
        return contextEntry.kind;
    }

    const subcategory = reviewItem.latestFinding?.subcategories[0];
    return subcategory ? subcategory.replaceAll('_', ' ') : null;
};
