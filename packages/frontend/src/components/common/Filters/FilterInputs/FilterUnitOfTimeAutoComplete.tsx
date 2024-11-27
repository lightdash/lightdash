import { getUnitsOfTimeGreaterOrEqual, UnitOfTime } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import { useEffect, useMemo, type FC } from 'react';

const getUnitOfTimeLabel = (
    unitOfTime: UnitOfTime,
    isPlural: boolean,
    isCompleted: boolean,
) => {
    return `${isCompleted ? 'completed ' : ''}${
        isPlural ? unitOfTime : unitOfTime.substring(0, unitOfTime.length - 1)
    }`;
};

const getUnitOfTimeOptions = ({
    isTimestamp,
    minUnitOfTime,
    showCompletedOptions,
    showOptionsInPlural,
}: {
    isTimestamp: boolean;
    minUnitOfTime?: UnitOfTime;
    showCompletedOptions: boolean;
    showOptionsInPlural: boolean;
}) => {
    const dateIndex = Object.keys(UnitOfTime).indexOf(UnitOfTime.days);

    const unitsOfTime = minUnitOfTime
        ? getUnitsOfTimeGreaterOrEqual(minUnitOfTime)
        : isTimestamp
        ? Object.values(UnitOfTime)
        : Object.values(UnitOfTime).slice(dateIndex);

    return unitsOfTime
        .reverse()
        .reduce<{ label: string; value: string }[]>((sum, unitOfTime) => {
            const newOptions = [
                ...sum,
                {
                    label: getUnitOfTimeLabel(
                        unitOfTime,
                        showOptionsInPlural,
                        false,
                    ),
                    value: unitOfTime.toString(),
                },
            ];

            if (showCompletedOptions) {
                newOptions.push({
                    label: getUnitOfTimeLabel(
                        unitOfTime,
                        showOptionsInPlural,
                        true,
                    ),
                    value: `${unitOfTime}-completed`,
                });
            }
            return newOptions;
        }, []);
};

interface Props extends Omit<SelectProps, 'data' | 'onChange'> {
    isTimestamp: boolean;
    unitOfTime: UnitOfTime | null;
    minUnitOfTime?: UnitOfTime;
    showOptionsInPlural?: boolean;
    showCompletedOptions?: boolean;
    completed: boolean;
    onChange: (value: { unitOfTime: UnitOfTime; completed: boolean }) => void;
}

const FilterUnitOfTimeAutoComplete: FC<Props> = ({
    isTimestamp,
    unitOfTime,
    minUnitOfTime,
    showOptionsInPlural = true,
    showCompletedOptions = true,
    completed,
    onChange,
    ...rest
}) => {
    // Memoize options to prevent unnecessary re-renders
    const options = useMemo(
        () =>
            getUnitOfTimeOptions({
                isTimestamp,
                minUnitOfTime,
                showCompletedOptions,
                showOptionsInPlural,
            }),
        [isTimestamp, minUnitOfTime, showCompletedOptions, showOptionsInPlural],
    );

    // Memoize option values
    const optionValues = useMemo(() => options.map((o) => o.value), [options]);

    const currentValue = unitOfTime
        ? completed
            ? `${unitOfTime}-completed`
            : unitOfTime
        : '';

    // reset value only if it's no longer valid (e.g. options changed and the current value is no longer in the list)
    useEffect(() => {
        if (!optionValues.includes(currentValue)) {
            // The current value is no longer valid
            const firstOptionValue = options[0]?.value;
            if (firstOptionValue) {
                const [unitOfTimeValue, isCompleted] =
                    firstOptionValue.split('-');
                onChange({
                    unitOfTime: unitOfTimeValue as UnitOfTime,
                    completed: isCompleted === 'completed',
                });
            } else {
                // no options available, reset value
                onChange({
                    unitOfTime: UnitOfTime.days,
                    completed: false,
                });
            }
        }
    }, [currentValue, optionValues, onChange, options]);

    const selectValue: string | null = optionValues.includes(currentValue)
        ? currentValue
        : options[0]?.value ?? null;

    return (
        <Select
            searchable
            placeholder="Select value"
            size="xs"
            {...rest}
            value={selectValue}
            data={options}
            onChange={(value) => {
                if (value === null) return;

                const [unitOfTimeValue, isCompleted] = value.split('-');
                onChange({
                    unitOfTime: unitOfTimeValue as UnitOfTime,
                    completed: isCompleted === 'completed',
                });
            }}
        />
    );
};

export default FilterUnitOfTimeAutoComplete;
