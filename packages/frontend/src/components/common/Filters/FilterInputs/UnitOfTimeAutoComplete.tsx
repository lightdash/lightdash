import { Button } from '@blueprintjs/core';
import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { ItemRenderer, Select2 } from '@blueprintjs/select';
import { UnitOfTime } from '@lightdash/common';
import { FC } from 'react';
import { createGlobalStyle } from 'styled-components';

type UnitOfTimeOption = {
    label: string;
    unitOfTime: UnitOfTime;
    completed: boolean;
};

type UnitOfTimeAutoCompleteProps = {
    isTimestamp: boolean;
    showCompletedOptions: boolean;
    showOptionsInPlural: boolean;
};

const getUnitOfTimeLabel = (
    unitOfTime: UnitOfTime,
    isPlural: boolean,
    isCompleted: boolean,
) =>
    `${isCompleted ? 'completed ' : ''}${
        isPlural ? unitOfTime : unitOfTime.substring(0, unitOfTime.length - 1)
    }`;
const UnitOfTimeOptions = ({
    isTimestamp,
    showCompletedOptions,
    showOptionsInPlural,
}: UnitOfTimeAutoCompleteProps) => {
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
};

const FieldSuggest = Select2.ofType<UnitOfTimeOption>();

const AutocompleteMaxHeight = createGlobalStyle`
  .autocomplete-max-height {
    max-height: 400px;
    overflow-y: auto;
  }
`;

const renderItem: ItemRenderer<UnitOfTimeOption> = (
    field,
    { modifiers, handleClick },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem2
            active={modifiers.active}
            key={`${field.completed}_${field.unitOfTime}`}
            text={field.label}
            onClick={handleClick}
            shouldDismissPopover={false}
        />
    );
};

type Props = {
    isTimestamp: boolean;
    unitOfTime: UnitOfTime;
    showOptionsInPlural?: boolean;
    showCompletedOptions?: boolean;
    completed: boolean;
    onChange: (value: UnitOfTimeOption) => void;
    onClosed?: () => void;
    popoverProps?: Popover2Props;
    disabled?: boolean;
};

const UnitOfTimeAutoComplete: FC<Props> = ({
    isTimestamp,
    unitOfTime,
    showOptionsInPlural = true,
    showCompletedOptions = true,
    completed,
    onChange,
    onClosed,
    popoverProps,
    disabled,
}) => (
    <>
        <AutocompleteMaxHeight />
        <FieldSuggest
            className={disabled ? 'disabled-filter' : ''}
            disabled={disabled}
            items={UnitOfTimeOptions({
                isTimestamp,
                showCompletedOptions,
                showOptionsInPlural,
            })}
            itemsEqual={(value, other) =>
                value.unitOfTime === other.unitOfTime &&
                value.completed === other.completed
            }
            popoverProps={{
                fill: true,
                minimal: true,
                onClosed,
                popoverClassName: 'autocomplete-max-height',
                ...popoverProps,
            }}
            itemRenderer={renderItem}
            activeItem={{
                label: getUnitOfTimeLabel(
                    unitOfTime,
                    showOptionsInPlural,
                    completed,
                ),
                unitOfTime,
                completed,
            }}
            noResults={<MenuItem2 disabled text="No results." />}
            onItemSelect={onChange}
            itemPredicate={(
                query: string,
                field: UnitOfTimeOption,
                index?: undefined | number,
                exactMatch?: undefined | false | true,
            ) => {
                if (exactMatch) {
                    return query.toLowerCase() === field.label.toLowerCase();
                }
                return field.label.toLowerCase().includes(query.toLowerCase());
            }}
        >
            <Button
                className={disabled ? 'disabled-filter' : ''}
                disabled={disabled}
                rightIcon="caret-down"
                text={getUnitOfTimeLabel(
                    unitOfTime,
                    showOptionsInPlural,
                    completed,
                )}
                fill
                style={{
                    display: 'inline-flex',
                    justifyContent: 'space-between',
                    whiteSpace: 'nowrap',
                }}
            />
        </FieldSuggest>
    </>
);

export default UnitOfTimeAutoComplete;
