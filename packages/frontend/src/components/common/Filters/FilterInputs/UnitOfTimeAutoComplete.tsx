import { Button, MenuItem } from '@blueprintjs/core';
import { ItemRenderer, Select } from '@blueprintjs/select';
import { UnitOfTime } from '@lightdash/common';
import { FC } from 'react';
import { createGlobalStyle } from 'styled-components';

type UnitOfTimeOption = {
    label: string;
    unitOfTime: UnitOfTime;
    completed: boolean;
};

const UnitOfTimeOptions = Object.values(UnitOfTime)
    .reverse()
    .reduce<UnitOfTimeOption[]>(
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

const FieldSuggest = Select.ofType<UnitOfTimeOption>();

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
        <MenuItem
            active={modifiers.active}
            key={`${field.completed}_${field.unitOfTime}`}
            text={field.label}
            onClick={handleClick}
            shouldDismissPopover={false}
        />
    );
};

type Props = {
    unitOfTime: UnitOfTime;
    completed: boolean;
    onChange: (value: UnitOfTimeOption) => void;
    onClosed?: () => void;
};

const UnitOfTimeAutoComplete: FC<Props> = ({
    unitOfTime,
    completed,
    onChange,
    onClosed,
}) => (
    <>
        <AutocompleteMaxHeight />
        <FieldSuggest
            items={UnitOfTimeOptions}
            itemsEqual={(value, other) =>
                value.unitOfTime === other.unitOfTime &&
                value.completed === other.completed
            }
            popoverProps={{
                fill: true,
                minimal: true,
                onClosed,
                popoverClassName: 'autocomplete-max-height',
            }}
            itemRenderer={renderItem}
            activeItem={{
                label: completed ? `completed ${unitOfTime}` : unitOfTime,
                unitOfTime,
                completed,
            }}
            noResults={<MenuItem disabled text="No results." />}
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
