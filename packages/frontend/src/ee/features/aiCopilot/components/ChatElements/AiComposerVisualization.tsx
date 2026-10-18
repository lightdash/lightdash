import {
    derivePivotConfigurationFromChart,
    ECHARTS_DEFAULT_COLORS,
    getComposerChartConfig,
    getComposerDefaultChartType,
    getComposerPivotDimensions,
    pivotConfigurationToColumns,
    rekeyPivotDetails,
    rekeyResultRows,
    type AiAgentChartTypeOption,
    type AiComposerChartViz,
    type ApiError,
    type ChartConfig,
    type QueryNodeId,
    type SourceQuery,
} from '@lightdash/common';
import { Box, Group, Stack, useMantineColorScheme } from '@mantine/core';
import { useCallback, useMemo, type FC, type ReactNode } from 'react';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import { useProjectColorPalette } from '../../../../../hooks/appearance/useProjectColorPalette';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { type AiAgentArtifactVersionRef } from '../../hooks/useAiAgentArtifacts';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import { getAgentVisualizationChartTypes } from './AgentVisualizationChartTypeSwitcher.utils';
import styles from './AiVisualizationRenderer.module.css';
import { useArtifactNodeResults } from './useArtifactNodeResults';
import { useComposerPivotQuery } from './useComposerPivotQuery';
import { useComposerResultItems } from './useComposerResultItems';

export type ComposerVizState = {
    viz: AiComposerChartViz;
    /** The viz switcher's pick, rebuilding the chart from the intent; null draws the stored viz. */
    overrideChartType: AiAgentChartTypeOption | null;
};

type Props = {
    artifact: AiAgentArtifactVersionRef;
    nodeId: QueryNodeId;
    node: Pick<SourceQuery, 'nodeId' | 'title'> | null;
    /** The node's own result, as the run produced it. */
    results: InfiniteQueryResults;
    queryUuid: string | null;
    resolvedTimezone?: string | null;
    metadata: { title: string | null; description: string | null };
    state: ComposerVizState;
    onStateChange: (next: ComposerVizState) => void;
    /** Whether the person edits the viz (config panel, pivot); the switcher is always available. */
    canEdit: boolean;
    /** Opened by the Chart bar; config edits are only recorded once it has been. */
    configOpen: boolean;
    headerContent: ReactNode;
    /** Renders the explorer config panel for the chart type, inside the provider. */
    renderConfig?: (chartType: ChartConfig['type']) => ReactNode;
    onError?: (error: ApiError) => void;
};

/**
 * A composer node result drawn through the classic chart stack: the result
 * columns become items, the stored viz becomes an explorer `ChartConfig`, and
 * a chart that groups re-pivots the result on the compose engine.
 */
