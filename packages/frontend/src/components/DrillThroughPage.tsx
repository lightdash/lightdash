import {
    ECHARTS_DEFAULT_COLORS,
    type DrillThroughState,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Center,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconArrowLeft,
    IconExternalLink,
    IconFilter,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useDrillThroughResults } from '../hooks/useDrillThroughResults';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useSavedQuery } from '../hooks/useSavedQuery';
import MantineIcon from './common/MantineIcon';
import Page from './common/Page/Page';
import LightdashVisualization from './LightdashVisualization';
import VisualizationProvider from './LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from './MetricQueryData/MetricQueryDataProvider';

type Props = {
    drillContext: DrillThroughState;
};

const DrillThroughPage: FC<Props> = ({ drillContext }) => {
    const navigate = useNavigate();
    const projectUuid = useProjectUuid();
    const { data: org } = useOrganization();
    const colorPalette = org?.chartColors ?? ECHARTS_DEFAULT_COLORS;

    const { data: linkedChart, isLoading: isChartLoading } = useSavedQuery({
        uuidOrSlug: drillContext.linkedChartUuid,
        projectUuid,
    });

    const {
        data: drillResults,
        isLoading: isQueryLoading,
        error: queryError,
    } = useDrillThroughResults(
        drillContext.sourceChartUuid,
        drillContext.drillSteps,
        true,
    );

    const skippedFieldIds = useMemo(() => {
        const warnings = drillResults?.warnings ?? [];
        return new Set(warnings.flatMap((w) => w.fields ?? []));
    }, [drillResults?.warnings]);
    const isLoading = isChartLoading || isQueryLoading;
    const isReady = !isLoading && !queryError && linkedChart && drillResults;

    const handleViewChart = () => {
        void navigate(
            `/projects/${projectUuid}/saved/${drillContext.linkedChartUuid}`,
        );
    };

    return (
        <Page title={linkedChart?.name ?? 'Drill through'} withFullHeight>
            <Stack h="100%" p="lg" gap="md">
                <Paper
                    withBorder
                    radius="sm"
                    style={{
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <Group
                        gap="sm"
                        justify="space-between"
                        px="sm"
                        py="xs"
                        style={{
                            borderBottom:
                                '1px solid var(--mantine-color-default-border)',
                        }}
                    >
                        <Group gap="xs">
                            {drillContext.target === 'navigate' && (
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    onClick={() => navigate(-1)}
                                >
                                    <IconArrowLeft size={16} />
                                </ActionIcon>
                            )}
                            <Title order={5}>
                                {linkedChart?.name ?? 'Loading...'}
                            </Title>
                            {drillContext.filterDetails.map((detail) => {
                                const isSkipped = skippedFieldIds.has(
                                    detail.fieldId,
                                );
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
                                        <Text
                                            component="span"
                                            fz="inherit"
                                            fw={700}
                                        >
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
                        <Button
                            variant="subtle"
                            size="compact-xs"
                            rightSection={
                                <MantineIcon icon={IconExternalLink} />
                            }
                            onClick={handleViewChart}
                        >
                            View full chart
                        </Button>
                    </Group>

                    <div
                        style={{
                            flex: 1,
                            minHeight: 0,
                            padding: 'var(--mantine-spacing-sm)',
                        }}
                    >
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
                                    <Text
                                        c="dimmed"
                                        fz="xs"
                                        maw={400}
                                        ta="center"
                                    >
                                        {queryError.error?.message ??
                                            'Query failed'}
                                    </Text>
                                </Stack>
                            </Center>
                        )}

                        {isReady && linkedChart.chartConfig && drillResults && (
                            <MetricQueryDataProvider
                                metricQuery={drillResults.metricQuery}
                                tableName={linkedChart.tableName}
                                explore={undefined}
                                queryUuid={drillResults.queryUuid}
                            >
                                <VisualizationProvider
                                    chartConfig={linkedChart.chartConfig}
                                    initialPivotDimensions={
                                        linkedChart.pivotConfig?.columns
                                    }
                                    unsavedMetricQuery={
                                        drillResults.metricQuery ??
                                        linkedChart.metricQuery
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
                                    columnOrder={
                                        linkedChart.tableConfig.columnOrder ??
                                        []
                                    }
                                    pivotTableMaxColumnLimit={1000}
                                    colorPalette={colorPalette}
                                    isDashboard={false}
                                >
                                    <LightdashVisualization
                                        className="sentry-block ph-no-capture"
                                        data-testid="drill-visualization"
                                    />
                                </VisualizationProvider>
                            </MetricQueryDataProvider>
                        )}
                    </div>
                </Paper>
            </Stack>
        </Page>
    );
};

export default DrillThroughPage;
