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
import classes from './FieldsAndCharts.module.css';
import { type FieldCount } from './peers';

const pluralizeCharts = (count: number): string =>
    count === 1 ? 'tile' : 'tiles';

type Props = {
    field: DashboardFilterableField | null;
    label: string;
    tableLabel: string;
    count: FieldCount;
    isWaiting: boolean;
    isHighlighted: boolean;
    isNotSaved: boolean;
    onToggleHighlight: () => void;
    onHoverChange: (isHovered: boolean) => void;
    onAll: () => void;
    onNone: () => void;
    // null when the row is the last one and cannot be removed
    onRemove: (() => void) | null;
};

export const FieldRow: FC<Props> = ({
    field,
    label,
    tableLabel,
    count,
    isWaiting,
    isHighlighted,
    isNotSaved,
    onToggleHighlight,
    onHoverChange,
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
                data-highlighted={isHighlighted || undefined}
                onClick={onToggleHighlight}
                onMouseEnter={() => onHoverChange(true)}
                onMouseLeave={() => onHoverChange(false)}
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
                    {isNotSaved
                        ? `Not on any tile yet · could reach ${
                              count.possible
                          } ${pluralizeCharts(count.possible)}`
                        : isWaiting
                          ? `${tableLabel} · not added yet`
                          : `${tableLabel} · ${count.applied} of ${
                                count.possible
                            } ${pluralizeCharts(count.possible)}`}
                </Text>
                <Group gap={4} wrap="nowrap" flex="0 0 auto">
                    {showAll && (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            aria-label={`Apply ${label} to all ${count.possible} ${tableLabel} tiles`}
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
                                    <Menu.Item
                                        aria-label={
                                            count.applied === 1
                                                ? `Clear ${label} from the 1 tile`
                                                : `Clear ${label} from all ${count.applied} tiles`
                                        }
                                        onClick={onNone}
                                    >
                                        Clear from tiles
                                    </Menu.Item>
                                )}
                                {onRemove !== null && (
                                    <Menu.Item
                                        aria-label={`Remove ${label}`}
                                        onClick={onRemove}
                                    >
                                        Remove{' '}
                                        {tableLabel === 'Parameter'
                                            ? 'parameter'
                                            : 'field'}
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
