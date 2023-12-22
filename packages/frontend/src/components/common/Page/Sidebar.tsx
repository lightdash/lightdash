import {
    Box,
    Card,
    CardProps,
    Flex,
    FlexProps,
    MantineTransition,
    Stack,
    Transition,
} from '@mantine/core';
import { FC } from 'react';

import useSidebarResize from '../../../hooks/useSidebarResize';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';

const SIDEBAR_DEFAULT_WIDTH = 400;
const SIDEBAR_MIN_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 600;

const SIDEBAR_RESIZE_HANDLE_WIDTH = 6;

type Props = {
    isOpen?: boolean;
    containerProps?: FlexProps;
    cardProps?: CardProps;
};

const Sidebar: FC<React.PropsWithChildren<Props>> = ({
    isOpen = true,
    containerProps,
    cardProps,
    children,
}) => {
    const { sidebarRef, sidebarWidth, isResizing, startResizing } =
        useSidebarResize({
            defaultWidth: SIDEBAR_DEFAULT_WIDTH,
            minWidth: SIDEBAR_MIN_WIDTH,
            maxWidth: SIDEBAR_MAX_WIDTH,
        });

    const transition: MantineTransition = {
        in: {
            opacity: 1,
            marginLeft: 0,
        },
        out: {
            opacity: 0,
            marginLeft: -sidebarWidth,
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
                                right={-SIDEBAR_RESIZE_HANDLE_WIDTH}
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
