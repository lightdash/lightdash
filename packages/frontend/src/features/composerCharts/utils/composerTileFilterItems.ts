import {
    FieldType,
    getItemId,
    QuerySourceType,
    type ComposerChartPipelineNode,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type FilterableDimension,
    type ResultColumn,
} from '@lightdash/common';
import { type TileFilterItem } from '../../../components/DashboardTiles/TileFiltersPopover';

const sqlColumnField = (column: ResultColumn): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: column.type,
    name: column.reference,
    label: column.label ?? column.reference,
    table: '',
    tableLabel: '',
    sql: '',
    hidden: false,
});

/** The dashboard filters a composer run pushed into its semantic-layer and SQL nodes, in pipeline order; nodes are named only when there are several. */
export const getComposerTileFilterItems = ({
    nodes,
    appliedDashboardFiltersByNodeId,
    fields,
    sqlColumns,
}: {
    nodes: ComposerChartPipelineNode[];
    appliedDashboardFiltersByNodeId: Record<string, DashboardFilters>;
    fields: DashboardFilterableField[];
    sqlColumns: ResultColumn[];
}): TileFilterItem[] => {
    const filteredNodes = nodes.filter(
        (node) =>
            node.sourceType === QuerySourceType.SEMANTIC_LAYER ||
            node.sourceType === QuerySourceType.SQL,
    );
    const fieldOf = ({ target }: DashboardFilterRule) => {
        if (target.isSqlColumn) {
            const column = sqlColumns.find(
                ({ reference }) => reference === target.fieldId,
            );
            return column ? sqlColumnField(column) : null;
        }
        return (
            fields.find((field) => getItemId(field) === target.fieldId) ?? null
        );
    };
    return filteredNodes.flatMap(({ nodeId, title }) => {
        const applied = appliedDashboardFiltersByNodeId[nodeId];
        if (!applied) return [];
        return [...applied.dimensions, ...applied.metrics].map(
            (filterRule) => ({
                key: `${nodeId}:${filterRule.id}`,
                filterRule,
                field: fieldOf(filterRule),
                sourceLabel: filteredNodes.length > 1 ? title : null,
            }),
        );
    });
};
