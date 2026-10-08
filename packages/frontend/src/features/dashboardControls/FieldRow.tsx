import { type DashboardFilterableField } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Stack,
    Text,
    Tooltip,
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
    // On no tile yet
    isWaiting: boolean;
    onAll: () => void;
    onNone: () => void;
    onRemove: () => void;
    // Why the row cannot be removed, or null when it can
    removeDisabledReason: string | null;
};

export const FieldRow: FC<Props> = ({
    field,
    label,
    tableLabel,
    count,
    isWaiting,
    onAll,
    onNone,
    onRemove,
    removeDisabledReason,
}) => {
    const showAll = count.applied < count.possible;
    const showNone = count.applied > 0;
    const canRemove = removeDisabledReason === null;

    return (
        <Stack
            className={classes.row}
            gap={0}
            data-waiting={isWaiting || undefined}
        >
            <Group gap={0} wrap="nowrap" align="flex-start">
                <Box className={classes.rowMain}>
                    <Group gap="xs" wrap="nowrap">
                        {field !== null && (
                            <FieldIcon item={field} size={14} aria-hidden />
                        )}
                        <Text fz="sm" fw={600} truncate>
                            {label}
                        </Text>
                    </Group>
                </Box>
            </Group>
            <Group
                className={classes.rowActions}
                gap="xs"
                justify="space-between"
                wrap="nowrap"
            >
                <Text
                    key={`${count.applied}/${count.possible}`}
                    fz="xs"
                    c="dimmed"
                    truncate
                    className={classes.rowCount}
                >
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
                            {/* Not `disabled`: the arrow keys still reach
                                    it, so the reason can be read */}
                            <Tooltip
                                label={removeDisabledReason}
                                disabled={canRemove}
                                events={{
                                    hover: true,
                                    focus: true,
                                    touch: true,
                                }}
                            >
                                <Menu.Item
                                    closeMenuOnClick={canRemove}
                                    aria-disabled={!canRemove || undefined}
                                    c={canRemove ? undefined : 'dimmed'}
                                    onClick={() => {
                                        if (canRemove) onRemove();
                                    }}
                                >
                                    Remove field
                                </Menu.Item>
                            </Tooltip>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Group>
        </Stack>
    );
};
