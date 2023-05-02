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

type Props = {
    opened?: boolean;
    containerProps?: FlexProps;
    cardProps?: CardProps;
};

const Sidebar: FC<Props> = ({
    opened = true,
    containerProps,
    cardProps,
    children,
}) => {
    const { sidebarRef, sidebarWidth, isResizing, startResizing } =
        useSidebarResize({
            defaultWidth: 400,
            minWidth: 300,
            maxWidth: 600,
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
                h="100%"
                mah="100%"
                pos="relative"
                {...containerProps}
            >
                <Transition
                    mounted={opened}
                    duration={500}
                    transition={transition}
                >
                    {(styles) => (
                        <>
                            <Card
                                component={Stack}
                                display="flex"
                                radius="unset"
                                shadow="lg"
                                pb={0}
                                w={sidebarWidth}
                                style={{
                                    flexGrow: 1,
                                    ...styles,
                                }}
                            >
                                {children}
                            </Card>

                            {opened ? (
                                <Box
                                    w={5}
                                    h="100%"
                                    pos="absolute"
                                    top={0}
                                    right={-5}
                                    onMouseDown={startResizing}
                                    {...cardProps}
                                    sx={(theme) => ({
                                        cursor: 'col-resize',
                                        background: isResizing
                                            ? theme.fn.linearGradient(
                                                  90,
                                                  theme.colors.blue[5],
                                                  'transparent',
                                              )
                                            : undefined,
                                    })}
                                />
                            ) : null}
                        </>
                    )}
                </Transition>
            </Flex>
        </TrackSection>
    );
};

export default Sidebar;
