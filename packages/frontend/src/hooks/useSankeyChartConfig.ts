import {
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type SankeyChart,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import {
    buildValidSankeyConfig,
    getSankeyData,
    resolveSankeyMetricFieldId,
    resolveSankeySourceFieldId,
    resolveSankeyTargetFieldId,
    type SankeySeriesDataPoint,
} from '@lightdash/visualization/editor';
import { useEffect, useMemo } from 'react';
import {
    buildSankeyEditorState,
    sankeyEditorActions,
    selectSankeyEditor,
    useEditorFieldSetter,
    type SankeyEditorState,
    useVisualizationSelector,
} from '../features/visualization/store';
import { type InfiniteQueryResults } from './useQueryResults';

type SankeyChartConfig = {
    validConfig: SankeyChart;

    sourceFieldId: string | null;
    targetFieldId: string | null;
    metricFieldId: string | null;

    onSourceFieldChange: (fieldId: string | null) => void;
    onTargetFieldChange: (fieldId: string | null) => void;
    onMetricFieldChange: (fieldId: string | null) => void;

    nodeAlign: NonNullable<SankeyChart['nodeAlign']>;
    onNodeAlignChange: (align: NonNullable<SankeyChart['nodeAlign']>) => void;

    orient: NonNullable<SankeyChart['orient']>;
    onOrientChange: (orient: NonNullable<SankeyChart['orient']>) => void;

    nodeLayout: NonNullable<SankeyChart['nodeLayout']>;
    onNodeLayoutChange: (
        nodeLayout: NonNullable<SankeyChart['nodeLayout']>,
    ) => void;

    data: SankeySeriesDataPoint;
};

export type SankeyChartConfigFn = (
    resultsData: InfiniteQueryResults | undefined,
    sankeyChartConfig: SankeyChart | undefined,
    itemsMap: ItemsMap | undefined,
    dimensions: Record<string, CustomDimension | Dimension>,
    numericFields: Record<string, Metric | TableCalculation>,
    colorPalette: string[],
    tableCalculationsMetadata?: TableCalculationMetadata[],
) => SankeyChartConfig;

const useSankeyChartConfig: SankeyChartConfigFn = (
    resultsData,
    sankeyChartConfig,
    _itemsMap,
    dimensions,
    numericFields,
    _colorPalette,
    tableCalculationsMetadata,
) => {
    const {
        sourceFieldId,
        targetFieldId,
        metricFieldId,
        nodeAlign,
        orient,
        nodeLayout,
    } = useVisualizationSelector(selectSankeyEditor);
    const set = useEditorFieldSetter<SankeyEditorState>(
        selectSankeyEditor,
        sankeyEditorActions.set,
    );

    const setters = useMemo(
        () => ({
            onSourceFieldChange: (fieldId: string | null) =>
                set('sourceFieldId', fieldId),
            onTargetFieldChange: (fieldId: string | null) =>
                set('targetFieldId', fieldId),
            onMetricFieldChange: (fieldId: string | null) =>
                set('metricFieldId', fieldId),
            onNodeAlignChange: (align: SankeyEditorState['nodeAlign']) =>
                set('nodeAlign', align),
            onOrientChange: (value: SankeyEditorState['orient']) =>
                set('orient', value),
            onNodeLayoutChange: (value: SankeyEditorState['nodeLayout']) =>
                set('nodeLayout', value),
        }),
        [set],
    );

    const dimensionIds = useMemo(() => Object.keys(dimensions), [dimensions]);
    const numericFieldIds = useMemo(
        () => Object.keys(numericFields),
        [numericFields],
    );

    const isLoading = !resultsData;

    // Auto-select fields when data first loads
    useEffect(() => {
        const resolved = resolveSankeySourceFieldId({
            sourceFieldId,
            dimensionIds,
            isLoading,
            tableCalculationsMetadata,
        });
        if (resolved !== sourceFieldId) set('sourceFieldId', resolved);
    }, [
        dimensionIds,
        sourceFieldId,
        isLoading,
        tableCalculationsMetadata,
        set,
    ]);

    useEffect(() => {
        const resolved = resolveSankeyTargetFieldId({
            targetFieldId,
            sourceFieldId,
            dimensionIds,
            isLoading,
            tableCalculationsMetadata,
        });
        if (resolved !== targetFieldId) set('targetFieldId', resolved);
    }, [
        dimensionIds,
        targetFieldId,
        sourceFieldId,
        isLoading,
        tableCalculationsMetadata,
        set,
    ]);

    useEffect(() => {
        const resolved = resolveSankeyMetricFieldId({
            metricFieldId,
            numericFieldIds,
            isLoading,
            tableCalculationsMetadata,
        });
        if (resolved !== metricFieldId) set('metricFieldId', resolved);
    }, [
        numericFieldIds,
        metricFieldId,
        isLoading,
        tableCalculationsMetadata,
        set,
    ]);

    const data: SankeySeriesDataPoint = useMemo(
        () =>
            getSankeyData({
                resultsData,
                sourceFieldId,
                targetFieldId,
                metricFieldId,
                nodeLayout,
            }),
        [resultsData, sourceFieldId, targetFieldId, metricFieldId, nodeLayout],
    );

    const validConfig: SankeyChart = useMemo(
        () =>
            buildValidSankeyConfig({
                sourceFieldId,
                targetFieldId,
                metricFieldId,
                nodeAlign,
                orient,
                nodeLayout,
            }),
        [
            sourceFieldId,
            targetFieldId,
            metricFieldId,
            nodeAlign,
            orient,
            nodeLayout,
        ],
    );

    return useMemo(
        () => ({
            validConfig,
            sourceFieldId,
            targetFieldId,
            metricFieldId,
            nodeAlign,
            orient,
            nodeLayout,
            data,
            ...setters,
        }),
        [
            validConfig,
            sourceFieldId,
            targetFieldId,
            metricFieldId,
            nodeAlign,
            orient,
            nodeLayout,
            data,
            setters,
        ],
    );
};

export default useSankeyChartConfig;
