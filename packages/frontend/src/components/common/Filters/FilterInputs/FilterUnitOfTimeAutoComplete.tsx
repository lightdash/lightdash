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
    unitOfTime?: UnitOfTime;
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
    // compute the options
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

    // compute the current value
    const selectValue = useMemo(() => {
        // return the value if it's valid
        if (unitOfTime) {
            return `${unitOfTime}${completed ? '-completed' : ''}`;
        }
        // return the last option value
        if (options.length > 0) {
            return options[options.length - 1]?.value;
        }
        return '';
    }, [unitOfTime, completed, options]);

    // update the selected value if it's no longer valid
    useEffect(() => {
        const optionValues = options.map((o) => o.value);
        if (!optionValues.includes(selectValue)) {
            if (options.length > 0) {
                // if incvalid, set the last option value
                const [newUnitOfTime, isCompleted] =
                    options[options.length - 1].value.split('-');
                onChange({
                    unitOfTime: newUnitOfTime as UnitOfTime,
                    completed: isCompleted === 'completed',
                });
            } else {
                console.warn(
                    'No options available for FilterUnitOfTimeAutoComplete',
                );
            }
        }
    }, [selectValue, options, onChange]);

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
