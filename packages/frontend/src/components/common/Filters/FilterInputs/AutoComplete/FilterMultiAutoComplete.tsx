import { FilterableItem } from '@lightdash/common';
import {
    Highlight,
    Loader,
    MultiSelect,
    MultiSelectProps,
    Text,
} from '@mantine/core';
import { FC, ReactNode, useCallback, useMemo, useState } from 'react';

import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../../hooks/useFieldValues';
import { useFiltersContext } from '../../FiltersProvider';
import { mergeUniqueValues } from './autoCompleteUtils';

type Props = Pick<MultiSelectProps, 'disabled' | 'placeholder'> & {
    filterId: string;
    field: FilterableItem;
    values: string[];
    suggestions: string[];
    onChange: (values: string[]) => void;
};

const FilterMultiAutoComplete: FC<Props> = ({
    filterId,
    values,
    field,
    suggestions: initialSuggestionData,
    disabled,
    onChange,
    placeholder,
}) => {
    const { projectUuid, getAutocompleteFilterGroup } = useFiltersContext();
    if (!projectUuid) {
        throw new Error('projectUuid is required in FiltersProvider');
    }

    const [search, setSearch] = useState('');

    const autocompleteFilterGroup = useMemo(
        () => getAutocompleteFilterGroup(filterId, field),
        [field, filterId, getAutocompleteFilterGroup],
    );

    const { isLoading, results: resultsSet } = useFieldValues(
        search,
        initialSuggestionData,
        projectUuid,
        field,
        autocompleteFilterGroup,
        true,
        { refetchOnMount: 'always' },
    );

    const results = useMemo(() => [...resultsSet], [resultsSet]);

    const handleChange = useCallback(
        (value: string[]) => {
            onChange(value);
        },
        [onChange],
    );

    const handleAdd = useCallback(
        (value: string) => {
            onChange([...values, value]);
            return value;
        },
        [onChange, values],
    );

    const handleOnClose = useCallback(() => {
        setSearch('');
    }, [setSearch]);

    const data = useMemo(() => {
        // Mantine does not show value tag if value is not found in data
        // so we need to add it manually here
        // also we are merging status indicator as a first item
        return mergeUniqueValues(results, values).map((value) => ({
            value,
            label: value,
        }));
    }, [results, values]);

    return (
        <MultiSelect
            size="xs"
            w="100%"
            placeholder={
                values.length > 0 || disabled ? undefined : placeholder
            }
            disabled={disabled}
            creatable
            getCreateLabel={(query) => `+ Add "${query}"`}
            selectOnBlur
            disableSelectedItemFiltering
            searchable
            clearSearchOnChange
            searchValue={search}
            onSearchChange={setSearch}
            limit={MAX_AUTOCOMPLETE_RESULTS}
            nothingFound={isLoading ? 'Loading...' : 'No results found'}
            rightSection={isLoading ? <Loader size="xs" color="gray" /> : null}
            dropdownComponent={({
                children,
                ...others
            }: {
                children: ReactNode;
            }) => (
                <div {...others}>
                    {data.length > MAX_AUTOCOMPLETE_RESULTS ||
                    results.length === MAX_AUTOCOMPLETE_RESULTS ? (
                        <Text
                            color="dimmed"
                            size="xs"
                            px="sm"
                            pt="xs"
                            pb="xxs"
                            bg="white"
                        >
                            Showing first {MAX_AUTOCOMPLETE_RESULTS} results.{' '}
                            {search ? 'Continue' : 'Start'} typing...
                        </Text>
                    ) : null}

                    <div>{children}</div>
                </div>
            )}
            itemComponent={({ label, ...others }) =>
                others.disabled ? (
                    <Text color="dimmed" {...others}>
                        {label}
                    </Text>
                ) : (
                    <Highlight highlight={search} {...others}>
                        {label}
                    </Highlight>
                )
            }
            data={data}
            value={values}
            onDropdownClose={handleOnClose}
            onChange={handleChange}
            onCreate={handleAdd}
        />
    );
};

export default FilterMultiAutoComplete;
