import { type FilterableItem } from '@lightdash/common';
import {
    Group,
    Highlight,
    Loader,
    MultiSelect,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    type MultiSelectProps,
    type MultiSelectValueProps,
} from '@mantine/core';
import { IconAlertCircle, IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import useHealth from '../../../../hooks/health/useHealth';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../hooks/useFieldValues';
import MantineIcon from '../../MantineIcon';
import useFiltersContext from '../useFiltersContext';
import MultiValuePastePopover from './MultiValuePastePopover';
import { formatDisplayValue } from './utils';

type Props = Omit<MultiSelectProps, 'data' | 'onChange'> & {
    filterId: string;
    field: FilterableItem;
    values: string[];
    suggestions: string[];
    onChange: (values: string[]) => void;
    singleValue?: boolean;
};

// Single value component that mimics a single select behavior - maxSelectedValues={1} behaves weirdly so we don't use it.
const SingleValueComponent = ({
    value,
    label,
    onRemove,
    ...others
}: MultiSelectValueProps & { value: string }) => {
    return (
        <div {...others}>
            <Text size="xs" lineClamp={1}>
                {label}
            </Text>
        </div>
    );
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
    singleValue,
    ...rest
}) => {
    const multiSelectRef = useRef<HTMLInputElement>(null);
    const { projectUuid, getAutocompleteFilterGroup } = useFiltersContext();
    if (!projectUuid) {
        throw new Error('projectUuid is required in FiltersProvider');
    }

    const { data: healthData } = useHealth();

    const [search, setSearch] = useState('');
    const [pastePopUpOpened, setPastePopUpOpened] = useState(false);
    const [tempPasteValues, setTempPasteValues] = useState<
        string | undefined
    >();

    const [forceRefresh, setForceRefresh] = useState<boolean>(false);

    const autocompleteFilterGroup = useMemo(
        () => getAutocompleteFilterGroup(filterId, field),
        [field, filterId, getAutocompleteFilterGroup],
    );

    const {
        isInitialLoading,
        results: resultsSet,
        refreshedAt,
        refetch,
        error,
        isError,
    } = useFieldValues(
        search,
        initialSuggestionData,
        projectUuid,
        field,
        filterId,
        autocompleteFilterGroup,
        true,
        forceRefresh,
        {
            refetchOnMount: 'always',
        },
    );

    useEffect(() => {
        if (forceRefresh) {
            refetch().then().catch(console.error); // This will skip queryKey cache from react query and refetch from backend
            setForceRefresh(false);
        }
    }, [forceRefresh, refetch]);
    const results = useMemo(() => [...resultsSet], [resultsSet]);

    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, [setSearch]);

    const handleChange = useCallback(
        (updatedValues: string[]) => {
            if (singleValue && updatedValues.length > 1) {
                onChange([updatedValues[updatedValues.length - 1]]);
            } else {
                onChange(uniq(updatedValues));
            }
            if (singleValue) {
                multiSelectRef.current?.blur();
            }
        },
        [onChange, singleValue],
    );

    const handleAdd = useCallback(
        (newValue: string) => {
            if (singleValue) {
                handleChange([newValue]);
            } else {
                handleChange([...values, newValue]);
            }
            return newValue;
        },
        [handleChange, values, singleValue],
    );

    const handleAddMultiple = useCallback(
        (newValues: string[]) => {
            if (singleValue && newValues.length > 0) {
                handleChange([newValues[newValues.length - 1]]);
            } else {
                handleChange([...values, ...newValues]);
            }
            return newValues;
        },
        [handleChange, values, singleValue],
    );

    const handlePaste = useCallback(
        (event: React.ClipboardEvent<HTMLInputElement>) => {
            const clipboardData = event.clipboardData.getData('Text');
            if (clipboardData.includes(',') || clipboardData.includes('\n')) {
                setTempPasteValues(clipboardData);
                setPastePopUpOpened(true);
            }
        },
        [],
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

    useEffect(() => {
        if (singleValue && values.length > 1) {
            handleChange([values[values.length - 1]]);
        }
    }, [values, singleValue, handleChange]);

    const data = useMemo(() => {
        // Mantine does not show value tag if value is not found in data
        // so we need to add it manually here
        // also we are merging status indicator as a first item
        return uniq([...results, ...values]).map((value) => ({
            value,
            label: formatDisplayValue(value),
        }));
    }, [results, values]);

    const searchedMaxResults = resultsSet.size >= MAX_AUTOCOMPLETE_RESULTS;
    // memo override component so list doesn't scroll to the top on each click
    const DropdownComponentOverride = useCallback(
        ({ children, ...props }: { children: ReactNode }) => (
            <Stack w="100%" spacing={0}>
                <ScrollArea {...props}>
                    {searchedMaxResults ? (
                        <Text color="dimmed" size="xs" px="sm" pt="xs" pb="xxs">
                            Showing first {MAX_AUTOCOMPLETE_RESULTS} results.{' '}
                            {search ? 'Continue' : 'Start'} typing...
                        </Text>
                    ) : null}

                    {children}
                </ScrollArea>
                {healthData?.hasCacheAutocompleResults ? (
                    <>
                        <Tooltip
                            withinPortal
                            position="left"
                            label={`Click here to refresh cache filter values`}
                        >
                            <Text
                                color="dimmed"
                                size="xs"
                                px="sm"
                                p="xxs"
                                sx={(theme) => ({
                                    cursor: 'pointer',
                                    borderTop: `1px solid ${theme.colors.ldGray[2]}`,
                                    '&:hover': {
                                        backgroundColor: theme.colors.ldGray[1],
                                    },
                                })}
                                onClick={() => setForceRefresh(true)}
                            >
                                Results loaded at {refreshedAt.toLocaleString()}
                            </Text>
                        </Tooltip>
                    </>
                ) : null}
            </Stack>
        ),
        [
            searchedMaxResults,
            search,
            refreshedAt,
            healthData?.hasCacheAutocompleResults,
        ],
    );

    return (
        <MultiValuePastePopover
            opened={pastePopUpOpened}
            onClose={() => {
                setPastePopUpOpened(false);
                setTempPasteValues(undefined);
                handleResetSearch();
            }}
            onMultiValue={() => {
                if (!tempPasteValues) {
                    setPastePopUpOpened(false);
                    return;
                }
                const clipboardDataArray = tempPasteValues
                    .split(/\,|\n/)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                handleAddMultiple(clipboardDataArray);
            }}
            onSingleValue={() => {
                if (!tempPasteValues) {
                    setPastePopUpOpened(false);
                    return;
                }
                handleAdd(tempPasteValues);
            }}
        >
            <MultiSelect
                ref={multiSelectRef}
                size="xs"
                w="100%"
                placeholder={
                    values.length > 0 || disabled ? undefined : placeholder
                }
                disabled={disabled}
                creatable
                valueComponent={singleValue ? SingleValueComponent : undefined}
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
                clearable={singleValue}
                clearSearchOnChange
                {...rest}
                searchValue={search}
                onSearchChange={setSearch}
                limit={MAX_AUTOCOMPLETE_RESULTS}
                onPaste={handlePaste}
                nothingFound={
                    isInitialLoading ? 'Loading...' : 'No results found'
                }
                rightSection={
                    isInitialLoading ? (
                        <Loader size="xs" color="gray" />
                    ) : isError ? (
                        <Tooltip
                            label={
                                error?.error?.message || 'Filter not available'
                            }
                            withinPortal
                        >
                            <MantineIcon icon={IconAlertCircle} color="red" />
                        </Tooltip>
                    ) : null
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
        </MultiValuePastePopover>
    );
};

export default FilterStringAutoComplete;
