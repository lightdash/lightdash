import { assertUnreachable } from '@lightdash/common';
import { Box, Drawer, Flex, Group, Text } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import {
    Fragment,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type PropsWithChildren,
} from 'react';
import {
    Panel,
    PanelGroup,
    PanelResizeHandle,
    type ImperativePanelHandle,
} from 'react-resizable-panels';
import { useLocation } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import {
    clearPreview,
    selectPreview,
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
    isAgentSidebarCollapsed?: boolean;
    setIsAgentSidebarCollapsed?: (isAgentSidebarCollapsed: boolean) => void;
    isEmbed?: boolean;
}

export const AiAgentPageLayout: React.FC<Props> = ({
    Sidebar,
    Header,
    children,
    setIsAgentSidebarCollapsed,
    isAgentSidebarCollapsed,
    isEmbed = false,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

    const [isResizing, setIsResizing] = useState(false);

    const preview = useAiAgentStoreSelector(selectPreview);
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
        if (sidebarPanelRef.current?.isCollapsed()) {
            sidebarPanelRef.current?.expand();
        } else {
            sidebarPanelRef.current?.collapse();
        }
    }, [setIsAgentSidebarCollapsed, isAgentSidebarCollapsed]);

    useLayoutEffect(() => {
        if (!preview || isMobile) return;

        const frame = requestAnimationFrame(() => {
            sidebarPanelRef.current?.collapse();
            setIsAgentSidebarCollapsed?.(true);
        });

        return () => cancelAnimationFrame(frame);
    }, [preview, isMobile, setIsAgentSidebarCollapsed]);

    return (
        <div
            className={`${styles.workspace} ${
                isEmbed ? styles.workspaceEmbed : ''
            }`}
        >
            <PanelGroup
                direction="horizontal"
                className={styles.panelGroup}
                style={{ flex: 1, minWidth: 0 }}
            >
                {Sidebar && !isMobile && (
                    <Fragment>
                        <ErrorBoundary>
                            <Panel
                                id="sidebar"
                                ref={sidebarPanelRef}
                                defaultSize={20}
                                minSize={10}
                                maxSize={40}
                                order={1}
                                collapsible
                                className={`${styles.sidebar} ${
                                    !isResizing ? styles.sidebarTransition : ''
                                }`}
                                data-collapsed={
                                    isAgentSidebarCollapsed ? 'true' : undefined
                                }
                                onCollapse={() =>
                                    setIsAgentSidebarCollapsed?.(true)
                                }
                                onExpand={() =>
                                    setIsAgentSidebarCollapsed?.(false)
                                }
                            >
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
                            </Panel>
                        </ErrorBoundary>

                        <PanelResizeHandle
                            className={styles.resizeHandle}
                            onDragging={(isDragging) =>
                                setIsResizing(isDragging)
                            }
                        />
                    </Fragment>
                )}

                <ErrorBoundary>
                    <Panel
                        className={styles.chat}
                        id="chat"
                        minSize={25}
                        order={2}
                    >
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
                    </Panel>
                </ErrorBoundary>

                {!isMobile && preview && (
                    <Fragment>
                        <PanelResizeHandle
                            aria-label="Resize artifact panel"
                            className={`${styles.resizeHandle} ${styles.artifactResizeHandle}`}
                            hitAreaMargins={{ coarse: 16, fine: 8 }}
                            onDragging={(isDragging) =>
                                setIsResizing(isDragging)
                            }
                        />

                        <ErrorBoundary>
                            {/* Keyed by preview kind: interactive apps remount
                                to a wider default; chart/artifact switches keep
                                the user's size. */}
                            <Panel
                                key={
                                    preview.type === 'dataApp'
                                        ? 'data-app'
                                        : 'chart-artifact'
                                }
                                className={styles.floatingArtifactRegion}
                                defaultSize={
                                    preview.type === 'dataApp' ? 60 : 46
                                }
                                id="artifact"
                                minSize={32}
                                maxSize={64}
                                order={3}
                            >
                                <Box className={styles.floatingArtifactWrap}>
                                    {renderPreviewPanel(preview)}
                                </Box>
                            </Panel>
                        </ErrorBoundary>
                    </Fragment>
                )}
            </PanelGroup>

            {isMobile && Sidebar && (
                <Drawer
                    opened={isMobileSidebarOpened}
                    onClose={closeMobileSidebar}
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
