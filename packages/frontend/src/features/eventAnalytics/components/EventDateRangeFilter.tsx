import {
    EVENT_ANALYTICS_DATE_PRESETS,
    type EventAnalyticsDatePreset,
} from '@lightdash/common';
import { Group, SegmentedControl } from '@mantine/core';
import { useCallback, type FC } from 'react';
import CalendarRangePickerInput from '../../../components/common/DatePickers/CalendarRangePickerInput';
import { type CalendarDateRange } from '../../../components/common/DatePickers/types';

type Props = {
    preset: EventAnalyticsDatePreset;
    /** ISO strings, so the value can live in a serializable store */
    customRange: [string | null, string | null];
    onPresetChange: (preset: EventAnalyticsDatePreset) => void;
    onCustomRangeChange: (range: [string | null, string | null]) => void;
    presets?: readonly EventAnalyticsDatePreset[];
};

const isPreset = (value: string): value is EventAnalyticsDatePreset =>
    EVENT_ANALYTICS_DATE_PRESETS.some((p) => p.value === value);

/** Selects the date range of an event analytics query. */
export const EventDateRangeFilter: FC<Props> = ({
    preset,
    customRange,
    onPresetChange,
    onCustomRangeChange,
    presets,
}) => {
    const customDateRangeDates: CalendarDateRange = [
        customRange[0] ? new Date(customRange[0]) : null,
        customRange[1] ? new Date(customRange[1]) : null,
    ];

    const handleCustomDateChange = useCallback(
        (range: CalendarDateRange) => {
            onCustomRangeChange([
                range[0]?.toISOString() ?? null,
                range[1]?.toISOString() ?? null,
            ]);
        },
        [onCustomRangeChange],
    );

    const data = EVENT_ANALYTICS_DATE_PRESETS.filter(
        (p) => !presets || presets.includes(p.value),
    ).map((p) => ({ value: p.value, label: p.label }));

    return (
        <Group gap="md" wrap="nowrap">
            <SegmentedControl
                value={preset}
                onChange={(value) => {
                    if (isPreset(value)) onPresetChange(value);
                }}
                data={data}
            />

            {preset === 'custom' && (
                <CalendarRangePickerInput
                    label="Custom date range"
                    value={customDateRangeDates}
                    onChange={handleCustomDateChange}
                />
            )}
        </Group>
    );
};
