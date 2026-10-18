import { subject } from '@casl/ability';
import {
    getPipelineSqlChartSource,
    type ChartConfig,
    type SavedChart,
} from '@lightdash/common';
import { Box, Button, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import Page from '../../components/common/Page/Page';
import PageHeader from '../../components/common/Page/PageHeader';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import VisualizationConfig from '../../components/Explorer/VisualizationCard/VisualizationConfig';
import { AiComposerPipelinePanel } from '../../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerPipelinePanel';
import { useAddVersionMutation } from '../../hooks/useSavedQuery';
import useApp from '../../providers/App/useApp';
import { SavedPipelineVisualization } from './SavedPipelineVisualization';
import { useSavedPipelineChartResults } from './useSavedPipelineChartResults';

type Props = {
    chart: SavedChart;
    isEditMode: boolean;
};

const NO_DISPLAYABLE_NODES: ReadonlySet<string> = new Set();
const NO_NODE_STATUSES = {};

/**
 * A saved pipeline chart's own page: the chart drawn from its run, with the
 * pipeline that produces it underneath. Editing changes the chart config
 * and pivot and saves a new version; the pipeline itself is edited where it
 * was made, in the agent thread.
 */
/**
 * Walkthrough marker for manage:SqlRunner: the chart page a saved SQL chart
 * opens on, which saving from the SQL runner lands on.
 */
const savedChartTourProps = {
    'data-tour-scope': 'manage:SqlRunner',
    'data-tour-step': '1',
    'data-tour-route': '/projects/:projectUuid/saved/:savedQueryUuid/view',
    'data-tour-label': 'The chart is saved in its space',
    'data-tour-docs': 'explore/sql-runner.mdx#intro:p2:1',
    'data-tour-return': 'none',
    'data-tour-resultdocs':
        'explore/sql-runner.mdx#saved-charts-in-the-sql-runner:1',
};

export const SavedPipelineChartPage: FC<Props> = ({ chart, isEditMode }) => {
    const navigate = useNavigate();
    const { user } = useApp();
    const [chartConfig, setChartConfig] = useState<ChartConfig>(
        chart.chartConfig,
    );
    const [pivotDimensions, setPivotDimensions] = useState<
        string[] | undefined
    >(chart.pivotConfig?.columns);
    const { resultsData, isLoading, error } =
        useSavedPipelineChartResults(chart);
    const { mutateAsync: saveVersion, isLoading: isSaving } =
        useAddVersionMutation();

    const canManage =
        user.data?.ability.can(
            'manage',
            subject('SavedChart', {
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
                inheritsFromOrgOrProject: chart.inheritsFromOrgOrProject,
                access: chart.access,
            }),
        ) ?? false;
    const viewPath = `/projects/${chart.projectUuid}/saved/${chart.uuid}`;
    const pipeline = chart.pipeline;

    const handleSave = async () => {
        await saveVersion({
            uuid: chart.uuid,
            payload: {
                tableName: chart.tableName,
                metricQuery: chart.metricQuery,
                chartConfig,
                tableConfig: chart.tableConfig,
                pivotConfig:
                    pivotDimensions && pivotDimensions.length > 0
                        ? { columns: pivotDimensions }
                        : undefined,
                parameters: chart.parameters,
                pipeline: chart.pipeline,
            },
        });
    };

    // A chart whose pipeline is one SQL node edits its statement in the SQL runner
    const sqlRunnerEditPath =
        chart.pipeline && getPipelineSqlChartSource(chart.pipeline)
            ? `/projects/${chart.projectUuid}/sql-runner/${chart.slug}`
            : null;

    const header = (
        <PageHeader>
            <Group
                justify="space-between"
                w="100%"
                wrap="nowrap"
                {...savedChartTourProps}
            >
                <Stack gap={0} miw={0}>
                    <Text fz="lg" fw={600} truncate>
                        {chart.name}
                    </Text>
                    {chart.description && (
                        <Text fz="sm" c="dimmed" truncate>
                            {chart.description}
                        </Text>
                    )}
                </Stack>
                <Group gap="xs" wrap="nowrap">
                    {isEditMode ? (
                        <>
                            <Button
                                variant="default"
                                size="xs"
                                onClick={() => void navigate(viewPath)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="xs"
                                loading={isSaving}
                                onClick={() => void handleSave()}
                            >
                                Save changes
                            </Button>
                        </>
                    ) : (
                        canManage && (
                            <Button
                                variant="default"
                                size="xs"
                                onClick={() =>
                                    void navigate(
                                        sqlRunnerEditPath ?? `${viewPath}/edit`,
                                    )
                                }
                            >
                                Edit chart
                            </Button>
                        )
                    )}
                </Group>
            </Group>
        </PageHeader>
    );

    const visualization = error ? (
        <SuboptimalState
            title="Error loading chart"
            description={error.error.message}
        />
    ) : (
        <SavedPipelineVisualization
            chart={chart}
            resultsData={resultsData}
            isLoading={isLoading}
            chartConfig={chartConfig}
            pivotDimensions={pivotDimensions}
            onChartConfigChange={isEditMode ? setChartConfig : undefined}
            onPivotDimensionsChange={
                isEditMode ? setPivotDimensions : undefined
            }
        >
            {isEditMode && (
                <ScrollArea.Autosize mah="40vh" type="auto" p="md">
                    <VisualizationConfig chartType={chartConfig.type} />
                </ScrollArea.Autosize>
            )}
        </SavedPipelineVisualization>
    );

    return (
        <Page title={chart.name} header={header} withFullHeight>
            <Box h="100%" mih={0} display="flex">
                {pipeline ? (
                    <AiComposerPipelinePanel
                        projectUuid={chart.projectUuid}
                        queries={pipeline.queries}
                        terminalNodeId={pipeline.terminalNodeId}
                        displayedNodeId={pipeline.terminalNodeId}
                        displayableNodeIds={NO_DISPLAYABLE_NODES}
                        onDisplayNode={() => {}}
                        nodeStatuses={NO_NODE_STATUSES}
                    >
                        {visualization}
                    </AiComposerPipelinePanel>
                ) : (
                    visualization
                )}
            </Box>
        </Page>
    );
};
