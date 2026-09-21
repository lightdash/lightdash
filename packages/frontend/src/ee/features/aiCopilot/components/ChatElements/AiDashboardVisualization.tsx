import {
    getAiDashboardLayoutRows,
    isValidDashboardTilePositions,
    type AiAgentMessageAssistant,
    type AiArtifact,
    type ToolDashboardV2Args,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Card,
    Grid,
    Group,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { clearPreview } from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AiDashboardQuickOptions } from './AiDashboardQuickOptions';
import styles from './AiDashboardVisualization.module.css';
import { AiDashboardVisualizationItem } from './AiDashboardVisualizationItem';

type Props = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    dashboardConfig: ToolDashboardV2Args;
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
        const { breakpoints } = useMantineTheme();
        const isMobile = useMediaQuery('(max-width: 768px)');

        if (!dashboardConfig?.visualizations) {
            return (
                <Text c="red" size="sm">
                    Invalid dashboard configuration
                </Text>
            );
        }

        const layout = dashboardConfig.layout;
        const rows =
            layout &&
            isValidDashboardTilePositions(
                layout.positions,
                dashboardConfig.visualizations.length,
            )
                ? getAiDashboardLayoutRows(layout)
                : null;

        const renderVisualization = (index: number) => (
            <ErrorBoundary>
                <AiDashboardVisualizationItem
                    visualization={dashboardConfig.visualizations[index]}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadUuid={artifactData.threadUuid}
                    artifactUuid={artifactData.artifactUuid}
                    versionUuid={artifactData.versionUuid}
                    message={message}
                    index={index}
                />
            </ErrorBoundary>
        );

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
                            <AiDashboardQuickOptions
                                artifactData={artifactData}
                                projectUuid={projectUuid}
                                agentUuid={agentUuid}
                                dashboardConfig={dashboardConfig}
                            />
                            {showCloseButton && (
                                <Tooltip label="Close preview">
                                    <ActionIcon
                                        size="sm"
                                        aria-label="Close preview"
                                        onClick={() => dispatch(clearPreview())}
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </Group>
                    </Group>
                </Box>

                {/* Scrollable Dashboard Visualizations */}
                <Box flex="1" className={styles.scrollableBody}>
                    <Stack gap="md" mih="min-content">
                        {rows
                            ? rows.map((row) => (
                                  <Grid
                                      key={row.y}
                                      columns={36}
                                      gap="md"
                                      type="container"
                                      breakpoints={breakpoints}
                                  >
                                      {row.tiles.map((tile, position) => (
                                          <Grid.Col
                                              key={tile.index}
                                              span={{ base: 36, sm: tile.w }}
                                              offset={{
                                                  base: 0,
                                                  sm:
                                                      tile.x -
                                                      (position
                                                          ? row.tiles[
                                                                position - 1
                                                            ].x +
                                                            row.tiles[
                                                                position - 1
                                                            ].w
                                                          : 0),
                                              }}
                                          >
                                              <Card
                                                  p="md"
                                                  h={tile.h * 40}
                                                  className={styles.layoutTile}
                                              >
                                                  {renderVisualization(
                                                      tile.index,
                                                  )}
                                              </Card>
                                          </Grid.Col>
                                      ))}
                                  </Grid>
                              ))
                            : dashboardConfig.visualizations.map((_, index) => (
                                  <Card
                                      key={index}
                                      withBorder
                                      p="md"
                                      radius="md"
                                      h={400}
                                      display="flex"
                                      dir="column"
                                      className={styles.tile}
                                      style={{
                                          // Cap delay so a 20-tile dashboard
                                          // doesn't take forever to settle.
                                          animationDelay: `${
                                              Math.min(index, 8) * 35
                                          }ms`,
                                      }}
                                  >
                                      {renderVisualization(index)}
                                  </Card>
                              ))}
                    </Stack>
                </Box>
            </Stack>
        );
    },
);

AiDashboardVisualization.displayName = 'AiDashboardVisualization';
