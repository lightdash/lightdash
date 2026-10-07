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
import MantineIcon from '../../components/common/MantineIcon';
import classes from './FieldsAndCharts.module.css';
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
                data-highlighted={isHighlighted || undefined}
                onClick={onToggleHighlight}
            >
                <Text fz="sm" fw={600} truncate>
                    {label}
                </Text>
            </UnstyledButton>
            <Stack className={classes.rowActions} gap={2}>
                <Text fz="xs" c="dimmed" truncate>
                    {isNotSaved
                        ? `${tableLabel} · Not on any chart yet`
                        : isWaiting
                          ? `${tableLabel} · not added yet`
                          : `${tableLabel} · ${count.applied} of ${
                                count.possible
                            } ${pluralizeCharts(count.possible)}`}
                </Text>
                <Group gap={4} wrap="wrap">
                    {showAll && (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            aria-label={`Apply ${label} to all ${count.possible} ${tableLabel} charts`}
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
                                <Menu.Item
                                    aria-label={
                                        count.applied === 1
                                            ? `Clear ${label} from the 1 chart`
                                            : `Clear ${label} from all ${count.applied} charts`
                                    }
                                    onClick={onNone}
                                >
                                    Clear from charts
                                </Menu.Item>
                            )}
                            <Menu.Item
                                aria-label={`Remove ${label} from this filter`}
                                onClick={onRemove}
                            >
                                Remove field
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Stack>
        </Stack>
    );
};
