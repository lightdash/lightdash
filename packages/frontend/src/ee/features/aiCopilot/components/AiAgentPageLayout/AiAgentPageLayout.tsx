import { Box } from '@mantine-8/core';
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
    type ReactNode,
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
import {
    AiAgentPageLayoutContext,
    type AiAgentPageLayoutContextType,
} from '../../providers/AiLayoutProvider';
import { SidebarButton } from './SidebarButton';
import styles from './aiAgentPageLayout.module.css';

interface Props extends PropsWithChildren {
    Sidebar?: ReactNode;
    Header?: ReactNode;
}

export const AiAgentPageLayout: React.FC<Props> = ({
    Sidebar,
    Header,
    children,
}) => {
    const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
    const artifactPanelRef = useRef<ImperativePanelHandle>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [contextArtifact, setContextArtifact] = useState<ReactNode>(null);

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

    const setArtifact = (artifact: ReactNode) => {
        setContextArtifact(artifact);

        if (artifactPanelRef.current?.isCollapsed()) {
            expandArtifact();
            collapseSidebar();
        }
    };

    const contextValue: AiAgentPageLayoutContextType = {
        isSidebarCollapsed,
        collapseSidebar,
        expandSidebar,
        toggleSidebar,
        collapseArtifact,
        expandArtifact,
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
                                className={styles.sidebar}
                            >
                                <SidebarButton
                                    leftSection={
                                        <MantineIcon
                                            size="md"
                                            icon={
                                                isSidebarCollapsed
                                                    ? IconLayoutSidebar
                                                    : IconLayoutSidebarLeftCollapseFilled
                                            }
                                        />
                                    }
                                    onClick={() => toggleSidebar()}
                                />

                                {Sidebar}
                            </Panel>
                        </ErrorBoundary>

                        <PanelResizeHandle className={styles.resizeHandle} />
                    </Fragment>
                )}
                <ErrorBoundary>
                    <Panel className={styles.chat} id="chat" minSize={25}>
                        {Header && (
                            <Box className={styles.chatHeader}>{Header}</Box>
                        )}

                        <Box className={styles.chatContent}>{children}</Box>
                    </Panel>

                    {contextArtifact && (
                        <PanelResizeHandle
                            className={styles.resizeHandle}
                            disabled={!contextArtifact}
                        />
                    )}

                    <Panel
                        id="artifact"
                        ref={artifactPanelRef}
                        defaultSize={0}
                        minSize={60}
                        collapsible
                        collapsedSize={0}
                    >
                        {contextArtifact}
                    </Panel>
                </ErrorBoundary>
            </PanelGroup>
        </AiAgentPageLayoutContext.Provider>
    );
};
