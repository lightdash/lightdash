import {
    addFilterRule,
    deleteFilterRuleFromGroup,
    getFiltersFromGroup,
    getItemId,
    getTotalFilterRules,
    hasNestedGroups,
    isAndFilterGroup,
    isFilterableField,
    isOrFilterGroup,
    type FilterGroup,
    type FilterRule,
    type Filters,
    type OrFilterGroup,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Stack,
    Text,
    Tooltip,
    useMantineColorScheme,
} from '@mantine-8/core';
import { IconAlertCircle, IconPlus, IconX } from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    type FC,
} from 'react';
import { useToggle } from 'react-use';
import { v4 as uuidv4 } from 'uuid';
import { useIsFilterAutofocusEnabled } from '../../../hooks/useIsFilterAutofocusEnabled';
import {
    type FieldsWithSuggestions,
    type FieldWithSuggestions,
} from '../../Explorer/FiltersCard/useFieldsWithSuggestions';
import FieldSelect from '../FieldSelect';
import MantineIcon from '../MantineIcon';
import { FILTER_SELECT_LIMIT } from './constants';
import FilterGroupForm from './FilterGroupForm';
import SimplifiedFilterGroupForm from './SimplifiedFilterGroupForm';
import useFiltersContext from './useFiltersContext';

type Props = {
    filters: Filters;
    setFilters: (value: Filters) => void;
    isEditMode: boolean;
};

const getInvalidFilterRules = (
    fields: FieldWithSuggestions[],
    filterRules: FilterRule[],
) =>
    filterRules.reduce<FilterRule[]>((accumulator, filterRule) => {
        const fieldInRule = fields.find(
            (field) => getItemId(field) === filterRule.target.fieldId,
        );

        if (!fieldInRule) {
            return [...accumulator, filterRule];
        }

        return accumulator;
    }, []);

type AddFilterSectionProps = {
    isOpen: boolean;
    fields: FieldWithSuggestions[];
    totalFilterRules: number;
    baseTable?: string;
    toggleFieldInput: () => void;
    clearAllFilters: () => void;
    addFieldRule: (field: FieldWithSuggestions) => void;
};

const AddFilterSection: FC<AddFilterSectionProps> = ({
    isOpen,
    fields,
    totalFilterRules,
    baseTable,
    toggleFieldInput,
    clearAllFilters,
    addFieldRule,
}) => {
    const { colorScheme } = useMantineColorScheme();
    return (
        <Box
            pos="relative"
            style={{
                zIndex: 2,
                backgroundColor:
                    colorScheme === 'dark'
                        ? 'var(--mantine-color-dark-6)'
                        : 'white',
            }}
        >
            {!isOpen ? (
                <Group
                    align="center"
                    justify="space-between"
                    style={{ flex: 1 }}
                >
                    <Button
                        variant="outline"
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        disabled={fields.length <= 0}
                        onClick={toggleFieldInput}
                        data-testid="FiltersForm/add-filter-button"
                    >
                        Add filter
                    </Button>
                    {totalFilterRules > 0 && (
                        <Tooltip label="Clear all filters" position="bottom">
                            <Button
                                variant="light"
                                size="xs"
                                color="gray"
                                onClick={clearAllFilters}
                                disabled={totalFilterRules === 0}
                            >
                                Clear all
                            </Button>
                        </Tooltip>
                    )}
                </Group>
            ) : (
                <FieldSelect
                    limit={FILTER_SELECT_LIMIT}
                    size="xs"
                    maw={300}
                    hasGrouping
                    baseTable={baseTable}
                    items={fields}
                    onChange={(field) => {
                        if (!field) return;
                        addFieldRule(field);
                    }}
                    onClosed={toggleFieldInput}
                    rightSection={
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={toggleFieldInput}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    }
                />
            )}
        </Box>
    );
};

