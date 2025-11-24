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
} from '@mantine/core';
import { IconDots, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    label: string;
    onControlClick: () => void;
    onRemove: () => void;
    extraControlElements?: React.ReactNode;
} & MantineAccordionControlProps;

// NOTE: Custom Accordion.Control component so that we can add more interactive elements to the control without nesting them inside the Accordion.Control component
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
            sx={(theme) => ({
                borderRadius: theme.radius.sm,
                '&:hover': {
                    backgroundColor: theme.colors.ldGray[0],
                },
            })}
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
                sx={{ flex: 1 }}
                onClick={onControlClick}
            >
                {label}
            </Text>
            <Group noWrap ml="sm" spacing="lg">
                <Tooltip
                    variant="xs"
                    label={`Remove ${label}`}
                    position="right"
                    withinPortal
                >
                    <Menu withArrow offset={-2}>
                        <Menu.Target>
                            <ActionIcon variant="transparent">
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                icon={<MantineIcon icon={IconTrash} />}
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
                    sx={{ flex: 0 }}
                    onClick={onControlClick}
                    {...props}
                />
            </Group>
        </Flex>
    );
};
