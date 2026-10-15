import {
    formatAiProjectContextObjectRef,
    getReviewItemProjectContextEntry,
    getReviewItemSkillProposal,
    getVisibleAiAgentReviewRootCauses,
    type AiAgentRecommendationAction,
    type AiAgentReviewItemPriority,
    type AiAgentReviewItemSummary,
    type AiAgentReviewItemWritebackBlockedReason,
    type AiAgentRootCause,
    type AiAgentTargetRef,
} from '@lightdash/common';
import i18n from '../../../../../i18n/i18n';

export const reviewRootCauseLabels: Record<AiAgentRootCause, string> = {
    get semantic_layer() {
        return i18n.t('reviews.rootCauses.semanticLayer', {
            ns: 'aiCopilotAdmin',
        });
    },
    get project_context() {
        return i18n.t('reviews.rootCauses.projectContext', {
            ns: 'aiCopilotAdmin',
        });
    },
    get agent_configuration() {
        return i18n.t('reviews.rootCauses.agentConfiguration', {
            ns: 'aiCopilotAdmin',
        });
    },
    get product_capability() {
        return i18n.t('reviews.rootCauses.productCapability', {
            ns: 'aiCopilotAdmin',
        });
    },
    get runtime_reliability() {
        return i18n.t('reviews.rootCauses.runtimeReliability', {
            ns: 'aiCopilotAdmin',
        });
    },
    get feedback_quality() {
        return i18n.t('reviews.rootCauses.feedbackQuality', {
            ns: 'aiCopilotAdmin',
        });
    },
    get not_a_failure() {
        return i18n.t('reviews.rootCauses.notAFailure', {
            ns: 'aiCopilotAdmin',
        });
    },
    get ambiguous() {
        return i18n.t('reviews.rootCauses.ambiguous', { ns: 'aiCopilotAdmin' });
    },
};

export const getRootCauseLabelKey = (rootCause: AiAgentRootCause): string =>
    `reviews.rootCauses.${rootCause.replace(/_([a-z])/g, (_, char: string) =>
        char.toUpperCase(),
    )}`;

// Every root cause a user can ever see or pick. Root causes the judge keeps
// assigning but the API never returns (product capability gaps) are dropped
// here, so no filter, legend or picker offers a category with nothing behind it.
export const SURFACED_ROOT_CAUSES = getVisibleAiAgentReviewRootCauses(
    Object.keys(reviewRootCauseLabels) as AiAgentRootCause[],
);

// Of the surfaced ones, which start selected in the board filter.
const DEFAULT_HIDDEN_ROOT_CAUSES: AiAgentRootCause[] = [
    'agent_configuration',
    'runtime_reliability',
];

export const DEFAULT_VISIBLE_ROOT_CAUSES = SURFACED_ROOT_CAUSES.filter(
    (rootCause) => !DEFAULT_HIDDEN_ROOT_CAUSES.includes(rootCause),
);

export const reviewRootCauseColors: Record<AiAgentRootCause, string> = {
    semantic_layer: 'indigo',
    project_context: 'violet',
    agent_configuration: 'cyan',
    product_capability: 'grape',
    runtime_reliability: 'red',
    feedback_quality: 'teal',
    not_a_failure: 'gray',
    ambiguous: 'gray',
};

export const reviewPriorityLabels: Record<AiAgentReviewItemPriority, string> = {
    get urgent() {
        return i18n.t('reviews.priorities.urgent', { ns: 'aiCopilotAdmin' });
    },
    get high() {
        return i18n.t('reviews.priorities.high', { ns: 'aiCopilotAdmin' });
    },
    get medium() {
        return i18n.t('reviews.priorities.medium', { ns: 'aiCopilotAdmin' });
    },
    get low() {
        return i18n.t('reviews.priorities.low', { ns: 'aiCopilotAdmin' });
    },
    get none() {
        return i18n.t('reviews.priorities.none', { ns: 'aiCopilotAdmin' });
    },
};

export const reviewPriorityColors: Record<AiAgentReviewItemPriority, string> = {
    urgent: 'red',
    high: 'orange',
    medium: 'yellow',
    low: 'blue',
    none: 'gray',
};

export const writebackBlockedReasonLabels: Record<
    AiAgentReviewItemWritebackBlockedReason,
    string
