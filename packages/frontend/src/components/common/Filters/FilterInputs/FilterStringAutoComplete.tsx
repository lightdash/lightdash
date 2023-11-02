import { FilterableItem } from '@lightdash/common';
import {
    Highlight,
    Loader,
    MultiSelect,
    MultiSelectProps,
    Text,
} from '@mantine/core';
import uniq from 'lodash-es/uniq';
import { FC, ReactNode, useCallback, useMemo, useState } from 'react';

import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../hooks/useFieldValues';
import { useFiltersContext } from '../FiltersProvider';

type Props = Pick<
    MultiSelectProps,
    'disabled' | 'placeholder' | 'withinPortal'
> & {
    filterId: string;
    field: FilterableItem;
    values: string[];
    suggestions: string[];
    onChange: (values: string[]) => void;
};

const FilterStringAutoComplete: FC<Props> = ({
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

    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, [setSearch]);

    const handleChange = useCallback(
        (updatedValues: string[]) => {
            onChange(uniq(updatedValues));
        },
        [onChange],
    );

    const handleAdd = useCallback(
        (newValue: string) => {
            handleChange([...values, newValue]);
            return newValue;
        },
        [handleChange, values],
    );

    const handleAddMultiple = useCallback(
        (newValues: string[]) => {
            handleChange([...values, ...newValues]);
            return newValues;
        },
        [handleChange, values],
    );

    const handlePaste = useCallback(
        (event: React.ClipboardEvent<HTMLInputElement>) => {
            const clipboardData = event.clipboardData.getData('Text');
            const clipboardDataArray = clipboardData
                .split(/\,|\n/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

            handleAddMultiple(clipboardDataArray);
            handleResetSearch();
        },
        [handleAddMultiple, handleResetSearch],
    );

    const data = useMemo(() => {
        // Mantine does not show value tag if value is not found in data
        // so we need to add it manually here
        // also we are merging status indicator as a first item
        return uniq([...results, ...values]).map((value) => ({
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
            onPaste={handlePaste}
            nothingFound={isLoading ? 'Loading...' : 'No results found'}
            rightSection={isLoading ? <Loader size="xs" color="gray" /> : null}
            dropdownComponent={({
                children,
                ...others
            }: {
                children: ReactNode;
            }) => (
                <div {...others}>
                    {results.length === MAX_AUTOCOMPLETE_RESULTS ? (
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
            onDropdownClose={handleResetSearch}
            onChange={handleChange}
            onCreate={handleAdd}
        />
    );
};

export default FilterStringAutoComplete;
