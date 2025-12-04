import {
    parseVizConfig,
    type AiAgentMessageAssistant,
    type AiArtifact,
} from '@lightdash/common';
import {
    ActionIcon,
    Center,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
import { IconExclamationCircle, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useCompiledSqlFromMetricQuery } from '../../../../../hooks/useCompiledSql';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useAiAgentArtifactVizQuery } from '../../hooks/useProjectAiAgents';
import { clearArtifact } from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AiChartQuickOptions } from './AiChartQuickOptions';
import { AiVisualizationRenderer } from './AiVisualizationRenderer';
import { ViewSqlButton } from './ViewSqlButton';

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
    const isMobile = useMediaQuery('(max-width: 768px)');

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
            <Stack h="100%">
                <Group justify="flex-end">
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="ldGray.9"
                        onClick={() => dispatch(clearArtifact())}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Group>
                <Paper h="100%" bg="ldGray.0">
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
                    <Group gap="md" align="start">
                        <Stack gap={0} flex={1}>
                            <Title order={5}>
                                {queryExecutionHandle.data.metadata.title}
                            </Title>
                            <Text c="dimmed" size="xs">
                                {queryExecutionHandle.data.metadata.description}
                            </Text>
                        </Stack>
                        <Group gap="sm" display={isMobile ? 'none' : 'flex'}>
                            <ViewSqlButton sql={compiledSql?.query} />
                            <AiChartQuickOptions
                                message={message}
                                projectUuid={projectUuid}
                                agentUuid={agentUuid}
                                artifactData={artifactData}
                                saveChartOptions={{
                                    name: queryExecutionHandle.data.metadata
                                        .title,
                                    description:
                                        queryExecutionHandle.data.metadata
                                            .description,
                                    linkToMessage: true,
                                }}
                                compiledSql={compiledSql?.query}
                            />
                            {showCloseButton && (
                                <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    color="ldGray.4"
                                    onClick={() => dispatch(clearArtifact())}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            )}
                        </Group>
                    </Group>
                }
            />
        </Stack>
    );
};
