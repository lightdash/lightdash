import {
    Box,
    Button,
    Card,
    createStyles,
    Flex,
    Group,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useCallback, type FC, type Ref } from 'react';
import MantineIcon from './../MantineIcon';
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

const useStyles = createStyles((theme) => ({
    inactiveCardHeading: {
        cursor: 'not-allowed',
    },
    activeCardHeading: {
        cursor: 'pointer',
        '&:hover': {
            backgroundColor: theme.fn.rgba(theme.colors.ldGray[1], 0.5),
        },
    },
}));

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
    const { classes } = useStyles();
    const handleToggle = useCallback(
        (value: boolean) => onToggle?.(value),
        [onToggle],
    );

    const shouldExpand = isOpen && isVisualizationCard;

    /**
     * Collapsible cards can be toggled via the heading, in which case we need to
     * ensure we're targetting click events only to the heading (and not its children),
     * so that things like the 'Copy SQL' button continue to work.
     */
    const onClickHeading = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (disabled) return;
            if (event.target === event.currentTarget) {
                handleToggle(!isOpen);
                event.stopPropagation();
            }
        },
        [disabled, handleToggle, isOpen],
    );

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
                        <Group spacing="xs" pos="relative" right={2}>
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
