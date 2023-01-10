import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { Suggest2 } from '@blueprintjs/select';
import {
    Field,
    getItemId,
    getItemLabel,
    TableCalculation,
} from '@lightdash/common';
import { useMemo } from 'react';
import { createGlobalStyle } from 'styled-components';
import FieldIcon from './FieldIcon';
import renderFilterItem from './renderFilterItem';

const AutocompleteMaxHeight = createGlobalStyle`
  .autocomplete-max-height {
    max-height: 400px;
    overflow-y: auto;
  }
`;

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

const FieldAutoComplete = <T extends Field | TableCalculation>({
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
}: FieldAutoCompleteProps<T>) => {
    const sortedFields = useMemo(() => {
        return fields.sort((a, b) =>
            getItemLabel(a).localeCompare(getItemLabel(b)),
        );
    }, [fields]);

    return (
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
                    leftIcon: activeField && <FieldIcon item={activeField} />,
                }}
                items={sortedFields}
                itemsEqual={(value, other) => {
                    return getItemId(value) === getItemId(other);
                }}
                inputValueRenderer={(item) => {
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
                itemRenderer={renderFilterItem}
                activeItem={activeField}
                selectedItem={activeField}
                noResults={<MenuItem2 disabled text="No results." />}
                onItemSelect={onChange}
                itemPredicate={(query, item, _index, exactMatch) => {
                    const label = getItemLabel(item);
                    if (exactMatch) {
                        return query.toLowerCase() === label.toLowerCase();
                    }
                    return label.toLowerCase().includes(query.toLowerCase());
                }}
            />
        </>
    );
};

export default FieldAutoComplete;
