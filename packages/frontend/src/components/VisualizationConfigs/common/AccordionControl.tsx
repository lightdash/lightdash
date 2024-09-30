import {
    Accordion,
    ActionIcon,
    Box,
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
        <Group
            noWrap
            ref={ref}
            spacing="xs"
            px="xs"
            pos="relative"
            sx={(theme) => ({
                borderRadius: theme.radius.sm,
                '&:hover': {
                    backgroundColor: theme.colors.gray[0],
                },
            })}
        >
            {extraControlElements && (
                <Box onClick={(e) => e.stopPropagation()}>
                    {extraControlElements}
                </Box>
            )}
            <Tooltip
                variant="xs"
                label={`Remove ${label}`}
                position="left"
                withinPortal
            >
                <ActionIcon
                    onClick={onRemove}
                    pos="absolute"
                    right={40}
                    sx={{
                        visibility: hovered ? 'visible' : 'hidden',
                    }}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>
            <Accordion.Control onClick={onControlClick} {...props}>
                <Text fw={500} size="xs">
                    {label}
                </Text>
            </Accordion.Control>
        </Group>
    );
};
