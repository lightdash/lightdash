import { Group, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    EDIT_SHORTCUTS,
    nextInCycle,
    toHotkeyItems,
} from '../../components/common/Dashboard/editShortcuts';
import { ShortcutHint } from '../../components/common/Dashboard/ShortcutHint';
import MantineIcon from '../../components/common/MantineIcon';

export type EditFiltersVisibility = 'all' | 'summary' | 'hidden';

const OPTIONS: {
    value: EditFiltersVisibility;
    label: string;
    tooltip: string;
}[] = [
    { value: 'all', label: 'All', tooltip: 'Show every filter' },
    {
        value: 'summary',
        label: 'Hide',
        tooltip: 'Collapse filters into a one-line summary',
    },
    { value: 'hidden', label: 'Off', tooltip: 'Hide the filters bar' },
];

const isEditFiltersVisibility = (
    value: string,
): value is EditFiltersVisibility =>
    OPTIONS.some((option) => option.value === value);

type Props = {
    value: EditFiltersVisibility;
    onChange: (value: EditFiltersVisibility) => void;
};

export const EditFiltersVisibilityControl: FC<Props> = ({
    value,
    onChange,
}) => {
    useHotkeys(
        toHotkeyItems(EDIT_SHORTCUTS.filters, () =>
            onChange(
                nextInCycle(
                    OPTIONS.map((option) => option.value),
                    value,
                ),
            ),
        ),
    );

    return (
        <ShortcutHint shortcut={EDIT_SHORTCUTS.filters} position="top">
            <Group gap="xs" wrap="nowrap">
                <Group gap="xxs" wrap="nowrap">
                    <MantineIcon icon={IconFilter} color="dimmed" />
                    <Text fz="xs" c="dimmed" fw={500}>
                        Filters
                    </Text>
                </Group>
                <SegmentedControl
                    size="xs"
                    aria-label="Filters visibility while editing"
                    value={value}
                    onChange={(next) => {
                        if (isEditFiltersVisibility(next)) onChange(next);
                    }}
                    data={OPTIONS.map((option) => ({
                        value: option.value,
                        label: (
                            <Tooltip
                                label={option.tooltip}
                                position="bottom"
                                openDelay={200}
                            >
                                <Text span inherit>
                                    {option.label}
                                </Text>
                            </Tooltip>
                        ),
                    }))}
                />
            </Group>
        </ShortcutHint>
    );
};
