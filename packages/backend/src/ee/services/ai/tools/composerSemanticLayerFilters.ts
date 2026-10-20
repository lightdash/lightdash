import {
    AiAgentValidatorError,
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

type ResolveOptions = {
    getExplore: (exploreName: string) => Explore;
};

/**
 * Resolves a semanticLayer node's filter expressions against its explore into
 * domain Filters, with runQuery's resolver (field recovery included). Throws
 * a model-actionable error naming the node.
 */
export const resolveComposerSemanticLayerFilters = (
    node: ToolComposerSemanticLayerNode,
    { getExplore }: ResolveOptions,
): Filters | null => {
    if (node.filters === null) return null;
    const result = resolveExploreFilterExpressions({
        filters: node.filters,
        explore: getExplore(node.exploreName),
    });
    if (!result.success) {
        throw new AiAgentValidatorError(
            `Invalid filters on semanticLayer node "${node.nodeId}": ${formatFilterExpressionError(
                result.error,
            )}`,
        );
    }
    return result.data;
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
