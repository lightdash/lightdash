import { Popover2Props } from '@blueprintjs/popover2';
import { UnitOfTime } from '@lightdash/common';
import { Select, SelectProps } from '@mantine/core';
import { FC } from 'react';

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
    showCompletedOptions,
    showOptionsInPlural,
}: {
    isTimestamp: boolean;
    showCompletedOptions: boolean;
    showOptionsInPlural: boolean;
}) => {
    const dateIndex = Object.keys(UnitOfTime).indexOf(UnitOfTime.days);

    // Filter unitTimes before Days if we are filtering Dates only
    const unitsOfTime = isTimestamp
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
    showOptionsInPlural?: boolean;
    showCompletedOptions?: boolean;
    completed: boolean;
    popoverProps?: Popover2Props;
    onChange: (value: { unitOfTime: UnitOfTime; completed: boolean }) => void;
}

const FilterUnitOfTimeAutoComplete: FC<Props> = ({
    isTimestamp,
    unitOfTime,
    showOptionsInPlural = true,
    showCompletedOptions = true,
    completed,
    onChange,
    popoverProps,
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
