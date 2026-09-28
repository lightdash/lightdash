import {
    assertUnreachable,
    isAiComposerChartArtifactConfig,
    type AiArtifact,
    type ApiError,
} from '@lightdash/common';
import { Box, Drawer, Flex, Group, Text } from '@mantine/core';
import {
    useDisclosure,
    useMediaQuery,
    type UseSplitterReturnValue,
} from '@mantine/hooks';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    type PropsWithChildren,
} from 'react';
import { useLocation, useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ResizableSplitter from '../../../../../components/common/ResizableSplitter';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import {
    AI_AGENT_ARTIFACT_KEY,
    aiAgentArtifactVersionQuery,
} from '../../hooks/useAiAgentArtifacts';
import {
    clearPreview,
    selectPreviewForThreads,
    type AiPreview,
} from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AiArtifactPanel } from '../ChatElements/AiArtifactPanel';
import { AiDataAppPreviewPanel } from '../ChatElements/AiDataAppPreviewPanel';
import { AiSavedChartPreviewPanel } from '../ChatElements/AiSavedChartPreviewPanel';
import styles from './aiAgentPageLayout.module.css';
import {
    PREVIEW_PANE_MAX,
    PREVIEW_PANE_MIN,
    previewPaneOf,
} from './previewPane';
import { SidebarButton } from './SidebarButton';

const renderPreviewPanel = (preview: AiPreview) => {
    switch (preview.type) {
        case 'artifact':
            return <AiArtifactPanel artifact={preview} />;
        case 'savedChart':
            return <AiSavedChartPreviewPanel savedChartPreview={preview} />;
        case 'dataApp':
            return (
                <AiDataAppPreviewPanel dataAppPreview={preview} showInspector />
            );
        default:
            return assertUnreachable(preview, 'Unknown preview type');
    }
};

interface Props extends PropsWithChildren {
    Sidebar?: React.ReactNode;
    Header?: React.ReactNode;
    MobileSidebarHeader?: React.ReactNode;
    isAgentSidebarCollapsed?: boolean;
    setIsAgentSidebarCollapsed?: (isAgentSidebarCollapsed: boolean) => void;
    isEmbed?: boolean;
}

