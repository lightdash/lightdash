import { Spinner } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import { FilterableField, getItemId } from '@lightdash/common';
import React, { FC, useCallback, useEffect, useState } from 'react';
import { useDebounce } from 'react-use';
import { useFieldValues } from '../../../../hooks/useFieldValues';
import { Hightlighed } from '../../../NavBar/GlobalSearch/globalSearch.styles';
import HighlightedText from '../../HighlightedText';
import { useFiltersContext } from '../FiltersProvider';

function toggleValueFromArray<T>(array: T[], value: T) {
    const copy = [...array];
    const index = copy.indexOf(value);

    if (index === -1) {
        copy.push(value);
    } else {
        copy.splice(index, 1);
    }
    return copy;
}

function itemPredicate(
    query: string,
    item: string,
    index?: undefined | number,
    exactMatch?: undefined | false | true,
) {
    if (exactMatch) {
        return query === item;
    }
    return item.toLowerCase().includes(query.toLowerCase());
}

type Props = {
    field: FilterableField;
    values: string[];
    suggestions: string[];
    onChange: (values: string[]) => void;
};

export const useDebouncedSearch = (
    projectUuid: string,
    fieldId: string,
    query: string | undefined,
    enabled: boolean,
) => {
    const [debouncedQuery, setDebouncedQuery] = useState<string>();
    useDebounce(
        () => {
            setDebouncedQuery(query);
        },
        500,
        [query],
    );
    const { data, isLoading } = useFieldValues(
        projectUuid,
        fieldId,
        debouncedQuery || '',
        10,
        enabled,
    );

    const isSearching = (query && query !== debouncedQuery) || isLoading;

    return {
        isSearching,
        items: data,
    };
};

const StringMultiSelect: FC<Props> = ({
    values,
    field,
    suggestions,
    onChange,
}) => {
    const [options, setOptions] = useState(
        new Set([...suggestions, ...values]),
    );
    const { projectUuid } = useFiltersContext();
    const [search, setSearch] = useState<string>();
    const { items, isSearching } = useDebouncedSearch(
        projectUuid,
        getItemId(field),
        search,
        suggestions.length <= 0 || !!search,
    );

    useEffect(() => {
        setOptions((prev) => {
            return new Set([...prev, ...values, ...(items || [])]);
        });
    }, [suggestions, values, items]);

    const renderItem: ItemRenderer<string> = useCallback(
        (name, { modifiers, handleClick, query }) => {
            if (!modifiers.matchesPredicate) {
                return null;
            }
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
        },
        [values],
    );
    const renderCreateOption = useCallback(
        (
            q: string,
            active: boolean,
            handleClick: React.MouseEventHandler<HTMLElement>,
        ) =>
            !isSearching ? (
                <MenuItem2
                    icon="add"
                    text={`Add "${q}"`}
                    active={active}
                    onClick={handleClick}
                    shouldDismissPopover={false}
                />
            ) : (
                <Spinner size={16} style={{ margin: 12 }} />
            ),
        [isSearching],
    );
    const onItemSelect = useCallback(
        (value: string) => {
            onChange(toggleValueFromArray(values, value));
        },
        [onChange, values],
    );
    const onRemove = useCallback(
        (selectedValue: React.ReactNode) => {
            onChange(values.filter((v: string) => v !== selectedValue));
        },
        [onChange, values],
    );
    return (
        <MultiSelect2
            fill
            items={Array.from(options).sort()}
            noResults={<MenuItem2 disabled text="No suggestions." />}
            itemsEqual={(value, other) =>
                value.toLowerCase() === other.toLowerCase()
            }
            selectedItems={values}
            itemRenderer={renderItem}
            tagRenderer={(name) => name}
            onItemSelect={onItemSelect}
            tagInputProps={{
                placeholder: undefined,
                tagProps: {
                    minimal: true,
                },
                onRemove,
            }}
            popoverProps={{ minimal: true, matchTargetWidth: true }}
            resetOnSelect
            itemPredicate={itemPredicate}
            createNewItemRenderer={renderCreateOption}
            createNewItemFromQuery={(name: string) => name}
            onQueryChange={setSearch}
        />
    );
};

export default StringMultiSelect;
