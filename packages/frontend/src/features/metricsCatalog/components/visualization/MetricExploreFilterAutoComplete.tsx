import { type CompiledDimension } from '@lightdash/common';
import {
    Group,
    Highlight,
    Loader,
    Text,
    type ComboboxProps,
    type PillsInputProps,
} from '@mantine-8/core';
import { Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import MultiValuePastePopover from '../../../../components/common/Filters/FilterInputs/MultiValuePastePopover';
import MantineIcon from '../../../../components/common/MantineIcon';
import { MultiSelectCombobox } from '../../../../components/common/MultiSelectCombobox/MultiSelectCombobox';
import useHealth from '../../../../hooks/health/useHealth';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../hooks/useFieldValues';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import styles from './MetricExploreFilterAutoComplete.module.css';

type Props = Omit<PillsInputProps, 'onChange'> & {
    dimension: CompiledDimension;
    values: string[];
    onChange: (values: string[]) => void;
    comboboxProps?: ComboboxProps;
    onDropdownOpen?: () => void;
    onDropdownClose?: () => void;
    placeholder?: string;
};

/**
 * This component is very similar to FilterStringAutoComplete, but it's used for the MetricExploreFilter, so these components arent wrapped in a FilterProvider.
 * TODO:
 * - Create a shared hook to handle the results, and hotkeys
 * - Create a shared component to handle the dropdown
 */

export const MetricExploreFilterAutoComplete: FC<Props> = ({
    dimension,
    values,
    disabled,
    onChange,
    placeholder,
    onDropdownOpen,
    onDropdownClose,
    comboboxProps,
    ...rest
}) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const { data: healthData } = useHealth();

    const [search, setSearch] = useState('');
    const [pastePopUpOpened, setPastePopUpOpened] = useState(false);
    const [tempPasteValues, setTempPasteValues] = useState<
        string | undefined
    >();
    const [forceRefresh, setForceRefresh] = useState<boolean>(false);

    const { isInitialLoading, results, refreshedAt, refetch } = useFieldValues(
        search,
        [],
        projectUuid,
        dimension,
        undefined,
        undefined,
        true,
        forceRefresh,
        {
            refetchOnMount: 'always',
        },
    );

    useEffect(() => {
        if (forceRefresh) {
            refetch().then().catch(console.error);
            setForceRefresh(false);
        }
    }, [forceRefresh, refetch]);

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
            if (clipboardData.includes(',') || clipboardData.includes('\n')) {
                setTempPasteValues(clipboardData);
                setPastePopUpOpened(true);
            }
        },
        [],
    );

    const data = useMemo(() => {
        const resultLabels = new Map(
            results.map(({ value, label }) => [value, label]),
        );

        return uniq([...results.map(({ value }) => value), ...values]).map(
            (value) => ({
                value,
                label: resultLabels.get(value) ?? value,
            }),
        );
    }, [results, values]);

    const searchedMaxResults = results.length >= MAX_AUTOCOMPLETE_RESULTS;

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
            <MultiSelectCombobox
                {...rest}
                size="xs"
                w="100%"
                placeholder={
                    values.length > 0 || disabled ? undefined : placeholder
                }
                disabled={disabled}
                shouldCreate={(query) =>
                    query.trim().length > 0 && !values.includes(query)
                }
                createLabel={
                    <Group gap="xxs">
                        <MantineIcon icon={IconPlus} color="blue" size="sm" />
                        <Text c="blue">Add "{search.trim()}"</Text>
                    </Group>
                }
                classNames={{
                    root: styles.root,
                    input: styles.input,
                    section: styles.rightSection,
                }}
                comboboxProps={{
                    ...comboboxProps,
                    classNames: {
                        dropdown: styles.dropdown,
                        option: styles.option,
                    },
                }}
                searchValue={search}
                onSearchChange={setSearch}
                onPaste={handlePaste}
                nothingFoundMessage={
                    isInitialLoading ? 'Loading...' : 'No results found'
                }
                rightSection={
                    isInitialLoading ? <Loader size="xs" color="gray" /> : null
                }
                topContent={
                    searchedMaxResults ? (
                        <Text c="dimmed" size="xs" px="sm" pt="xs" pb="xxs">
                            Showing first {MAX_AUTOCOMPLETE_RESULTS} results.{' '}
                            {search ? 'Continue' : 'Start'} typing...
                        </Text>
                    ) : null
                }
                footer={
                    healthData?.hasCacheAutocompleResults ? (
                        <Tooltip
                            withinPortal
                            position="left"
                            label="Click here to refresh cache filter values"
                        >
                            <Text
                                c="dimmed"
                                size="xs"
                                px="sm"
                                p="xxs"
                                className={styles.cacheHint}
                                onClick={() => setForceRefresh(true)}
                            >
                                Results loaded at {refreshedAt.toLocaleString()}
                            </Text>
                        </Tooltip>
                    ) : null
                }
                renderOption={(option) =>
                    option.disabled ? (
                        <Text c="dimmed">{option.label}</Text>
                    ) : (
                        <Highlight highlight={search} fz="sm">
                            {option.label}
                        </Highlight>
                    )
                }
                options={data}
                limit={MAX_AUTOCOMPLETE_RESULTS}
                value={values}
                onDropdownOpen={onDropdownOpen}
                onDropdownClose={() => {
                    handleResetSearch();
                    onDropdownClose?.();
                }}
                onValueRemove={(itemValue) =>
                    handleChange(values.filter((value) => value !== itemValue))
                }
                onOptionSubmit={(itemValue) => {
                    if (values.includes(itemValue)) {
                        handleChange(
                            values.filter((value) => value !== itemValue),
                        );
                    } else {
                        handleAdd(itemValue);
                    }
                }}
                onCreate={handleAdd}
            />
        </MultiValuePastePopover>
    );
};
