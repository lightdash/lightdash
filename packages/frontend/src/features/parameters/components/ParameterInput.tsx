import {
    DimensionType,
    FieldType,
    getItemId,
    type FilterableItem,
    type LightdashProjectParameter,
    type ParametersValuesMap,
} from '@lightdash/common';
import {
    Group,
    Highlight,
    Loader,
    MultiSelect,
    ScrollArea,
    Select,
    Stack,
    Text,
    Tooltip,
    type MultiSelectProps,
    type MultiSelectValueProps,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import MultiValuePastePopover from '../../../components/common/Filters/FilterInputs/MultiValuePastePopover';
import { formatDisplayValue } from '../../../components/common/Filters/FilterInputs/utils';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../hooks/useFieldValues';

// Consistent create label component for all parameter inputs
const CreateParameterLabel: FC<{ query: string }> = ({ query }) => (
    <Group spacing="xxs">
        <MantineIcon icon={IconPlus} color="blue" size="sm" />
        <Text color="blue">Add "{query}"</Text>
    </Group>
);

type ParameterInputProps = {
    paramKey: string;
    parameter: LightdashProjectParameter;
    value: string | string[] | null;
    onParameterChange: (
        paramKey: string,
        value: string | string[] | null,
    ) => void;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    projectUuid?: string;
    parameterValues?: ParametersValuesMap;
    disabled?: boolean;
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

type ParameterStringAutoCompleteProps = Omit<
    MultiSelectProps,
    'data' | 'onChange'
> & {
    projectUuid: string;
    field: FilterableItem;
    values: string[];
    suggestions: string[];
    onChange: (values: string[]) => void;
    singleValue?: boolean;
    parameterValues?: ParametersValuesMap;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

const ParameterStringAutoComplete: FC<ParameterStringAutoCompleteProps> = ({
    values,
    field,
    projectUuid,
    suggestions: initialSuggestionData,
    disabled,
    onChange,
    placeholder,
    onDropdownOpen,
    onDropdownClose,
    singleValue,
    parameterValues,
    size,
    creatable = false,
    ...rest
}) => {
    const multiSelectRef = useRef<HTMLInputElement>(null);
    const fieldId = getItemId(field);

    const [search, setSearch] = useState('');
    const [pastePopUpOpened, setPastePopUpOpened] = useState(false);
    const [tempPasteValues, setTempPasteValues] = useState<
        string | undefined
    >();

    const [forceRefresh, setForceRefresh] = useState<boolean>(false);

    const {
        isInitialLoading,
        results: resultsSet,
        refreshedAt,
        refetch,
    } = useFieldValues(
        search,
        initialSuggestionData,
        projectUuid,
        field,
        fieldId,
        undefined,
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
                <Tooltip
                    withinPortal
                    position="left"
                    label={`Click here to refresh filter values`}
                >
                    <Text
                        color="dimmed"
                        size="xs"
                        px="sm"
                        p="xxs"
                        sx={(theme) => ({
                            cursor: 'pointer',
                            borderTop: `1px solid ${theme.colors.gray[2]}`,
                            '&:hover': {
                                backgroundColor: theme.colors.gray[1],
                            },
                        })}
                        onClick={() => setForceRefresh(true)}
                    >
                        Results loaded at {refreshedAt.toLocaleString()}
                    </Text>
                </Tooltip>
            </Stack>
        ),
        [searchedMaxResults, search, refreshedAt],
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
                size={size}
                w="100%"
                placeholder={
                    values.length > 0 || disabled ? undefined : placeholder
                }
                disabled={disabled}
                valueComponent={singleValue ? SingleValueComponent : undefined}
                creatable={creatable}
                shouldCreate={(query) =>
                    query.trim().length > 0 && !values.includes(query)
                }
                getCreateLabel={(query) => (
                    <CreateParameterLabel query={query} />
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
        </MultiValuePastePopover>
    );
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
}) => {
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

    const shouldCreate = useCallback(
        (query: string) => {
            return (
                query.trim().length > 0 &&
                !(Array.isArray(value) ? value : [value]).includes(query)
            );
        },
        [value],
    );

    const getCreateLabel = useCallback(
        (query: string) => <CreateParameterLabel query={query} />,
        [],
    );

    if (parameter.options_from_dimension && projectUuid) {
        // Create a FilterableItem from parameter.options_from_dimension
        const field: FilterableItem = {
            name: parameter.options_from_dimension.dimension,
            table: parameter.options_from_dimension.model,
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            label:
                parameter.label || parameter.options_from_dimension.dimension,
            tableLabel: parameter.options_from_dimension.model,
            sql: '',
            hidden: false,
        };

        return (
            <ParameterStringAutoComplete
                projectUuid={projectUuid}
                field={field}
                autoFocus={false}
                placeholder={placeholder}
                suggestions={[]}
                values={value ? (Array.isArray(value) ? value : [value]) : []}
                singleValue={!parameter.multiple}
                onChange={(newValue) => onParameterChange(paramKey, newValue)}
                parameterValues={parameterValues}
                size={size}
                creatable={parameter.allow_custom_values}
            />
        );
    }

    const currentValues = value ? (Array.isArray(value) ? value : [value]) : [];
    const optionsData = parameter.allow_custom_values
        ? uniq([...(parameter.options ?? []), ...currentValues])
        : parameter.options ?? [];

    if (parameter.multiple) {
        return (
            <MultiSelect
                data={optionsData}
                value={currentValues}
                onChange={(newValue) => onParameterChange(paramKey, newValue)}
                placeholder={placeholder}
                size={size}
                searchable
                clearable
                disabled={disabled}
                creatable={parameter.allow_custom_values}
                shouldCreate={shouldCreate}
                getCreateLabel={getCreateLabel}
            />
        );
    }

    return (
        <Select
            placeholder={placeholder}
            value={currentValues[0]}
            onChange={(newValue) => onParameterChange(paramKey, newValue)}
            data={optionsData}
            size={size}
            searchable
            clearable
            disabled={disabled}
            creatable={parameter.allow_custom_values}
            shouldCreate={shouldCreate}
            getCreateLabel={getCreateLabel}
        />
    );
};
