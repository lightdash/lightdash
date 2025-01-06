import {
    Accordion,
    ActionIcon,
    Box,
    Flex,
    Group,
    Text,
    Tooltip,
    type AccordionControlProps as MantineAccordionControlProps,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconTrash } from '@tabler/icons-react';
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
    const { ref, hovered } = useHover<HTMLDivElement>();

    return (
        <Flex
            ref={ref}
            px="xs"
            pos="relative"
            align="center"
            gap="xs"
            sx={(theme) => ({
                borderRadius: theme.radius.sm,
                '&:hover': {
                    backgroundColor: theme.colors.gray[0],
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
                    <ActionIcon
                        onClick={onRemove}
                        sx={{
                            visibility: hovered ? 'visible' : 'hidden',
                        }}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
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
