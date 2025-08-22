import { parseVizConfig } from '@lightdash/common';
import { Box, Center, Loader, Stack, Text } from '@mantine-8/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentArtifactVizQuery } from '../../hooks/useOrganizationAiAgents';
import { type ArtifactData } from '../../providers/AiLayoutProvider';
import { AiChartVisualization } from './AiChartVisualization';
import { ChatElementsUtils } from './utils';

interface AiArtifactPanelProps {
    artifact: ArtifactData;
}

export const AiArtifactPanel: FC<AiArtifactPanelProps> = memo(
    ({ artifact }) => {
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
                        <MantineIcon
                            icon={IconExclamationCircle}
                            color="gray"
                        />
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
                        <MantineIcon
                            icon={IconExclamationCircle}
                            color="gray"
                        />
                        <Text size="xs" c="dimmed" ta="center">
                            Something went wrong loading the visualization data.
                            Please try again.
                        </Text>
                    </Stack>
                ) : (
                    <AiChartVisualization
                        results={queryResults}
                        message={artifact.message}
                        queryExecutionHandle={queryExecutionHandle}
                        projectUuid={artifact.projectUuid}
                    />
                )}
            </Box>
        );
    },
);
