import {
    type ApiGetMetricPeek,
    type MetricExplorerDateRange,
} from '@lightdash/common';
import { useMemo, useState } from 'react';
import {
    formatDate,
    getDateRangePresets,
    getDefaultDateRangeFromInterval,
} from '../utils/metricPeekDate';

type DateRange = MetricExplorerDateRange;

export interface DateRangePreset {
    label: string;
    getValue: () => DateRange;
    getTooltipLabel: () => string;
}

interface UseDateRangePickerProps {
    defaultTimeDimension?: ApiGetMetricPeek['results']['defaultTimeDimension'];
    onChange?: (range: DateRange) => void;
}

/**
 * Hook to handle the date range picker for the metric peek
 * This hook handles the open/close state of the date range picker,
 * the date range itself, the selected preset, and the temp date range
 * (used when the user is selecting a preset, but has not applied it yet)
 */
export const useDateRangePicker = ({
    defaultTimeDimension,
    onChange,
}: UseDateRangePickerProps) => {
    const presets = getDateRangePresets();
    const [isOpen, setIsOpen] = useState(false);

    const [dateRange, setDateRange] = useState<DateRange>(
        getDefaultDateRangeFromInterval(defaultTimeDimension?.interval),
    );
    const [tempDateRange, setTempDateRange] = useState<DateRange>(dateRange);

    const [selectedPreset, setSelectedPreset] =
        useState<DateRangePreset | null>(null);
    const [tempSelectedPreset, setTempSelectedPreset] =
        useState<DateRangePreset | null>(null);

    const buttonLabel =
        selectedPreset?.label ||
        (dateRange[0]
            ? dateRange[1]
                ? `${formatDate(dateRange[0])} - ${formatDate(dateRange[1])}`
                : formatDate(dateRange[0])
            : 'Select date range');

    const formattedTempDateRange = useMemo(() => {
        return [formatDate(tempDateRange[0]), formatDate(tempDateRange[1])];
    }, [tempDateRange]);

    const handleOpen = (open: boolean) => {
        if (open) {
            setTempDateRange(dateRange);
            setTempSelectedPreset(selectedPreset);
        }
        setIsOpen(open);
    };

    const handleApply = () => {
        setDateRange(tempDateRange);
        setSelectedPreset(tempSelectedPreset);
        onChange?.(tempDateRange);
        setIsOpen(false);
    };

    const handlePresetSelect = (preset: DateRangePreset) => {
        const newRange = preset.getValue();
        setTempDateRange(newRange);
        setTempSelectedPreset(preset);
    };

    const handleDateRangeChange = (newRange: DateRange) => {
        setTempDateRange(newRange);
        setTempSelectedPreset(null);
    };

    return {
        isOpen,
        tempDateRange,
        selectedPreset,
        tempSelectedPreset,
        presets,
        buttonLabel,
        formattedTempDateRange,
        handleOpen,
        handleApply,
        handlePresetSelect,
        handleDateRangeChange,
    };
};
