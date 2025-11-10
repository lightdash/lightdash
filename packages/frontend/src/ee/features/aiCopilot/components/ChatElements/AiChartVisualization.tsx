import {
    parseVizConfig,
    type AiAgentMessageAssistant,
    type AiArtifact,
} from '@lightdash/common';
import { Center, Loader, Paper, Stack, Text } from '@mantine-8/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useCompiledSqlFromMetricQuery } from '../../../../../hooks/useCompiledSql';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useAiAgentArtifactVizQuery } from '../../hooks/useProjectAiAgents';
import { clearArtifact } from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AiChartVisualizationHeader } from './AiChartVisualizationHeader';
import { AiVisualizationRenderer } from './AiVisualizationRenderer';

type Props = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    message: AiAgentMessageAssistant;
    showCloseButton?: boolean;
};

export const AiChartVisualization: FC<Props> = ({
    artifactData,
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
    message,
    showCloseButton = true,
}) => {
    const dispatch = useAiAgentStoreDispatch();

    const vizConfig = useMemo(() => {
        if (!artifactData?.chartConfig) return null;
        return parseVizConfig(artifactData.chartConfig);
    }, [artifactData?.chartConfig]);

    const queryExecutionHandle = useAiAgentArtifactVizQuery(
        {
            projectUuid,
            agentUuid,
            artifactUuid,
            versionUuid,
        },
        { enabled: !!vizConfig },
    );

    const queryResults = useInfiniteQueryResults(
        projectUuid,
        queryExecutionHandle?.data?.query.queryUuid,
    );

    const { data: compiledSql } = useCompiledSqlFromMetricQuery({
        tableName: queryExecutionHandle.data?.query.metricQuery?.exploreName,
        projectUuid,
        metricQuery: queryExecutionHandle.data?.query.metricQuery,
    });

    const isQueryLoading =
        queryExecutionHandle.isLoading || queryResults.isFetchingRows;
    const isQueryError = queryExecutionHandle.isError || queryResults.error;

    if (isQueryLoading) {
        return (
            <Center h="100%">
                <Loader
                    color="gray"
                    delayedMessage="Loading visualization..."
                />
            </Center>
        );
    }

    if (isQueryError) {
        return (
            <Stack h="100%" gap="md">
                <AiChartVisualizationHeader
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    artifactData={artifactData}
                    message={message}
                    title="Visualization Error"
                    description="Unable to load data for this visualization"
                    compiledSql={compiledSql?.query}
                    showCloseButton={showCloseButton}
                    onClose={() => dispatch(clearArtifact())}
                />
                <Paper h="100%" bg="gray.0">
                    <Stack gap="xs" align="center" justify="center" h="100%">
                        <MantineIcon
                            icon={IconExclamationCircle}
                            color="gray"
                        />
                        <Text size="xs" c="dimmed" ta="center">
                            Something went wrong loading the visualization data.
                            Please try again.
                        </Text>
                    </Stack>
                </Paper>
            </Stack>
        );
    }

    if (!queryExecutionHandle.data || !vizConfig) {
        return null;
    }

    return (
        <Stack gap="md" h="100%">
            <AiVisualizationRenderer
                results={queryResults}
                queryExecutionHandle={queryExecutionHandle}
                chartConfig={artifactData.chartConfig!}
                headerContent={
                    <AiChartVisualizationHeader
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        artifactData={artifactData}
                        message={message}
                        title={queryExecutionHandle.data.metadata.title}
                        description={
                            queryExecutionHandle.data.metadata.description ??
                            null
                        }
                        compiledSql={compiledSql?.query}
                        showCloseButton={showCloseButton}
                        onClose={() => dispatch(clearArtifact())}
                    />
                }
            />
        </Stack>
    );
};
