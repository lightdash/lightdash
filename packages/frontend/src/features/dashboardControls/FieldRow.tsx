import { type DashboardFilterableField } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { pluralizeTiles } from './fieldLabels';
import classes from './FieldsAndTiles.module.css';

type Props = {
    field: DashboardFilterableField | null;
    label: string;
    tableLabel: string;
    // Tiles on the field, of the tiles that offer it, over every tab
    applied: number;
    possible: number;
    isHighlighted: boolean;
    // On no tile yet
    isWaiting: boolean;
    onToggleHighlight: () => void;
    onHoverChange: (isHovered: boolean) => void;
    onRemove: () => void;
};

export const FieldRow: FC<Props> = ({
    field,
    label,
    tableLabel,
    applied,
    possible,
    isHighlighted,
    isWaiting,
    onToggleHighlight,
    onHoverChange,
    onRemove,
}) => (
    <Stack
        className={
            isHighlighted
                ? `${classes.row} ${classes.rowHighlighted}`
                : classes.row
        }
        gap={0}
        data-waiting={isWaiting || undefined}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
    >
        <Group className={classes.rowHeader} gap="xs" wrap="nowrap">
            <UnstyledButton
                className={classes.rowMain}
                data-highlighted={isHighlighted || undefined}
                aria-pressed={isHighlighted}
                onClick={onToggleHighlight}
                onFocus={() => onHoverChange(true)}
                onBlur={() => onHoverChange(false)}
            >
                <Group gap="xs" wrap="nowrap" className={classes.rowLabel}>
                    {field !== null && (
                        <FieldIcon item={field} size={14} aria-hidden />
                    )}
                    <Text fz="sm" fw={600} truncate>
                        {label}
                    </Text>
                </Group>
            </UnstyledButton>
            <Tooltip label="Remove field">
                <ActionIcon
                    className={classes.rowRemove}
                    size="sm"
                    variant="subtle"
                    color="gray"
                    flex="0 0 auto"
                    aria-label={`Remove field ${label}`}
                    onClick={onRemove}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>
        </Group>
        <Text
            key={`${applied}/${possible}`}
            fz="xs"
            c="dimmed"
            truncate
            className={classes.rowCount}
        >
            {`${tableLabel} · ${applied} of ${possible} ${pluralizeTiles(possible)}`}
        </Text>
    </Stack>
);
