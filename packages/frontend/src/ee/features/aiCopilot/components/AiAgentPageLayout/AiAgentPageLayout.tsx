import { Box, Drawer, Flex } from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import {
    Fragment,
    useCallback,
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
import MantineIcon from '../../../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { clearPreview } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AiArtifactPanel } from '../ChatElements/AiArtifactPanel';
import { AiSavedChartPreviewPanel } from '../ChatElements/AiSavedChartPreviewPanel';
import styles from './aiAgentPageLayout.module.css';
import { SidebarButton } from './SidebarButton';

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

    const artifact = useAiAgentStoreSelector(
        (state) => state.aiArtifact.artifact,
    );
    const savedChart = useAiAgentStoreSelector(
        (state) => state.aiArtifact.savedChart,
    );
    const preview = artifact || savedChart;
    const isMobile = useMediaQuery('(max-width: 768px)');

    const toggleSidebar = useCallback(() => {
        setIsAgentSidebarCollapsed?.(!isAgentSidebarCollapsed);
        if (sidebarPanelRef.current?.isCollapsed()) {
            sidebarPanelRef.current?.expand();
        } else {
            sidebarPanelRef.current?.collapse();
        }
    }, [setIsAgentSidebarCollapsed, isAgentSidebarCollapsed]);

    useLayoutEffect(() => {
        if (!preview) return;

        const frame = requestAnimationFrame(() => {
            sidebarPanelRef.current?.collapse();
            setIsAgentSidebarCollapsed?.(true);
        });

        return () => cancelAnimationFrame(frame);
    }, [preview, setIsAgentSidebarCollapsed]);

    return (
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
                        {Header && (
                            <Box className={styles.chatHeader}>{Header}</Box>
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
                            <Panel
                                className={styles.floatingArtifactRegion}
                                defaultSize={46}
                                id="artifact"
                                minSize={32}
                                maxSize={64}
                                order={3}
                            >
                                <Box className={styles.floatingArtifactWrap}>
                                    {artifact ? (
                                        <AiArtifactPanel artifact={artifact} />
                                    ) : savedChart ? (
                                        <AiSavedChartPreviewPanel
                                            savedChartPreview={savedChart}
                                        />
                                    ) : null}
                                </Box>
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
                    ) : savedChart ? (
                        <AiSavedChartPreviewPanel
                            savedChartPreview={savedChart}
                        />
                    ) : null}
                </Drawer>
            )}
        </div>
    );
};
