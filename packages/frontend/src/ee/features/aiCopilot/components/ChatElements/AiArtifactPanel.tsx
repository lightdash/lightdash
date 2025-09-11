import { Box, Center, Loader, Stack, Text } from '@mantine-8/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentStoreSelector } from '../../store/hooks';
import { AiChartVisualization } from './AiChartVisualization';
import { AiDashboardVisualization } from './AiDashboardVisualization';
import { ChatElementsUtils } from './utils';

export const AiArtifactPanel: FC = memo(() => {
    const artifact = useAiAgentStoreSelector(
        (state) => state.aiArtifact.artifact,
    );

    if (!artifact) {
        throw new Error('Artifact is required');
    }

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

    if (
        artifactError ||
        !artifactData ||
        (artifactData.artifactType === 'dashboard' &&
            !artifactData.dashboardConfig) ||
        (artifactData.artifactType === 'chart' && !artifactData.chartConfig)
    ) {
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

    if (artifactData.artifactType === 'dashboard') {
        return (
            <Box {...ChatElementsUtils.centeredElementProps} p="md">
                <Stack gap="md" h="100%">
                    <AiDashboardVisualization
                        artifactData={artifactData}
                        projectUuid={artifact.projectUuid}
                        agentUuid={artifact.agentUuid}
                        dashboardConfig={artifactData.dashboardConfig!}
                    />
                </Stack>
            </Box>
        );
    }

    // Handle chart artifacts (existing logic)
    return (
        <Box {...ChatElementsUtils.centeredElementProps} p="md">
            <Stack gap="md" h="100%">
                <AiChartVisualization
                    artifactData={artifactData}
                    projectUuid={artifact.projectUuid}
                    agentUuid={artifact.agentUuid}
                    artifactUuid={artifact.artifactUuid}
                    versionUuid={artifact.versionUuid}
                    message={artifact.message}
                />
            </Stack>
        </Box>
    );
});
