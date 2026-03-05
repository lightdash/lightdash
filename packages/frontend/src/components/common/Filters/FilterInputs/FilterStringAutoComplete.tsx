import { type FilterableItem } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Highlight,
    Loader,
    MultiSelect,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type MultiSelectProps,
    type MultiSelectValueProps,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconListDetails,
    IconPlus,
} from '@tabler/icons-react';
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
import { DefaultValue } from '../../TagInput/DefaultValue/DefaultValue';
import useFiltersContext from '../useFiltersContext';
import classes from './FilterStringAutoComplete.module.css';
import {
    computeDisplayValues,
    computeHiddenCount,
    isValueSelected,
    mergeWithHiddenValues,
    MORE_VALUES_TOKEN,
    SUMMARY_MODE_THRESHOLD,
    wasTokenRemoved,
} from './FilterStringAutoComplete.utils';
import { ManageFilterValuesModal } from './ManageFilterValuesModal';
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
    onFocus: onInputFocus,
    onBlur: onInputBlur,
    singleValue,
    ...rest
}) => {
    const multiSelectRef = useRef<HTMLInputElement>(null);
    const { projectUuid, getAutocompleteFilterGroup, parameterValues } =
        useFiltersContext();
    if (!projectUuid) {
        throw new Error('projectUuid is required in FiltersProvider');
    }

    const { data: healthData } = useHealth();

    const [search, setSearch] = useState('');
    const [pastePopUpOpened, setPastePopUpOpened] = useState(false);
    const [tempPasteValues, setTempPasteValues] = useState<
        string | undefined
    >();
    const { ref: wrapperRef, hovered: isWrapperHovered } = useHover();

    const [
        manageValuesOpened,
        { open: openManageValuesInternal, close: closeManageValuesInternal },
    ] = useDisclosure(false);

    // Wrapper functions that also notify parent popover to prevent closing
    const openManageValues = useCallback(() => {
        openManageValuesInternal();
        onDropdownOpen?.();
    }, [openManageValuesInternal, onDropdownOpen]);

    const closeManageValues = useCallback(() => {
        closeManageValuesInternal();
        onDropdownClose?.();
    }, [closeManageValuesInternal, onDropdownClose]);

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
        parameterValues,
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

    // CSV import lives inside the Manage Values modal.

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

    const isSummaryMode =
        !singleValue && values.length > SUMMARY_MODE_THRESHOLD;
    const hiddenCount = computeHiddenCount(values);

    const displayValues = useMemo(
        () => computeDisplayValues(values, singleValue),
        [singleValue, values],
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

    const ValueComponent = useCallback(
        (props: MultiSelectValueProps & { value: string }) => {
            if (props.value === MORE_VALUES_TOKEN) {
                return (
                    <DefaultValue
                        {...props}
                        label={`+${hiddenCount.toLocaleString()} more`}
                        // Don't show the remove button on the "more" pill
                        readOnly={true}
                        // Clicking it should open Manage Values
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!disabled) openManageValues();
                        }}
                        className={classes.moreValuesPill}
                    />
                );
            }

            return <DefaultValue {...props} />;
        },
        [disabled, hiddenCount, openManageValues],
    );

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
                                className={classes.dropdownRefresh}
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
        <>
            <ManageFilterValuesModal
                opened={manageValuesOpened}
                onClose={closeManageValues}
                values={values}
                onChange={handleChange}
                title="Manage filter values"
            />

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
                {isSummaryMode ? (
                    <TextInput
                        size="xs"
                        w="100%"
                        readOnly
                        value={`${values.length.toLocaleString()} values selected`}
                        disabled={disabled}
                        rightSection={
                            disabled ? null : (
                                <Tooltip
                                    withinPortal
                                    label="Edit filter values"
                                >
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        size="sm"
                                        onClick={() => openManageValues()}
                                    >
                                        <MantineIcon icon={IconListDetails} />
                                    </ActionIcon>
                                </Tooltip>
                            )
                        }
                        onClick={() => {
                            if (!disabled) openManageValues();
                        }}
                    />
                ) : (
                    <MultiSelect
                        ref={multiSelectRef}
                        size="xs"
                        w="100%"
                        placeholder={
                            values.length > 0 || disabled
                                ? undefined
                                : placeholder
                        }
                        wrapperProps={{ ref: wrapperRef }}
                        disabled={disabled}
                        creatable
                        valueComponent={
                            singleValue ? SingleValueComponent : ValueComponent
                        }
                        /**
                         * Opts out of Mantine's default condition and always allows adding, as long as not
                         * an empty query.
                         */
                        shouldCreate={(query: string) =>
                            query.trim().length > 0 && !values.includes(query)
                        }
                        getCreateLabel={(query: string) => (
                            <Group spacing="xxs">
                                <MantineIcon
                                    icon={IconPlus}
                                    color="blue.6"
                                    size="sm"
                                />
                                <Text c="blue.6">Add "{query}"</Text>
                            </Group>
                        )}
                        classNames={{
                            input: classes.multiSelectInput,
                            rightSection: classes.rightSectionGroup,
                        }}
                        disableSelectedItemFiltering
                        searchable
                        clearSearchOnChange
                        {...rest}
                        searchValue={search}
                        onSearchChange={setSearch}
                        limit={MAX_AUTOCOMPLETE_RESULTS}
                        onPaste={handlePaste}
                        nothingFound={
                            isInitialLoading ? 'Loading...' : 'No results found'
                        }
                        rightSectionWidth={30}
                        rightSection={
                            <Group
                                spacing="xxs"
                                noWrap
                                sx={{
                                    visibility: disabled ? 'hidden' : 'visible',
                                }}
                            >
                                {isInitialLoading ? (
                                    <Loader size="xs" color="gray" />
                                ) : isError ? (
                                    <Tooltip
                                        label={
                                            error?.error?.message ||
                                            'Filter not available'
                                        }
                                        withinPortal
                                    >
                                        <MantineIcon
                                            icon={IconAlertCircle}
                                            color="red"
                                        />
                                    </Tooltip>
                                ) : null}

                                <Tooltip
                                    withinPortal
                                    label="Edit filter values"
                                >
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        size="sm"
                                        onClick={openManageValues}
                                        sx={{
                                            visibility: isWrapperHovered
                                                ? 'visible'
                                                : 'hidden',
                                        }}
                                    >
                                        <MantineIcon icon={IconListDetails} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        }
                        dropdownComponent={DropdownComponentOverride}
                        itemComponent={({
                            label,
                            value: itemValue,
                            selected: _selected,
                            className,
                            ...others
                        }) => {
                            // Override selection state to check against full values array
                            // This fixes the bug where hidden values (beyond display limit) appear
                            // unselected in dropdown even though they're actually selected
                            const isSelected = isValueSelected(
                                itemValue,
                                values,
                            );
                            const itemClassName = [
                                className,
                                isSelected
                                    ? classes.multiSelectItemSelected
                                    : undefined,
                            ]
                                .filter(Boolean)
                                .join(' ');

                            return others.disabled ? (
                                <Text
                                    color="dimmed"
                                    className={itemClassName}
                                    {...others}
                                >
                                    {label}
                                </Text>
                            ) : (
                                <Highlight
                                    highlight={search}
                                    className={itemClassName}
                                    {...others}
                                >
                                    {label}
                                </Highlight>
                            );
                        }}
                        data={
                            hiddenCount > 0
                                ? [
                                      ...data,
                                      {
                                          value: MORE_VALUES_TOKEN,
                                          label: `+${hiddenCount.toLocaleString()} more`,
                                      },
                                  ]
                                : data
                        }
                        value={displayValues}
                        onDropdownOpen={onDropdownOpen}
                        onDropdownClose={() => {
                            handleResetSearch();
                            onDropdownClose?.();
                        }}
                        onChange={(updatedValues) => {
                            // If token was removed (backspace on truncated list), open modal instead
                            if (
                                wasTokenRemoved(
                                    displayValues,
                                    updatedValues,
                                    hiddenCount,
                                )
                            ) {
                                openManageValues();
                                return;
                            }

                            // Merge with hidden values to prevent data loss in truncated mode
                            const finalValues = mergeWithHiddenValues(
                                updatedValues,
                                displayValues,
                                values,
                            );
                            handleChange(finalValues);
                        }}
                        onCreate={handleAdd}
                        onKeyDown={handleKeyDown}
                    />
                )}
            </MultiValuePastePopover>
        </>
    );
};

export default FilterStringAutoComplete;
