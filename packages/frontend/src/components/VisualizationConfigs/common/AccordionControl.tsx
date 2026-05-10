import {
    Accordion,
    Box,
    Flex,
    Group,
    Stack,
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
    description?: string;
    onControlClick?: () => void;
    onRemove?: () => void;
    extraControlElements?: React.ReactNode;
    disabled?: boolean;
} & MantineAccordionControlProps;

export const AccordionControl: FC<Props> = ({
    label,
    description,
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
            h={description ? '45px' : undefined}
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
            <Stack
                gap={0}
                className={classes.controlLabel}
                onClick={onControlClick}
            >
                <Text fw={500} size="xs" truncate>
                    {label}
                </Text>
                {description && (
                    <div className={classes.controlDescriptionWrapper}>
                        <Text size="xs" c="dimmed" truncate lh={1.1}>
                            {description}
                        </Text>
                    </div>
                )}
            </Stack>
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
