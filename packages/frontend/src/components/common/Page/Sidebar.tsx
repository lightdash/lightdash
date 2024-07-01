import {
    Box,
    Card,
    Flex,
    Stack,
    type CardProps,
    type FlexProps,
} from '@mantine/core';
import { useEffect, useState, type FC } from 'react';

import useSidebarResize from '../../../hooks/useSidebarResize';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';

const SIDEBAR_DEFAULT_WIDTH = 400;
const SIDEBAR_MIN_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 600;

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

    const [shouldRender, setShouldRender] = useState(isOpen);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            setIsAnimating(true);
            const timer = setTimeout(() => {
                setIsAnimating(false);
            }, 250); // Match this duration with transition duration
            return () => clearTimeout(timer);
        } else {
            setIsAnimating(true);
            const timer = setTimeout(() => {
                setIsAnimating(false);
                setShouldRender(false);
            }, 250); // Match this duration with transition duration
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const transitionStyles = {
        transition: 'opacity 0.25s ease-in-out, transform 0.25s ease-in-out',
        opacity: isOpen ? 1 : 0,
        transform: isOpen
            ? 'translateX(0)'
            : `translateX(${
                  position === SidebarPosition.LEFT ? '-' : ''
              }${sidebarWidth}px)`,
        visibility: shouldRender || isAnimating ? 'visible' : 'hidden',
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
                <Box
                    style={{
                        ...transitionStyles,
                    }}
                >
                    <Card
                        component={Stack}
                        display="flex"
                        radius="unset"
                        shadow="lg"
                        padding="lg"
                        pb={0}
                        w={sidebarWidth}
                        sx={{ flexGrow: 1 }}
                        {...cardProps}
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
                        sx={(theme) => ({
                            cursor: 'col-resize',
                            ...(isResizing
                                ? {
                                      background: theme.fn.linearGradient(
                                          90,
                                          theme.colors.blue[3],
                                          'transparent',
                                      ),
                                  }
                                : {
                                      ...theme.fn.hover({
                                          background: theme.fn.linearGradient(
                                              90,
                                              theme.colors.blue[1],
                                              'transparent',
                                          ),
                                      }),
                                  }),
                        })}
                    />
                </Box>
            </Flex>
        </TrackSection>
    );
};

export default Sidebar;
