import {
    ActionIcon,
    Box,
    Card,
    CardProps,
    Flex,
    FlexProps,
    MantineTransition,
    Stack,
    Transition,
} from '@mantine/core';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { FC, useCallback, useEffect, useState } from 'react';
import useSidebarResize from '../../../hooks/useSidebarResize';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import MantineIcon from '../MantineIcon';

const SIDEBAR_DEFAULT_WIDTH = 400;
const SIDEBAR_MIN_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 600;

const SIDEBAR_RESIZE_HANDLE_WIDTH = 6;

type Props = {
    isOpen?: boolean;
    containerProps?: FlexProps;
    cardProps?: CardProps;
    collapsable?: boolean;
    inverted?: boolean;
};

const Sidebar: FC<React.PropsWithChildren<Props>> = ({
    isOpen = true,
    collapsable = false,
    inverted = false,
    containerProps,
    cardProps,
    children,
}) => {
    const [opened, setOpened] = useState(isOpen);

    useEffect(() => {
        setOpened(isOpen);
    }, [isOpen]);
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

    const getPropertiesForCollapseButton = useCallback(() => {
        if (inverted) {
            return {
                left: opened ? -10 : 'default',
                right: opened ? 'default' : 1,
                icon: opened ? IconArrowRight : IconArrowLeft,
            };
        }

        return {
            right: opened ? -10 : 'default',
            left: opened ? 'default' : 1,
            icon: opened ? IconArrowLeft : IconArrowRight,
        };
    }, [inverted, opened]);

    const { left, right, icon } = getPropertiesForCollapseButton();

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
                    mounted={opened}
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

                {collapsable && (
                    <ActionIcon
                        radius="xl"
                        variant="default"
                        pos="absolute"
                        top="5%"
                        right={right}
                        left={left}
                        w={16}
                        h={16}
                        miw={16}
                        mih={16}
                        onClick={() => setOpened((o) => !o)}
                    >
                        <MantineIcon color="gray.5" icon={icon} />
                    </ActionIcon>
                )}
            </Flex>
        </TrackSection>
    );
};

export default Sidebar;
