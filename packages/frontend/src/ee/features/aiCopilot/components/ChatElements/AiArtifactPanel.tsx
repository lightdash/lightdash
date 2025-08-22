import { parseVizConfig } from '@lightdash/common';
import { Box, Center, Group, Loader, Stack, Text } from '@mantine-8/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useCompiledSqlFromMetricQuery } from '../../../../../hooks/useCompiledSql';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentArtifactVizQuery } from '../../hooks/useOrganizationAiAgents';
import { useAiAgentPageLayout } from '../../providers/AiLayoutProvider';
import { AiArtifactSqlControls } from './AiArtifactSqlControls';
import { AiChartVisualization } from './AiChartVisualization';
import { ChatElementsUtils } from './utils';

export const AiArtifactPanel: FC = memo(() => {
    const { artifact } = useAiAgentPageLayout();

    if (!artifact) {
        throw new Error('Artifact is required');
    }

    // Always call hooks, even if artifact is null
    const {
        data: artifactData,
        isLoading: isArtifactLoading,
        error: artifactError,
    } = useAiAgentArtifact({
        projectUuid: artifact.projectUuid,
        agentUuid: artifact.agentUuid,
        artifactUuid: artifact.artifactUuid,
        versionUuid: artifact.versionUuid,
    });

    const vizConfig = useMemo(() => {
        if (!artifactData?.chartConfig) return null;
        return parseVizConfig(artifactData.chartConfig);
    }, [artifactData?.chartConfig]);

    const queryExecutionHandle = useAiAgentArtifactVizQuery(
        {
            projectUuid: artifact.projectUuid,
            agentUuid: artifact.agentUuid,
            artifactUuid: artifact.artifactUuid,
            versionUuid: artifact.versionUuid,
        },
        { enabled: !!vizConfig && !!artifact },
    );

    const queryResults = useInfiniteQueryResults(
        artifact.projectUuid,
        queryExecutionHandle?.data?.query.queryUuid,
    );

    const { data: compiledSql } = useCompiledSqlFromMetricQuery({
        tableName: vizConfig?.metricQuery?.exploreName,
        projectUuid: artifact.projectUuid,
        metricQuery: vizConfig?.metricQuery
            ? {
                  ...vizConfig.metricQuery,
                  tableCalculations: [],
              }
            : undefined,
    });

    const isQueryLoading =
        queryExecutionHandle.isLoading || queryResults.isFetchingRows;
    const isQueryError = queryExecutionHandle.isError || queryResults.error;

    if (isArtifactLoading) {
        return (
            <Box {...ChatElementsUtils.centeredElementProps} p="md">
                <Center>
                    <Loader
                        type="dots"
                        color="gray"
                        delayedMessage="Loading artifact..."
                    />
                </Center>
            </Box>
        );
    }

    if (artifactError || !artifactData) {
        return (
            <Box {...ChatElementsUtils.centeredElementProps} p="md">
                <Stack gap="xs" align="center" justify="center">
                    <MantineIcon icon={IconExclamationCircle} color="gray" />
                    <Text size="xs" c="dimmed" ta="center">
                        Failed to load artifact. Please try again.
                    </Text>
                </Stack>
            </Box>
        );
    }

    return (
        <Box {...ChatElementsUtils.centeredElementProps} p="md">
            {isQueryLoading ? (
                <Center>
                    <Loader
                        type="dots"
                        color="gray"
                        delayedMessage="Loading visualization..."
                    />
                </Center>
            ) : isQueryError ? (
                <Stack gap="xs" align="center" justify="center">
                    <MantineIcon icon={IconExclamationCircle} color="gray" />
                    <Text size="xs" c="dimmed" ta="center">
                        Something went wrong loading the visualization data.
                        Please try again.
                    </Text>
                </Stack>
            ) : (
                <Stack gap="md" h="100%">
                    <AiChartVisualization
                        results={queryResults}
                        message={artifact.message}
                        queryExecutionHandle={queryExecutionHandle}
                        projectUuid={artifact.projectUuid}
                    />
                    {/* TODO ADJUST POSITIONING */}
                    <Group justify="center" gap="xs">
                        {compiledSql?.query && (
                            <AiArtifactSqlControls
                                sql={compiledSql.query}
                                projectUuid={artifact.projectUuid}
                            />
                        )}

                        {/* <Text size="xs" c="dimmed" ta="center">
                            {capitalize(artifactData.artifactType)} • v
                            {artifactData.versionNumber || 'latest'}
                        </Text> */}
                    </Group>
                </Stack>
            )}
        </Box>
    );
});
