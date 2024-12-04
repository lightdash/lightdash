import {
    type MetricExplorerDateRange,
    type MetricExplorerPartialDateRange,
} from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';
import { formatDate, getDateRangePresets } from '../utils/metricPeekDate';

type DateRange = MetricExplorerPartialDateRange;

export interface DateRangePreset {
    label: string;
    getValue: () => DateRange;
    getTooltipLabel: () => string;
}

interface UseDateRangePickerProps {
    value: MetricExplorerDateRange;
    onChange?: (range: MetricExplorerDateRange) => void;
}

/**
 * Hook to handle the date range picker for the metric peek
 * This hook handles the open/close state of the date range picker,
 * the date range itself, the selected preset, and the temp date range
 * (used when the user is selecting a preset, but has not applied it yet)
 */
export const useDateRangePicker = ({
    value,
    onChange,
}: UseDateRangePickerProps) => {
    const presets = getDateRangePresets();
    const [isOpen, setIsOpen] = useState(false);

    const [dateRange, setDateRange] = useState<DateRange>(value);

    const [tempDateRange, setTempDateRange] = useState<DateRange>(dateRange);

    const [selectedPreset, setSelectedPreset] =
        useState<DateRangePreset | null>(null);
    const [tempSelectedPreset, setTempSelectedPreset] =
        useState<DateRangePreset | null>(null);

    useEffect(() => {
        setDateRange(value);
    }, [value]);

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
        if (onChange && tempDateRange[0] && tempDateRange[1]) {
            onChange([tempDateRange[0], tempDateRange[1]]);
        }
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

    const reset = () => {
        setDateRange(value);
        setSelectedPreset(null);
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
        reset,
    };
};
