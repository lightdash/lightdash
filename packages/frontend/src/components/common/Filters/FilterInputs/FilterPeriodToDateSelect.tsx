import {
    isDimension,
    TimeFrames,
    UnitOfTime,
    type FilterableField,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import { useMemo, type FC } from 'react';

const allPeriodOptions = [
    { value: UnitOfTime.years, label: 'year to date (YTD)' },
    { value: UnitOfTime.quarters, label: 'quarter to date (QTD)' },
    { value: UnitOfTime.months, label: 'month to date (MTD)' },
    { value: UnitOfTime.weeks, label: 'week to date (WTD)' },
];

/**
 * Maps a field's time interval to the minimum period granularity allowed.
 * For example, a MONTH-level field can use month, quarter, or year to date
 * (but not week, since the raw date is truncated to month).
 */
const timeIntervalToMinUnit: Partial<Record<TimeFrames, UnitOfTime>> = {
    [TimeFrames.WEEK]: UnitOfTime.weeks,
    [TimeFrames.MONTH]: UnitOfTime.months,
    [TimeFrames.QUARTER]: UnitOfTime.quarters,
    [TimeFrames.YEAR]: UnitOfTime.years,
};

const unitOrder: UnitOfTime[] = [
    UnitOfTime.weeks,
    UnitOfTime.months,
    UnitOfTime.quarters,
    UnitOfTime.years,
];

interface Props {
    disabled?: boolean;
    unitOfTime?: UnitOfTime;
    field?: FilterableField;
    onChange: (unitOfTime: UnitOfTime) => void;
}

const FilterPeriodToDateSelect: FC<Props> = ({
    disabled,
    unitOfTime,
    field,
    onChange,
}) => {
    const options = useMemo(() => {
        if (!field || !isDimension(field) || !field.timeInterval) {
            return allPeriodOptions;
        }
        const minUnit = timeIntervalToMinUnit[field.timeInterval];
        if (!minUnit) return allPeriodOptions;
        const minIndex = unitOrder.indexOf(minUnit);
        return allPeriodOptions.filter((opt) => {
            const optIndex = unitOrder.indexOf(opt.value as UnitOfTime);
            return optIndex >= minIndex;
        });
    }, [field]);

    return (
        <Select
            w="100%"
            size="xs"
            disabled={disabled}
            placeholder="Select period"
            data={options}
            value={unitOfTime ?? null}
            data-autofocus={!unitOfTime || undefined}
            onChange={(value) => {
                if (value) {
                    onChange(value as UnitOfTime);
                }
            }}
        />
    );
};

export default FilterPeriodToDateSelect;
