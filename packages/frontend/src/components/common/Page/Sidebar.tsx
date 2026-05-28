import {
    Box,
    Flex,
    getDefaultZIndex,
    Paper,
    Transition,
    type FlexProps,
    type MantineTransition,
} from '@mantine/core';
import { type FC } from 'react';
import useSidebarResize from '../../../hooks/useSidebarResize';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import {
    SIDEBAR_ANIMATION_DURATION,
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_RESIZE_HANDLE_WIDTH,
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
        h="100%"
        w={SIDEBAR_RESIZE_HANDLE_WIDTH}
        pos="absolute"
        top={0}
        {...(position === SidebarPosition.LEFT
            ? { right: -SIDEBAR_RESIZE_HANDLE_WIDTH }
            : { left: -SIDEBAR_RESIZE_HANDLE_WIDTH })}
        onMouseDown={onMouseDown}
        sx={(theme) => ({
            cursor: 'col-resize',
            zIndex: getDefaultZIndex('app') + 1,
            ...(isResizing
                ? {
                      background: theme.fn.linearGradient(
                          90,
                          theme.colorScheme === 'dark'
                              ? theme.colors.blue[5]
                              : theme.colors.blue[3],
                          'transparent',
                      ),
                  }
                : {
                      ...theme.fn.hover({
                          background: theme.fn.linearGradient(
                              90,
                              theme.colorScheme === 'dark'
                                  ? theme.colors.blue[7]
                                  : theme.colors.blue[1],
                              'transparent',
                          ),
                      }),
                  }),
        })}
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
                    style={{ width: isCollapsed ? 0 : sidebarWidth }}
                    {...containerProps}
                >
                    <Paper
                        shadow="lg"
                        radius={0}
                        className={classes.floatingPanel}
                        style={{ width: sidebarWidth }}
                        data-collapsed={isCollapsed ? 'true' : 'false'}
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

    const sidebarPadding = noSidebarPadding ? 0 : 16;
    const contentWidth = sidebarWidth - sidebarPadding * 2;

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
                pos="relative"
                h="100%"
                mah="100%"
                sx={{ zIndex: 1 }}
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
                                style={{
                                    ...style,
                                    width: sidebarWidth,
                                    padding: sidebarPadding,
                                    paddingBottom: 0,
                                }}
                                radius={0}
                                sx={{
                                    display: 'flex',
                                    flexGrow: 1,
                                    flexDirection: 'column',
                                    overflow: 'hidden',
                                }}
                                data-testid="common-sidebar"
                            >
                                <Box
                                    sx={{
                                        flexGrow: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        width: contentWidth,
                                        minHeight: 0,
                                    }}
                                >
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
