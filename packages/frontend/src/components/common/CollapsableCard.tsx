import {
    Box,
    Button,
    ButtonProps,
    Flex,
    Group,
    PopoverProps,
    Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { FC, useCallback } from 'react';
import {
    StyledCard,
    StyledCardTitle,
    StyledCollapse,
} from './CollapsableCard.style';
import MantineIcon from './MantineIcon';

export const COLLAPSABLE_CARD_BUTTON_PROPS: Omit<ButtonProps, 'children'> = {
    variant: 'default',
    size: 'xs',
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

const CollapsableCard: FC<CollapsableCardProps> = ({
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

    return (
        <StyledCard elevation={1} $shouldExpand={isOpen && isVisualizationCard}>
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
                    <StyledCardTitle>{title}</StyledCardTitle>
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
                <StyledCollapse
                    $shouldExpand={isOpen && isVisualizationCard}
                    $minHeight={minHeight}
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
                </StyledCollapse>
            )}
        </StyledCard>
    );
};

export default CollapsableCard;
