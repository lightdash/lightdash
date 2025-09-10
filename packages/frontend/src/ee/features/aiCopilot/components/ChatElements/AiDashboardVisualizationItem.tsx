import {
    AiResultType,
    assertUnreachable,
    type ToolTableVizArgs,
    type ToolTimeSeriesArgs,
    type ToolVerticalBarArgs,
} from '@lightdash/common';
import {
    Box,
    Center,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconChartBar,
    IconChartLine,
    IconExclamationCircle,
    IconTable,
} from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useAiAgentDashboardChartVizQuery } from '../../hooks/useProjectAiAgents';
import { AiVisualizationRenderer } from './AiVisualizationRenderer';

type Props = {
    visualization: ToolTableVizArgs | ToolTimeSeriesArgs | ToolVerticalBarArgs;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    artifactUuid: string;
    versionUuid: string;
    index: number;
};

export const AiDashboardVisualizationItem: FC<Props> = memo(
    ({
        visualization,
        projectUuid,
        agentUuid,
        threadUuid: _threadUuid,
        artifactUuid,
        versionUuid,
        index,
    }) => {
        const getVisualizationIcon = () => {
            const type = visualization.type;
            switch (type) {
                case AiResultType.TABLE_RESULT:
                    return IconTable;
                case AiResultType.VERTICAL_BAR_RESULT:
                    return IconChartBar;
                case AiResultType.TIME_SERIES_RESULT:
                    return IconChartLine;
                default:
                    return assertUnreachable(
                        type,
                        `invalid visualization type ${type}`,
                    );
            }
        };

        const VisualizationIcon = getVisualizationIcon();

        // Fetch the chart query data
        const queryExecutionHandle = useAiAgentDashboardChartVizQuery({
            projectUuid,
            agentUuid,
            artifactUuid,
            versionUuid,
            chartIndex: index,
        });

        const queryResults = useInfiniteQueryResults(
            projectUuid,
            queryExecutionHandle.data?.query?.queryUuid,
        );

        const isQueryLoading =
            queryExecutionHandle.isLoading || queryResults.isFetchingRows;
        const queryError = queryExecutionHandle.error || queryResults.error;

        if (isQueryLoading) {
            return (
                <Stack gap="sm">
                    {/* Visualization Header */}
                    <Group align="start">
                        <MantineIcon
                            icon={VisualizationIcon}
                            color="blue"
                            size="lg"
                        />
                        <Stack gap="xs" flex={1}>
                            <Title order={4} size="h5">
                                {visualization.title}
                            </Title>
                            {visualization.description && (
                                <Text c="dimmed" size="sm">
                                    {visualization.description}
                                </Text>
                            )}
                        </Stack>
                    </Group>

                    {/* Loading State */}
                    <Paper p="md" withBorder radius="md" bg="gray.0">
                        <Center h={200}>
                            <Stack gap="xs" align="center">
                                <Loader type="dots" color="gray" />
                                <Text size="sm" c="dimmed" ta="center">
                                    Loading visualization...
                                </Text>
                            </Stack>
                        </Center>
                    </Paper>
                </Stack>
            );
        }

        if (queryError || !queryExecutionHandle.data) {
            return (
                <Stack gap="sm">
                    {/* Visualization Header */}
                    <Group align="start">
                        <MantineIcon
                            icon={VisualizationIcon}
                            color="blue"
                            size="lg"
                        />
                        <Stack gap="xs" flex={1}>
                            <Title order={4} size="h5">
                                {visualization.title}
                            </Title>
                            {visualization.description && (
                                <Text c="dimmed" size="sm">
                                    {visualization.description}
                                </Text>
                            )}
                        </Stack>
                    </Group>

                    {/* Error State */}
                    <Paper p="md" withBorder radius="md" bg="gray.0">
                        <Center h={200}>
                            <Stack gap="xs" align="center">
                                <MantineIcon
                                    icon={IconExclamationCircle}
                                    color="red"
                                />
                                <Text size="sm" c="dimmed" ta="center">
                                    Failed to load visualization
                                </Text>
                            </Stack>
                        </Center>
                    </Paper>
                </Stack>
            );
        }

        return (
            <Stack gap="sm">
                {/* Visualization Header */}
                <Group align="start">
                    <MantineIcon
                        icon={VisualizationIcon}
                        color="blue"
                        size="lg"
                    />
                    <Stack gap="xs" flex={1}>
                        <Title order={4} size="h5">
                            {visualization.title}
                        </Title>
                        {visualization.description && (
                            <Text c="dimmed" size="sm">
                                {visualization.description}
                            </Text>
                        )}
                    </Stack>
                </Group>

                {/* Actual Visualization */}
                <Box mih={300}>
                    <AiVisualizationRenderer
                        results={queryResults}
                        queryExecutionHandle={queryExecutionHandle}
                        chartConfig={visualization}
                    />
                </Box>
            </Stack>
        );
    },
);

AiDashboardVisualizationItem.displayName = 'AiDashboardVisualizationItem';
