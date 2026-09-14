import { assertUnreachable } from '@lightdash/common';
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
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    type PropsWithChildren,
} from 'react';
import { useLocation } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ResizableSplitter from '../../../../../components/common/ResizableSplitter';
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
    const splitterRef = useRef<UseSplitterReturnValue>(null);

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

    useLayoutEffect(() => {
        if (Sidebar && !isMobile && isAgentSidebarCollapsed) {
            splitterRef.current?.collapse(0);
        }
    }, [Sidebar, isMobile, isAgentSidebarCollapsed, preview?.type]);

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
                        (!isMobile && preview
                            ? preview.type === 'dataApp'
                                ? 60
                                : 46
                            : 0)
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

                {!isMobile && preview && (
                    <ResizableSplitter.Pane
                        key={
                            preview.type === 'dataApp'
                                ? 'data-app'
                                : 'chart-artifact'
                        }
                        className={styles.floatingArtifactRegion}
                        defaultSize={preview.type === 'dataApp' ? 60 : 46}
                        id={
                            preview.type === 'dataApp'
                                ? 'data-app'
                                : 'chart-artifact'
                        }
                        min={32}
                        max={64}
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