export const AiAgentPageLayout: React.FC<Props> = ({
    Sidebar,
    Header,
    MobileSidebarHeader,
    children,
    setIsAgentSidebarCollapsed,
    isAgentSidebarCollapsed,
    isEmbed = false,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const splitterRef = useRef<UseSplitterReturnValue>(null);

    // Thread routes and the battle route name the threads on screen.
    const { threadUuid, threadUuidA, threadUuidB } = useParams();
    const selectOnScreenPreview = useMemo(
        () =>
            selectPreviewForThreads(
                [threadUuid, threadUuidA, threadUuidB].filter(
                    (uuid): uuid is string => uuid !== undefined,
                ),
            ),
        [threadUuid, threadUuidA, threadUuidB],
    );
    const preview = useAiAgentStoreSelector(selectOnScreenPreview);
    // Same key as the artifact panel's fetch, so this adds no request; the
    // panel owns error handling.
    const artifactQuery =
        preview?.type === 'artifact'
            ? aiAgentArtifactVersionQuery(preview)
            : null;
    const { data: previewArtifact } = useQuery<AiArtifact, ApiError>({
        queryKey: artifactQuery?.queryKey ?? [AI_AGENT_ARTIFACT_KEY, 'none'],
        queryFn: artifactQuery?.queryFn,
        enabled: artifactQuery !== null,
    });
    const previewPane = preview
        ? previewPaneOf(
              preview.type,
              isAiComposerChartArtifactConfig(previewArtifact?.chartConfig),
          )
        : null;
    // Resolved on first render so the sidebar never flashes open on mobile
    const isMobile = useMediaQuery('(max-width: 768px)', undefined, {
        getInitialValueInEffect: false,
    });
    const [
        isMobileSidebarOpened,
        { close: closeMobileSidebar, toggle: toggleMobileSidebar },
    ] = useDisclosure(false);
    const { pathname } = useLocation();

    // Navigating from a thread link inside the drawer should dismiss it
    useEffect(() => {
        closeMobileSidebar();
    }, [pathname, closeMobileSidebar]);

    const toggleSidebar = useCallback(() => {
        setIsAgentSidebarCollapsed?.(!isAgentSidebarCollapsed);
        splitterRef.current?.toggleCollapse(0);
    }, [setIsAgentSidebarCollapsed, isAgentSidebarCollapsed]);

    useLayoutEffect(() => {
        if (!preview || isMobile) return;

        const frame = requestAnimationFrame(() => {
            splitterRef.current?.collapse(0);
            setIsAgentSidebarCollapsed?.(true);
        });

        return () => cancelAnimationFrame(frame);
    }, [preview, isMobile, setIsAgentSidebarCollapsed]);

    // The pane id is the splitter layout key; when it changes (e.g. an
    // artifact resolves as a composer one) sizes reset, so re-apply collapse.
    const previewPaneId = previewPane?.id;
    useLayoutEffect(() => {
        if (Sidebar && !isMobile && isAgentSidebarCollapsed) {
            splitterRef.current?.collapse(0);
        }
    }, [Sidebar, isMobile, isAgentSidebarCollapsed, previewPaneId]);

    return (
        <div
            className={`${styles.workspace} ${
                isEmbed ? styles.workspaceEmbed : ''
            }`}
        >
            <ResizableSplitter
                orientation="horizontal"
                className={styles.panelGroup}
                splitterRef={splitterRef}
                handleLabel="Resize workspace panels"
                classNames={{ handle: styles.resizeHandle }}
                onCollapseChange={(index, collapsed) => {
                    if (index === 0 && Sidebar && !isMobile)
                        setIsAgentSidebarCollapsed?.(collapsed);
                }}
                style={{ flex: 1, minWidth: 0 }}
            >
                {Sidebar && !isMobile && (
                    <ResizableSplitter.Pane
                        id="sidebar"
                        defaultSize={20}
                        min={10}
                        max={40}
                        collapsible
                        className={styles.sidebar}
                        data-collapsed={
                            isAgentSidebarCollapsed ? 'true' : undefined
                        }
                    >
                        <ErrorBoundary>
                            <Flex
                                align="center"
                                justify="flex-end"
                                className={styles.sidebarHeader}
                            >
                                <SidebarButton
                                    aria-label={
                                        isAgentSidebarCollapsed
                                            ? 'Expand Ask AI sidebar'
                                            : 'Collapse Ask AI sidebar'
                                    }
                                    size="sm"
                                    leftSection={
                                        <MantineIcon
                                            size="md"
                                            icon={
                                                isAgentSidebarCollapsed
                                                    ? IconLayoutSidebarLeftExpand
                                                    : IconLayoutSidebarLeftCollapse
                                            }
                                            stroke={1.8}
                                            color="ldGray.7"
                                        />
                                    }
                                    onClick={toggleSidebar}
                                />
                            </Flex>

                            {Sidebar}
                        </ErrorBoundary>
                    </ResizableSplitter.Pane>
                )}

                <ResizableSplitter.Pane
                    className={styles.chat}
                    id="chat"
                    defaultSize={
                        100 -
                        (Sidebar && !isMobile ? 20 : 0) -
                        (!isMobile && previewPane ? previewPane.defaultSize : 0)
                    }
                    min={25}
                >
                    <ErrorBoundary>
                        {(Header || (isMobile && Sidebar)) && (
                            <Box className={styles.chatHeader}>
                                <Group gap="xs" wrap="nowrap" align="center">
                                    {isMobile && Sidebar && (
                                        <SidebarButton
                                            aria-label="Open Ask AI sidebar"
                                            size="sm"
                                            leftSection={
                                                <MantineIcon
                                                    size="md"
                                                    icon={
                                                        IconLayoutSidebarLeftExpand
                                                    }
                                                    stroke={1.8}
                                                    color="ldGray.7"
                                                />
                                            }
                                            onClick={toggleMobileSidebar}
                                        />
                                    )}
                                    {Header && (
                                        <Box flex={1} miw={0}>
                                            {Header}
                                        </Box>
                                    )}
                                </Group>
                            </Box>
                        )}

                        <Box className={styles.chatContent}>{children}</Box>
                    </ErrorBoundary>
                </ResizableSplitter.Pane>

                {!isMobile && preview && previewPane && (
                    <ResizableSplitter.Pane
                        key={previewPane.id}
                        className={styles.floatingArtifactRegion}
                        defaultSize={previewPane.defaultSize}
                        id={previewPane.id}
                        min={PREVIEW_PANE_MIN}
                        max={PREVIEW_PANE_MAX}
                    >
                        <ErrorBoundary>
                            <Box className={styles.floatingArtifactWrap}>
                                {renderPreviewPanel(preview)}
                            </Box>
                        </ErrorBoundary>
                    </ResizableSplitter.Pane>
                )}
            </ResizableSplitter>

            {isMobile && Sidebar && (
                <Drawer
                    opened={isMobileSidebarOpened}
                    onClose={closeMobileSidebar}
                    closeButtonProps={{
                        'aria-label': 'Close threads',
                        size: 44,
                    }}
                    position="left"
                    size="85%"
                    title={
                        <Text fw={600} fz="sm">
                            Threads
                        </Text>
                    }
                    classNames={{
                        content: styles.mobileSidebarContent,
                        header: styles.mobileSidebarHeader,
                        body: styles.mobileSidebarBody,
                    }}
                >
                    {MobileSidebarHeader && (
                        <Box className={styles.mobileSidebarContext}>
                            {MobileSidebarHeader}
                        </Box>
                    )}
                    {Sidebar}
                </Drawer>
            )}

            {isMobile && (
                <Drawer
                    opened={!!preview}
                    onClose={() => dispatch(clearPreview())}
                    size="75%"
                    position="bottom"
                    h="75%"
                    withCloseButton={false}
                    transitionProps={{
                        transition: 'slide-up',
                        duration: 200,
                        timingFunction: 'ease-out',
                    }}
                    styles={{
                        body: {
                            padding: 0,
                            paddingBottom: 'var(--mantine-spacing-lg)',
                            height: '100%',
                        },
                    }}
                >
                    {preview && renderPreviewPanel(preview)}
                </Drawer>
            )}
        </div>
    );
};
