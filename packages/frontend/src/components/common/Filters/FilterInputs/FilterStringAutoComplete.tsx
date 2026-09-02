import {
    interpolateUiString,
    isDimension,
    isFilterAutocompleteManualOnly,
    type FilterableItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Highlight,
    Loader,
    Pill,
    Text,
    TextInput,
    Tooltip,
    type ComboboxProps,
    type PillsInputProps,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconListDetails,
    IconPlus,
    IconRefresh,
} from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import useHealth from '../../../../hooks/health/useHealth';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../hooks/useFieldValues';
import MantineIcon from '../../MantineIcon';
import { MultiSelectCombobox } from '../../MultiSelectCombobox/MultiSelectCombobox';
import useFiltersContext from '../useFiltersContext';
import classes from './FilterStringAutoComplete.module.css';
import {
    computeDisplayValues,
    computeHiddenCount,
    isValueSelected,
    mergeWithHiddenValues,
    MORE_VALUES_TOKEN,
    NULL_VALUE_LABEL,
    NULL_VALUE_TOKEN,
    SUMMARY_MODE_THRESHOLD,
} from './FilterStringAutoComplete.utils';
import { ManageFilterValuesModal } from './ManageFilterValuesModal';
import MultiValuePastePopover from './MultiValuePastePopover';
import { formatDisplayValue } from './utils';

type Props = Omit<PillsInputProps, 'onChange'> & {
    filterId: string;
    field: FilterableItem;
    values: string[];
    suggestions: string[];
    onChange: (values: string[]) => void;
    singleValue?: boolean;
    /** Show a static "(null)" option that toggles the rule's includeNull flag. */
    showNullOption?: boolean;
    includeNull?: boolean;
    onIncludeNullChange?: (includeNull: boolean) => void;
    comboboxProps?: ComboboxProps;
    onDropdownOpen?: () => void;
    onDropdownClose?: () => void;
    placeholder?: string;
};

