import { type AiArtifact, type ToolDashboardArgs } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Card,
    Group,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
import { IconX } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { clearArtifact } from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AiDashboardVisualizationItem } from './AiDashboardVisualizationItem';

type Props = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    dashboardConfig: ToolDashboardArgs;
};

export const AiDashboardVisualization: FC<Props> = memo(
    ({ artifactData, projectUuid, agentUuid, dashboardConfig }) => {
        const dispatch = useAiAgentStoreDispatch();
        const isMobile = useMediaQuery('(max-width: 768px)');

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
                    <Group gap="md" align="start">
                        <Stack gap={0} flex={1}>
                            <Title order={5}>{dashboardConfig.title}</Title>
                            {dashboardConfig.description && (
                                <Text c="dimmed" size="xs">
                                    {dashboardConfig.description}
                                </Text>
                            )}
                        </Stack>
                        <Group gap="sm" display={isMobile ? 'none' : 'flex'}>
                            {/* TODO: Add more quick actions here (Save Dashboard, Export, etc.) */}
                            <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="gray"
                                onClick={() => dispatch(clearArtifact())}
                            >
                                <MantineIcon icon={IconX} color="gray" />
                            </ActionIcon>
                        </Group>
                    </Group>
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
