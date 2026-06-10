import {
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type SankeyChart,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';
import {
    transformSankeyData,
    type SankeySeriesDataPoint,
} from './sankeyTransform';
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
        if (isLoading || dimensionIds.length < 2) return;

        if (!sourceFieldId || !dimensionIds.includes(sourceFieldId)) {
            // Handle table calculation renames
            if (tableCalculationsMetadata && sourceFieldId) {
                const meta = tableCalculationsMetadata.find(
                    (tc) => tc.oldName === sourceFieldId,
                );
                if (meta) {
                    setSourceFieldId(meta.name);
                    return;
                }
            }
            setSourceFieldId(dimensionIds[0]);
        }
    }, [dimensionIds, sourceFieldId, isLoading, tableCalculationsMetadata]);

    useEffect(() => {
        if (isLoading || dimensionIds.length < 2) return;

        if (!targetFieldId || !dimensionIds.includes(targetFieldId)) {
            if (tableCalculationsMetadata && targetFieldId) {
                const meta = tableCalculationsMetadata.find(
                    (tc) => tc.oldName === targetFieldId,
                );
                if (meta) {
                    setTargetFieldId(meta.name);
                    return;
                }
            }
            // Pick the second dimension, different from source
            const available = dimensionIds.filter(
                (id) => id !== (sourceFieldId ?? dimensionIds[0]),
            );
            setTargetFieldId(available[0] ?? dimensionIds[1] ?? null);
        }
    }, [
        dimensionIds,
        targetFieldId,
        sourceFieldId,
        isLoading,
        tableCalculationsMetadata,
    ]);

    useEffect(() => {
        if (isLoading || numericFieldIds.length === 0) return;

        if (!metricFieldId || !numericFieldIds.includes(metricFieldId)) {
            if (tableCalculationsMetadata && metricFieldId) {
                const meta = tableCalculationsMetadata.find(
                    (tc) => tc.oldName === metricFieldId,
                );
                if (meta) {
                    setMetricFieldId(meta.name);
                    return;
                }
            }
            setMetricFieldId(numericFieldIds[0]);
        }
    }, [numericFieldIds, metricFieldId, isLoading, tableCalculationsMetadata]);

    const data: SankeySeriesDataPoint = useMemo(() => {
        if (
            !resultsData ||
            !sourceFieldId ||
            !targetFieldId ||
            !metricFieldId
        ) {
            return { nodes: [], links: [], maxDepth: 0, hasCycle: false };
        }
        return transformSankeyData(
            resultsData.rows,
            { sourceFieldId, targetFieldId, metricFieldId },
            { nodeLayout },
        );
    }, [resultsData, sourceFieldId, targetFieldId, metricFieldId, nodeLayout]);

    const validConfig: SankeyChart = useMemo(
        () => ({
            sourceFieldId: sourceFieldId ?? undefined,
            targetFieldId: targetFieldId ?? undefined,
            metricFieldId: metricFieldId ?? undefined,
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
