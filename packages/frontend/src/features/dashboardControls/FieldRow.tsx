import { type DashboardFilterableField } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './FieldsAndTiles.module.css';
import { type FieldCount } from './peers';

const pluralizeTiles = (count: number): string =>
    count === 1 ? 'tile' : 'tiles';

type Props = {
    field: DashboardFilterableField | null;
    label: string;
    tableLabel: string;
    count: FieldCount;
    isHighlighted: boolean;
    onToggleHighlight: () => void;
    onHoverChange: (isHovered: boolean) => void;
    onAll: () => void;
    onNone: () => void;
    // null when the row cannot be removed
    onRemove: (() => void) | null;
};

export const FieldRow: FC<Props> = ({
    field,
    label,
    tableLabel,
    count,
    isHighlighted,
    onToggleHighlight,
    onHoverChange,
    onAll,
    onNone,
    onRemove,
}) => {
    const showAll = count.applied < count.possible;
    const showNone = count.applied > 0;

    return (
        <Stack
            className={
                isHighlighted
                    ? `${classes.row} ${classes.rowHighlighted}`
                    : classes.row
            }
            gap={0}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
        >
            <UnstyledButton
                className={classes.rowMain}
                data-highlighted={isHighlighted || undefined}
                aria-pressed={isHighlighted}
                onClick={onToggleHighlight}
                onFocus={() => onHoverChange(true)}
                onBlur={() => onHoverChange(false)}
            >
                <Group gap="xs" wrap="nowrap">
                    {field !== null && (
                        <FieldIcon item={field} size={14} aria-hidden />
                    )}
                    <Text fz="sm" fw={600} truncate>
                        {label}
                    </Text>
                </Group>
            </UnstyledButton>
            <Group
                className={classes.rowActions}
                gap="xs"
                justify="space-between"
                wrap="nowrap"
            >
                <Text fz="xs" c="dimmed" truncate>
                    {`${tableLabel} · ${count.applied} of ${
                        count.possible
                    } ${pluralizeTiles(count.possible)}`}
                </Text>
                <Group gap={4} wrap="nowrap" flex="0 0 auto">
                    {showAll && (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            aria-label={`Apply ${label} to all ${count.possible} ${tableLabel} ${pluralizeTiles(count.possible)}`}
                            onClick={onAll}
                        >
                            Apply to all {count.possible}
                        </Button>
                    )}
                    {(showNone || onRemove !== null) && (
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Tooltip label="More">
                                    <ActionIcon
                                        size="sm"
                                        variant="subtle"
                                        color="gray"
                                        aria-label={`More actions for ${label}`}
                                    >
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Tooltip>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {showNone && (
                                    <Menu.Item onClick={onNone}>
                                        Clear from tiles
                                    </Menu.Item>
                                )}
                                {onRemove !== null && (
                                    <Menu.Item onClick={onRemove}>
                                        Remove field
                                    </Menu.Item>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                    )}
                </Group>
            </Group>
        </Stack>
    );
};
