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

const UnitOfTimeOptions = (isTimestamp: boolean) => {
    const dateIndex = Object.keys(UnitOfTime).indexOf(UnitOfTime.days);

    // Filter unitTimes before Days if we are filtering Dates only
    const unitsOfTime = isTimestamp
        ? Object.values(UnitOfTime)
        : Object.values(UnitOfTime).slice(dateIndex);

    return unitsOfTime.reverse().reduce<UnitOfTimeOption[]>(
        (sum, unitOfTime) => [
            ...sum,
            {
                label: unitOfTime,
                unitOfTime,
                completed: false,
            },
            {
                label: `completed ${unitOfTime}`,
                unitOfTime,
                completed: true,
            },
        ],
        [],
    );
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
    completed: boolean;
    onChange: (value: UnitOfTimeOption) => void;
    onClosed?: () => void;
    popoverProps?: Popover2Props;
    disabled?: boolean;
};

const UnitOfTimeAutoComplete: FC<Props> = ({
    isTimestamp,
    unitOfTime,
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
            items={UnitOfTimeOptions(isTimestamp)}
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
                label: completed ? `completed ${unitOfTime}` : unitOfTime,
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
                text={completed ? `completed ${unitOfTime}` : unitOfTime}
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
