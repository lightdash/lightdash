import {
    Accordion,
    ActionIcon,
    Box,
    Flex,
    Group,
    Menu,
    Text,
    Tooltip,
    type AccordionControlProps as MantineAccordionControlProps,
} from '@mantine-8/core';
import { IconDots, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import classes from './Accordion.module.css';

type Props = {
    label: string;
    onControlClick: () => void;
    onRemove: () => void;
    extraControlElements?: React.ReactNode;
} & MantineAccordionControlProps;

// Custom Accordion.Control wrapper so interactive elements (color swatch, menu)
// can sit alongside the toggle without being nested inside the click target.
export const AccordionControl: FC<Props> = ({
    label,
    onControlClick,
    onRemove,
    extraControlElements,
    ...props
}) => {
    return (
        <Flex
            px="xs"
            pos="relative"
            align="center"
            gap="xs"
            className={classes.controlRow}
        >
            {extraControlElements && (
                <Box
                    onClick={(e: React.MouseEvent<HTMLDivElement>) =>
                        e.stopPropagation()
                    }
                >
                    {extraControlElements}
                </Box>
            )}
            <Text
                fw={500}
                size="xs"
                truncate
                className={classes.controlLabel}
                onClick={onControlClick}
            >
                {label}
            </Text>
            <Group wrap="nowrap" ml="sm" gap="lg">
                <Tooltip label={`Remove ${label}`} position="right">
                    <Menu withArrow offset={-2}>
                        <Menu.Target>
                            <ActionIcon variant="transparent">
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={onRemove}
                            >
                                <Text fz="xs" fw={500}>
                                    Delete
                                </Text>
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Tooltip>
                <Accordion.Control
                    w="sm"
                    className={classes.controlButton}
                    onClick={onControlClick}
                    {...props}
                />
            </Group>
        </Flex>
    );
};
