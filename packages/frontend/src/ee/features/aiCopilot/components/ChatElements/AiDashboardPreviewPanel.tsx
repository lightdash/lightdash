import { ActionIcon, Box, Group, Stack, Text, Title } from '@mantine-8/core';
import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useDashboardQuery } from '../../../../../hooks/dashboard/useDashboard';
import {
    InteractiveDashboardShell,
    MinimalDashboardView,
} from '../../../../../pages/MinimalDashboard';
import DashboardAiAgentContextBridge from '../../../../../providers/Dashboard/DashboardAiAgentContextBridge';
import { DashboardInMemoryProvider } from '../../../../../providers/Dashboard/DashboardInMemoryProvider';
import { clearPreview } from '../../store/aiPreviewSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';

type DashboardPreviewRef = {
    projectUuid: string;
    dashboardUuid: string;
    threadUuid: string;
};

type Props = {
    dashboard: DashboardPreviewRef;
};

export const AiDashboardPreviewPanel: FC<Props> = ({ dashboard }) => {
    const dispatch = useAiAgentStoreDispatch();
    const rootRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { data: dashboardData } = useDashboardQuery({
        uuidOrSlug: dashboard.dashboardUuid,
        projectUuid: dashboard.projectUuid,
    });

    useEffect(() => {
        const element = rootRef.current;
        if (!element) return;

        let animationFrame: number | null = null;
        let lastWidth = element.getBoundingClientRect().width;

        const observer = new ResizeObserver(([entry]) => {
            const nextWidth = entry.contentRect.width;
            if (nextWidth === lastWidth) return;

            lastWidth = nextWidth;

            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }

            animationFrame = window.requestAnimationFrame(() => {
                window.dispatchEvent(new Event('resize'));
            });
        });

        observer.observe(element);

        return () => {
            observer.disconnect();
            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }
        };
    }, []);

    return (
        <Box
            ref={rootRef}
            h="100%"
            pos="relative"
            style={{
                borderRadius: 'var(--mantine-radius-lg)',
                overflow: 'hidden',
                background: 'white',
                border: '1px solid var(--mantine-color-ldGray-2)',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
            }}
        >
            <Box
                px="md"
                py="sm"
                style={{
                    borderBottom: '1px solid var(--mantine-color-ldGray-2)',
                    flexShrink: 0,
                }}
            >
                <Group gap="md" align="start" justify="space-between">
                    <Stack gap={0} flex={1} pr="sm">
                        <Title order={5}>
                            {dashboardData?.name ?? 'Dashboard'}
                        </Title>
                        {dashboardData?.description && (
                            <Text c="dimmed" size="xs">
                                {dashboardData.description}
                            </Text>
                        )}
                    </Stack>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => dispatch(clearPreview())}
                        aria-label="Close dashboard preview"
                    >
                        <MantineIcon icon={IconX} color="gray" />
                    </ActionIcon>
                </Group>
            </Box>
            <Box
                ref={scrollContainerRef}
                flex={1}
                style={{
                    minHeight: 0,
                    minWidth: 0,
                }}
            >
                <DashboardInMemoryProvider
                    projectUuid={dashboard.projectUuid}
                    dashboardUuid={dashboard.dashboardUuid}
                >
                    <Box
                        px={0}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            minWidth: 0,
                            boxSizing: 'border-box',
                        }}
                    >
                        <MinimalDashboardView
                            shell={InteractiveDashboardShell}
                            renderLayout={({ shell, body }) => (
                                <>
                                    {shell}
                                    <Box
                                        ref={scrollContainerRef}
                                        flex={1}
                                        style={{
                                            overflowY: 'auto',
                                            minHeight: 0,
                                            minWidth: 0,
                                            position: 'relative',
                                            scrollbarGutter: 'stable',
                                        }}
                                    >
                                        {body}
                                    </Box>
                                </>
                            )}
                            shellProps={{
                                scrollContainer: scrollContainerRef.current,
                            }}
                            dashboardContextBridge={
                                <DashboardAiAgentContextBridge
                                    threadUuid={dashboard.threadUuid}
                                />
                            }
                        />
                    </Box>
                </DashboardInMemoryProvider>
            </Box>
        </Box>
    );
};
