import {
    ECHARTS_DEFAULT_COLORS,
    type LinkedChartDrillState,
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
} from '@mantine-8/core';
import { IconArrowLeft, IconExternalLink, IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useLinkedChartDrillResults } from '../hooks/useLinkedChartDrillResults';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useSavedQuery } from '../hooks/useSavedQuery';
import Page from './common/Page/Page';
import MantineIcon from './common/MantineIcon';
import LightdashVisualization from './LightdashVisualization';
import VisualizationProvider from './LightdashVisualization/VisualizationProvider';

type Props = {
    drillContext: LinkedChartDrillState;
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
    } = useLinkedChartDrillResults(
        drillContext.sourceChartUuid,
        drillContext.drillSteps,
        true,
    );

    const isLoading = isChartLoading || isQueryLoading;
    const isReady = !isLoading && !queryError && linkedChart && drillResults;

    const handleViewChart = () => {
        navigate(
            `/projects/${projectUuid}/saved/${drillContext.linkedChartUuid}`,
        );
    };

    return (
        <Page title={linkedChart?.name ?? 'Drill through'} withFullHeight>
            <Stack h="100%" p="lg" gap="md">
                <Paper
                    withBorder
                    radius="sm"
                    style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
                >
                    <Group
                        gap="sm"
                        justify="space-between"
                        px="sm"
                        py="xs"
                        style={{
                            borderBottom: '1px solid var(--mantine-color-default-border)',
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
                            {drillContext.filterSummary && (
                                <Badge
                                    size="sm"
                                    variant="light"
                                    color="gray"
                                    leftSection={<IconFilter size={10} />}
                                >
                                    {drillContext.filterSummary}
                                </Badge>
                            )}
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

                    <div style={{ flex: 1, minHeight: 0, padding: 'var(--mantine-spacing-sm)' }}>
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

                        {isReady &&
                            linkedChart.chartConfig &&
                            drillResults && (
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
                                        metricQuery:
                                            drillResults.metricQuery,
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
                                        linkedChart.tableConfig
                                            .columnOrder ?? []
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
                            )}
                    </div>
                </Paper>
            </Stack>
        </Page>
    );
};

export default DrillThroughPage;
