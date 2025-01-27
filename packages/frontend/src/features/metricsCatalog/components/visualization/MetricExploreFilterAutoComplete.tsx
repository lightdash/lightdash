import { type CompiledDimension } from '@lightdash/common';
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
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import MultiValuePastePopover from '../../../../components/common/Filters/FilterInputs/MultiValuePastePopover';
import MantineIcon from '../../../../components/common/MantineIcon';
import useHealth from '../../../../hooks/health/useHealth';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../hooks/useFieldValues';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useFilterAutoCompleteStyles } from '../../styles/useFilterStyles';

type Props = Omit<MultiSelectProps, 'data' | 'onChange'> & {
    dimension: CompiledDimension;
    values: string[];
    onChange: (values: string[]) => void;
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
}) => {
    const { classes: filterAutoCompleteClasses } =
        useFilterAutoCompleteStyles();
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

    const {
        isInitialLoading,
        results: resultsSet,
        refreshedAt,
        refetch,
    } = useFieldValues(
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

    const data = useMemo(() => {
        return uniq([...results, ...values]).map((value) => ({
            value,
            label: value,
        }));
    }, [results, values]);

    const searchedMaxResults = resultsSet.size >= MAX_AUTOCOMPLETE_RESULTS;

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
                {healthData?.hasCacheAutocompleResults ? (
                    <Tooltip
                        withinPortal
                        position="left"
                        label="Click here to refresh cache filter values"
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
                size="xs"
                w="100%"
                placeholder={
                    values.length > 0 || disabled ? undefined : placeholder
                }
                disabled={disabled}
                creatable
                shouldCreate={(query) =>
                    query.trim().length > 0 && !values.includes(query)
                }
                getCreateLabel={(query) => (
                    <Group spacing="xxs">
                        <MantineIcon icon={IconPlus} color="blue" size="sm" />
                        <Text color="blue">Add "{query}"</Text>
                    </Group>
                )}
                classNames={filterAutoCompleteClasses}
                disableSelectedItemFiltering
                searchable
                clearSearchOnChange
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
