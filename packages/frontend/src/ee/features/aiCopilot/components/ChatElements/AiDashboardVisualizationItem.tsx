import {
    type AiAgentChartTypeOption,
    type AiAgentMessageAssistant,
    type ApiAiAgentThreadMessageVizQuery,
    type ChartConfig,
    type ToolTableVizArgs,
    type ToolTimeSeriesArgs,
    type ToolVerticalBarArgs,
} from '@lightdash/common';
import {
    Center,
    Flex,
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
import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useCompiledSqlFromMetricQuery } from '../../../../../hooks/useCompiledSql';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import {
    getAiAgentDashboardChartVizQueryKey,
    useAiAgentDashboardChartVizQuery,
} from '../../hooks/useProjectAiAgents';
import { AiChartQuickOptions } from './AiChartQuickOptions';
import { AiVisualizationRenderer } from './AiVisualizationRenderer';
import { ViewSqlButton } from './ViewSqlButton';

type Props = {
    visualization: ToolTableVizArgs | ToolTimeSeriesArgs | ToolVerticalBarArgs;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    artifactUuid: string;
    versionUuid: string;
    message: AiAgentMessageAssistant;
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
        message,
        index,
    }) => {
        const queryClient = useQueryClient();

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

        const { data: compiledSql } = useCompiledSqlFromMetricQuery({
            tableName:
                queryExecutionHandle.data?.query.metricQuery?.exploreName,
            projectUuid,
            metricQuery: queryExecutionHandle.data?.query.metricQuery,
        });

        const isQueryLoading =
            queryExecutionHandle.isLoading || queryResults.isFetchingRows;
        const queryError = queryExecutionHandle.error || queryResults.error;

        const handleDashboardChartTypeChange = useCallback(
            (type: AiAgentChartTypeOption) => {
                const queryKey = getAiAgentDashboardChartVizQueryKey({
                    projectUuid,
                    agentUuid,
                    artifactUuid,
                    versionUuid,
                    chartIndex: index,
                });

                queryClient.setQueryData(
                    queryKey,
                    (oldData: ApiAiAgentThreadMessageVizQuery | undefined) => {
                        if (!oldData) return oldData;
                        return {
                            ...oldData,
                            selectedChartType: type,
                            // Clear expanded config when type changes
                            expandedChartConfig: undefined,
                        };
                    },
                );
            },
            [
                projectUuid,
                agentUuid,
                artifactUuid,
                versionUuid,
                index,
                queryClient,
            ],
        );

        const handleDashboardChartConfigChange = useCallback(
            (config: ChartConfig) => {
                const queryKey = getAiAgentDashboardChartVizQueryKey({
                    projectUuid,
                    agentUuid,
                    artifactUuid,
                    versionUuid,
                    chartIndex: index,
                });

                queryClient.setQueryData(
                    queryKey,
                    (oldData: ApiAiAgentThreadMessageVizQuery | undefined) => {
                        if (!oldData) return oldData;
                        return {
                            ...oldData,
                            expandedChartConfig: config,
                        };
                    },
                );
            },
            [
                projectUuid,
                agentUuid,
                artifactUuid,
                versionUuid,
                index,
                queryClient,
            ],
        );

        const VisualizationHeaderSimple = () => (
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

        const VisualizationHeaderWithButton = () => (
            <Group gap="md" align="start" justify="space-between">
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
                <Group gap="sm">
                    <ViewSqlButton sql={compiledSql?.query} />
                    <AiChartQuickOptions
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        saveChartOptions={{
                            name: visualization.title,
                            description: visualization.description ?? null,
                            linkToMessage: false,
                        }}
                        message={message}
                        compiledSql={compiledSql?.query}
                    />
                </Group>
            </Group>
        );

        if (isQueryLoading) {
            return (
                <Stack gap="sm">
                    <VisualizationHeaderSimple />

                    {/* Loading State */}
                    <Paper p="md" bg="ldGray.0">
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
                    <VisualizationHeaderSimple />
                    {/* Error State */}
                    <Paper p="md" bg="ldGray.0">
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
            <Flex direction="column" h="100%">
                <AiVisualizationRenderer
                    results={queryResults}
                    queryExecutionHandle={queryExecutionHandle}
                    chartConfig={visualization}
                    headerContent={<VisualizationHeaderWithButton />}
                    onDashboardChartTypeChange={handleDashboardChartTypeChange}
                    onDashboardChartConfigChange={
                        handleDashboardChartConfigChange
                    }
                />
            </Flex>
        );
    },
);

AiDashboardVisualizationItem.displayName = 'AiDashboardVisualizationItem';
