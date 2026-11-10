import {
    metricQueryOfSemanticNode,
    QuerySourceType,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import { getVisualizationFiltersCount } from '../../AiVisualizationRenderer.utils';

export const semanticQueryOf = (query: SourceQuery) =>
    query.sourceType === QuerySourceType.SEMANTIC_LAYER ? query : null;

export const hasQueryDetails = (query: SemanticLayerSourceQuery) => {
    const { dimensions, metrics, filters, sorts } =
        metricQueryOfSemanticNode(query);
    return (
        dimensions.length > 0 ||
        metrics.length > 0 ||
        getVisualizationFiltersCount(filters) > 0 ||
        sorts.length > 0 ||
        Object.keys(query.parameters ?? {}).length > 0
    );
};

/** A semantic cell's toggleable query views. */
export type QueryPanel = 'details' | 'sql';
