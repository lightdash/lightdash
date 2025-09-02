import { type AiAgentMessageAssistant } from '@lightdash/common';
import { Box, Drawer, Flex } from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
import {
    IconLayoutSidebar,
    IconLayoutSidebarLeftCollapseFilled,
} from '@tabler/icons-react';
import {
    Fragment,
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
import { useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import {
    AiAgentPageLayoutContext,
    type AiAgentPageLayoutContextType,
    type ArtifactData,
} from '../../providers/AiLayoutProvider';
import { AiArtifactPanel } from '../ChatElements/AiArtifactPanel';
import { SidebarButton } from './SidebarButton';
import styles from './aiAgentPageLayout.module.css';

interface Props extends PropsWithChildren {
    Sidebar?: React.ReactNode;
    Header?: React.ReactNode;
}

export const AiAgentPageLayout: React.FC<Props> = ({
    Sidebar,
    Header,
    children,
}) => {
    const { agentUuid, threadUuid, projectUuid } = useParams();
    const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
    const artifactPanelRef = useRef<ImperativePanelHandle>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [contextArtifact, setContextArtifact] = useState<ArtifactData | null>(
        null,
    );
    const isMobile = useMediaQuery('(max-width: 768px)');

    const updateCollapsedState = () => {
        const isCollapsed = sidebarPanelRef.current?.isCollapsed() ?? false;
        setIsSidebarCollapsed(isCollapsed);
    };

    useEffect(() => {
        const timer = setInterval(updateCollapsedState, 100);
        return () => clearInterval(timer);
    }, []);

    const collapseSidebar = () => {
        sidebarPanelRef.current?.collapse();
    };

    const expandSidebar = () => {
        sidebarPanelRef.current?.expand();
    };

    const toggleSidebar = () => {
        if (sidebarPanelRef.current?.isCollapsed()) {
            expandSidebar();
        } else {
            collapseSidebar();
        }
    };

    const collapseArtifact = () => {
        artifactPanelRef.current?.collapse();
    };

    const expandArtifact = () => {
        artifactPanelRef.current?.expand();
    };

    const setArtifact = (
        artifactUuid: string,
        versionUuid: string,
        message: AiAgentMessageAssistant,
        messageProjectUuid: string,
        messageAgentUuid: string,
    ) => {
        setContextArtifact({
            artifactUuid,
            versionUuid,
            message,
            projectUuid: messageProjectUuid,
            agentUuid: messageAgentUuid,
        });

        if (artifactPanelRef.current?.isCollapsed()) {
            expandArtifact();
            collapseSidebar();
        }
    };

    const clearArtifact = () => {
        setContextArtifact(null);
        collapseArtifact();
    };

    useEffect(() => {
        if (contextArtifact) {
            clearArtifact();
        }
    }, [agentUuid, threadUuid, projectUuid]); // eslint-disable-line react-hooks/exhaustive-deps

    const contextValue: AiAgentPageLayoutContextType = {
        isSidebarCollapsed,
        collapseSidebar,
        expandSidebar,
        toggleSidebar,
        collapseArtifact,
        expandArtifact,
        clearArtifact,
        artifact: contextArtifact,
        setArtifact,
    };

    return (
        <AiAgentPageLayoutContext.Provider value={contextValue}>
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
                            >
                                <Flex
                                    w={isSidebarCollapsed ? 'xs' : 'auto'}
                                    justify="flex-end"
                                >
                                    <SidebarButton
                                        display={
                                            isSidebarCollapsed ? 'none' : 'flex'
                                        }
                                        size="sm"
                                        leftSection={
                                            <MantineIcon
                                                size="md"
                                                icon={IconLayoutSidebar}
                                                stroke={1.8}
                                                color="gray.7"
                                            />
                                        }
                                        onClick={toggleSidebar}
                                    />

                                    <SidebarButton
                                        display={
                                            isSidebarCollapsed ? 'flex' : 'none'
                                        }
                                        size="sm"
                                        leftSection={
                                            <MantineIcon
                                                size="md"
                                                stroke={1.8}
                                                color="gray.7"
                                                icon={
                                                    IconLayoutSidebarLeftCollapseFilled
                                                }
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
                    <Panel className={styles.chat} id="chat" minSize={25}>
                        {Header && (
                            <Box className={styles.chatHeader}>{Header}</Box>
                        )}

                        <Box className={styles.chatContent}>{children}</Box>
                    </Panel>

                    {!isMobile && (
                        <>
                            {contextArtifact && (
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
                                {contextArtifact && <AiArtifactPanel />}
                            </Panel>
                        </>
                    )}
                    {isMobile && (
                        <Drawer
                            opened={!!contextArtifact}
                            onClose={clearArtifact}
                            size="75%"
                            position="bottom"
                            h="75%"
                            withCloseButton={false}
                            styles={{
                                body: {
                                    padding: 0,
                                    paddingBottom: 'var(--mantine-spacing-lg)',
                                    height: '100%',
                                },
                            }}
                        >
                            {contextArtifact && <AiArtifactPanel />}
                        </Drawer>
                    )}
                </ErrorBoundary>
            </PanelGroup>
        </AiAgentPageLayoutContext.Provider>
    );
};
