import {
    Box,
    Card,
    Flex,
    Stack,
    Transition,
    type CardProps,
    type FlexProps,
    type MantineTransition,
} from '@mantine/core';
import { type FC } from 'react';

import useSidebarResize from '../../../hooks/useSidebarResize';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';

const SIDEBAR_DEFAULT_WIDTH = 400;
export const SIDEBAR_MIN_WIDTH = 300;
export const SIDEBAR_MAX_WIDTH = 600;

const SIDEBAR_RESIZE_HANDLE_WIDTH = 6;

export enum SidebarPosition {
    LEFT = 'left',
    RIGHT = 'right',
}

export type SidebarWidthProps = {
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
};

type Props = {
    isOpen?: boolean;
    containerProps?: FlexProps;
    cardProps?: CardProps;
    position?: SidebarPosition;
    widthProps?: SidebarWidthProps;
    mainWidth?: number;
};

const Sidebar: FC<React.PropsWithChildren<Props>> = ({
    isOpen = true,
    containerProps,
    cardProps,
    position = SidebarPosition.LEFT,
    widthProps = {},
    mainWidth,
    children,
}) => {
    const {
        defaultWidth = SIDEBAR_DEFAULT_WIDTH,
        minWidth = SIDEBAR_MIN_WIDTH,
        maxWidth = SIDEBAR_MAX_WIDTH,
    } = widthProps;
    const { sidebarRef, sidebarWidth, isResizing, startResizing } =
        useSidebarResize({
            defaultWidth,
            minWidth,
            maxWidth,
            position,
            mainWidth,
        });

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
        transitionProperty: 'opacity, margin',
    };
    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <Flex
                ref={sidebarRef}
                direction="column"
                pos="relative"
                h="100%"
                mah="100%"
                {...containerProps}
            >
                <Transition
                    mounted={isOpen}
                    duration={500}
                    transition={transition}
                >
                    {(style) => (
                        <>
                            <Card
                                component={Stack}
                                display="flex"
                                radius="unset"
                                shadow="lg"
                                padding="lg"
                                pb={0}
                                w={sidebarWidth}
                                style={style}
                                sx={{ flexGrow: 1 }}
                            >
                                {children}
                            </Card>

                            <Box
                                h="100%"
                                w={SIDEBAR_RESIZE_HANDLE_WIDTH}
                                pos="absolute"
                                top={0}
                                {...(position === SidebarPosition.LEFT
                                    ? { right: -SIDEBAR_RESIZE_HANDLE_WIDTH }
                                    : { left: -SIDEBAR_RESIZE_HANDLE_WIDTH })}
                                onMouseDown={startResizing}
                                {...cardProps}
                                sx={(theme) => ({
                                    cursor: 'col-resize',

                                    ...(isResizing
                                        ? {
                                              background:
                                                  theme.fn.linearGradient(
                                                      90,
                                                      theme.colors.blue[3],
                                                      'transparent',
                                                  ),
                                          }
                                        : {
                                              ...theme.fn.hover({
                                                  background:
                                                      theme.fn.linearGradient(
                                                          90,
                                                          theme.colors.blue[1],
                                                          'transparent',
                                                      ),
                                              }),
                                          }),
                                })}
                            />
                        </>
                    )}
                </Transition>
            </Flex>
        </TrackSection>
    );
};

export default Sidebar;