> = {
    get reviews_disabled() {
        return i18n.t('reviews.blockedReasons.reviewsDisabled', {
            ns: 'aiCopilotAdmin',
        });
    },
    get unsupported_root_cause() {
        return i18n.t('reviews.blockedReasons.unsupportedRootCause', {
            ns: 'aiCopilotAdmin',
        });
    },
    get missing_project() {
        return i18n.t('reviews.blockedReasons.missingProject', {
            ns: 'aiCopilotAdmin',
        });
    },
    get missing_agent() {
        return i18n.t('reviews.blockedReasons.missingAgent', {
            ns: 'aiCopilotAdmin',
        });
    },
    get missing_project_context_entry() {
        return i18n.t('reviews.blockedReasons.missingProjectContextEntry', {
            ns: 'aiCopilotAdmin',
        });
    },
    get project_context_disabled() {
        return i18n.t('reviews.blockedReasons.projectContextDisabled', {
            ns: 'aiCopilotAdmin',
        });
    },
    get insufficient_source_code_access() {
        return i18n.t('reviews.blockedReasons.insufficientSourceCodeAccess', {
            ns: 'aiCopilotAdmin',
        });
    },
    get unsupported_source_control() {
        return i18n.t('reviews.blockedReasons.unsupportedSourceControl', {
            ns: 'aiCopilotAdmin',
        });
    },
    get bitbucket_token_missing() {
        return i18n.t('reviews.blockedReasons.bitbucketTokenMissing', {
            ns: 'aiCopilotAdmin',
        });
    },
    get git_app_not_installed() {
        return i18n.t('reviews.blockedReasons.gitAppNotInstalled', {
            ns: 'aiCopilotAdmin',
        });
    },
    get missing_writeback_config() {
        return i18n.t('reviews.blockedReasons.missingWritebackConfig', {
            ns: 'aiCopilotAdmin',
        });
    },
    get pull_request_open() {
        return i18n.t('reviews.blockedReasons.pullRequestOpen', {
            ns: 'aiCopilotAdmin',
        });
    },
    get source_thread_writeback_exists() {
        return i18n.t('reviews.blockedReasons.sourceThreadWritebackExists', {
            ns: 'aiCopilotAdmin',
        });
    },
    get terminal_state() {
        return i18n.t('reviews.blockedReasons.terminalState', {
            ns: 'aiCopilotAdmin',
        });
    },
    get writeback_in_progress() {
        return i18n.t('reviews.blockedReasons.writebackInProgress', {
            ns: 'aiCopilotAdmin',
        });
    },
};

/**
 * One-line explanations of what a blocked reason means and how to unblock it.
 * Only the actionable reasons get a description; the rest fall back to the
 * short label alone.
 */
export const writebackBlockedReasonDescriptions: Partial<
    Record<AiAgentReviewItemWritebackBlockedReason, string>
> = {
    get unsupported_source_control() {
        return i18n.t(
            'reviews.blockedReasonDescriptions.unsupportedSourceControl',
            { ns: 'aiCopilotAdmin' },
        );
    },
    get reviews_disabled() {
        return i18n.t('reviews.blockedReasonDescriptions.reviewsDisabled', {
            ns: 'aiCopilotAdmin',
        });
    },
    get bitbucket_token_missing() {
        return i18n.t(
            'reviews.blockedReasonDescriptions.bitbucketTokenMissing',
            { ns: 'aiCopilotAdmin' },
        );
    },
    get git_app_not_installed() {
        return i18n.t('reviews.blockedReasonDescriptions.gitAppNotInstalled', {
            ns: 'aiCopilotAdmin',
        });
    },
    get project_context_disabled() {
        return i18n.t(
            'reviews.blockedReasonDescriptions.projectContextDisabled',
            { ns: 'aiCopilotAdmin' },
        );
    },
    get insufficient_source_code_access() {
        return i18n.t(
            'reviews.blockedReasonDescriptions.insufficientSourceCodeAccess',
            { ns: 'aiCopilotAdmin' },
        );
    },
    get missing_writeback_config() {
        return i18n.t(
            'reviews.blockedReasonDescriptions.missingWritebackConfig',
            { ns: 'aiCopilotAdmin' },
        );
    },
};

export const shouldShowWritebackBlockedReason = (
    reason: AiAgentReviewItemWritebackBlockedReason | null,
): reason is Exclude<
    AiAgentReviewItemWritebackBlockedReason,
    'unsupported_root_cause'
> => reason !== null && reason !== 'unsupported_root_cause';

const actionLabels: Record<AiAgentRecommendationAction, string> = {
    get update_semantic_yaml() {
        return i18n.t('reviews.actions.updateSemanticYaml', {
            ns: 'aiCopilotAdmin',
        });
    },
    get update_agent_instructions() {
        return i18n.t('reviews.actions.updateAgentInstructions', {
            ns: 'aiCopilotAdmin',
        });
    },
    get add_knowledge_document() {
        return i18n.t('reviews.actions.addKnowledgeDocument', {
            ns: 'aiCopilotAdmin',
        });
    },
    get enable_data_access() {
        return i18n.t('reviews.actions.enableDataAccess', {
            ns: 'aiCopilotAdmin',
        });
    },
    get enable_sql_mode() {
        return i18n.t('reviews.actions.enableSqlMode', {
            ns: 'aiCopilotAdmin',
        });
    },
    get enable_self_improvement() {
        return i18n.t('reviews.actions.enableSelfImprovement', {
            ns: 'aiCopilotAdmin',
        });
    },
    get configure_mcp_server() {
        return i18n.t('reviews.actions.configureMcpServer', {
            ns: 'aiCopilotAdmin',
        });
    },
    get adjust_explore_tags() {
        return i18n.t('reviews.actions.adjustExploreTags', {
            ns: 'aiCopilotAdmin',
        });
    },
    get update_access() {
        return i18n.t('reviews.actions.updateAccess', { ns: 'aiCopilotAdmin' });
    },
    get route_to_product_work() {
        return i18n.t('reviews.actions.routeToProductWork', {
            ns: 'aiCopilotAdmin',
        });
    },
    get request_more_evidence() {
        return i18n.t('reviews.actions.requestMoreEvidence', {
            ns: 'aiCopilotAdmin',
        });
    },
    get create_skill() {
        return i18n.t('reviews.actions.createSkill', { ns: 'aiCopilotAdmin' });
    },
    get no_action() {
        return i18n.t('reviews.actions.noAction', { ns: 'aiCopilotAdmin' });
    },
};

