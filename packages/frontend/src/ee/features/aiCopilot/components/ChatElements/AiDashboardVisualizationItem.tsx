import {
    type ToolTableVizArgs,
    type ToolTimeSeriesArgs,
    type ToolVerticalBarArgs,
} from '@lightdash/common';
import {
    Box,
    Center,
    Group,
    HoverCard,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconExclamationCircle } from '@tabler/icons-react';
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

        const VisualizationHeader = () => (
            <Stack gap="two" flex={1}>
                <Title order={4} size="h6">
                    {visualization.title}
                </Title>
                {visualization.description && (
                    <Text c="dimmed" size="11px" fw={400}>
                        {visualization.description}
                    </Text>
                )}
            </Stack>
        );

        if (isQueryLoading) {
            return (
                <Stack gap="sm">
                    <VisualizationHeader />

                    {/* Loading State */}
                    <Paper p="md" bg="gray.0">
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
                    <VisualizationHeader />
                    {/* Error State */}
                    <Paper p="md" bg="gray.0">
                        <Center h={100}>
                            <Stack gap="xs" align="center">
                                <HoverCard withinPortal position="left">
                                    <HoverCard.Target>
                                        <MantineIcon
                                            icon={IconExclamationCircle}
                                        />
                                    </HoverCard.Target>
                                    <HoverCard.Dropdown p={0} maw={500}>
                                        <Prism
                                            language="json"
                                            withLineNumbers
                                            styles={{
                                                code: {
                                                    fontSize: 10,
                                                },
                                            }}
                                        >
                                            {JSON.stringify(
                                                visualization,
                                                null,
                                                2,
                                            )}
                                        </Prism>
                                    </HoverCard.Dropdown>
                                </HoverCard>

                                <Group>
                                    <Text
                                        size="xs"
                                        c="dimmed"
                                        fw={500}
                                        ta="center"
                                    >
                                        Failed to load visualization
                                    </Text>
                                </Group>
                                <Text size="xs" c="dimmed" ta="center">
                                    {queryError?.error.message}
                                </Text>
                            </Stack>
                        </Center>
                    </Paper>
                </Stack>
            );
        }

        return (
            <Stack gap="sm">
                <VisualizationHeader />

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
