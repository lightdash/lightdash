import {
    DimensionType,
    FieldType,
    type FilterableItem,
    formatDate,
    getItemId,
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
    parseDate,
    TimeFrames,
} from '@lightdash/common';
import {
    Box,
    type ComboboxItemGroup,
    Group,
    MultiSelect,
    Select,
} from '@mantine-8/core';
import { DatePickerInput } from '@mantine/dates';
import { IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import React, {
    type FC,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { formatDisplayValue } from '../../../components/common/Filters/FilterInputs/utils';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValuesSafely,
} from '../../../hooks/useFieldValues';
import styles from './ParameterInput.module.css';

type ParameterInputProps = {
    paramKey: string;
    parameter: LightdashProjectParameter;
    value: ParameterValue | null;
    onParameterChange: (paramKey: string, value: ParameterValue | null) => void;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    projectUuid?: string;
    parameterValues?: ParametersValuesMap;
    disabled?: boolean;
    isError?: boolean;
};

const parameterDimensionMap: Record<string, DimensionType> = {
    string: DimensionType.STRING,
    number: DimensionType.NUMBER,
    date: DimensionType.DATE,
};

const getDimensionType = (paramType: string | undefined): DimensionType => {
    if (!paramType) return DimensionType.STRING;

    return parameterDimensionMap[paramType] || DimensionType.STRING;
};

export const ParameterInput: FC<ParameterInputProps> = ({
    paramKey,
    parameter,
    value,
    onParameterChange,
    size,
    projectUuid,
    parameterValues,
    disabled,
    isError,
}) => {
    const multiSelectRef = useRef<HTMLInputElement>(null);

    const [search, setSearch] = useState('');
    const [forceRefresh, setForceRefresh] = useState<boolean>(false);

    // Create field for fetching if options_from_dimension exists
    const field: FilterableItem | undefined = useMemo(() => {
        if (parameter.options_from_dimension) {
            return {
                name: parameter.options_from_dimension.dimension,
                table: parameter.options_from_dimension.model,
                fieldType: FieldType.DIMENSION,
                type: getDimensionType(parameter.type),
                label:
                    parameter.label ||
                    parameter.options_from_dimension.dimension,
                tableLabel: parameter.options_from_dimension.model,
                sql: '',
                hidden: false,
            };
        }
        return undefined;
    }, [parameter.options_from_dimension, parameter.label, parameter.type]);

    const fieldId = field ? getItemId(field) : undefined;

    // Only use fetching if we have options_from_dimension and projectUuid
    const shouldFetch = !!(
        parameter.options_from_dimension &&
        projectUuid &&
        field
    );

    const fieldValuesResult = useFieldValuesSafely(
        search,
        [],
        projectUuid,
        field,
        fieldId,
        undefined,
        true,
        forceRefresh,
        {
            refetchOnMount: 'always',
            enabled: parameter.type !== 'date',
        },
        parameterValues,
    );

    const { results: resultsSet, refreshedAt, refetch } = fieldValuesResult;

    useEffect(() => {
        if (forceRefresh && shouldFetch && refetch) {
            refetch().then().catch(console.error);
            setForceRefresh(false);
        }
    }, [forceRefresh, refetch, shouldFetch]);

    const fetchedResults = useMemo(
        () => (shouldFetch && resultsSet ? [...resultsSet] : []),
        [resultsSet, shouldFetch],
    );

    const placeholder = useMemo(() => {
        const defaultValues = parameter.default
            ? Array.isArray(parameter.default)
                ? parameter.default
                : [parameter.default]
            : undefined;
        return defaultValues
            ? `${
                  parameter.multiple
                      ? defaultValues.join(', ')
                      : defaultValues[0]
              } (default)`
            : 'Choose value...';
    }, [parameter]);

    const currentStringValues = useMemo((): string[] => {
        if (parameter.type !== 'string' || value == null) return [];
        return (Array.isArray(value) ? value : [value]).map(String);
    }, [value, parameter.type]);

    const currentNumberValues = useMemo((): number[] => {
        if (parameter.type !== 'number' || value == null) return [];
        return (Array.isArray(value) ? value : [value])
            .map((v) => (typeof v === 'number' ? v : Number(v)))
            .filter((n): n is number => !isNaN(n) && isFinite(n));
    }, [value, parameter.type]);

    const currentDateValues = useMemo((): string[] => {
        if (parameter.type !== 'date' || value == null) return [];
        // Dates are stored as ISO 8601 strings (YYYY-MM-DD)
        // Note: Multiple dates not yet supported, but using array for consistency
        return (Array.isArray(value) ? value : [value]).map(String);
    }, [value, parameter.type]);

    // Use the appropriate array based on parameter type
    const currentValues =
        parameter.type === 'number'
            ? currentNumberValues
            : parameter.type === 'date'
            ? currentDateValues
            : currentStringValues;

    const optionsData = useMemo(() => {
        const parameterOptions = parameter.options ?? [];

        // Add custom values if allowed
        if (parameter.allow_custom_values) {
            // Needed because current values are not in the same group as parameter options
            const filteredCurrentValues = currentValues.filter(
                (option) => !fetchedResults.includes(String(option)),
            );

            return uniq([...parameterOptions, ...filteredCurrentValues]);
        }

        // Always return a copy to avoid Redux immutability issues
        return [...parameterOptions];
    }, [
        parameter.options,
        parameter.allow_custom_values,
        currentValues,
        fetchedResults,
    ]);

    // Handler for creating custom values when allow_custom_values is true
    const handleCreateValue = useCallback(
        (newValue: string) => {
            if (!parameter.allow_custom_values || !newValue.trim()) return;

            const trimmedValue = newValue.trim();

            if (parameter.type === 'number') {
                const numValue = Number(trimmedValue);

                if (isNaN(numValue) || !isFinite(numValue)) return;

                if (parameter.multiple) {
                    onParameterChange(paramKey, [
                        ...currentNumberValues,
                        numValue,
                    ]);
                } else {
                    onParameterChange(paramKey, numValue);
                }
            } else if (parameter.type === 'date') {
                // Validate ISO 8601 date format (YYYY-MM-DD)
                const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!isoDateRegex.test(trimmedValue)) return;

                // Validate that it's an actual valid date
                const date = new Date(trimmedValue);
                if (isNaN(date.getTime())) return;

                // Note: Multiple dates not yet supported
                if (!parameter.multiple) {
                    onParameterChange(paramKey, trimmedValue);
                }
            } else {
                if (parameter.multiple) {
                    onParameterChange(paramKey, [
                        ...currentStringValues,
                        trimmedValue,
                    ]);
                } else {
                    onParameterChange(paramKey, trimmedValue);
                }
            }
        },
        [
            parameter.allow_custom_values,
            parameter.multiple,
            parameter.type,
            currentStringValues,
            currentNumberValues,
            onParameterChange,
            paramKey,
        ],
    );

    const searchedMaxResults =
        shouldFetch && fetchedResults.length >= MAX_AUTOCOMPLETE_RESULTS;

    const selectData = useMemo(() => {
        const baseItems = shouldFetch
            ? optionsData.filter(
                  (option) =>
                      option !== '__refresh__' && option !== '__create__',
              )
            : optionsData;

        const regularItems = [...baseItems] // Create a copy to avoid mutating Redux state
            .sort((a, b) => String(a).localeCompare(String(b)))
            .map((option) => ({
                value: String(option),
                label: formatDisplayValue(String(option)),
            }));

        const fetchedItems =
            fetchedResults.length > 0
                ? [
                      {
                          group: 'Dimension values',
                          items: [...fetchedResults] // Create a copy to avoid mutating Redux state
                              .sort((a, b) => a.localeCompare(b))
                              .map((option) => ({
                                  value: option,
                                  label: formatDisplayValue(option),
                              })),
                      } satisfies ComboboxItemGroup,
                  ]
                : [];

        const specialItems = [];

        // Add create item if search doesn't match existing options and custom values are allowed
        if (
            parameter.allow_custom_values &&
            search &&
            search.trim() &&
            !baseItems.some(
                (option) =>
                    String(option).toLowerCase() === search.toLowerCase(),
            ) &&
            !fetchedResults.some(
                (option) => option.toLowerCase() === search.toLowerCase(),
            )
        ) {
            specialItems.push({
                value: '__create__',
                label: `Add "${search.trim()}"`,
            });
        }

        // Add refresh item for fetched options
        if (shouldFetch) {
            specialItems.push({
                value: '__refresh__',
                label: '__refresh_placeholder__', // Will be replaced in renderOption
            });
        }

        return [...regularItems, ...fetchedItems, ...specialItems];
    }, [
        fetchedResults,
        shouldFetch,
        optionsData,
        parameter.allow_custom_values,
        search,
    ]);

    const renderOption = useCallback(
        ({ option }: { option: { value: string; label: string } }) => {
            if (option.value === '__refresh__' && shouldFetch && refreshedAt) {
                const refreshLabel = `${
                    searchedMaxResults
                        ? `Showing first ${MAX_AUTOCOMPLETE_RESULTS} results. `
                        : ''
                }Options loaded at ${refreshedAt.toLocaleTimeString()} - ↻ Click to refresh`;

                return (
                    <Box fz={11} className={styles.refreshItem}>
                        {refreshLabel}
                    </Box>
                );
            }
            if (option.value === '__create__') {
                // Extract the query from the label (e.g., 'Add "query"' -> 'query')
                const query = option.label.match(/^Add "(.+)"$/)?.[1] || '';
                return (
                    <div className={styles.createItem}>
                        <Group gap="xxs" c="blue" fz="sm">
                            <MantineIcon
                                icon={IconPlus}
                                color="blue"
                                size="sm"
                            />
                            Add "{query}"
                        </Group>
                    </div>
                );
            }
            return <div>{option.label}</div>;
        },
        [shouldFetch, refreshedAt, searchedMaxResults],
    );

    const handleChange = useCallback(
        (newValues: string | string[] | null) => {
            // Handle refresh item selection - check both single value and array cases
            if (
                newValues === '__refresh__' ||
                (Array.isArray(newValues) && newValues.includes('__refresh__'))
            ) {
                setForceRefresh(true);
                return; // Don't update the actual parameter value
            }

            // Handle create item selection - create new value from search
            if (
                newValues === '__create__' ||
                (Array.isArray(newValues) && newValues.includes('__create__'))
            ) {
                if (search && search.trim()) {
                    handleCreateValue(search.trim());
                    setSearch(''); // Clear search after creation
                }
                return; // Don't update with the __create__ value
            }

            // Convert string values back to appropriate types if needed
            let finalValue: ParameterValue | null = newValues;

            // For number parameters that somehow went through string flow, convert back
            if (parameter.type === 'number' && newValues !== null) {
                if (Array.isArray(newValues)) {
                    // Filter out invalid numbers from the array
                    const validNumbers = newValues
                        .map((v) => Number(v))
                        .filter((num) => !isNaN(num) && isFinite(num));

                    // Only update if we have valid numbers, otherwise keep null
                    finalValue = validNumbers.length > 0 ? validNumbers : null;
                } else {
                    const num = Number(newValues);
                    // For single values, only accept valid numbers
                    if (!isNaN(num) && isFinite(num)) {
                        finalValue = num;
                    } else {
                        // Invalid number input - set to null rather than keeping invalid string
                        finalValue = null;
                    }
                }
            }

            // Handle single value mode constraints
            if (
                !parameter.multiple &&
                finalValue !== null &&
                Array.isArray(finalValue)
            ) {
                finalValue =
                    finalValue.length > 0
                        ? finalValue[finalValue.length - 1]
                        : null;
            }

            onParameterChange(paramKey, finalValue);

            // Close dropdown if single value mode and a value was selected
            if (!parameter.multiple && finalValue && multiSelectRef.current) {
                multiSelectRef.current.blur();
            }
        },
        [
            parameter.multiple,
            parameter.type,
            paramKey,
            onParameterChange,
            search,
            handleCreateValue,
        ],
    );

    // Render DateInput for date type parameters (single value only - multiple dates not yet supported)
    if (parameter.type === 'date' && !parameter.multiple) {
        // Convert current ISO string value to Date object
        const currentDate =
            currentDateValues.length > 0
                ? parseDate(currentDateValues[0], TimeFrames.DAY)
                : null;

        // Reasonable date range constraints
        const minDate = new Date(1900, 0, 1); // January 1, 1900
        const maxDate = new Date(2100, 11, 31); // December 31, 2100

        const defaultValue =
            typeof parameter.default === 'string'
                ? new Date(parameter.default)
                : null;

        return (
            <DatePickerInput
                value={currentDate || defaultValue}
                onChange={(date: Date | null) => {
                    if (date) {
                        // Convert Date object to ISO string (YYYY-MM-DD)
                        const isoString = formatDate(date, TimeFrames.DAY);
                        onParameterChange(paramKey, isoString);
                    } else {
                        onParameterChange(paramKey, null);
                    }
                }}
                firstDayOfWeek={0}
                size={size}
                clearable
                disabled={disabled}
                error={isError}
                minDate={minDate}
                maxDate={maxDate}
                popoverProps={{
                    shadow: 'sm',
                    withinPortal: false,
                    zIndex: 10000,
                }}
            />
        );
    }

    // Render Select or MultiSelect for non-date types or multiple date selection
    if (parameter.multiple) {
        return (
            <MultiSelect
                ref={multiSelectRef}
                data={selectData}
                value={currentValues.map(String)}
                onChange={handleChange}
                searchValue={
                    shouldFetch || parameter.allow_custom_values
                        ? search
                        : undefined
                }
                onSearchChange={
                    shouldFetch || parameter.allow_custom_values
                        ? setSearch
                        : undefined
                }
                placeholder={currentValues.length > 0 ? undefined : placeholder}
                size={size}
                searchable
                clearable
                disabled={disabled}
                error={isError}
                hidePickedOptions
                maxDropdownHeight={200}
                renderOption={
                    shouldFetch || parameter.allow_custom_values
                        ? renderOption
                        : undefined
                }
                comboboxProps={{
                    withinPortal: false,
                    zIndex: 10000,
                    position: 'bottom-start',
                    offset: 5,
                }}
            />
        );
    }

    return (
        <Select
            ref={multiSelectRef}
            data={selectData}
            value={currentValues.length > 0 ? String(currentValues[0]) : null}
            onChange={handleChange}
            searchValue={
                shouldFetch || parameter.allow_custom_values
                    ? search
                    : undefined
            }
            onSearchChange={
                shouldFetch || parameter.allow_custom_values
                    ? setSearch
                    : undefined
            }
            placeholder={placeholder}
            size={size}
            searchable
            clearable
            disabled={disabled}
            error={isError}
            maxDropdownHeight={200}
            renderOption={
                shouldFetch || parameter.allow_custom_values
                    ? renderOption
                    : undefined
            }
            comboboxProps={{
                withinPortal: false,
                zIndex: 10000,
                position: 'bottom-start',
                offset: 5,
            }}
        />
    );
};