export const AiComposerVisualization: FC<Props> = ({
    artifact,
    nodeId,
    node,
    results,
    queryUuid,
    resolvedTimezone,
    metadata,
    state,
    onStateChange,
    canEdit,
    configOpen,
    headerContent,
    renderConfig,
}) => {
    const isEmbed = useIsEmbedded();
    const { colorScheme } = useMantineColorScheme();
    const { data: resolvedPalette } = useProjectColorPalette(
        artifact.projectUuid,
        {},
        { enabled: !isEmbed },
    );
    const colorPalette = useMemo(() => {
        if (colorScheme === 'dark' && resolvedPalette?.darkColors)
            return resolvedPalette.darkColors;
        return resolvedPalette?.colors ?? ECHARTS_DEFAULT_COLORS;
    }, [colorScheme, resolvedPalette]);

    const items = useComposerResultItems(results.columns, node, nodeId);
    const { viz, overrideChartType } = state;

    const chartConfig = useMemo(
        () =>
            items
                ? getComposerChartConfig({
                      viz,
                      metricQuery: items.metricQuery,
                      fieldsMap: items.itemsMap,
                      metadata,
                      overrideChartType: overrideChartType ?? undefined,
                  })
                : null,
        [items, viz, metadata, overrideChartType],
    );
    const pivotDimensions = useMemo(
        () => getComposerPivotDimensions(viz, overrideChartType ?? undefined),
        [viz, overrideChartType],
    );

    // A grouped chart needs the result pivoted; the engine does it on the stored result.
    const pivotConfiguration = useMemo(() => {
        if (!items || !chartConfig || !pivotDimensions?.length) return null;
        const derived = derivePivotConfigurationFromChart(
            { chartConfig, pivotConfig: { columns: pivotDimensions } },
            items.metricQuery,
            items.itemsMap,
        );
        return derived
            ? pivotConfigurationToColumns(derived, items.columnByFieldId)
            : null;
    }, [items, chartConfig, pivotDimensions]);
    const pivot = useComposerPivotQuery({
        artifact,
        sourceQueryUuid: queryUuid,
        pivotConfiguration,
    });
    const pivotResults = useArtifactNodeResults(
        artifact,
        pivotConfiguration ? (pivot.data?.queryUuid ?? null) : null,
    );
    const displayed = pivotConfiguration ? pivotResults : results;

    const resultsData = useMemo(() => {
        if (!items) return null;
        return {
            ...displayed,
            rows: rekeyResultRows(displayed.rows, items.fieldIdByColumn),
            pivotDetails: displayed.pivotDetails
                ? rekeyPivotDetails(
                      displayed.pivotDetails,
                      items.fieldIdByColumn,
                  )
                : displayed.pivotDetails,
            metricQuery: items.metricQuery,
            fields: items.itemsMap,
            resolvedTimezone: resolvedTimezone ?? undefined,
        };
    }, [displayed, items, resolvedTimezone]);

    const columnOrder = useMemo(
        () =>
            items
                ? [
                      ...items.metricQuery.dimensions,
                      ...items.metricQuery.metrics,
                  ]
                : [],
        [items],
    );

    const handleChartConfigChange = useCallback(
        (next: ChartConfig) => {
            if (!canEdit || !configOpen) return;
            onStateChange({
                viz: { ...viz, chartConfig: next },
                overrideChartType: null,
            });
        },
        [canEdit, configOpen, onStateChange, viz],
    );
    const handlePivotDimensionsChange = useCallback(
        (next: string[] | undefined) => {
            if (!canEdit || !configOpen) return;
            onStateChange({
                viz: {
                    ...viz,
                    pivotConfig:
                        next && next.length > 0 ? { columns: next } : null,
                },
                overrideChartType: null,
            });
        },
        [canEdit, configOpen, onStateChange, viz],
    );
    const handleChartTypeChange = useCallback(
        (type: AiAgentChartTypeOption) =>
            onStateChange({ viz, overrideChartType: type }),
        [onStateChange, viz],
    );

    if (!items || !chartConfig || !resultsData) return <>{headerContent}</>;

    const selectedChartType =
        overrideChartType ?? getComposerDefaultChartType(viz) ?? null;
    const isLoading =
        resultsData.isFetchingRows ||
        (pivotConfiguration !== null &&
            (pivot.isLoading || pivotResults.isFetchingRows));

    return (
        <VisualizationProvider
            hasExplorerStore={false}
            key={`${nodeId}:${overrideChartType ?? 'stored'}`}
            resultsData={resultsData}
            chartConfig={chartConfig}
            columnOrder={columnOrder}
            initialPivotDimensions={pivotDimensions}
            colorPalette={colorPalette}
            isLoading={isLoading}
            onChartConfigChange={handleChartConfigChange}
            onPivotDimensionsChange={handlePivotDimensionsChange}
            unsavedMetricQuery={items.metricQuery}
        >
            <Stack
                gap="md"
                h="100%"
                w="100%"
                maw="100%"
                className={styles.root}
            >
                {headerContent}
                <Group justify="flex-end" px="md">
                    <AgentVisualizationChartTypeSwitcher
                        availableChartTypes={getAgentVisualizationChartTypes(
                            items.metricQuery,
                            (pivotDimensions?.length ?? 0) > 0,
                        )}
                        selectedChartType={selectedChartType ?? 'table'}
                        onChartTypeChange={handleChartTypeChange}
                        variant="pill"
                    />
                </Group>
                <Box
                    flex="1"
                    mih={0}
                    miw={0}
                    w="100%"
                    maw="100%"
                    className={styles.flushViz}
                >
                    <LightdashVisualization
                        className="sentry-block ph-no-capture"
                        data-testid="ai-composer-visualization"
                        enableContextMenu={false}
                    />
                </Box>
                {renderConfig?.(chartConfig.type)}
            </Stack>
        </VisualizationProvider>
    );
};
