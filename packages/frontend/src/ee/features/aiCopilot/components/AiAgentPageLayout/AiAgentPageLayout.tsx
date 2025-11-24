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
import { clearArtifact } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AiArtifactPanel } from '../ChatElements/AiArtifactPanel';
import { SidebarButton } from './SidebarButton';
import styles from './aiAgentPageLayout.module.css';

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
    const artifactPanelRef = useRef<ImperativePanelHandle>(null);

    const [isResizing, setIsResizing] = useState(false);

    const artifact = useAiAgentStoreSelector(
        (state) => state.aiArtifact.artifact,
    );
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
        if (artifact) {
            artifactPanelRef.current?.expand();
            sidebarPanelRef.current?.collapse();
            setIsAgentSidebarCollapsed?.(true);
        } else {
            artifactPanelRef.current?.collapse();
        }
    }, [artifact, setIsAgentSidebarCollapsed]);

    return (
        <PanelGroup
            direction="horizontal"
            className={styles.panelGroup}
            style={{
                height: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
            }}
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
                            collapsible
                            className={`${styles.sidebar} ${
                                !isResizing ? styles.sidebarTransition : ''
                            }`}
                            onCollapse={() =>
                                setIsAgentSidebarCollapsed?.(true)
                            }
                            onExpand={() => setIsAgentSidebarCollapsed?.(false)}
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
                        onDragging={(isDragging) => setIsResizing(isDragging)}
                    />
                </Fragment>
            )}
            <ErrorBoundary>
                <Panel className={styles.chat} id="chat" minSize={25}>
                    {Header && (
                        <Box className={styles.chatHeader}>{Header}</Box>
                    )}

                    <Box className={styles.chatContent}>{children}</Box>
                </Panel>

                {!isMobile && (
                    <>
                        {artifact && (
                            <PanelResizeHandle
                                className={styles.resizeHandle}
                            />
                        )}

                        <Panel
                            id="artifact"
                            ref={artifactPanelRef}
                            defaultSize={0}
                            minSize={50}
                            collapsible
                            collapsedSize={0}
                            className={styles.artifact}
                        >
                            {artifact && (
                                <AiArtifactPanel artifact={artifact} />
                            )}
                        </Panel>
                    </>
                )}
                {isMobile && (
                    <Drawer
                        opened={!!artifact}
                        onClose={() => dispatch(clearArtifact())}
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
                        {artifact && <AiArtifactPanel artifact={artifact} />}
                    </Drawer>
                )}
            </ErrorBoundary>
        </PanelGroup>
    );
};
