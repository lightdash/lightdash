import {
    Box,
    Flex,
    Paper,
    Transition,
    type FlexProps,
    type MantineTransition,
} from '@mantine-8/core';
import { type FC } from 'react';
import useSidebarResize from '../../../hooks/useSidebarResize';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import {
    SIDEBAR_ANIMATION_DURATION,
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MIN_WIDTH,
} from './constants';
import classes from './Sidebar.module.css';
import { SidebarPosition, type SidebarWidthProps } from './types';

type Props = {
    isOpen?: boolean;
    isCollapsed?: boolean;
    collapsible?: boolean;
    collapsedContent?: React.ReactNode;
    containerProps?: FlexProps;
    position?: SidebarPosition;
    widthProps?: SidebarWidthProps;
    noSidebarPadding?: boolean;
    mainWidth?: number;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
};

const ResizeHandle: FC<{
    position: SidebarPosition;
    isResizing: boolean;
    onMouseDown: (event: React.MouseEvent) => void;
}> = ({ position, isResizing, onMouseDown }) => (
    <Box
        className={classes.resizeHandle}
        data-position={position}
        data-resizing={isResizing}
        onMouseDown={onMouseDown}
    />
);

const Sidebar: FC<React.PropsWithChildren<Props>> = ({
    isOpen = true,
    isCollapsed = false,
    collapsible = false,
    collapsedContent,
    containerProps,
    position = SidebarPosition.LEFT,
    widthProps = {},
    mainWidth,
    children,
    noSidebarPadding,
    onResizeStart,
    onResizeEnd,
}) => {
    const {
        defaultWidth = SIDEBAR_DEFAULT_WIDTH,
        minWidth = SIDEBAR_MIN_WIDTH,
    } = widthProps;
    const { sidebarRef, sidebarWidth, isResizing, startResizing } =
        useSidebarResize({
            defaultWidth,
            minWidth,
            position,
            mainWidth,
            onResizeStart,
            onResizeEnd,
        });

    // Collapsible sidebars drop out of the page flow when collapsed and
    // reveal as a floating overlay when the edge trigger (or panel) is hovered.
    if (collapsible) {
        return (
            <TrackSection name={SectionName.SIDEBAR}>
                <Flex
                    ref={sidebarRef}
                    direction="column"
                    className={classes.floatContainer}
                    style={{
                        '--sidebar-width': `${sidebarWidth}px`,
                    }}
                    {...containerProps}
                >
                    <Paper
                        withBorder={false}
                        radius={0}
                        className={classes.floatingPanel}
                        data-collapsed={isCollapsed}
                        data-testid={
                            isCollapsed
                                ? 'common-sidebar-collapsed'
                                : 'common-sidebar'
                        }
                    >
                        <Box className={classes.floatingPanelInner}>
                            {children}
                        </Box>
                    </Paper>

                    {isCollapsed ? (
                        <>
                            <Box className={classes.edgeTrigger} />
                            <Box className={classes.trigger}>
                                {collapsedContent}
                            </Box>
                        </>
                    ) : (
                        <ResizeHandle
                            position={position}
                            isResizing={isResizing}
                            onMouseDown={startResizing}
                        />
                    )}
                </Flex>
            </TrackSection>
        );
    }

    const transition: MantineTransition = {
        in: {
            opacity: 1,
            ...(position === SidebarPosition.LEFT
                ? { marginLeft: 0 }
                : { marginRight: 0 }),
        },
        out: {
            opacity: 0,
            ...(position === SidebarPosition.LEFT
                ? { marginLeft: -sidebarWidth }
                : { marginRight: -sidebarWidth }),
        },
        transitionProperty: isResizing
            ? 'opacity, margin'
            : 'opacity, margin, width',
    };

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <Flex
                ref={sidebarRef}
                direction="column"
                className={classes.sidebarContainer}
                {...containerProps}
            >
                <Transition
                    mounted={isOpen}
                    duration={SIDEBAR_ANIMATION_DURATION}
                    transition={transition}
                >
                    {(style) => (
                        <>
                            <Paper
                                shadow="lg"
                                radius={0}
                                className={classes.sidebarPaper}
                                style={{
                                    ...style,
                                    '--sidebar-width': `${sidebarWidth}px`,
                                }}
                                data-no-padding={noSidebarPadding}
                                data-testid="common-sidebar"
                            >
                                <Box className={classes.sidebarContent}>
                                    {children}
                                </Box>
                            </Paper>

                            <ResizeHandle
                                position={position}
                                isResizing={isResizing}
                                onMouseDown={startResizing}
                            />
                        </>
                    )}
                </Transition>
            </Flex>
        </TrackSection>
    );
};

export default Sidebar;
