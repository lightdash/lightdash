import { getUnitsOfTimeGreaterOrEqual, UnitOfTime } from '@lightdash/common'; // Modified import to include getUnitsOfTimeGreaterOrEqual
import { Select, type SelectProps } from '@mantine/core';
import { type FC } from 'react';

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
}) => (
    <Select
        searchable
        placeholder="Select value"
        size="xs"
        {...rest}
        value={completed ? `${unitOfTime}-completed` : unitOfTime}
        data={getUnitOfTimeOptions({
            isTimestamp,
            minUnitOfTime,
            showCompletedOptions,
            showOptionsInPlural,
        })}
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

export default FilterUnitOfTimeAutoComplete;
