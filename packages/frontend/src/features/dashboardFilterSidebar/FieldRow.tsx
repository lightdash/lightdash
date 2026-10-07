import { Box, Button, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { type FC } from 'react';
import classes from './FieldsAndCharts.module.css';
import { NotSavedBadge } from './NotSavedBadge';
import { type FieldCount } from './peers';

const pluralizeCharts = (count: number): string =>
    count === 1 ? 'chart' : 'charts';

type Props = {
    label: string;
    tableLabel: string;
    count: FieldCount;
    isWaiting: boolean;
    isHighlighted: boolean;
    isNotSaved: boolean;
    onToggleHighlight: () => void;
    onAll: () => void;
    onNone: () => void;
    onRemove: () => void;
};

export const FieldRow: FC<Props> = ({
    label,
    tableLabel,
    count,
    isWaiting,
    isHighlighted,
    isNotSaved,
    onToggleHighlight,
    onAll,
    onNone,
    onRemove,
}) => {
    const showAll = count.applied < count.possible;
    const showNone = !isWaiting && count.applied > 0;

    const rowClassName = [
        classes.row,
        isHighlighted ? classes.rowHighlighted : '',
        isWaiting ? classes.rowWaiting : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <Stack className={rowClassName} gap={0}>
            <UnstyledButton
                className={classes.rowMain}
                aria-pressed={isHighlighted}
                onClick={onToggleHighlight}
            >
                <Group gap="xs" wrap="nowrap">
                    <Text fz="sm" fw={600} truncate>
                        {label}
                    </Text>
                    {isNotSaved && (
                        <NotSavedBadge tooltip="A field on no charts is not saved yet. It will be gone after a reload." />
                    )}
                </Group>
                <Text fz="xs" c="dimmed" truncate>
                    {isWaiting
                        ? `${tableLabel} · not added yet`
                        : `${tableLabel} · ${count.applied} of ${
                              count.possible
                          } ${pluralizeCharts(count.possible)}`}
                </Text>
            </UnstyledButton>
            <Box
                className={`${classes.rowActions} ${
                    isWaiting ? classes.rowActionsVisible : ''
                }`}
            >
                <Group gap={4} wrap="wrap">
                    {showAll && (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            aria-label={`Use ${label} on all ${count.possible} ${tableLabel} charts`}
                            onClick={onAll}
                        >
                            Use on all {count.possible}{' '}
                            {pluralizeCharts(count.possible)}
                        </Button>
                    )}
                    {showNone && (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            aria-label={
                                count.applied === 1
                                    ? `Stop using ${label} on the 1 chart`
                                    : `Stop using ${label} on all ${count.applied} charts`
                            }
                            onClick={onNone}
                        >
                            Use on no charts
                        </Button>
                    )}
                    {
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            aria-label={`Remove ${label} from this filter`}
                            onClick={onRemove}
                        >
                            Remove
                        </Button>
                    }
                </Group>
            </Box>
        </Stack>
    );
};
