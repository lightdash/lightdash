import {
    type ComposerChartPipelineNode,
    type ParametersValuesMap,
} from '@lightdash/common';

/** What the chart page's controls show: the user's pick, else the value the run used on the first node that ran it. */
export const getComposerChartParameterValues = ({
    nodes,
    usedParameterValuesByNodeId,
    picks,
}: {
    nodes: ComposerChartPipelineNode[];
    usedParameterValuesByNodeId: Record<string, ParametersValuesMap> | null;
    picks: ParametersValuesMap;
}): ParametersValuesMap => {
    const used = nodes.reduceRight<ParametersValuesMap>(
        (acc, node) => ({
            ...acc,
            ...usedParameterValuesByNodeId?.[node.nodeId],
        }),
        {},
    );
    return { ...used, ...picks };
};
