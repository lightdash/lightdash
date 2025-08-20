import { Box } from '@mantine-8/core';
import {
    IconLayoutSidebar,
    IconLayoutSidebarLeftCollapseFilled,
} from '@tabler/icons-react';
import {
    forwardRef,
    Fragment,
    useEffect,
    useImperativeHandle,
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

interface AiAgentPageLayoutRef {
    collapseSidebar: () => void;
    expandSidebar: () => void;
    toggleSidebar: () => void;
}

export const AiAgentPageLayout = forwardRef<AiAgentPageLayoutRef, Props>(
    ({ Sidebar, Header, children }, ref) => {
        const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
        const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

        useImperativeHandle(ref, () => ({
            collapseSidebar,
            expandSidebar,
            toggleSidebar,
        }));

        const contextValue: AiAgentPageLayoutContextType = {
            isSidebarCollapsed,
            collapseSidebar,
            expandSidebar,
            toggleSidebar,
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

                            <PanelResizeHandle
                                className={styles.resizeHandle}
                            />
                        </Fragment>
                    )}
                    <ErrorBoundary>
                        <Panel className={styles.chat} id="chat">
                            {Header && (
                                <Box className={styles.chatHeader}>
                                    {Header}
                                </Box>
                            )}

                            <Box className={styles.chatContent}>{children}</Box>
                        </Panel>
                    </ErrorBoundary>
                </PanelGroup>
            </AiAgentPageLayoutContext.Provider>
        );
    },
);
