import {
    QuerySourceType,
    type ComposerChartPipelineNode,
    type DashboardTileParameterInputs,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import {
    getTileParameterItems,
    type TileParameterItem,
} from '../../../components/DashboardTiles/tileParameterItems';

/** The parameter values a composer run used: one line per parameter, or one per node where its nodes ran different values. */
export const getComposerTileParameterItems = ({
    nodes,
    usedParameterValuesByNodeId,
    definitions,
    dashboardValues,
    excludedKeys,
}: Pick<DashboardTileParameterInputs, 'dashboardValues' | 'excludedKeys'> & {
    nodes: ComposerChartPipelineNode[];
    usedParameterValuesByNodeId: Record<string, ParametersValuesMap>;
    definitions: ParameterDefinitions;
}): TileParameterItem[] => {
    const nodeItems = nodes.flatMap((node) =>
        getTileParameterItems({
            usedParameterValues: usedParameterValuesByNodeId[node.nodeId] ?? {},
            definitions,
            inputs: {
                dashboardValues,
                excludedKeys,
                // Only semantic-layer nodes keep saved values; the rest read the shared map
                chartSavedValues:
                    node.sourceType === QuerySourceType.SEMANTIC_LAYER
                        ? (node.parameters ?? {})
                        : {},
            },
            sourceLabel: node.title,
        }).map((item) => ({ ...item, nodeId: node.nodeId })),
    );
    const keys = [...new Set(nodeItems.map(({ key }) => key))];
    return keys.flatMap((key) => {
        const ran = nodeItems.filter((item) => item.key === key);
        const [{ nodeId: _, ...first }] = ran;
        const agree = ran.every(
            (item) =>
                isEqual(item.value, first.value) &&
                item.source === first.source,
        );
        return agree
            ? [{ ...first, sourceLabel: null }]
            : ran.map(({ nodeId, ...item }) => ({
                  ...item,
                  key: `${nodeId}:${key}`,
              }));
    });
};
