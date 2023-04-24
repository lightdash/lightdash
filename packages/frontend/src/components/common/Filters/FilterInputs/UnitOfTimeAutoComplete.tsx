import { UnitOfTime } from '@lightdash/common';
import { Select } from '@mantine/core';
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

type Props = {
    value: UnitOfTime;
    disabled?: boolean;
    isTimestamp: boolean;
    showOptionsInPlural?: boolean;
    showCompletedOptions?: boolean;
    completed: boolean;
    onClosed?: () => void;
    onChange: (
        value: Pick<UnitOfTimeOption, 'unitOfTime' | 'completed'>,
    ) => void;
};

const UnitOfTimeAutoComplete: FC<Props> = ({
    isTimestamp,
    completed,
    value,
    showOptionsInPlural = true,
    showCompletedOptions = true,
    onChange,
    onClosed,
    disabled,
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
            disabled={disabled}
            searchable
            nothingFound="No results..."
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
