import { UnitOfTime } from '@lightdash/common';
import { Select, SelectProps } from '@mantine/core';
import { FC, useMemo } from 'react';

type UnitOfTimeOption = {
    value: string;
    label: string;
    unitOfTime: UnitOfTime;
    completed: boolean;
};

const getUnitOfTimeLabel = (
    unitOfTime: UnitOfTime,
    isPlural: boolean,
    isCompleted: boolean,
) => {
    return `${isCompleted ? 'completed ' : ''}${
        isPlural ? unitOfTime : unitOfTime.substring(0, unitOfTime.length - 1)
    }`;
};

const getUnitOfTimeValue = (unitOfTime: UnitOfTime, isCompleted: boolean) => {
    return `${isCompleted ? 'completed-' : ''}${unitOfTime}`;
};

interface UnitOfTimeAutoCompleteProps
    extends Omit<SelectProps, 'data' | 'onChange'> {
    value: UnitOfTime;
    completed: boolean;
    isTimestamp: boolean;
    showOptionsInPlural?: boolean;
    showCompletedOptions?: boolean;
    onClosed?: () => void;
    onChange: (
        value: Pick<UnitOfTimeOption, 'unitOfTime' | 'completed'>,
    ) => void;
}

const UnitOfTimeAutoComplete: FC<UnitOfTimeAutoCompleteProps> = ({
    isTimestamp,
    completed,
    value,
    showOptionsInPlural = true,
    showCompletedOptions = true,
    onClosed,
    onChange,
    ...rest
}) => {
    const data = useMemo(() => {
        const dateIndex = Object.keys(UnitOfTime).indexOf(UnitOfTime.days);

        // Filter unitTimes before Days if we are filtering Dates only
        const unitsOfTime = isTimestamp
            ? Object.values(UnitOfTime)
            : Object.values(UnitOfTime).slice(dateIndex);

        return unitsOfTime
            .reverse()
            .reduce<UnitOfTimeOption[]>((sum, unitOfTime) => {
                const newOptions = [
                    ...sum,
                    {
                        value: getUnitOfTimeValue(unitOfTime, false),
                        label: getUnitOfTimeLabel(
                            unitOfTime,
                            showOptionsInPlural,
                            false,
                        ),
                        unitOfTime,
                        completed: false,
                    },
                ];

                if (showCompletedOptions) {
                    newOptions.push({
                        value: getUnitOfTimeValue(unitOfTime, true),
                        label: getUnitOfTimeLabel(
                            unitOfTime,
                            showOptionsInPlural,
                            true,
                        ),
                        unitOfTime,
                        completed: true,
                    });
                }
                return newOptions;
            }, []);
    }, [isTimestamp, showCompletedOptions, showOptionsInPlural]);

    return (
        <Select
            {...rest}
            data={data}
            value={getUnitOfTimeValue(value, completed)}
            onChange={(newValue) => {
                const unitOfTime = data.find(
                    (u) =>
                        getUnitOfTimeValue(u.unitOfTime, u.completed) ===
                        newValue,
                );

                if (!unitOfTime) return;

                onChange({
                    unitOfTime: unitOfTime.unitOfTime,
                    completed: unitOfTime.completed,
                });
            }}
            onDropdownClose={onClosed}
        />
    );
};

export default UnitOfTimeAutoComplete;
