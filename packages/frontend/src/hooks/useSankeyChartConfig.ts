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
import { useEffect, useMemo, useState } from 'react';
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
    const [sourceFieldId, setSourceFieldId] = useState(
        sankeyChartConfig?.sourceFieldId ?? null,
    );
    const [targetFieldId, setTargetFieldId] = useState(
        sankeyChartConfig?.targetFieldId ?? null,
    );
    const [metricFieldId, setMetricFieldId] = useState(
        sankeyChartConfig?.metricFieldId ?? null,
    );
    const [nodeAlign, setNodeAlign] = useState<
        NonNullable<SankeyChart['nodeAlign']>
    >(sankeyChartConfig?.nodeAlign ?? 'justify');
    const [orient, setOrient] = useState<NonNullable<SankeyChart['orient']>>(
        sankeyChartConfig?.orient ?? 'horizontal',
    );
    const [nodeLayout, setNodeLayout] = useState<
        NonNullable<SankeyChart['nodeLayout']>
    >(sankeyChartConfig?.nodeLayout ?? 'multi-step');

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
        if (resolved !== sourceFieldId) setSourceFieldId(resolved);
    }, [dimensionIds, sourceFieldId, isLoading, tableCalculationsMetadata]);

    useEffect(() => {
        const resolved = resolveSankeyTargetFieldId({
            targetFieldId,
            sourceFieldId,
            dimensionIds,
            isLoading,
            tableCalculationsMetadata,
        });
        if (resolved !== targetFieldId) setTargetFieldId(resolved);
    }, [
        dimensionIds,
        targetFieldId,
        sourceFieldId,
        isLoading,
        tableCalculationsMetadata,
    ]);

    useEffect(() => {
        const resolved = resolveSankeyMetricFieldId({
            metricFieldId,
            numericFieldIds,
            isLoading,
            tableCalculationsMetadata,
        });
        if (resolved !== metricFieldId) setMetricFieldId(resolved);
    }, [numericFieldIds, metricFieldId, isLoading, tableCalculationsMetadata]);

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

    return {
        validConfig,
        sourceFieldId,
        targetFieldId,
        metricFieldId,
        onSourceFieldChange: setSourceFieldId,
        onTargetFieldChange: setTargetFieldId,
        onMetricFieldChange: setMetricFieldId,
        nodeAlign,
        onNodeAlignChange: setNodeAlign,
        orient,
        onOrientChange: setOrient,
        nodeLayout,
        onNodeLayoutChange: setNodeLayout,
        data,
    };
};

export default useSankeyChartConfig;
