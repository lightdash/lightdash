import {
    Box,
    Button,
    Card,
    Flex,
    Group,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useCallback, type FC, type Ref } from 'react';
import MantineIcon from '../MantineIcon';
import styles from './CollapsibleCard.module.css';
import { COLLAPSIBLE_CARD_GAP_SIZE } from './constants';

interface CollapsibleCardProps {
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

const CollapsibleCard: FC<React.PropsWithChildren<CollapsibleCardProps>> = ({
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

    /**
     * Collapsible cards can be toggled via the heading, in which case we need to
     * ensure we're targetting click events only to the heading (and not its children),
     * so that things like the 'Copy SQL' button continue to work.
     */
    const onClickHeading = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (disabled) return;

            // Check if the click target is an interactive element (button, link, popover target, etc.)
            const target = event.target as HTMLElement;
            const currentTarget = event.currentTarget as HTMLElement;

            // Walk up the DOM tree to check for interactive elements
            let element: HTMLElement | null = target;
            while (element && element !== currentTarget) {
                // Check for standard interactive elements
                if (
                    element.tagName === 'BUTTON' ||
                    element.tagName === 'A' ||
                    element.getAttribute('role') === 'button' ||
                    element.getAttribute('data-mantine-popover-target') !==
                        null ||
                    element.getAttribute('data-mantine-menu-target') !== null ||
                    element.getAttribute('data-mantine-dropdown-target') !==
                        null ||
                    // Check if element has onClick handler (indicating it's interactive)
                    element.onclick !== null ||
                    // Check for Mantine Popover/Menu/Dropdown wrapper patterns
                    element.classList.contains('mantine-Popover-target') ||
                    element.classList.contains('mantine-Menu-target') ||
                    element.classList.contains('mantine-Dropdown-target')
                ) {
                    return; // Don't toggle if clicking on interactive element
                }
                element = element.parentElement;
            }

            // Only toggle if we didn't find any interactive elements
            handleToggle(!isOpen);
            event.stopPropagation();
        },
        [disabled, handleToggle, isOpen],
    );

    return (
        <Card
            component={Flex}
            display="flex"
            padding="xxs"
            className={
                styles.card + ' ' + (shouldExpand ? styles.flexGrow : '')
            }
            shadow="subtle"
            radius="md"
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
                        ? styles.inactiveCardHeading
                        : styles.activeCardHeading
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
                        className={disabled ? styles.disabledButton : undefined}
                    >
                        <MantineIcon
                            icon={IconChevronRight}
                            className={`${styles.chevronIcon} ${
                                isOpen ? styles.chevronIconOpen : ''
                            }`}
                        />
                    </Button>
                </Tooltip>
                <Group>
                    <Title order={5} fw={500} fz="sm">
                        {title}
                    </Title>
                    <Group gap="xs">{headerElement}</Group>
                </Group>
                {rightHeaderElement && (
                    <>
                        <Box className={styles.flexGrow} />
                        <Group gap="xs" pos="relative" right={2}>
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
                        <Box pos="relative" w="100%" h="100%">
                            <Flex
                                direction="column"
                                pos="absolute"
                                left={0}
                                right={0}
                                top={0}
                                bottom={0}
                                style={{ overflow: 'hidden' }}
                            >
                                <Box
                                    h={COLLAPSIBLE_CARD_GAP_SIZE}
                                    mih={COLLAPSIBLE_CARD_GAP_SIZE}
                                />

                                {children}
                            </Flex>
                        </Box>
                    ) : (
                        children
                    )}
                </Flex>
            )}
        </Card>
    );
};

export default CollapsibleCard;
