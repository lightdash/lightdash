import {
    Accordion,
    Box,
    Flex,
    Group,
    Text,
    type AccordionControlProps as MantineAccordionControlProps,
} from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import classes from './Accordion.module.css';
import { ConfirmDeleteButton } from './ConfirmDeleteButton';

type Props = {
    label: string;
    onControlClick?: () => void;
    onRemove?: () => void;
    extraControlElements?: React.ReactNode;
    disabled?: boolean;
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
                {onRemove && (
                    <ConfirmDeleteButton
                        data-cf-rule-delete
                        aria-label={`Remove ${label}`}
                        onConfirm={onRemove}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ConfirmDeleteButton>
                )}
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
