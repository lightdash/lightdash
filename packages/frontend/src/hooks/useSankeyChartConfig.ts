import {
    getItemLabelWithoutTableName,
    isField,
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type ResultRow,
    type ResultValue,
    type SankeyChart,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type InfiniteQueryResults } from './useQueryResults';

export type SankeySeriesDataPoint = {
    nodes: { name: string }[];
    links: {
        source: string;
        target: string;
        value: number;
        meta: {
            value: ResultValue;
            rows: ResultRow[];
        };
    }[];
    /** Maximum depth level discovered during BFS traversal */
    maxDepth: number;
};

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

    colorOverrides: Record<string, string>;
    onColorOverridesChange: (key: string, value: string) => void;

    labelOverrides: Record<string, string>;
    onLabelOverridesChange: (key: string, value: string) => void;

    colorDefaults: Record<string, string>;

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
    itemsMap,
    dimensions,
    numericFields,
    colorPalette,
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

    const [colorOverrides, setColorOverrides] = useState(
        sankeyChartConfig?.colorOverrides ?? {},
    );
    const [labelOverrides, setLabelOverrides] = useState(
        sankeyChartConfig?.labelOverrides ?? {},
    );
    const [debouncedLabelOverrides] = useDebouncedValue(labelOverrides, 500);

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

    // Transform results into Sankey nodes & links using BFS-based depth assignment.
    // This handles cyclical flows by creating depth-specific node instances
    // (e.g., "Conversion - Step 2" and "Conversion - Step 4").
    const data: SankeySeriesDataPoint = useMemo(() => {
        if (
            !resultsData ||
            !sourceFieldId ||
            !targetFieldId ||
            !metricFieldId ||
            resultsData.rows.length === 0
        ) {
            return { nodes: [], links: [], maxDepth: 0 };
        }

        // Step 1: Aggregate raw rows into source→target links
        const aggregated = new Map<
            string,
            {
                source: string;
                target: string;
                value: number;
                meta: { value: ResultValue; rows: ResultRow[] };
            }
        >();

        for (const row of resultsData.rows) {
            const sourceCell = row[sourceFieldId];
            const targetCell = row[targetFieldId];
            const metricCell = row[metricFieldId];
            if (!sourceCell || !targetCell || !metricCell) continue;

            const sourceName = String(sourceCell.value.formatted);
            const targetName = String(targetCell.value.formatted);
            const metricValue = Number(metricCell.value.raw);
            if (isNaN(metricValue) || metricValue <= 0) continue;

            const key = `${sourceName}→${targetName}`;
            const existing = aggregated.get(key);
            if (existing) {
                existing.value += metricValue;
                existing.meta.rows.push(row);
            } else {
                aggregated.set(key, {
                    source: sourceName,
                    target: targetName,
                    value: metricValue,
                    meta: { value: metricCell.value, rows: [row] },
                });
            }
        }

        // Step 2: Build adjacency list (source → set of targets)
        const outgoing = new Map<string, Set<string>>();
        for (const link of aggregated.values()) {
            if (!outgoing.has(link.source))
                outgoing.set(link.source, new Set());
            outgoing.get(link.source)!.add(link.target);
        }

        // Step 3: Find root nodes (sources that never appear as targets)
        const allTargets = new Set(
            Array.from(aggregated.values()).map((l) => l.target),
        );
        const allSources = new Set(
            Array.from(aggregated.values()).map((l) => l.source),
        );
        let roots = [...allSources].filter((s) => !allTargets.has(s));
        if (roots.length === 0) roots = [...allSources].slice(0, 1); // fallback for pure cycles

        // Step 4: BFS to discover node depths and edges.
        // Each original edge (e.g., "Conversion→Retargeting") is placed exactly
        // once. This prevents cycles from creating infinite depth expansion.
        const MAX_DEPTH = 50;

        // Track all depths each node appears at
        const nodeDepthMap = new Map<string, Set<number>>();
        // Track edges with depth info
        const edgeInstances: {
            source: string;
            sourceDepth: number;
            target: string;
            targetDepth: number;
        }[] = [];
        // Track which original edges have been placed (stop BFS when all placed)
        const placedOriginalEdges = new Set<string>();

        type BFSItem = { name: string; depth: number };
        const queue: BFSItem[] = roots.map((n) => ({ name: n, depth: 0 }));
        const visited = new Set<string>(); // "name:depth"
        let maxDepth = 0;

        while (queue.length > 0) {
            const { name, depth } = queue.shift()!;
            if (depth > MAX_DEPTH) continue;

            const key = `${name}:${depth}`;
            if (visited.has(key)) continue;
            visited.add(key);

            if (!nodeDepthMap.has(name)) nodeDepthMap.set(name, new Set());
            nodeDepthMap.get(name)!.add(depth);
            if (depth > maxDepth) maxDepth = depth;

            const targets = outgoing.get(name);
            if (!targets) continue;

            for (const target of targets) {
                const originalEdgeKey = `${name}→${target}`;
                // Each original edge is placed only once to prevent
                // cycles from expanding infinitely
                if (placedOriginalEdges.has(originalEdgeKey)) continue;
                placedOriginalEdges.add(originalEdgeKey);

                const targetDepth = depth + 1;
                edgeInstances.push({
                    source: name,
                    sourceDepth: depth,
                    target,
                    targetDepth,
                });
                queue.push({ name: target, depth: targetDepth });
            }
        }

        // Step 5: Determine which nodes need step suffixes (appear at multiple depths)
        const multiDepthNodes = new Set<string>();
        for (const [name, depths] of nodeDepthMap) {
            if (depths.size > 1) multiDepthNodes.add(name);
        }

        const getLabel = (name: string, depth: number) => {
            if (multiDepthNodes.has(name)) return `${name} - Step ${depth}`;
            return name;
        };

        // Step 6: Build final nodes and links
        const nodeSet = new Set<string>();
        const finalLinks: SankeySeriesDataPoint['links'] = [];
        const placedLinks = new Set<string>();

        for (const edge of edgeInstances) {
            const sourceLabel = getLabel(edge.source, edge.sourceDepth);
            const targetLabel = getLabel(edge.target, edge.targetDepth);

            nodeSet.add(sourceLabel);
            nodeSet.add(targetLabel);

            const linkKey = `${sourceLabel}→${targetLabel}`;
            if (placedLinks.has(linkKey)) continue;
            placedLinks.add(linkKey);

            const aggKey = `${edge.source}→${edge.target}`;
            const aggLink = aggregated.get(aggKey);
            if (!aggLink) continue;

            finalLinks.push({
                source: sourceLabel,
                target: targetLabel,
                value: aggLink.value,
                meta: aggLink.meta,
            });
        }

        return {
            nodes: Array.from(nodeSet).map((name) => ({ name })),
            links: finalLinks,
            maxDepth,
        };
    }, [resultsData, sourceFieldId, targetFieldId, metricFieldId]);

    const colorDefaults = useMemo(() => {
        return Object.fromEntries(
            data.nodes.map((node, index) => [
                node.name,
                colorPalette[index % colorPalette.length],
            ]),
        );
    }, [data.nodes, colorPalette]);

    const onColorOverridesChange = useCallback((key: string, value: string) => {
        setColorOverrides(({ [key]: _, ...rest }) => {
            return value.trim() === '' ? rest : { ...rest, [key]: value };
        });
    }, []);

    const onLabelOverridesChange = useCallback((key: string, value: string) => {
        setLabelOverrides(({ [key]: _, ...rest }) => {
            return value.trim() === '' ? rest : { ...rest, [key]: value };
        });
    }, []);

    const getFieldLabel = useCallback(
        (fieldId: string) => {
            const item = itemsMap?.[fieldId];
            return item && isField(item)
                ? getItemLabelWithoutTableName(item)
                : fieldId;
        },
        [itemsMap],
    );

    // Keep a reference to getFieldLabel to suppress lint warnings
    void getFieldLabel;

    const validConfig: SankeyChart = useMemo(
        () => ({
            sourceFieldId: sourceFieldId ?? undefined,
            targetFieldId: targetFieldId ?? undefined,
            metricFieldId: metricFieldId ?? undefined,
            nodeAlign,
            orient,
            colorOverrides,
            labelOverrides: debouncedLabelOverrides,
        }),
        [
            sourceFieldId,
            targetFieldId,
            metricFieldId,
            nodeAlign,
            orient,
            colorOverrides,
            debouncedLabelOverrides,
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
        colorOverrides,
        onColorOverridesChange,
        labelOverrides,
        onLabelOverridesChange,
        colorDefaults,
        data,
    };
};

export default useSankeyChartConfig;
