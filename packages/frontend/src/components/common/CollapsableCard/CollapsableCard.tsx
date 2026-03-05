import {
    Box,
    Button,
    Card,
    Flex,
    Group,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useCallback, type FC, type MouseEvent, type Ref } from 'react';
import MantineIcon from './../MantineIcon';
import classes from './CollapsableCard.module.css';
import { COLLAPSIBLE_CARD_GAP_SIZE } from './constants';

interface CollapsableCardProps {
    onToggle?: (isOpen: boolean) => void;
    isOpen?: boolean;
    disabled?: boolean;
    minHeight?: number;
    toggleTooltip?: string;
    title: string;
    headingRef?: Ref<HTMLDivElement>;
    headerElement?: React.ReactNode;
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
    headingRef,
    headerElement,
    rightHeaderElement,
    minHeight = 300,
}) => {
    const handleToggle = useCallback(
        (value: boolean) => onToggle?.(value),
        [onToggle],
    );

    const shouldExpand = isOpen && isVisualizationCard;

    const onClickHeading = useCallback(() => {
        if (disabled) return;
        handleToggle(!isOpen);
    }, [disabled, handleToggle, isOpen]);

    return (
        <Card
            component={Flex}
            p="xxs"
            style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'visible',
                ...(shouldExpand ? { flex: 1 } : undefined),
            }}
            shadow="subtle"
        >
            <Flex
                ref={headingRef}
                gap="xxs"
                align="center"
                mr="xs"
                h="xxl"
                w="100%"
                onClick={onClickHeading}
                className={
                    disabled
                        ? classes.inactiveCardHeading
                        : classes.activeCardHeading
                }
            >
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
                            disabled
                                ? undefined
                                : (e: MouseEvent) => {
                                      e.stopPropagation();
                                      handleToggle(!isOpen);
                                  }
                        }
                        className={
                            disabled ? classes.disabledButton : undefined
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
                    <Group
                        gap="xs"
                        onClick={(e: MouseEvent) => e.stopPropagation()}
                    >
                        {headerElement}
                    </Group>
                </Group>
                {rightHeaderElement && (
                    <>
                        <Box flex={1} />
                        <Group
                            gap="xs"
                            pos="relative"
                            right={2}
                            onClick={(e: MouseEvent) => e.stopPropagation()}
                        >
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
                                }}
                            >
                                <div
                                    style={{
                                        height: COLLAPSIBLE_CARD_GAP_SIZE,
                                        minHeight: COLLAPSIBLE_CARD_GAP_SIZE,
                                    }}
                                />
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
