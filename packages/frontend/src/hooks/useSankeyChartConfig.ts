import {
    isField,
    isMetric,
    isTableCalculation,
    SankeyChartLabelPosition,
    SankeyChartOrientation,
    type Dimension,
    type ItemsMap,
    type Metric,
    type SankeyChart,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type InfiniteQueryResults } from './useQueryResults';

export type SankeyNode = {
    name: string;
};

export type SankeyLink = {
    source: string;
    target: string;
    value: number;
};

export type SankeySeriesData = {
    nodes: SankeyNode[];
    links: SankeyLink[];
};

type SankeyChartConfig = {
    validConfig: SankeyChart;

    // Source field
    sourceFieldId: string | null;
    onSourceFieldChange: (fieldId: string | null) => void;
    sourceField: Dimension | undefined;

    // Target field
    targetFieldId: string | null;
    onTargetFieldChange: (fieldId: string | null) => void;
    targetField: Dimension | undefined;

    // Value field
    valueFieldId: string | null;
    onValueFieldChange: (fieldId: string | null) => void;
    valueField: Metric | TableCalculation | undefined;

    // Display options
    nodeWidth: number;
    onNodeWidthChange: (width: number) => void;
    nodeGap: number;
    onNodeGapChange: (gap: number) => void;
    orientation: SankeyChartOrientation;
    onOrientationChange: (orientation: SankeyChartOrientation) => void;

    // Label options
    labels: SankeyChart['labels'];
    onLabelsChange: (labels: SankeyChart['labels']) => void;

    // Color options
    nodeColorDefaults: Record<string, string>;
    nodeColorOverrides: Record<string, string>;
    onNodeColorOverridesChange: (key: string, value: string) => void;
    linkColorMode: 'source' | 'target' | 'gradient';
    onLinkColorModeChange: (mode: 'source' | 'target' | 'gradient') => void;

    // Interaction options
    draggable: boolean;
    toggleDraggable: () => void;

    // Legend options
    showLegend: boolean;
    toggleShowLegend: () => void;

    // Computed data
    data: SankeySeriesData;
};

export type SankeyChartConfigFn = (
    resultsData: InfiniteQueryResults | undefined,
    sankeyChartConfig: SankeyChart | undefined,
    itemsMap: ItemsMap | undefined,
    dimensions: Record<string, Dimension>,
    numericFields: Record<string, Metric | TableCalculation>,
    colorPalette: string[],
    tableCalculationsMetadata?: TableCalculationMetadata[],
) => SankeyChartConfig;

