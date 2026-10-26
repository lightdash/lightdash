import { type SankeyChart } from '@lightdash/common';
import { type SankeySeriesDataPoint } from '@lightdash/visualization/editor';
import { useMemo } from 'react';
import { useVisualizationInputSelector } from '../components/LightdashVisualization/useVisualizationContext';
import {
    sankeyEditorActions,
    selectSankeyData,
    selectSankeyEditor,
    selectSankeyMetricFieldId,
    selectSankeySourceFieldId,
    selectSankeyTargetFieldId,
    selectSankeyValidConfig,
    useEditorFieldSetter,
    type SankeyEditorState,
} from '../features/visualization/store';

export type SankeyEditorActions = {
    onSourceFieldChange: (fieldId: string | null) => void;
    onTargetFieldChange: (fieldId: string | null) => void;
    onMetricFieldChange: (fieldId: string | null) => void;
    onNodeAlignChange: (align: SankeyEditorState['nodeAlign']) => void;
    onOrientChange: (orient: SankeyEditorState['orient']) => void;
    onNodeLayoutChange: (nodeLayout: SankeyEditorState['nodeLayout']) => void;
};

/** Stable sankey editor actions. */
export const useSankeyEditorActions = (): SankeyEditorActions => {
    const set = useEditorFieldSetter<SankeyEditorState>(
        selectSankeyEditor,
        sankeyEditorActions.set,
    );
    return useMemo(
        () => ({
            onSourceFieldChange: (fieldId) => set('sourceFieldId', fieldId),
            onTargetFieldChange: (fieldId) => set('targetFieldId', fieldId),
            onMetricFieldChange: (fieldId) => set('metricFieldId', fieldId),
            onNodeAlignChange: (align) => set('nodeAlign', align),
            onOrientChange: (orient) => set('orient', orient),
            onNodeLayoutChange: (nodeLayout) => set('nodeLayout', nodeLayout),
        }),
        [set],
    );
};

export type SankeyChartConfig = SankeyEditorActions & {
    validConfig: SankeyChart;
    sourceFieldId: string | null;
    targetFieldId: string | null;
    metricFieldId: string | null;
    nodeAlign: SankeyEditorState['nodeAlign'];
    orient: SankeyEditorState['orient'];
    nodeLayout: SankeyEditorState['nodeLayout'];
    data: SankeySeriesDataPoint;
};

/**
 * Everything the sankey chart body reads, re-rendering on every edit.
 * Config panels select the fields they show instead.
 */
const useSankeyChartConfig = (): SankeyChartConfig => {
    const { nodeAlign, orient, nodeLayout } =
        useVisualizationInputSelector(selectSankeyEditor);
    const sourceFieldId = useVisualizationInputSelector(
        selectSankeySourceFieldId,
    );
    const targetFieldId = useVisualizationInputSelector(
        selectSankeyTargetFieldId,
    );
    const metricFieldId = useVisualizationInputSelector(
        selectSankeyMetricFieldId,
    );
    const data = useVisualizationInputSelector(selectSankeyData);
    const validConfig = useVisualizationInputSelector(selectSankeyValidConfig);
    const actions = useSankeyEditorActions();

    return useMemo(
        () => ({
            ...actions,
            validConfig,
            sourceFieldId,
            targetFieldId,
            metricFieldId,
            nodeAlign,
            orient,
            nodeLayout,
            data,
        }),
        [
            actions,
            validConfig,
            sourceFieldId,
            targetFieldId,
            metricFieldId,
            nodeAlign,
            orient,
            nodeLayout,
            data,
        ],
    );
};

export default useSankeyChartConfig;
