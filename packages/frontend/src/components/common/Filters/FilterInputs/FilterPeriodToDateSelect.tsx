import {
    isDimension,
    TimeFrames,
    UnitOfTime,
    type FilterableField,
    type UiStringResolver,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';

const getAllPeriodOptions = (getUiString: UiStringResolver) => [
    {
        value: UnitOfTime.years,
        label: getUiString('filters.periodToDateSelect.years'),
    },
    {
        value: UnitOfTime.quarters,
        label: getUiString('filters.periodToDateSelect.quarters'),
    },
    {
        value: UnitOfTime.months,
        label: getUiString('filters.periodToDateSelect.months'),
    },
    {
        value: UnitOfTime.weeks,
        label: getUiString('filters.periodToDateSelect.weeks'),
    },
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
    popoverProps?: {
        withinPortal?: boolean;
        onOpen?: () => void;
        onClose?: () => void;
    };
}

const FilterPeriodToDateSelect: FC<Props> = ({
    disabled,
    unitOfTime,
    field,
    onChange,
    popoverProps,
}) => {
    const getUiString = useUiStrings();
    const options = useMemo(() => {
        const allPeriodOptions = getAllPeriodOptions(getUiString);
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
    }, [field, getUiString]);

    return (
        <Select
            allowDeselect={false}
            w="100%"
            size="xs"
            disabled={disabled}
            placeholder={getUiString('filters.selectPeriodPlaceholder')}
            comboboxProps={{ withinPortal: popoverProps?.withinPortal }}
            onDropdownOpen={popoverProps?.onOpen}
            onDropdownClose={popoverProps?.onClose}
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