const camelCase = (value: string) =>
    value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

const tr = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`reviews.${key}`, { ns: 'aiCopilotAdmin', ...options });

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

/**
 * Coarse "last seen 2h ago" recency, falling back to an absolute date once the
 * finding is more than a week old (where relative phrasing stops being useful).
 */
export const formatRelativeReviewDate = (date: Date): string => {
    const parsedDate = new Date(date);
    const diffMs = new Date().getTime() - parsedDate.getTime();
    const diffMinutes = Math.floor(diffMs / 60_000);

    if (diffMinutes < 1) return tr('relative.justNow');
    if (diffMinutes < 60)
        return tr('relative.minutesAgo', { count: diffMinutes });

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return tr('relative.hoursAgo', { count: diffHours });

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return tr('relative.daysAgo', { count: diffDays });

    return formatReviewDate(parsedDate);
};

export const getTargetAnchor = (
    reviewItem: AiAgentReviewItemSummary,
): string | null => getTargetLabel(reviewItem.latestFinding?.targetRefs ?? []);

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

export const getReviewItemAgentUuid = (
    reviewItem: AiAgentReviewItemSummary,
): string | null =>
    reviewItem.latestFinding?.agentUuid ?? reviewItem.agentUuid ?? null;

export const getReviewItemProjectUuid = (
    reviewItem: AiAgentReviewItemSummary,
): string | null =>
    reviewItem.latestFinding?.projectUuid ?? reviewItem.projectUuid ?? null;

const isTriageReviewItem = (reviewItem: AiAgentReviewItemSummary): boolean =>
    reviewItem.source !== 'manual' &&
    (reviewItem.primaryRootCause === 'ambiguous' ||
        reviewItem.latestFinding?.fixTargets.includes('feedback_needed') ===
            true);

export const getIssueTitle = (reviewItem: AiAgentReviewItemSummary): string => {
    if (isTriageReviewItem(reviewItem)) {
        return tr('details.triageTitle');
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
        return tr('details.triageWhy');
    }

    if (reviewItem.source === 'manual') {
        return reviewItem.description || tr('details.manualWhy');
    }

    if (reviewItem.source === 'memory') {
        return reviewItem.nominationReason ?? reviewItem.description;
    }

    return (
        reviewItem.latestFinding?.recommendation?.rationale ??
        tr(`rootCauseJudged.${camelCase(reviewItem.primaryRootCause)}`)
    );
};

export const getReviewReasoningText = (
    reviewItem: AiAgentReviewItemSummary,
): string => {
    const skillProposal = getReviewItemSkillProposal(reviewItem);
    if (skillProposal) {
        return tr('details.proposedSkill', {
            why: getWhyText(reviewItem),
            name: skillProposal.name,
            description: skillProposal.description,
        });
    }

    const contextEntry = getReviewItemProjectContextEntry(reviewItem);

    if (contextEntry) {
        const objectRefs = contextEntry.objects
            .map(formatAiProjectContextObjectRef)
            .join(', ');
        const summary = tr(
            contextEntry.op === 'update'
                ? 'details.contextUpdates'
                : 'details.contextAdds',
            { content: contextEntry.content },
        );
        return `${summary}${
            objectRefs
                ? tr('details.contextObjects', { objects: objectRefs })
                : ''
        }`;
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

    return tr('details.review');
};

export const getSuggestedNextStep = (
    reviewItem: AiAgentReviewItemSummary,
): string => {
    if (isTriageReviewItem(reviewItem)) {
        return tr('details.triageNextStep');
    }

    if (reviewItem.latestFinding?.recommendation?.actionType === 'no_action') {
        return tr('details.noActionSuggested');
    }

    return getActionLabel(reviewItem);
};

export const getReviewSecondaryDetail = (
    reviewItem: AiAgentReviewItemSummary,
): string | null => {
    const contextEntry = getReviewItemProjectContextEntry(reviewItem);
    if (contextEntry) {
        return contextEntry.kind;
    }

    const subcategory = reviewItem.latestFinding?.subcategories[0];
    return subcategory ? subcategory.replaceAll('_', ' ') : null;
};
