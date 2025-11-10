import {
    type AiAgentMessageAssistant,
    type AiArtifact,
    type ToolDashboardArgs,
} from '@lightdash/common';
import { Box, Card, Stack, Text } from '@mantine-8/core';
import { memo, type FC } from 'react';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { clearArtifact } from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AiDashboardVisualizationHeader } from './AiDashboardVisualizationHeader';
import { AiDashboardVisualizationItem } from './AiDashboardVisualizationItem';

type Props = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    dashboardConfig: ToolDashboardArgs;
    message: AiAgentMessageAssistant;
    showCloseButton?: boolean;
};

export const AiDashboardVisualization: FC<Props> = memo(
    ({
        artifactData,
        projectUuid,
        agentUuid,
        dashboardConfig,
        message,
        showCloseButton = true,
    }) => {
        const dispatch = useAiAgentStoreDispatch();

        if (!dashboardConfig?.visualizations) {
            return (
                <Text c="red" size="sm">
                    Invalid dashboard configuration
                </Text>
            );
        }

        return (
            <Stack gap={0} h="100%">
                {/* Dashboard Header with Quick Actions */}
                <Box pb="md">
                    <AiDashboardVisualizationHeader
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        artifactData={artifactData}
                        dashboardConfig={dashboardConfig}
                        showCloseButton={showCloseButton}
                        onClose={() => dispatch(clearArtifact())}
                    />
                </Box>

                {/* Scrollable Dashboard Visualizations */}
                <Box
                    flex="1"
                    style={{
                        overflow: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <Stack gap="md" style={{ minHeight: 'min-content' }}>
                        {dashboardConfig.visualizations.map(
                            (visualization, index) => (
                                <Card
                                    key={index}
                                    withBorder
                                    p="md"
                                    radius="md"
                                    h={400}
                                >
                                    <ErrorBoundary>
                                        <AiDashboardVisualizationItem
                                            visualization={visualization}
                                            projectUuid={projectUuid}
                                            agentUuid={agentUuid}
                                            threadUuid={artifactData.threadUuid}
                                            artifactUuid={
                                                artifactData.artifactUuid
                                            }
                                            versionUuid={
                                                artifactData.versionUuid
                                            }
                                            message={message}
                                            index={index}
                                        />
                                    </ErrorBoundary>
                                </Card>
                            ),
                        )}
                    </Stack>
                </Box>
            </Stack>
        );
    },
);

AiDashboardVisualization.displayName = 'AiDashboardVisualization';
