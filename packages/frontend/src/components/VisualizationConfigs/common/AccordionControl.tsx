import {
    Accordion,
    ActionIcon,
    Box,
    Flex,
    Group,
    Text,
    Tooltip,
    type AccordionControlProps as MantineAccordionControlProps,
} from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
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
            py="xs"
            pl="sm"
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
            <Group wrap="nowrap" ml="sm" gap="xs">
                <Tooltip label={`Remove ${label}`} position="left">
                    <ActionIcon
                        data-cf-rule-delete
                        variant="transparent"
                        color="red"
                        onClick={onRemove}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                </Tooltip>
                <Accordion.Control
                    px="sm"
                    variant="transparent"
                    className={classes.controlButton}
                    onClick={onControlClick}
                    {...props}
                />
            </Group>
        </Flex>
    );
};
