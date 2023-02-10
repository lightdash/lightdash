import { Menu, Spinner } from '@blueprintjs/core';
import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import { FilterableField, FilterableItem, getItemId } from '@lightdash/common';
import React, { FC, useCallback, useMemo, useState } from 'react';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../../hooks/useFieldValues';
import { Hightlighed } from '../../../../NavBar/GlobalSearch/globalSearch.styles';
import HighlightedText from '../../../HighlightedText';
import { useFiltersContext } from '../../FiltersProvider';
import {
    isMatch,
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

    const {
        isLoading,
        resultCounts,
        results: resultsSet,
    } = useFieldValues(search, initialData, projectUuid, field, true);

    const results = useMemo(() => [...resultsSet], [resultsSet]);

    const handleItemSelect = useCallback(
        (value: string) => {
            onChange(toggleValueFromArray(values, value));
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
            handleItemSelect(value);
        },
        [handleItemSelect, setSearch],
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
            itemsEqual={isMatch}
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
                filteredItems,
            }) => (
                <Menu role="listbox" ulRef={itemsParentRef} {...menuProps}>
                    {isLoading ? (
                        <MenuItem2
                            disabled
                            icon={<Spinner style={{ margin: 6 }} size={16} />}
                            text="Loading results..."
                        />
                    ) : filteredItems.length === MAX_AUTOCOMPLETE_RESULTS ? (
                        <MenuItem2
                            disabled
                            text={`Showing ${MAX_AUTOCOMPLETE_RESULTS} results`}
                        />
                    ) : filteredItems.length === 0 ? (
                        <MenuItem2 disabled text="No results found" />
                    ) : null}

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
