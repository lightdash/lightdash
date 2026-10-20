import {
    AiAgentValidatorError,
    composerSemanticLayerExpressionFiltersSchema,
    composerSemanticLayerStructuredFiltersSchema,
    filtersSchemaTransformed,
    getErrorMessage,
    getTotalFilterRules,
    QuerySourceType,
    type Explore,
    type Filters,
    type ResolvedToolComposerQueryNode,
    type ToolComposerQueryNode,
    type ToolComposerSemanticLayerNode,
} from '@lightdash/common';
import {
    formatFilterExpressionError,
    resolveExploreFilterExpressions,
} from '../utils/filterExpressions';
import {
    validateFilterRules,
    validateMetricDimensionFilterPlacement,
} from '../utils/validators';

type ResolveOptions = {
    enableFilterExpressions: boolean;
    getExplore: (exploreName: string) => Explore;
};

const nodeFilterError = (node: ToolComposerSemanticLayerNode, detail: string) =>
    new AiAgentValidatorError(
        `Invalid filters on semanticLayer node "${node.nodeId}": ${detail}`,
    );

/**
 * Validates a semanticLayer node's filters against its explore and resolves
 * them to domain Filters, the same way runQuery does for its queryConfig: the
 * structured contract is checked rule by rule, the expression contract is
 * parsed and resolved with field recovery. Throws a model-actionable error.
 */
export const resolveComposerSemanticLayerFilters = (
    node: ToolComposerSemanticLayerNode,
    { enableFilterExpressions, getExplore }: ResolveOptions,
): Filters | null => {
    if (node.filters === null) return null;
    const explore = getExplore(node.exploreName);

    if (enableFilterExpressions) {
        const result = resolveExploreFilterExpressions({
            filters: composerSemanticLayerExpressionFiltersSchema.parse(
                node.filters,
            ),
            explore,
        });
        if (!result.success) {
            throw nodeFilterError(
                node,
                formatFilterExpressionError(result.error),
            );
        }
        return result.data;
    }

    const filters = filtersSchemaTransformed.parse(
        composerSemanticLayerStructuredFiltersSchema.parse(node.filters),
    );
    try {
        validateFilterRules(explore, getTotalFilterRules(filters));
        validateMetricDimensionFilterPlacement(explore, null, null, filters);
    } catch (e) {
        throw nodeFilterError(node, getErrorMessage(e));
    }
    return filters;
};

export const resolveComposerQueryNode = (
    node: ToolComposerQueryNode,
    options: ResolveOptions,
): ResolvedToolComposerQueryNode =>
    node.sourceType === QuerySourceType.SEMANTIC_LAYER
        ? {
              ...node,
              filters: resolveComposerSemanticLayerFilters(node, options),
          }
        : node;
