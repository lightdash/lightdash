import type { AiAgentMessageAssistant } from '@lightdash/common';
import { Box, Center, Loader, Stack, Text } from '@mantine-8/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { AiArtifactPanelProvider } from './AiArtifactPanelContext';
import { AiChartVisualization } from './AiChartVisualization';
import { AiDashboardVisualization } from './AiDashboardVisualization';
import { ChatElementsUtils } from './utils';

type AiArtifactPanelProps = {
    artifact: {
        projectUuid: string;
        agentUuid: string;
        artifactUuid: string;
        versionUuid: string;
        messageUuid?: string;
        threadUuid?: string;
    };
    showCloseButton?: boolean;
};

export const AiArtifactPanel: FC<AiArtifactPanelProps> = memo(
    ({ artifact, showCloseButton = true }) => {
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

        const hasMessage = !!(artifact.threadUuid && artifact.messageUuid);

        const { data: thread } = useAiAgentThread(
            artifact.projectUuid,
            artifact.agentUuid,
            artifact.threadUuid ?? '',
            {
                enabled: hasMessage,
            },
        );

        const message = useMemo(() => {
            if (!thread) return undefined;
            return thread.messages.find(
                (msg) =>
                    msg.role === 'assistant' &&
                    msg.uuid === artifact.messageUuid,
            ) as AiAgentMessageAssistant | undefined;
        }, [thread, artifact.messageUuid]);

        const contextValue = useMemo(
            () => ({
                message,
                artifactData,
            }),
            [message, artifactData],
        );

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

        if (artifactData.artifactType === 'dashboard') {
            return (
                <AiArtifactPanelProvider value={contextValue}>
                    <Box {...ChatElementsUtils.centeredElementProps} p="md">
                        <Stack gap="md" h="100%">
                            <AiDashboardVisualization
                                artifactData={artifactData}
                                projectUuid={artifact.projectUuid}
                                agentUuid={artifact.agentUuid}
                                dashboardConfig={artifactData.dashboardConfig!}
                                showCloseButton={showCloseButton}
                            />
                        </Stack>
                    </Box>
                </AiArtifactPanelProvider>
            );
        }

        // Handle chart artifacts (existing logic)
        return (
            <AiArtifactPanelProvider value={contextValue}>
                <Box {...ChatElementsUtils.centeredElementProps} p="md">
                    <Stack gap="md" h="100%">
                        <AiChartVisualization
                            artifactData={artifactData}
                            projectUuid={artifact.projectUuid}
                            agentUuid={artifact.agentUuid}
                            artifactUuid={artifact.artifactUuid}
                            versionUuid={artifact.versionUuid}
                            showCloseButton={showCloseButton}
                        />
                    </Stack>
                </Box>
            </AiArtifactPanelProvider>
        );
    },
);
