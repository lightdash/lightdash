import { Box, Drawer, Flex } from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import {
    Fragment,
    useCallback,
    useEffect,
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
import MantineIcon from '../../../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { clearPreview } from '../../store/aiPreviewSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AiArtifactPanel } from '../ChatElements/AiArtifactPanel';
import { AiDashboardPreviewPanel } from '../ChatElements/AiDashboardPreviewPanel';
import styles from './aiAgentPageLayout.module.css';
import { SidebarButton } from './SidebarButton';
import { AiAgentPageLayoutContextProvider } from './useAiAgentPageLayoutContext';

interface Props extends PropsWithChildren {
    Sidebar?: React.ReactNode;
    Header?: React.ReactNode;
    isAgentSidebarCollapsed?: boolean;
    setIsAgentSidebarCollapsed?: (isAgentSidebarCollapsed: boolean) => void;
}

export const AiAgentPageLayout: React.FC<Props> = ({
    Sidebar,
    Header,
    children,
    setIsAgentSidebarCollapsed,
    isAgentSidebarCollapsed,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

    const [isResizing, setIsResizing] = useState(false);

    const preview = useAiAgentStoreSelector((state) => state.aiPreview.preview);
    const isMobile = useMediaQuery('(max-width: 768px)');
    const activePreview = preview;
    const artifact = preview?.kind === 'artifact' ? preview : null;
    const dashboardPreview = preview?.kind === 'dashboard' ? preview : null;

    const toggleSidebar = useCallback(() => {
        setIsAgentSidebarCollapsed?.(!isAgentSidebarCollapsed);
        if (sidebarPanelRef.current?.isCollapsed()) {
            sidebarPanelRef.current?.expand();
        } else {
            sidebarPanelRef.current?.collapse();
        }
    }, [setIsAgentSidebarCollapsed, isAgentSidebarCollapsed]);

    const collapseSidebar = useCallback(() => {
        if (sidebarPanelRef.current?.isCollapsed()) return;

        sidebarPanelRef.current?.collapse();
        setIsAgentSidebarCollapsed?.(true);
    }, [setIsAgentSidebarCollapsed]);

    useEffect(() => {
        if (!activePreview) return;

        const animationFrame = window.requestAnimationFrame(() => {
            collapseSidebar();
        });

        return () => window.cancelAnimationFrame(animationFrame);
    }, [activePreview, collapseSidebar]);

    return (
        <AiAgentPageLayoutContextProvider value={{ collapseSidebar }}>
            <div
                className={styles.workspace}
                style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
            >
                <PanelGroup
                    direction="horizontal"
                    className={styles.panelGroup}
                    style={{ flex: 1, minWidth: 0 }}
                >
                    {Sidebar && (
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
                                        !isResizing
                                            ? styles.sidebarTransition
                                            : ''
                                    }`}
                                    onCollapse={() =>
                                        setIsAgentSidebarCollapsed?.(true)
                                    }
                                    onExpand={() =>
                                        setIsAgentSidebarCollapsed?.(false)
                                    }
                                >
                                    <Flex justify="flex-end">
                                        <SidebarButton
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
                            {Header && (
                                <Box className={styles.chatHeader}>
                                    {Header}
                                </Box>
                            )}

                            <Box className={styles.chatContent}>{children}</Box>
                        </Panel>
                    </ErrorBoundary>

                    {!isMobile && activePreview && (
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
                                <Panel
                                    className={styles.floatingArtifactRegion}
                                    defaultSize={50}
                                    id="preview"
                                    minSize={30}
                                    maxSize={70}
                                    order={3}
                                >
                                    {artifact ? (
                                        <AiArtifactPanel artifact={artifact} />
                                    ) : dashboardPreview ? (
                                        <AiDashboardPreviewPanel
                                            dashboard={dashboardPreview}
                                        />
                                    ) : null}
                                </Panel>
                            </ErrorBoundary>
                        </Fragment>
                    )}
                </PanelGroup>

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
                        {artifact ? (
                            <AiArtifactPanel artifact={artifact} />
                        ) : dashboardPreview ? (
                            <AiDashboardPreviewPanel
                                dashboard={dashboardPreview}
                            />
                        ) : null}
                    </Drawer>
                )}
            </div>
        </AiAgentPageLayoutContextProvider>
    );
};