const FiltersForm: FC<Props> = memo(({ filters, setFilters, isEditMode }) => {
    // const theme = useMantineTheme();
    const { itemsMap, baseTable } = useFiltersContext<FieldsWithSuggestions>();
    const [isOpen, toggleFieldInput] = useToggle(false);
    const isFilterAutofocusEnabled = useIsFilterAutofocusEnabled();
    const autoFocusRuleIdRef = useRef<string | undefined>(undefined);
    const lastFocusedRuleIdRef = useRef<string | undefined>(undefined);
    const formRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!isFilterAutofocusEnabled) return;
        if (autoFocusRuleIdRef.current) {
            autoFocusRuleIdRef.current = undefined;
        }
    }, [isFilterAutofocusEnabled]);

    const handleFocusCapture = useCallback(
        (e: React.FocusEvent) => {
            if (!isFilterAutofocusEnabled) return;
            const ruleEl = (e.target as HTMLElement).closest?.(
                '[data-rule-id]',
            );
            if (ruleEl) {
                lastFocusedRuleIdRef.current =
                    ruleEl.getAttribute('data-rule-id') || undefined;
            }
        },
        [isFilterAutofocusEnabled],
    );

    const setAutoFocusRuleId = useCallback(
        (ruleId: string) => {
            if (!isFilterAutofocusEnabled) return;
            autoFocusRuleIdRef.current = ruleId;
        },
        [isFilterAutofocusEnabled],
    );

    useEffect(() => {
        if (!isFilterAutofocusEnabled) return;
        const ruleId = lastFocusedRuleIdRef.current;
        if (!ruleId) return;
        if (document.activeElement && document.activeElement !== document.body)
            return;

        const ruleEl = formRef.current?.querySelector(
            `[data-rule-id="${CSS.escape(ruleId)}"]`,
        );
        if (ruleEl) {
            const input = ruleEl.querySelector<HTMLInputElement>(
                'input:not([type="hidden"])',
            );
            input?.focus();
        }
    }, [filters, isFilterAutofocusEnabled]);
    const fields = useMemo<FieldWithSuggestions[]>(() => {
        return Object.values(itemsMap);
    }, [itemsMap]);

    const totalFilterRules = getTotalFilterRules(filters);
    const clearAllFilters = useCallback(() => {
        setFilters({});
    }, [setFilters]);
    const invalidFilterRules = getInvalidFilterRules(fields, totalFilterRules);
    const hasInvalidFilterRules = invalidFilterRules.length > 0;

    const showSimplifiedForm: boolean =
        totalFilterRules.length < 2 && !hasNestedGroups(filters);

    const addFieldRule = useCallback(
        (field: FieldWithSuggestions) => {
            if (isFilterableField(field)) {
                const newFilters = addFilterRule({ filters, field });
                const newRules = getTotalFilterRules(newFilters);
                const lastRule = newRules[newRules.length - 1];
                if (isFilterAutofocusEnabled && lastRule) {
                    setAutoFocusRuleId(lastRule.id);
                }
                setFilters(newFilters);
                toggleFieldInput(false);
            }
        },
        [
            filters,
            isFilterAutofocusEnabled,
            setAutoFocusRuleId,
            setFilters,
            toggleFieldInput,
        ],
    );

    const updateFiltersFromGroup = useCallback(
        (filterGroup: FilterGroup) => {
            setFilters(getFiltersFromGroup(filterGroup, fields));
        },
        [fields, setFilters],
    );

    const andRootFilterGroupItems = useMemo(() => {
        const dimensionAndGroupItems =
            filters.dimensions && isAndFilterGroup(filters.dimensions)
                ? filters.dimensions.and
                : [];
        const metricAndGroupItems =
            filters.metrics && isAndFilterGroup(filters.metrics)
                ? filters.metrics.and
                : [];
        const tableCalculationAndGroupItems =
            filters.tableCalculations &&
            isAndFilterGroup(filters.tableCalculations)
                ? filters.tableCalculations.and
                : [];

        return [
            ...dimensionAndGroupItems,
            ...metricAndGroupItems,
            ...tableCalculationAndGroupItems,
        ];
    }, [filters.dimensions, filters.metrics, filters.tableCalculations]);

    const orRootFilterGroups = useMemo(() => {
        const groups: OrFilterGroup[] = [];

        if (filters.dimensions && isOrFilterGroup(filters.dimensions)) {
            groups.push(filters.dimensions);
        }

        if (filters.metrics && isOrFilterGroup(filters.metrics)) {
            groups.push(filters.metrics);
        }

        if (
            filters.tableCalculations &&
            isOrFilterGroup(filters.tableCalculations)
        ) {
            groups.push(filters.tableCalculations);
        }

        return groups;
    }, [filters.dimensions, filters.metrics, filters.tableCalculations]);

    const rootFilterGroup: FilterGroup = useMemo(() => {
        // If there are no ORs, we can just return the AND group items as a new root group
        if (orRootFilterGroups.length === 0) {
            return {
                id: uuidv4(),
                and: andRootFilterGroupItems,
            };
        }

        // If there are no ANDs, we can just return the OR groups as a new root group
        if (andRootFilterGroupItems.length === 0) {
            // If there's only one OR group, we can just return it as the root group
            return orRootFilterGroups.length === 1
                ? orRootFilterGroups[0]
                : {
                      id: uuidv4(),
                      and: orRootFilterGroups,
                  };
        }

        // If there are both ANDs and ORs, we need to create a new root group that contains both
        return {
            id: uuidv4(),
            and: [...andRootFilterGroupItems, ...orRootFilterGroups],
        };
    }, [andRootFilterGroupItems, orRootFilterGroups]);

    return (
        <Stack
            ref={formRef}
            onFocusCapture={handleFocusCapture}
            gap="xs"
            pos="relative"
            m="sm"
            style={{ flexGrow: 1 }}
        >
            {totalFilterRules.length >= 1 &&
                (showSimplifiedForm ? (
                    <SimplifiedFilterGroupForm
                        fields={fields}
                        isEditMode={isEditMode}
                        autoFocusRuleId={
                            isFilterAutofocusEnabled
                                ? autoFocusRuleIdRef.current
                                : undefined
                        }
                        filterRules={getTotalFilterRules(filters)}
                        onChange={(filterRules) => {
                            // This is a simplified form that only shows up with 1 filter rule, so we can just create a new root group
                            updateFiltersFromGroup({
                                id: uuidv4(),
                                and: filterRules,
                            });
                        }}
                    />
                ) : (
                    <>
                        <Divider
                            orientation="vertical"
                            pos="absolute"
                            h="100%"
                            top={0}
                            left={18}
                            style={{ zIndex: 1 }}
                        />

                        {rootFilterGroup && (
                            <FilterGroupForm
                                hideLine
                                hideButtons
                                autoFocusRuleId={
                                    isFilterAutofocusEnabled
                                        ? autoFocusRuleIdRef.current
                                        : undefined
                                }
                                onAutoFocusRule={
                                    isFilterAutofocusEnabled
                                        ? setAutoFocusRuleId
                                        : undefined
                                }
                                filterGroup={rootFilterGroup}
                                fields={fields}
                                isEditMode={isEditMode}
                                onChange={updateFiltersFromGroup}
                                onDelete={() => setFilters({})}
                            />
                        )}
                    </>
                ))}

            {hasInvalidFilterRules &&
                invalidFilterRules.map((rule, index) => (
                    <Stack
                        key={index}
                        ml={showSimplifiedForm ? undefined : 'xl'}
                        gap="two"
                        align="flex-start"
                    >
                        <Group
                            key={rule.id}
                            gap="xs"
                            pl="xs"
                            style={{
                                border: '1px solid var(--mantine-color-ldGray-2)',
                                borderRadius: 'var(--mantine-radius-sm)',
                            }}
                        >
                            <MantineIcon icon={IconAlertCircle} />
                            <Text c="dimmed" fz="xs">
                                Tried to reference field with unknown id:{' '}
                                <Text span fw={500} c="ldGray.7">
                                    {rule.target.fieldId}
                                </Text>
                            </Text>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                onClick={() =>
                                    updateFiltersFromGroup(
                                        deleteFilterRuleFromGroup(
                                            rootFilterGroup,
                                            rule.id,
                                        ),
                                    )
                                }
                            >
                                <MantineIcon icon={IconX} size="sm" />
                            </ActionIcon>
                        </Group>
                    </Stack>
                ))}

            {isEditMode && (
                <AddFilterSection
                    isOpen={isOpen}
                    fields={fields}
                    totalFilterRules={totalFilterRules.length}
                    baseTable={baseTable}
                    toggleFieldInput={toggleFieldInput}
                    clearAllFilters={clearAllFilters}
                    addFieldRule={addFieldRule}
                />
            )}
        </Stack>
    );
});

FiltersForm.displayName = 'FiltersForm';

export default FiltersForm;
