import {
    getItemId,
    QuerySourceType,
    type ComposerChartPipelineNode,
    type DashboardFilterableField,
    type DashboardFilters,
} from '@lightdash/common';
import { type TileFilterItem } from '../../../components/DashboardTiles/TileFiltersPopover';

/** The dashboard filters a composer run pushed into its nodes, in pipeline order; nodes are named only when there are several. */
export const getComposerTileFilterItems = ({
    nodes,
    appliedDashboardFiltersByNodeId,
    fields,
}: {
    nodes: ComposerChartPipelineNode[];
    appliedDashboardFiltersByNodeId: Record<string, DashboardFilters>;
    fields: DashboardFilterableField[];
}): TileFilterItem[] => {
    const semanticNodes = nodes.filter(
        (node) => node.sourceType === QuerySourceType.SEMANTIC_LAYER,
    );
    return semanticNodes.flatMap(({ nodeId, title }) => {
        const applied = appliedDashboardFiltersByNodeId[nodeId];
        if (!applied) return [];
        return [...applied.dimensions, ...applied.metrics].map(
            (filterRule) => ({
                key: `${nodeId}:${filterRule.id}`,
                filterRule,
                field: fields.find(
                    (field) => getItemId(field) === filterRule.target.fieldId,
                ),
                sourceLabel: semanticNodes.length > 1 ? title : null,
                isOverridden: false,
            }),
        );
    });
};
