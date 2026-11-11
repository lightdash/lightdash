import { Group, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

export type EditFiltersVisibility = 'all' | 'summary' | 'hidden';

const OPTIONS: {
    value: EditFiltersVisibility;
    label: string;
    tooltip: string;
    controlsTooltip: string;
}[] = [
    {
        value: 'all',
        label: 'All',
        tooltip: 'Show every filter',
        controlsTooltip: 'Show every control',
    },
    {
        value: 'summary',
        label: 'Hide',
        tooltip: 'Collapse filters into a one-line summary',
        controlsTooltip: 'Collapse controls into a one-line summary',
    },
    {
        value: 'hidden',
        label: 'Off',
        tooltip: 'Hide the filters bar',
        controlsTooltip: 'Hide the controls bar',
    },
];

const isEditFiltersVisibility = (
    value: string,
): value is EditFiltersVisibility =>
    OPTIONS.some((option) => option.value === value);

type Props = {
    value: EditFiltersVisibility;
    onChange: (value: EditFiltersVisibility) => void;
    /** Names the dashboard's controls rather than its filters (default false). */
    isControls?: boolean;
};

export const EditFiltersVisibilityControl: FC<Props> = ({
    value,
    onChange,
    isControls = false,
}) => (
    <Group gap="xs" wrap="nowrap">
        <Group gap="xxs" wrap="nowrap">
            <MantineIcon icon={IconFilter} color="dimmed" />
            <Text fz="xs" c="dimmed" fw={500}>
                {isControls ? 'Controls' : 'Filters'}
            </Text>
        </Group>
        <SegmentedControl
            size="xs"
            aria-label={`${isControls ? 'Controls' : 'Filters'} visibility while editing`}
            value={value}
            onChange={(next) => {
                if (isEditFiltersVisibility(next)) onChange(next);
            }}
            data={OPTIONS.map((option) => ({
                value: option.value,
                label: (
                    <Tooltip
                        label={
                            isControls ? option.controlsTooltip : option.tooltip
                        }
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
);
