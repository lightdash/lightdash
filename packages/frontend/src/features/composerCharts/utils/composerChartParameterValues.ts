import {
    type ComposerChartPipelineNode,
    type ParametersValuesMap,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';

/**
 * What the chart page's controls show: a pick once any node ran it, else the value the run used on the first node that ran it.
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
    if (!isRunCurrent) return { ...used, ...picks };
    const ranPicks = Object.entries(picks).filter(([key, value]) =>
        nodes.some((node) =>
            isEqual(usedParameterValuesByNodeId?.[node.nodeId]?.[key], value),
        ),
    );
    return { ...used, ...Object.fromEntries(ranPicks) };
};
