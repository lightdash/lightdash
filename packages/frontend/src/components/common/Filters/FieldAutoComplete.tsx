import { Icon } from '@blueprintjs/core';
import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { ItemRenderer, Suggest2 } from '@blueprintjs/select';
import {
    Field,
    FilterableField,
    getItemColor,
    getItemIcon,
    getItemId,
    getItemLabel,
    isDimension,
    isField,
    isMetric,
    TableCalculation,
} from '@lightdash/common';
import { FC } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { getItemIconName } from '../../Explorer/ExploreTree/TableTree/Tree/TreeSingleNode';

type Item = Field | TableCalculation | FilterableField;

const AutocompleteMaxHeight = createGlobalStyle`
  .autocomplete-max-height {
    max-height: 400px;
    overflow-y: auto;
  }
`;

// TODO: extract
const getFieldIcon = (field: Item) => {
    if (isField(field) && (isDimension(field) || isMetric(field))) {
        return getItemIconName(field.type);
    }
    return getItemIcon(field);
};

// TODO: extract
interface FieldItemProps {
    item: Item;
}

// TODO: extract
const BolderText = styled.span`
    font-weight: 600;
`;

export const FieldIcon: FC<FieldItemProps> = ({ item }) => {
    return <Icon icon={getFieldIcon(item)} color={getItemColor(item)} />;
};

export const FieldLabel: FC<FieldItemProps> = ({ item }) => {
    return (
        <span>
            {isField(item) ? `${item.tableLabel} ` : ''}
            <BolderText>
                {isField(item) ? item.label : item.displayName}
            </BolderText>
        </span>
    );
};

// TODO: extract
export const FieldItem: FC<FieldItemProps> = ({ item }) => (
    <div>
        <FieldIcon item={item} />
        <FieldLabel item={item} />
    </div>
);

// TODO: extract
export const renderItem: ItemRenderer<Item> = (
    item,
    { modifiers, handleClick, handleFocus },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem2
            key={getItemId(item)}
            roleStructure="listoption"
            shouldDismissPopover={false}
            active={modifiers.active}
            disabled={modifiers.disabled}
            icon={<FieldIcon item={item} />}
            text={<FieldLabel item={item} />}
            onClick={handleClick}
            onFocus={handleFocus}
        />
    );
};

type FieldAutoCompleteProps<T> = {
    id?: string;
    name?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    activeField?: T;
    placeholder?: string;
    fields: Array<T>;
    onChange: (value: T) => void;
    onClosed?: () => void;
    popoverProps?: Popover2Props;
};

const FieldAutoComplete = <T extends Item>({
    disabled,
    autoFocus,
    activeField,
    fields,
    id,
    name,
    onChange,
    onClosed,
    placeholder,
    popoverProps,
}: FieldAutoCompleteProps<T>) => (
    <>
        <AutocompleteMaxHeight />
        <Suggest2<T>
            fill
            className={disabled ? 'disabled-filter' : ''}
            disabled={disabled}
            inputProps={{
                id,
                name,
                autoFocus,
                placeholder: placeholder || 'Search field...',
                leftIcon: activeField && (
                    <Icon
                        icon={getFieldIcon(activeField)}
                        color={getItemColor(activeField)}
                    />
                ),
            }}
            items={fields}
            itemsEqual={(value, other) => {
                return getItemId(value) === getItemId(other);
            }}
            inputValueRenderer={(item: Item) => {
                if (!activeField) {
                    return '';
                }
                return getItemLabel(item);
            }}
            popoverProps={{
                minimal: true,
                onClosed,
                popoverClassName: 'autocomplete-max-height',
                captureDismiss: true,
                ...popoverProps,
            }}
            itemRenderer={renderItem}
            activeItem={activeField}
            selectedItem={activeField}
            noResults={<MenuItem2 disabled text="No results." />}
            onItemSelect={onChange}
            itemPredicate={(
                query: string,
                item: Item,
                index?: undefined | number,
                exactMatch?: undefined | false | true,
            ) => {
                const label = getItemLabel(item);
                if (exactMatch) {
                    return query.toLowerCase() === label.toLowerCase();
                }
                return label.toLowerCase().includes(query.toLowerCase());
            }}
        />
    </>
);

export default FieldAutoComplete;
