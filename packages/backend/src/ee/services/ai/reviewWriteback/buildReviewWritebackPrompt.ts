import {
    assertUnreachable,
    type AiAgentReviewItemSummary,
    type AiAgentSemanticTargetRef,
    type AiAgentTargetRef,
} from '@lightdash/common';

/**
 * Output of a review-writeback strategy. `aggregationKey` is null for one-shot
 * PRs (semantic_layer) and set for cumulative living-document flows that resume
 * an existing writeback thread (e.g. project_context).
 */
export type ReviewWritebackPlan = {
    promptText: string;
    aggregationKey: string | null;
};

const formatSemanticTargetRef = (ref: AiAgentSemanticTargetRef): string => {
    switch (ref.type) {
        case 'model':
            return `model "${ref.modelName}"`;
        case 'explore':
            return `explore "${ref.exploreName}" on model "${ref.modelName}"`;
        case 'join':
            return `join "${ref.joinName}" on model "${ref.modelName}"`;
        case 'dimension':
            return `dimension "${ref.modelName}.${ref.dimensionName}"`;
        case 'metric':
            return `metric "${ref.modelName}.${ref.metricName}"`;
        case 'additional_dimension':
            return `additional dimension "${ref.modelName}.${ref.parentDimensionName}.${ref.dimensionName}"`;
        case 'required_filter':
            return `required filter on "${ref.modelName}.${ref.fieldName}" in explore "${ref.exploreName}"`;
        case 'ai_hint':
            return `ai_hint on ${ref.targetType} "${ref.modelName}.${ref.targetName}"`;
        default:
            return assertUnreachable(ref, 'Unknown semantic target ref type');
    }
};

const isSemanticTargetRef = (
    ref: AiAgentTargetRef,
): ref is AiAgentSemanticTargetRef =>
    ref.type !== 'agent' &&
    ref.type !== 'agent_config' &&
    ref.type !== 'product_capability' &&
    ref.type !== 'runtime';

const buildSemanticLayerWritebackPrompt = (
    item: AiAgentReviewItemSummary,
): ReviewWritebackPlan => {
    const finding = item.latestFinding;
    const targetLines = (finding?.targetRefs ?? [])
        .filter(isSemanticTargetRef)
        .map((ref) => `- ${formatSemanticTargetRef(ref)}`);
    const evidenceLines = (finding?.evidenceExcerpts ?? []).map(
        (excerpt) => `- (${excerpt.source}) "${excerpt.text}"`,
    );
    const recommendation = finding?.recommendation ?? null;

    const sections = [
        'You are improving the dbt/Lightdash semantic layer YAML to fix a recurring issue surfaced by AI agent review. Make the smallest change that resolves it.',
        `Issue: ${item.title}`,
        item.description ? item.description : null,
        recommendation
            ? `Recommended change: ${recommendation.title}\nRationale: ${recommendation.rationale}`
            : null,
        targetLines.length > 0
            ? `Target(s) to edit:\n${targetLines.join('\n')}`
            : null,
        evidenceLines.length > 0
            ? `Evidence from the conversation:\n${evidenceLines.join('\n')}`
            : null,
        'Apply the change by updating field descriptions, ai_hint, or labels, or by adding a missing field/metric as appropriate. Do not change SQL logic or unrelated fields. Open a pull request describing the change and referencing this review finding.',
    ].filter((section): section is string => section !== null);

    return {
        promptText: sections.join('\n\n'),
        aggregationKey: null,
    };
};

/**
 * Per-root-cause strategy dispatcher. Only semantic_layer is implemented today;
 * other root causes (e.g. project_context living document) plug in here with
 * their own prompt + aggregationKey without touching the bridge.
 */
export const planReviewWriteback = (
    item: AiAgentReviewItemSummary,
): ReviewWritebackPlan => {
    if (item.primaryRootCause === 'semantic_layer') {
        return buildSemanticLayerWritebackPrompt(item);
    }
    throw new Error(
        `Writeback is not supported for root cause "${item.primaryRootCause}"`,
    );
};
