import { FilterableItem } from '@lightdash/common';
import {
    Group,
    Loader,
    ScrollArea,
    Select,
    SelectProps,
    Text,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import {
    FC,
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../hooks/useFieldValues';
import MantineIcon from '../../MantineIcon';
import { useFiltersContext } from '../FiltersProvider';

type Props = Omit<SelectProps, 'data' | 'onChange'> & {
    filterId: string;
    field: FilterableItem;
    value: string;
    suggestions: string[];
    tableCalculationField: boolean;
    onChange: (value: string) => void;
};

const FilterSingleStringAutoComplete: FC<Props> = ({
    filterId,
    value,
    field,
    suggestions: initialSuggestionData,
    disabled,
    onChange,
    placeholder,
    onDropdownOpen,
    onDropdownClose,
    tableCalculationField,
    ...rest
}) => {
    const { projectUuid, getAutocompleteFilterGroup } = useFiltersContext();
    if (!projectUuid) {
        throw new Error('projectUuid is required in FiltersProvider');
    }

    const [search, setSearch] = useState('');

    const initialized = useRef(false);

    // To update value when option changes from Multi-Select to Single-Select
    useEffect(() => {
        if (!initialized.current) {
            onChange(value);
            initialized.current = true;
        }
    }, [value, onChange]);

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
        (updatedValue: string) => {
            onChange(updatedValue);
        },
        [onChange],
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
                handleChange(search);
            }
        },
        [handleChange, search],
    );

    const data = useMemo(() => {
        const filteredResults = results.filter((val) => val);
        const validValue = value ? [value] : [];
        return uniq([...filteredResults, ...validValue]).map((val) => ({
            value: val,
            label: val,
        }));
    }, [results, value]);

    const searchedMaxResults = resultsSet.size >= MAX_AUTOCOMPLETE_RESULTS;

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
        <Select
            size="xs"
            w="100%"
            placeholder={value || disabled ? undefined : placeholder}
            disabled={disabled}
            creatable
            getCreateLabel={(query) => (
                <Group spacing="xxs">
                    <MantineIcon icon={IconPlus} color="blue" size="sm" />
                    <Text color="blue">Select "{query}"</Text>
                </Group>
            )}
            styles={{
                item: {
                    '&:last-child:not([value])': {
                        position: 'sticky',
                        bottom: 4,
                        boxShadow: '0 4px 0 0 white',
                    },
                    '&:last-child:not([value]):not(:hover)': {
                        background: 'white',
                    },
                },
            }}
            searchable
            searchValue={search}
            {...rest}
            onSearchChange={setSearch}
            limit={MAX_AUTOCOMPLETE_RESULTS}
            nothingFound={
                tableCalculationField
                    ? 'Please type to add the filter value'
                    : isLoading
                    ? 'Loading...'
                    : 'No results found'
            }
            rightSection={
                tableCalculationField ? null : isLoading ? (
                    <Loader size="xs" color="gray" />
                ) : null
            }
            dropdownComponent={DropdownComponentOverride}
            itemComponent={({ label, ...others }) =>
                others.disabled ? (
                    <Text color="dimmed" {...others}>
                        {label}
                    </Text>
                ) : (
                    <Text {...others}>{label}</Text>
                )
            }
            data={data}
            value={value}
            onDropdownOpen={onDropdownOpen}
            onDropdownClose={() => {
                onDropdownClose?.();
            }}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
        />
    );
};

export default FilterSingleStringAutoComplete;
