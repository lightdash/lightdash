import {
    ECHARTS_DEFAULT_COLORS,
    type ChartConfig,
    type DrillFilterDetail,
    type DrillStep,
    type MetricQuery,
} from '@lightdash/common';
import {
    Badge,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconAlertTriangle, IconFilter } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useDrillThroughResults } from '../../hooks/useDrillThroughResults';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import MantineModal from '../common/MantineModal';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';

/**
 * For inline drills, the source chart's config is passed directly.
 * For linked chart drills, the linked chart's UUID is provided and its config is fetched.
 */
type Props = {
    opened: boolean;
    onClose: () => void;
    /** The source chart that contains the drill config. Undefined for unsaved charts. */
    sourceChartUuid: string | undefined;
    /** Drill steps to send to the chart-drill endpoint */
    drillSteps: DrillStep[];
    filterSummary: string;
    filterDetails: DrillFilterDetail[];
    /** Title override — defaults to linked chart name or source chart name */
    title?: string;
} & (
    | {
          /** Inline drill: provide the source chart's rendering config */
          mode: 'inline';
          sourceChartConfig: ChartConfig;
          sourceColumnOrder: string[];
          sourcePivotColumns: string[] | undefined;
          sourceMetricQuery: MetricQuery;
      }
    | {
          /** Linked chart drill: provide the linked chart UUID to fetch */
          mode: 'linkedChart';
          linkedChartUuid: string;
      }
);

const ChartDrillModal: FC<Props> = (props) => {
    const {
        opened,
        onClose,
        sourceChartUuid,
        drillSteps,
        filterDetails,
        title: titleOverride,
    } = props;

    const projectUuid = useProjectUuid();
    const { data: org } = useOrganization();
    const colorPalette = org?.chartColors ?? ECHARTS_DEFAULT_COLORS;

    // Only fetch linked chart metadata when in linkedChart mode
    const linkedChartUuid =
        props.mode === 'linkedChart' ? props.linkedChartUuid : undefined;
    const { data: linkedChart, isLoading: isChartLoading } = useSavedQuery({
        uuidOrSlug: linkedChartUuid,
        projectUuid,
    });

    // Execute via chart-drill endpoint (view-level permissions)
    const {
        data: drillResults,
        isLoading: isQueryLoading,
        error: queryError,
    } = useDrillThroughResults(sourceChartUuid, drillSteps, opened);

    const isLoading =
        (props.mode === 'linkedChart' ? isChartLoading : false) ||
        isQueryLoading;

    // Resolve chart config based on mode
    const chartConfig =
        props.mode === 'inline'
            ? props.sourceChartConfig
            : linkedChart?.chartConfig;
    const columnOrder =
        props.mode === 'inline'
            ? props.sourceColumnOrder
            : (linkedChart?.tableConfig.columnOrder ?? []);
    const pivotColumns =
        props.mode === 'inline'
            ? props.sourcePivotColumns
            : linkedChart?.pivotConfig?.columns;
    const fallbackMetricQuery =
        props.mode === 'inline'
            ? props.sourceMetricQuery
            : linkedChart?.metricQuery;

    const displayTitle =
        titleOverride ??
        (props.mode === 'linkedChart'
            ? (linkedChart?.name ?? 'Loading...')
            : 'Drill down');

    const skippedFieldIds = useMemo(() => {
        const warnings = drillResults?.warnings ?? [];
        return new Set(warnings.flatMap((w) => w.fields ?? []));
    }, [drillResults?.warnings]);

    const isReady =
        props.mode === 'inline'
            ? !isLoading && !queryError && drillResults
            : !isLoading && !queryError && linkedChart && drillResults;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size="xl"
            title={displayTitle}
            cancelLabel={false}
        >
            {filterDetails.length > 0 && (
                <Group gap="xs">
                    {filterDetails.map((detail) => {
                        const isSkipped = skippedFieldIds.has(detail.fieldId);
                        const badge = (
                            <Badge
                                key={detail.fieldId}
                                size="sm"
                                variant="light"
                                color={isSkipped ? 'yellow' : 'gray'}
                                leftSection={
                                    isSkipped ? (
                                        <IconAlertTriangle size={10} />
                                    ) : (
                                        <IconFilter size={10} />
                                    )
                                }
                            >
                                <Text component="span" fz="inherit" fw={700}>
                                    {detail.label}
                                </Text>
                                {`: ${detail.formattedValue}`}
                            </Badge>
                        );

                        if (isSkipped) {
                            return (
                                <Tooltip
                                    key={detail.fieldId}
                                    label="This filter was not applied because the target chart does not have this field"
                                    withArrow
                                >
                                    {badge}
                                </Tooltip>
                            );
                        }
                        return badge;
                    })}
                </Group>
            )}

            <div style={{ height: 400 }}>
                {isLoading && (
                    <Center h="100%">
                        <Loader size="md" />
                    </Center>
                )}

                {queryError && (
                    <Center h="100%">
                        <Stack align="center" gap="xs">
                            <Text c="red" fz="sm" fw={500}>
                                Unable to load drill results
                            </Text>
                            <Text c="dimmed" fz="xs" maw={400} ta="center">
                                {queryError.error?.message?.includes(
                                    'unknown field id',
                                )
                                    ? 'The target chart does not have the dimensions used by this drill filter. Choose a chart that shares the same data model.'
                                    : (queryError.error?.message ??
                                      'Query failed')}
                            </Text>
                        </Stack>
                    </Center>
                )}

                {isReady && chartConfig && drillResults && (
                    <VisualizationProvider
                        chartConfig={chartConfig}
                        initialPivotDimensions={pivotColumns}
                        unsavedMetricQuery={
                            drillResults.metricQuery ?? fallbackMetricQuery
                        }
                        resultsData={{
                            rows: drillResults.rows,
                            metricQuery: drillResults.metricQuery,
                            fields: drillResults.fields,
                            isInitialLoading: false,
                            isFetchingFirstPage: false,
                            isFetchingRows: false,
                            isFetchingAllPages: false,
                            fetchMoreRows: () => {},
                            setFetchAll: () => {},
                            fetchAll: false,
                            hasFetchedAllRows: true,
                            totalClientFetchTimeMs: undefined,
                            error: null,
                        }}
                        minimal
                        isLoading={false}
                        columnOrder={columnOrder}
                        pivotTableMaxColumnLimit={1000}
                        colorPalette={colorPalette}
                        isDashboard={false}
                    >
                        <LightdashVisualization
                            className="sentry-block ph-no-capture"
                            data-testid="drill-visualization"
                        />
                    </VisualizationProvider>
                )}
            </div>
        </MantineModal>
    );
};

export default ChartDrillModal;
