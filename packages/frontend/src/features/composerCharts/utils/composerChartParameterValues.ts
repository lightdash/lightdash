import {
    type ComposerChartPipelineNode,
    type ParametersValuesMap,
} from '@lightdash/common';

/**
 * What the chart page's controls show: the value the run used on the first node that ran it.
 * While a run for new picks is pending, the picks show over the previous run's values.
 */
export const getComposerChartParameterValues = ({
    nodes,
    usedParameterValuesByNodeId,
    picks,
    isRunCurrent,
}: {
    nodes: ComposerChartPipelineNode[];
    usedParameterValuesByNodeId: Record<string, ParametersValuesMap> | null;
    picks: ParametersValuesMap;
    isRunCurrent: boolean;
}): ParametersValuesMap => {
    const used = nodes.reduceRight<ParametersValuesMap>(
        (acc, node) => ({
            ...acc,
            ...usedParameterValuesByNodeId?.[node.nodeId],
        }),
        {},
    );
    return isRunCurrent ? { ...picks, ...used } : { ...used, ...picks };
};
