import { type FilterableItem } from '@lightdash/common';
import {
    Group,
    Highlight,
    Loader,
    MultiSelect,
    ScrollArea,
    Text,
    type MultiSelectProps,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../hooks/useFieldValues';
import MantineIcon from '../../MantineIcon';
import { useFiltersContext } from '../FiltersProvider';

type Props = Omit<MultiSelectProps, 'data' | 'onChange'> & {
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
    onDropdownOpen,
    onDropdownClose,
    ...rest
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

    const { isInitialLoading, results: resultsSet } = useFieldValues(
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

            // if clipboard data is comma separated or new line separated and has more than 1 value
            // we add all of them to the values list and reset search
            // when there's only 1 value in the clipboard, we let the default behavior of the input handle it
            if (clipboardDataArray.length > 1) {
                handleAddMultiple(clipboardDataArray);
                handleResetSearch();
            }
        },
        [handleAddMultiple, handleResetSearch],
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter' && search !== '') {
                handleAdd(search);
                handleResetSearch();
            }
        },
        [handleAdd, handleResetSearch, search],
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

    const searchedMaxResults = resultsSet.size >= MAX_AUTOCOMPLETE_RESULTS;
    // memo override component so list doesn't scroll to the top on each click
    const DropdownComponentOverride = useCallback(
        ({ children, ...props }: { children: ReactNode }) => (
            <ScrollArea {...props}>
                {searchedMaxResults ? (
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

                {children}
            </ScrollArea>
        ),
        [searchedMaxResults, search],
    );

    return (
        <MultiSelect
            size="xs"
            w="100%"
            placeholder={
                values.length > 0 || disabled ? undefined : placeholder
            }
            disabled={disabled}
            creatable
            /**
             * Opts out of Mantine's default condition and always allows adding, as long as not
             * an empty query.
             */
            shouldCreate={(query) =>
                query.trim().length > 0 && !values.includes(query)
            }
            getCreateLabel={(query) => (
                <Group spacing="xxs">
                    <MantineIcon icon={IconPlus} color="blue" size="sm" />
                    <Text color="blue">Add "{query}"</Text>
                </Group>
            )}
            styles={{
                item: {
                    // makes add new item button sticky to bottom
                    '&:last-child:not([value])': {
                        position: 'sticky',
                        bottom: 4,
                        // casts shadow on the bottom of the list to avoid transparency
                        boxShadow: '0 4px 0 0 white',
                    },
                    '&:last-child:not([value]):not(:hover)': {
                        background: 'white',
                    },
                },
            }}
            disableSelectedItemFiltering
            searchable
            clearSearchOnChange
            {...rest}
            searchValue={search}
            onSearchChange={setSearch}
            limit={MAX_AUTOCOMPLETE_RESULTS}
            onPaste={handlePaste}
            nothingFound={isInitialLoading ? 'Loading...' : 'No results found'}
            rightSection={
                isInitialLoading ? <Loader size="xs" color="gray" /> : null
            }
            dropdownComponent={DropdownComponentOverride}
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
            onDropdownOpen={onDropdownOpen}
            onDropdownClose={() => {
                handleResetSearch();
                onDropdownClose?.();
            }}
            onChange={handleChange}
            onCreate={handleAdd}
            onKeyDown={handleKeyDown}
        />
    );
};

export default FilterStringAutoComplete;