const RefreshIndicator: FC<{
    refreshedAtRef: React.RefObject<Date>;
    onRefresh: () => void;
}> = ({ refreshedAtRef, onRefresh }) => {
    const getUiString = useUiStrings();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [displayTime, setDisplayTime] = useState(
        refreshedAtRef.current.toLocaleString(),
    );

    return (
        <Tooltip
            position="left"
            label={getUiString('filters.autocomplete.refreshTooltip')}
        >
            <Text
                size="xs"
                px="sm"
                py="xxs"
                className={classes.dropdownRefresh}
                onClick={() => {
                    onRefresh();
                    setIsRefreshing(true);
                }}
            >
                {interpolateUiString(
                    getUiString('filters.autocomplete.resultsLoadedAt'),
                    { time: displayTime },
                )}{' '}
                <MantineIcon
                    icon={IconRefresh}
                    display="inline"
                    size={12}
                    className={`${classes.refreshIcon} ${
                        isRefreshing ? classes.refreshIconSpin : ''
                    }`}
                    onAnimationEnd={() => {
                        setIsRefreshing(false);
                        setDisplayTime(refreshedAtRef.current.toLocaleString());
                    }}
                />
            </Text>
        </Tooltip>
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
    showNullOption,
    includeNull,
    onIncludeNullChange,
    comboboxProps,
    ...rest
}) => {
    const getUiString = useUiStrings();
    // The "(null)" option is only meaningful for multi-value filters.
    const showNull = !!showNullOption && !singleValue;
    const multiSelectRef = useRef<HTMLInputElement>(null);
    const skipBlurCommitRef = useRef(false);
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
        results,
        refreshedAt,
        refetch,
        reset,
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

    const refreshedAtRef = useRef(refreshedAt);
    refreshedAtRef.current = refreshedAt;

    useEffect(() => {
        if (forceRefresh) {
            refetch().then().catch(console.error); // This will skip queryKey cache from react query and refetch from backend
            setForceRefresh(false);
        }
    }, [forceRefresh, refetch]);
    const filterAutocomplete = isDimension(field)
        ? field.filterAutocomplete
        : undefined;

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
                const input = multiSelectRef.current;
                if (input && document.activeElement === input) {
                    skipBlurCommitRef.current = true;
                    input.blur();
                }
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
        const resultLabels = new Map(
            results.map(({ value, label }) => [value, label]),
        );

        const valueData = uniq([
            ...results.map(({ value }) => value),
            ...values,
        ]).map((value) => ({
            value,
            label: resultLabels.get(value) ?? formatDisplayValue(value),
        }));
        const showNullInData =
            showNull && (!isInitialLoading || includeNull === true);

        return showNullInData
            ? [
                  ...valueData,
                  { value: NULL_VALUE_TOKEN, label: NULL_VALUE_LABEL },
              ]
            : valueData;
    }, [includeNull, isInitialLoading, results, showNull, values]);

    const isSummaryMode =
        !singleValue && values.length > SUMMARY_MODE_THRESHOLD;
    const hiddenCount = computeHiddenCount(values);

    const displayValues = useMemo(
        () => computeDisplayValues(values, singleValue),
        [singleValue, values],
    );

    const handleBlur = useCallback(
        (event: React.FocusEvent<HTMLInputElement>) => {
            if (skipBlurCommitRef.current) {
                skipBlurCommitRef.current = false;
            } else if (search !== '' && !pastePopUpOpened) {
                handleAdd(search);
                handleResetSearch();
            }
            onInputBlur?.(event);
        },
        [handleAdd, handleResetSearch, onInputBlur, pastePopUpOpened, search],
    );

    // Nothing to autocomplete (no warehouse fetch, no curated values):
    // the input is plain entry with no dropdown.
    const manualEntryOnly = isFilterAutocompleteManualOnly(filterAutocomplete);
    const searchedMaxResults = results.length >= MAX_AUTOCOMPLETE_RESULTS;
    const canRefreshAutocomplete =
        filterAutocomplete?.fetchFromWarehouse !== false &&
        !((filterAutocomplete?.values?.length ?? 0) > 0 && search.length === 0);
    return (
        <>
            <ManageFilterValuesModal
                opened={manageValuesOpened}
                onClose={closeManageValues}
                values={values}
                onChange={handleChange}
                title={getUiString('filters.manageValues.filterValuesTitle')}
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
                        rightSectionPointerEvents="all"
                        rightSection={
                            disabled ? null : (
                                <Tooltip label="Edit filter values">
                                    <ActionIcon
                                        aria-label="Edit filter values"
                                        onMouseDown={(event) =>
                                            event.preventDefault()
                                        }
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
                    <Box ref={wrapperRef} w="100%">
                        <MultiSelectCombobox
                            ref={multiSelectRef}
                            {...rest}
                            size="xs"
                            w="100%"
                            placeholder={
                                values.length > 0 || disabled
                                    ? undefined
                                    : manualEntryOnly
                                      ? 'Type a value and press Enter'
                                      : placeholder
                            }
                            disabled={disabled}
                            shouldCreate={(query: string) =>
                                query.trim().length > 0 &&
                                !values.includes(query)
                            }
                            createLabel={
                                <Group gap="xxs">
                                    <MantineIcon
                                        icon={IconPlus}
                                        color="blue.7"
                                        size="sm"
                                    />
                                    <Text c="blue.7" fz="sm" fw={500}>
                                        {interpolateUiString(
                                            getUiString(
                                                'filters.autocomplete.addValue',
                                            ),
                                            { value: search.trim() },
                                        )}
                                    </Text>
                                </Group>
                            }
                            classNames={{
                                input: classes.multiSelectInput,
                                section: classes.rightSectionGroup,
                            }}
                            searchValue={search}
                            onSearchChange={setSearch}
                            comboboxProps={comboboxProps}
                            onPaste={handlePaste}
                            withDropdown={!manualEntryOnly}
                            nothingFoundMessage={
                                isInitialLoading
                                    ? getUiString(
                                          'filters.autocomplete.loading',
                                      )
                                    : getUiString(
                                          'filters.autocomplete.noResults',
                                      )
                            }
                            rightSectionWidth={30}
                            rightSectionPointerEvents="all"
                            rightSection={
                                <Group
                                    gap="xxs"
                                    wrap="nowrap"
                                    style={{
                                        visibility: disabled
                                            ? 'hidden'
                                            : 'visible',
                                    }}
                                >
                                    {isInitialLoading ? (
                                        <Loader size="xs" color="gray" />
                                    ) : isError ? (
                                        <Tooltip
                                            label={
                                                error?.error?.message ||
                                                getUiString(
                                                    'filters.autocomplete.filterNotAvailable',
                                                )
                                            }
                                        >
                                            <MantineIcon
                                                icon={IconAlertCircle}
                                                color="red"
                                            />
                                        </Tooltip>
                                    ) : null}

                                    <Tooltip
                                        label={getUiString(
                                            'filters.autocomplete.editValuesTooltip',
                                        )}
                                    >
                                        <ActionIcon
                                            size="sm"
                                            onClick={openManageValues}
                                            style={{
                                                visibility: isWrapperHovered
                                                    ? 'visible'
                                                    : 'hidden',
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconListDetails}
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            }
                            topContent={
                                searchedMaxResults ? (
                                    <Text
                                        c="dimmed"
                                        size="xs"
                                        px="sm"
                                        pt="xs"
                                        pb="xxs"
                                    >
                                        {interpolateUiString(
                                            getUiString(
                                                search
                                                    ? 'filters.autocomplete.maxResultsContinue'
                                                    : 'filters.autocomplete.maxResultsStart',
                                            ),
                                            { n: MAX_AUTOCOMPLETE_RESULTS },
                                        )}
                                    </Text>
                                ) : null
                            }
                            footer={
                                healthData?.hasCacheAutocompleResults &&
                                canRefreshAutocomplete ? (
                                    <RefreshIndicator
                                        refreshedAtRef={refreshedAtRef}
                                        onRefresh={() => {
                                            reset();
                                            setForceRefresh(true);
                                        }}
                                    />
                                ) : null
                            }
                            options={data}
                            limit={MAX_AUTOCOMPLETE_RESULTS}
                            selectedValues={
                                showNull && includeNull
                                    ? [...values, NULL_VALUE_TOKEN]
                                    : values
                            }
                            value={
                                showNull && includeNull
                                    ? [...displayValues, NULL_VALUE_TOKEN]
                                    : displayValues
                            }
                            renderPill={(itemValue, label, remove) => {
                                if (itemValue === MORE_VALUES_TOKEN) {
                                    return (
                                        <Pill
                                            className={classes.moreValuesPill}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Manage ${hiddenCount.toLocaleString()} more filter values`}
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                if (!disabled)
                                                    openManageValues();
                                            }}
                                            onKeyDown={(event) => {
                                                if (
                                                    !disabled &&
                                                    (event.key === 'Enter' ||
                                                        event.key === ' ')
                                                ) {
                                                    event.preventDefault();
                                                    openManageValues();
                                                }
                                            }}
                                        >
                                            +{hiddenCount.toLocaleString()} more
                                        </Pill>
                                    );
                                }
                                if (singleValue) {
                                    return (
                                        <Text size="xs" lineClamp={1}>
                                            {label}
                                        </Text>
                                    );
                                }
                                return (
                                    <Pill
                                        withRemoveButton={!disabled}
                                        disabled={disabled}
                                        onRemove={remove}
                                        removeButtonProps={{
                                            'aria-label': `Remove ${label}`,
                                            'aria-hidden': false,
                                            onMouseDown: (event) =>
                                                event.preventDefault(),
                                        }}
                                    >
                                        {label}
                                    </Pill>
                                );
                            }}
                            renderOption={(option) =>
                                option.disabled ? (
                                    <Text c="dimmed">{option.label}</Text>
                                ) : (
                                    <Highlight highlight={search} fz="sm">
                                        {option.label}
                                    </Highlight>
                                )
                            }
                            onDropdownOpen={onDropdownOpen}
                            onDropdownClose={() => {
                                handleResetSearch();
                                onDropdownClose?.();
                            }}
                            onValueRemove={(itemValue) => {
                                if (itemValue === MORE_VALUES_TOKEN) {
                                    openManageValues();
                                    return;
                                }
                                if (itemValue === NULL_VALUE_TOKEN) {
                                    onIncludeNullChange?.(false);
                                    return;
                                }
                                const finalValues = mergeWithHiddenValues(
                                    displayValues.filter(
                                        (value) => value !== itemValue,
                                    ),
                                    displayValues,
                                    values,
                                );
                                handleChange(finalValues);
                            }}
                            onOptionSubmit={(itemValue) => {
                                if (itemValue === NULL_VALUE_TOKEN) {
                                    onIncludeNullChange?.(!includeNull);
                                } else if (isValueSelected(itemValue, values)) {
                                    handleChange(
                                        values.filter(
                                            (value) => value !== itemValue,
                                        ),
                                    );
                                } else {
                                    handleAdd(itemValue);
                                }
                            }}
                            onCreate={handleAdd}
                            onFocus={onInputFocus}
                            onBlur={handleBlur}
                        />
                    </Box>
                )}
            </MultiValuePastePopover>
        </>
    );
};

export default FilterStringAutoComplete;
