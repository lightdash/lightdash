import { FUNNEL_DATE_PRESETS, type FunnelDatePreset } from '@lightdash/common';
import { Group, SegmentedControl } from '@mantine-8/core';
import { DatePickerInput } from '@mantine/dates';
import { useCallback, type FC } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
    selectCustomDateRange,
    selectDateRangePreset,
    setCustomDateRange,
    setDateRangePreset,
} from '../store/funnelBuilderSlice';

export const FunnelDateFilter: FC = () => {
    const dispatch = useAppDispatch();
    const dateRangePreset = useAppSelector(selectDateRangePreset);
    const customDateRange = useAppSelector(selectCustomDateRange);

    // Convert ISO strings to Date objects for the picker
    const customDateRangeDates: [Date | null, Date | null] = [
        customDateRange[0] ? new Date(customDateRange[0]) : null,
        customDateRange[1] ? new Date(customDateRange[1]) : null,
    ];

    const handleCustomDateChange = useCallback(
        (range: [Date | null, Date | null]) => {
            dispatch(
                setCustomDateRange([
                    range[0]?.toISOString() ?? null,
                    range[1]?.toISOString() ?? null,
                ]),
            );
        },
        [dispatch],
    );

    return (
        <Group gap="md" wrap="nowrap">
            <SegmentedControl
                value={dateRangePreset}
                onChange={(value) =>
                    dispatch(setDateRangePreset(value as FunnelDatePreset))
                }
                data={FUNNEL_DATE_PRESETS.map((p) => ({
                    value: p.value,
                    label: p.label,
                }))}
            />

            {dateRangePreset === 'custom' && (
                <DatePickerInput
                    type="range"
                    label="Custom Date Range"
                    value={customDateRangeDates}
                    onChange={handleCustomDateChange}
                />
            )}
        </Group>
    );
};