const useSankeyChartConfig: SankeyChartConfigFn = (
    resultsData,
    sankeyChartConfig,
    itemsMap,
    dimensions,
    numericFields,
    colorPalette,
    tableCalculationsMetadata,
) => {
    // Source field state
    const [sourceFieldId, setSourceFieldId] = useState(
        sankeyChartConfig?.sourceFieldId ?? null,
    );

    // Target field state
    const [targetFieldId, setTargetFieldId] = useState(
        sankeyChartConfig?.targetFieldId ?? null,
    );

    // Value field state
    const [valueFieldId, setValueFieldId] = useState(
        sankeyChartConfig?.valueFieldId ?? null,
    );

    // Display options state
    const [nodeWidth, setNodeWidth] = useState(
        sankeyChartConfig?.nodeWidth ?? 20,
    );
    const [nodeGap, setNodeGap] = useState(sankeyChartConfig?.nodeGap ?? 10);
    const [orientation, setOrientation] = useState(
        sankeyChartConfig?.orientation ?? SankeyChartOrientation.HORIZONTAL,
    );

    // Label options state
    const [labels, setLabels] = useState<SankeyChart['labels']>(
        sankeyChartConfig?.labels ?? {
            position: SankeyChartLabelPosition.RIGHT,
            showValue: true,
        },
    );

    // Color options state
    const [nodeColorOverrides, setNodeColorOverrides] = useState(
        sankeyChartConfig?.nodeColorOverrides ?? {},
    );
    const [debouncedNodeColorOverrides] = useDebouncedValue(
        nodeColorOverrides,
        500,
    );
    const [linkColorMode, setLinkColorMode] = useState<
        'source' | 'target' | 'gradient'
    >(sankeyChartConfig?.linkColorMode ?? 'source');

    // Interaction options state
    const [draggable, setDraggable] = useState(
        sankeyChartConfig?.draggable ?? false,
    );

    // Legend options state
    const [showLegend, setShowLegend] = useState(
        sankeyChartConfig?.showLegend ?? false,
    );

    // Get all dimension field IDs
    const allDimensionFieldIds = useMemo(
        () => (dimensions ? Object.keys(dimensions) : []),
        [dimensions],
    );

    // Get all numeric field IDs
    const allNumericFieldIds = useMemo(
        () => (numericFields ? Object.keys(numericFields) : []),
        [numericFields],
    );

    // Get selected fields
    const sourceField = useMemo(() => {
        if (!itemsMap || !sourceFieldId || !(sourceFieldId in itemsMap))
            return undefined;
        const item = itemsMap[sourceFieldId];
        if (isField(item) && !isMetric(item)) return item as Dimension;
        return undefined;
    }, [itemsMap, sourceFieldId]);

    const targetField = useMemo(() => {
        if (!itemsMap || !targetFieldId || !(targetFieldId in itemsMap))
            return undefined;
        const item = itemsMap[targetFieldId];
        if (isField(item) && !isMetric(item)) return item as Dimension;
        return undefined;
    }, [itemsMap, targetFieldId]);

    const valueField = useMemo(() => {
        if (!itemsMap || !valueFieldId || !(valueFieldId in itemsMap))
            return undefined;
        const item = itemsMap[valueFieldId];
        if ((isField(item) && isMetric(item)) || isTableCalculation(item))
            return item;
        return undefined;
    }, [itemsMap, valueFieldId]);

    const isLoading = !resultsData;

    // Auto-select fields if not set
    useEffect(() => {
        if (isLoading || allDimensionFieldIds.length < 2) return;

        // Handle table calculation name changes
        if (tableCalculationsMetadata && valueFieldId) {
            const metricTcIndex = tableCalculationsMetadata.findIndex(
                (tc) => tc.oldName === valueFieldId,
            );
            if (metricTcIndex !== -1) {
                setValueFieldId(tableCalculationsMetadata[metricTcIndex].name);
                return;
            }
        }

        // Auto-select source field
        if (!sourceFieldId || !allDimensionFieldIds.includes(sourceFieldId)) {
            setSourceFieldId(allDimensionFieldIds[0] ?? null);
        }

        // Auto-select target field (second dimension if available)
        if (!targetFieldId || !allDimensionFieldIds.includes(targetFieldId)) {
            setTargetFieldId(allDimensionFieldIds[1] ?? null);
        }

        // Auto-select value field
        if (!valueFieldId || !allNumericFieldIds.includes(valueFieldId)) {
            setValueFieldId(allNumericFieldIds[0] ?? null);
        }
    }, [
        allDimensionFieldIds,
        allNumericFieldIds,
        sourceFieldId,
        targetFieldId,
        valueFieldId,
        isLoading,
        tableCalculationsMetadata,
    ]);

    // Compute Sankey data from results
    const data: SankeySeriesData = useMemo(() => {
        if (
            !resultsData ||
            !sourceFieldId ||
            !targetFieldId ||
            !valueFieldId ||
            resultsData.rows.length === 0
        ) {
            return { nodes: [], links: [] };
        }

        const nodesSet = new Set<string>();
        const links: SankeyLink[] = [];

        resultsData.rows.forEach((row) => {
            const sourceValue = row[sourceFieldId]?.value?.formatted;
            const targetValue = row[targetFieldId]?.value?.formatted;
            const value = Number(row[valueFieldId]?.value?.raw ?? 0);

            if (sourceValue && targetValue && !isNaN(value)) {
                nodesSet.add(sourceValue);
                nodesSet.add(targetValue);
                links.push({
                    source: sourceValue,
                    target: targetValue,
                    value,
                });
            }
        });

        const nodes = Array.from(nodesSet).map((name) => ({ name }));

        return { nodes, links };
    }, [resultsData, sourceFieldId, targetFieldId, valueFieldId]);

    // Compute default colors for nodes
    const nodeColorDefaults = useMemo(() => {
        return Object.fromEntries(
            data.nodes.map((node, index) => {
                return [node.name, colorPalette[index % colorPalette.length]];
            }),
        );
    }, [data.nodes, colorPalette]);

    // Callbacks for updating state
    const onLabelsChange = useCallback((labelsProps: SankeyChart['labels']) => {
        setLabels((prevLabels: SankeyChart['labels']) => ({
            ...prevLabels,
            ...labelsProps,
        }));
    }, []);

    const onNodeColorOverridesChange = useCallback(
        (key: string, value: string) => {
            setNodeColorOverrides(({ [key]: _, ...rest }) => {
                return value.trim() === '' ? rest : { ...rest, [key]: value };
            });
        },
        [],
    );

    // Build valid config
    const validConfig: SankeyChart = useMemo(
        () => ({
            sourceFieldId: sourceFieldId ?? undefined,
            targetFieldId: targetFieldId ?? undefined,
            valueFieldId: valueFieldId ?? undefined,
            nodeWidth,
            nodeGap,
            orientation,
            labels,
            nodeColorOverrides: debouncedNodeColorOverrides,
            linkColorMode,
            draggable,
            showLegend,
        }),
        [
            sourceFieldId,
            targetFieldId,
            valueFieldId,
            nodeWidth,
            nodeGap,
            orientation,
            labels,
            debouncedNodeColorOverrides,
            linkColorMode,
            draggable,
            showLegend,
        ],
    );

    return {
        validConfig,

        sourceFieldId,
        onSourceFieldChange: setSourceFieldId,
        sourceField,

        targetFieldId,
        onTargetFieldChange: setTargetFieldId,
        targetField,

        valueFieldId,
        onValueFieldChange: setValueFieldId,
        valueField,

        nodeWidth,
        onNodeWidthChange: setNodeWidth,
        nodeGap,
        onNodeGapChange: setNodeGap,
        orientation,
        onOrientationChange: setOrientation,

        labels,
        onLabelsChange,

        nodeColorDefaults,
        nodeColorOverrides,
        onNodeColorOverridesChange,
        linkColorMode,
        onLinkColorModeChange: setLinkColorMode,

        draggable,
        toggleDraggable: () => setDraggable((prev: boolean) => !prev),

        showLegend,
        toggleShowLegend: () => setShowLegend((prev: boolean) => !prev),

        data,
    };
};

export default useSankeyChartConfig;
