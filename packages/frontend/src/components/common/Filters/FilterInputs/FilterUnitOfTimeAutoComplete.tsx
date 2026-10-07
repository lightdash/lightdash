import {
    getUnitsOfTimeGreaterOrEqual,
    UnitOfTime,
    unitOfTimeSupportsToDate,
    type UiStringResolver,
} from '@lightdash/common';
import { type SelectProps, Select } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';

const getUnitOfTimeLabel = (
    unitOfTime: UnitOfTime,
    isPlural: boolean,
    isCompleted: boolean,
    getUiString: UiStringResolver,
) =>
    getUiString(
        `filters.unitsOfTime.${unitOfTime}.${
            isCompleted
                ? isPlural
                    ? 'completedPlural'
                    : 'completedSingular'
                : isPlural
                  ? 'plural'
                  : 'singular'
        }`,
    );

const getToDateLabel = (
    unitOfTime: UnitOfTime,
    getUiString: UiStringResolver,
) => {
    switch (unitOfTime) {
        case UnitOfTime.weeks:
        case UnitOfTime.months:
        case UnitOfTime.quarters:
        case UnitOfTime.years:
            return getUiString(`filters.periodToDate.${unitOfTime}`);
        default:
            return getUiString('filters.periodToDate.fallback');
    }
};

const getUnitOfTimeOptions = ({
    isTimestamp,
    minUnitOfTime,
    showCompletedOptions,
    showToDateOptions,
    showOptionsInPlural,
    getUiString,
}: {
    isTimestamp: boolean;
    minUnitOfTime?: UnitOfTime;
    showCompletedOptions: boolean;
    showToDateOptions: boolean;
    showOptionsInPlural: boolean;
    getUiString: UiStringResolver;
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
                        getUiString,
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
                        getUiString,
                    ),
                    value: `${unitOfTime}-completed`,
                });
            }

            if (showToDateOptions && unitOfTimeSupportsToDate(unitOfTime)) {
                newOptions.push({
                    label: getToDateLabel(unitOfTime, getUiString),
                    value: `${unitOfTime}-toDate`,
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
    showToDateOptions?: boolean;
    completed: boolean;
    toDate?: boolean;
    onChange: (value: {
        unitOfTime: UnitOfTime;
        completed: boolean;
        toDate: boolean;
    }) => void;
}

const FilterUnitOfTimeAutoComplete: FC<Props> = ({
    isTimestamp,
    unitOfTime,
    minUnitOfTime,
    showOptionsInPlural = true,
    showCompletedOptions = true,
    showToDateOptions = false,
    completed,
    toDate = false,
    onChange,
    ...rest
}) => {
    const getUiString = useUiStrings();
    const { options, selectValue } = useMemo(() => {
        const standardOptions = getUnitOfTimeOptions({
            isTimestamp,
            minUnitOfTime,
            showCompletedOptions,
            showToDateOptions,
            showOptionsInPlural,
            getUiString,
        });

        // for a fresh filter (no unitOfTime), just return standard options
        if (!unitOfTime) {
            return {
                options: standardOptions,
                selectValue: '',
            };
        }

        // compute current value for existing filter
        const suffix = completed ? '-completed' : toDate ? '-toDate' : '';
        const currentValue = `${unitOfTime}${suffix}`;

        // check if current value exists in standard options
        const currentValueExists = standardOptions.some(
            (option) => option.value === currentValue,
        );

        // add current value to options if it doesn't exist
        const finalOptions = !currentValueExists
            ? [
                  ...standardOptions,
                  {
                      label: toDate
                          ? getToDateLabel(unitOfTime, getUiString)
                          : getUnitOfTimeLabel(
                                unitOfTime,
                                showOptionsInPlural,
                                completed,
                                getUiString,
                            ),
                      value: currentValue,
                  },
              ]
            : standardOptions;

        return {
            options: finalOptions,
            selectValue: currentValue,
        };
    }, [
        isTimestamp,
        minUnitOfTime,
        showCompletedOptions,
        showToDateOptions,
        showOptionsInPlural,
        unitOfTime,
        completed,
        toDate,
        getUiString,
    ]);

    return (
        <Select
            scrollAreaProps={{ type: 'always' }}
            allowDeselect={false}
            searchable
            placeholder={getUiString('filters.selectValuePlaceholder')}
            size="xs"
            {...rest}
            value={selectValue}
            data={options}
            onChange={(value) => {
                if (value === null) return;

                const [unitOfTimeValue, modifier] = value.split('-');
                onChange({
                    unitOfTime: unitOfTimeValue as UnitOfTime,
                    completed: modifier === 'completed',
                    toDate: modifier === 'toDate',
                });
            }}
        />
    );
};

export default FilterUnitOfTimeAutoComplete;
