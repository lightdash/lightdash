import {
    assertUnreachable,
    isExploreError,
    type AiAgentJudgeProjectContextEntry,
    type AiAgentReviewItemSummary,
    type AiAgentSemanticTargetRef,
    type AiAgentTargetRef,
    type Explore,
    type ExploreError,
} from '@lightdash/common';

/**
 * Output of a review-writeback strategy. Two execution shapes:
 * - `prompt`: a natural-language prompt run in the e2b/Claude Code sandbox
 *   (semantic_layer). `aggregationKey` is null for one-shot PRs and set for
 *   cumulative living-document flows that resume an existing writeback thread.
 * - `project_context`: a structured entry applied by a deterministic
 *   GitHub-API merge of lightdash.project_context.yml — no sandbox.
 */
export type ReviewWritebackPlan =
    | {
          strategy: 'prompt';
          promptText: string;
          aggregationKey: string | null;
      }
    | {
          strategy: 'project_context';
          entry: AiAgentJudgeProjectContextEntry;
      };

// Resolves each model's dbt YAML path from compiled explores so the writeback agent edits the right file (the judge only gives names).
export const buildYmlPathByModel = (
    explores: (Explore | ExploreError)[],
): Map<string, string> => {
    const map = new Map<string, string>();
    explores.forEach((explore) => {
        if (isExploreError(explore)) {
            return;
        }
        Object.entries(explore.tables).forEach(([tableName, table]) => {
            if (table.ymlPath) {
                map.set(tableName, table.ymlPath);
            }
        });
    });
    return map;
};

const formatSemanticTargetRef = (
    ref: AiAgentSemanticTargetRef,
    ymlPathByModel: Map<string, string>,
): string => {
    const ymlPath = ymlPathByModel.get(ref.modelName);
    const yaml = ymlPath ? ` (yaml: ${ymlPath})` : '';
    switch (ref.type) {
        case 'model':
            return `model "${ref.modelName}"${yaml}`;
        case 'explore':
            return `explore "${ref.exploreName}" on model "${ref.modelName}"${yaml}`;
        case 'join':
            return `join "${ref.joinName}" on model "${ref.modelName}"${yaml}`;
        case 'dimension':
            return `dimension "${ref.modelName}.${ref.dimensionName}"${yaml}`;
        case 'metric':
            return `metric "${ref.modelName}.${ref.metricName}"${yaml}`;
        case 'additional_dimension':
            return `additional dimension "${ref.modelName}.${ref.parentDimensionName}.${ref.dimensionName}"${yaml}`;
        case 'required_filter':
            return `required filter on "${ref.modelName}.${ref.fieldName}" in explore "${ref.exploreName}"${yaml}`;
        case 'ai_hint':
            return `ai_hint on ${ref.targetType} "${ref.modelName}.${ref.targetName}"${yaml}`;
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
    ymlPathByModel: Map<string, string>,
): ReviewWritebackPlan => {
    const finding = item.latestFinding;
    const targetLines = (finding?.targetRefs ?? [])
        .filter(isSemanticTargetRef)
        .map((ref) => `- ${formatSemanticTargetRef(ref, ymlPathByModel)}`);
    const recommendation = finding?.recommendation ?? null;

    const sections = [
        'You are improving the dbt/Lightdash semantic layer YAML to fix a recurring issue surfaced by AI agent review. Make the smallest change that resolves it.',
        'The pinned review finding, the proposed change, and the original conversation are attached to this thread as context — read them first to understand exactly what was missing, then open a pull request that closes the gap.',
        recommendation
            ? `Recommended change: ${recommendation.title}\nRationale: ${recommendation.rationale}`
            : null,
        targetLines.length > 0
            ? `Target(s) to edit:\n${targetLines.join('\n')}`
            : null,
        'Apply the change by updating field descriptions, ai_hint, or labels, or by adding a missing model, join, dimension, or metric as appropriate. Put routing and disambiguation directives — "use this field when…" steering, join recipes, and negative cross-model caveats like "NOT suitable for…, use the other model instead" — in ai_hint (model or field level), never in a description: a description defines what a field is, while an ai_hint tells the agent when to choose it over a similar one. Do not change SQL logic or unrelated fields. If the data needed to answer this is genuinely not present in the warehouse/dbt project and cannot be exposed by a semantic-layer edit, do not fabricate fields or invent data — open no pull request and report that upstream dbt modeling or ingestion is required. Otherwise open a pull request describing the change and referencing this review finding.',
    ].filter((section): section is string => section !== null);

    return {
        strategy: 'prompt',
        promptText: sections.join('\n\n'),
        aggregationKey: null,
    };
};

/**
 * Seed prompt for the project_context remediation work thread. The finding, the
 * proposed change, and the source conversation travel as pinned context (cards +
 * structured agent context), so the prompt stays a single short line.
 */
export const PROJECT_CONTEXT_WORK_THREAD_INSTRUCTION =
    'A pull request applying this change to your project context is already open. Tell me what to refine and I’ll update it with editProjectContext.';

/**
 * Per-root-cause strategy dispatcher. Two strategies are implemented:
 * `semantic_layer` → a sandbox prompt, and `project_context` → a structured
 * entry for the deterministic GitHub-API merge. Other root causes throw until
 * they plug in here with their own strategy.
 */
export const planReviewWriteback = (
    item: AiAgentReviewItemSummary,
    ymlPathByModel: Map<string, string> = new Map(),
): ReviewWritebackPlan => {
    if (item.primaryRootCause === 'semantic_layer') {
        return buildSemanticLayerWritebackPrompt(item, ymlPathByModel);
    }
    if (item.primaryRootCause === 'project_context') {
        const entry = item.latestFinding?.projectContextEntry ?? null;
        if (!entry) {
            throw new Error(
                'Writeback for project_context requires a projectContextEntry on the finding',
            );
        }
        return { strategy: 'project_context', entry };
    }
    throw new Error(
        `Writeback is not supported for root cause "${item.primaryRootCause}"`,
    );
};
