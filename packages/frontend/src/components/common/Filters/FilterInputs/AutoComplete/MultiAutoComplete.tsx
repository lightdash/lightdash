import { Menu, Spinner } from '@blueprintjs/core';
import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import { FilterableField, FilterableItem, getItemId } from '@lightdash/common';
import React, { FC, useCallback, useState } from 'react';
import { useFieldValues } from '../../../../../hooks/useFieldValues';
import { Hightlighed } from '../../../../NavBar/GlobalSearch/globalSearch.styles';
import HighlightedText from '../../../HighlightedText';
import { useFiltersContext } from '../../FiltersProvider';
import {
    comparator,
    itemPredicate,
    toggleValueFromArray,
} from './autoCompleteUtils';

type Props = {
    field: FilterableItem;
    values: string[];
    suggestions: string[];
    popoverProps?: Popover2Props;
    disabled?: boolean;
    onChange: (values: string[]) => void;
};

const normalize = (item: string) => item.toLowerCase();
const itemComparator = comparator(normalize);

const MultiAutoComplete: FC<Props> = ({
    values,
    field,
    suggestions: initialData,
    popoverProps,
    disabled,
    onChange,
}) => {
    const { projectUuid } = useFiltersContext();
    if (!projectUuid) {
        throw new Error('projectUuid is required in FiltersProvider');
    }

    const [search, setSearch] = useState('');

    const { isLoading, results } = useFieldValues(
        search,
        initialData,
        projectUuid,
        field,
        true,
    );

    const handleItemSelect = useCallback(
        (value: string) => {
            onChange(toggleValueFromArray(values, value, normalize));
        },
        [onChange, values],
    );

    const handleRemove = useCallback(
        (selectedValue: React.ReactNode) => {
            onChange(values.filter((v: string) => v !== selectedValue));
        },
        [onChange, values],
    );

    const handleOnClose = useCallback(
        (value?: string) => {
            if (!value || value === '') return;

            setSearch('');
            if (!values.map(normalize).includes(normalize(value))) {
                const existingOptionMatch = results.find((item) =>
                    itemComparator(item, value),
                );
                handleItemSelect(existingOptionMatch || value);
            }
        },
        [results, values, handleItemSelect, setSearch],
    );

    return (
        <MultiSelect2
            className={disabled ? 'disabled-filter' : ''}
            disabled={disabled}
            fill
            query={search}
            items={results || []}
            selectedItems={values}
            tagInputProps={{
                placeholder: undefined,
                addOnBlur: false,
                rightElement: isLoading ? (
                    <Spinner style={{ margin: 6 }} size={16} />
                ) : undefined,
                tagProps: {
                    minimal: true,
                },
                inputProps: {
                    placeholder: 'Start typing to search',
                },
                onRemove: handleRemove,
            }}
            popoverProps={{
                minimal: true,
                onClosing: () => handleOnClose(search),
                ...popoverProps,
            }}
            resetOnSelect
            tagRenderer={(name) => name}
            itemsEqual={itemComparator}
            itemPredicate={itemPredicate}
            itemRenderer={(name, { modifiers, handleClick, query }) => {
                if (!modifiers.matchesPredicate) return null;

                return (
                    <MenuItem2
                        active={modifiers.active}
                        icon={values.includes(name) ? 'tick' : 'blank'}
                        key={name}
                        text={
                            <HighlightedText
                                text={name}
                                query={query}
                                highlightElement={Hightlighed}
                            />
                        }
                        onClick={handleClick}
                        shouldDismissPopover={false}
                    />
                );
            }}
            itemListRenderer={({
                items,
                itemsParentRef,
                menuProps,
                renderCreateItem,
                renderItem,
            }) => (
                <Menu role="listbox" ulRef={itemsParentRef} {...menuProps}>
                    {items.map(renderItem)}
                    {renderCreateItem()}
                </Menu>
            )}
            createNewItemFromQuery={(name: string) => name}
            createNewItemRenderer={(query, active, handleClick) => (
                <MenuItem2
                    icon="add"
                    text={`Add "${query}"`}
                    active={active}
                    onClick={handleClick}
                    shouldDismissPopover={false}
                />
            )}
            onQueryChange={setSearch}
            onItemSelect={handleItemSelect}
        />
    );
};

export default MultiAutoComplete;
