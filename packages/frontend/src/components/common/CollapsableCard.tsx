import {
    Box,
    Button,
    Card,
    Flex,
    Group,
    Title,
    Tooltip,
    type ActionIconProps,
    type ButtonProps,
    type PopoverProps,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from './MantineIcon';

export const COLLAPSABLE_CARD_BUTTON_PROPS: Omit<ButtonProps, 'children'> = {
    variant: 'default',
    size: 'xs',
};

export const COLLAPSABLE_CARD_ACTION_ICON_PROPS: Pick<
    ActionIconProps,
    'variant' | 'size'
> = {
    ...COLLAPSABLE_CARD_BUTTON_PROPS,
    size: 'md',
};

export const COLLAPSABLE_CARD_POPOVER_PROPS: Omit<PopoverProps, 'children'> = {
    shadow: 'md',
    position: 'bottom',
    withArrow: true,
    closeOnClickOutside: true,
    closeOnEscape: true,
    keepMounted: false,
    arrowSize: 10,
    offset: 2,
};

interface CollapsableCardProps {
    onToggle?: (isOpen: boolean) => void;
    isOpen?: boolean;
    disabled?: boolean;
    minHeight?: number;
    toggleTooltip?: string;
    title: string;
    headerElement?: JSX.Element;
    rightHeaderElement?: React.ReactNode;
    isVisualizationCard?: boolean;
}

const CollapsableCard: FC<React.PropsWithChildren<CollapsableCardProps>> = ({
    isVisualizationCard = false,
    children,
    onToggle,
    isOpen = false,
    toggleTooltip,
    disabled = false,
    title,
    headerElement,
    rightHeaderElement,
    minHeight = 300,
}) => {
    const handleToggle = useCallback(
        (value: boolean) => onToggle?.(value),
        [onToggle],
    );

    const shouldExpand = isOpen && isVisualizationCard;

    return (
        <Card
            component={Flex}
            display="flex"
            direction="column"
            padding="xxs"
            style={{
                overflow: 'visible',
                ...(shouldExpand ? { flex: 1 } : undefined),
            }}
            shadow="xs"
        >
            <Flex gap="xxs" align="center" mr="xs" h="xxl">
                <Tooltip
                    position="top-start"
                    disabled={!toggleTooltip}
                    label={toggleTooltip}
                >
                    <Button
                        data-testid={`${title}-card-expand`}
                        variant="subtle"
                        color="gray"
                        w="xxl"
                        h="xxl"
                        p={0}
                        onClick={
                            disabled ? undefined : () => handleToggle(!isOpen)
                        }
                        sx={
                            disabled
                                ? {
                                      cursor: disabled
                                          ? 'not-allowed'
                                          : 'pointer',
                                      opacity: 0.5,
                                      backgroundColor: 'transparent',
                                      '&:hover': {
                                          backgroundColor: 'transparent',
                                      },
                                  }
                                : undefined
                        }
                    >
                        <MantineIcon
                            icon={isOpen ? IconChevronDown : IconChevronRight}
                        />
                    </Button>
                </Tooltip>

                <Group>
                    <Title order={5} fw={500} fz="sm">
                        {title}
                    </Title>
                    <Group spacing="xs">{headerElement}</Group>
                </Group>

                {rightHeaderElement && (
                    <>
                        <Box sx={{ flexGrow: 1 }} />
                        <Group spacing="xs" pos="relative" top={2} right={2}>
                            {rightHeaderElement}
                        </Group>
                    </>
                )}
            </Flex>

            {isOpen && (
                <Flex
                    direction="column"
                    style={shouldExpand ? { minHeight, flex: 1 } : undefined}
                >
                    {isVisualizationCard ? (
                        <div
                            style={{
                                position: 'relative',
                                width: '100%',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    top: 0,
                                    bottom: 0,
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    paddingTop: 8,
                                }}
                            >
                                {children}
                            </div>
                        </div>
                    ) : (
                        children
                    )}
                </Flex>
            )}
        </Card>
    );
};

export default CollapsableCard;
