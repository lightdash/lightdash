import {
    assertUnreachable,
    createDashboardFilterRuleFromField,
    fieldId,
    isField,
    isFilterableField,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
    type DashboardFilterRule,
    type DashboardTile,
    type Field,
    type FilterableField,
} from '@lightdash/common';
import {
    Box,
    Button,
    Flex,
    Group,
    Stack,
    Tabs,
    Text,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
import produce from 'immer';
import { useCallback, useMemo, useState, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import FieldIcon from '../../common/Filters/FieldIcon';
import FieldLabel from '../../common/Filters/FieldLabel';
import MantineIcon from '../../common/MantineIcon';
import FilterSettings from './FilterSettings';
import TileFilterConfiguration from './TileFilterConfiguration';
import {
    getFilterRuleRevertableObject,
    hasFilterValueSet,
    hasSavedFilterValueChanged,
    isFilterEnabled,
} from './utils';

export enum FilterTabs {
    SETTINGS = 'settings',
    TILES = 'tiles',
}

const DEFAULT_TAB = FilterTabs.SETTINGS;

export enum FilterActions {
    ADD = 'add',
    REMOVE = 'remove',
}

interface Props {
    tiles: DashboardTile[];
    field?: FilterableField;
    fields?: FilterableField[];
    availableTileFilters: Record<string, FilterableField[] | undefined>;
    originalFilterRule?: DashboardFilterRule;
    defaultFilterRule?: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    onSave: (value: DashboardFilterRule) => void;
}

const getDefaultField = (
    fields: FilterableField[],
    selectedField: FilterableField,
) => {
    return (
        fields.find(matchFieldExact(selectedField)) ??
        fields.find(matchFieldByTypeAndName(selectedField)) ??
        fields.find(matchFieldByType(selectedField))
    );
};

const FilterConfiguration: FC<Props> = ({
    isEditMode,
    isCreatingNew = false,
    isTemporary = false,
    tiles,
    field,
    fields,
    availableTileFilters,
    originalFilterRule,
    defaultFilterRule,
    popoverProps,
    onSave,
}) => {
    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>(DEFAULT_TAB);

    const [selectedField, setSelectedField] = useState<
        FilterableField | undefined
    >(field);

    const [draftFilterRule, setDraftFilterRule] = useState<
        DashboardFilterRule | undefined
    >(defaultFilterRule);

    const isFilterModified = useMemo(() => {
        if (!originalFilterRule || !draftFilterRule) return false;

        return hasSavedFilterValueChanged(originalFilterRule, draftFilterRule);
    }, [originalFilterRule, draftFilterRule]);

    const handleChangeField = (newField: FilterableField) => {
        const isCreatingTemporary = isCreatingNew && !isEditMode;

        if (newField && isField(newField) && isFilterableField(newField)) {
            setDraftFilterRule(
                createDashboardFilterRuleFromField({
                    field: newField,
                    availableTileFilters,
                    isTemporary: isCreatingTemporary,
                }),
            );

            setSelectedField(newField);
        }
    };

    const handleRevert = useCallback(() => {
        if (!originalFilterRule) return;

        setDraftFilterRule((oldDraftFilterRule) => {
            return oldDraftFilterRule
                ? {
                      ...oldDraftFilterRule,
                      ...getFilterRuleRevertableObject(originalFilterRule),
                  }
                : undefined;
        });
    }, [originalFilterRule, setDraftFilterRule]);

    const handleChangeFilterRule = useCallback(
        (newFilterRule: DashboardFilterRule) => {
            setDraftFilterRule(() => {
                // When a disabled filter has a value set, it should be enabled by setting it to false
                const isNewFilterDisabled =
                    newFilterRule.disabled && !hasFilterValueSet(newFilterRule);
                return { ...newFilterRule, disabled: isNewFilterDisabled };
            });
        },
        [setDraftFilterRule],
    );

    const handleChangeTileConfiguration = useCallback(
        (action: FilterActions, tileUuid: string, newField?: Field) => {
            const filters = availableTileFilters[tileUuid];
            if (!filters) return;

            const changedFilterRule = produce(draftFilterRule, (draftState) => {
                if (!draftState || !selectedField) return;

                draftState.tileTargets = draftState.tileTargets ?? {};

                switch (action) {
                    case FilterActions.ADD:
                        const filterableField =
                            newField ?? getDefaultField(filters, selectedField);

                        if (!filterableField) return draftState;

                        draftState.tileTargets[tileUuid] = {
                            fieldId: fieldId(filterableField),
                            tableName: filterableField.table,
                        };

                        return draftState;

                    case FilterActions.REMOVE:
                        draftState.tileTargets[tileUuid] = false;
                        return draftState;

                    default:
                        return assertUnreachable(
                            action,
                            'Invalid FilterActions',
                        );
                }
            });

            setDraftFilterRule(changedFilterRule);
        },
        [
            selectedField,
            availableTileFilters,
            setDraftFilterRule,
            draftFilterRule,
        ],
    );

    const handleToggleAll = useCallback(
        (checked: boolean) => {
            if (!checked) {
                const newFilterRule = produce(draftFilterRule, (draftState) => {
                    if (!draftState || !selectedField) return;

                    draftState.tileTargets = {};
                    Object.entries(availableTileFilters).forEach(
                        ([tileUuid]) => {
                            if (!draftState.tileTargets) return;
                            draftState.tileTargets[tileUuid] = false;
                        },
                    );
                    return draftState;
                });

                setDraftFilterRule(newFilterRule);
            } else {
                const newFilterRule = produce(draftFilterRule, (draftState) => {
                    if (!draftState || !selectedField) return;
                    draftState.tileTargets = {};
                    return draftState;
                });

                setDraftFilterRule(newFilterRule);
            }
        },
        [
            selectedField,
            availableTileFilters,
            setDraftFilterRule,
            draftFilterRule,
        ],
    );

    const isApplyDisabled = !isFilterEnabled(
        draftFilterRule,
        isEditMode,
        isCreatingNew,
    );

    return (
        <Stack>
            <Tabs
                value={selectedTabId}
                onTabChange={(tabId: FilterTabs) => setSelectedTabId(tabId)}
            >
                {isCreatingNew || isEditMode || isTemporary ? (
                    <Tabs.List mb="md">
                        <Tooltip
                            label="Select the value you want to filter your dimension by"
                            position="top-start"
                        >
                            <Tabs.Tab value={FilterTabs.SETTINGS}>
                                Filter Settings
                            </Tabs.Tab>
                        </Tooltip>

                        <Tooltip
                            label="Select tiles to apply filter to and which field to filter by"
                            position="top-start"
                        >
                            <Tabs.Tab
                                value={FilterTabs.TILES}
                                disabled={!selectedField}
                            >
                                Chart tiles
                            </Tabs.Tab>
                        </Tooltip>
                    </Tabs.List>
                ) : null}

                <Tabs.Panel value={FilterTabs.SETTINGS} miw={350} maw={520}>
                    <Stack spacing="sm">
                        {!!fields && isCreatingNew ? (
                            <FieldSelect
                                data-testid="FilterConfiguration/FieldSelect"
                                size="xs"
                                label={
                                    <Text>
                                        Select a dimension to filter{' '}
                                        <Text color="red" span>
                                            *
                                        </Text>{' '}
                                    </Text>
                                }
                                withinPortal={popoverProps?.withinPortal}
                                onDropdownOpen={popoverProps?.onOpen}
                                onDropdownClose={popoverProps?.onClose}
                                hasGrouping
                                item={selectedField}
                                items={fields}
                                onChange={(newField) => {
                                    if (!newField) return;

                                    handleChangeField(newField);
                                }}
                            />
                        ) : (
                            selectedField && (
                                <Group spacing="xs">
                                    <FieldIcon item={selectedField} />
                                    {originalFilterRule?.label &&
                                    !isEditMode ? (
                                        <Text span fw={500}>
                                            {originalFilterRule.label}
                                        </Text>
                                    ) : (
                                        <FieldLabel item={selectedField} />
                                    )}
                                </Group>
                            )
                        )}

                        {!!selectedField && draftFilterRule && (
                            <FilterSettings
                                isEditMode={isEditMode}
                                isCreatingNew={isCreatingNew}
                                field={selectedField}
                                filterRule={draftFilterRule}
                                onChangeFilterRule={handleChangeFilterRule}
                                popoverProps={popoverProps}
                            />
                        )}
                    </Stack>
                </Tabs.Panel>

                {!!selectedField && draftFilterRule && (
                    <Tabs.Panel value={FilterTabs.TILES} w={500}>
                        <TileFilterConfiguration
                            field={selectedField}
                            filterRule={draftFilterRule}
                            popoverProps={popoverProps}
                            tiles={tiles}
                            availableTileFilters={availableTileFilters}
                            onChange={handleChangeTileConfiguration}
                            onToggleAll={handleToggleAll}
                        />
                    </Tabs.Panel>
                )}
            </Tabs>

            <Flex gap="sm">
                <Box sx={{ flexGrow: 1 }} />

                {!isTemporary &&
                    isFilterModified &&
                    selectedTabId === FilterTabs.SETTINGS &&
                    !isEditMode && (
                        <Tooltip
                            label="Reset to original value"
                            position="left"
                        >
                            <Button
                                size="xs"
                                variant="default"
                                color="gray"
                                onClick={handleRevert}
                            >
                                <MantineIcon icon={IconRotate2} />
                            </Button>
                        </Tooltip>
                    )}

                <Tooltip
                    label="Filter field and value required"
                    disabled={!isApplyDisabled}
                >
                    <Box>
                        <Button
                            size="xs"
                            variant="filled"
                            disabled={isApplyDisabled}
                            onClick={() => {
                                setSelectedTabId(FilterTabs.SETTINGS);

                                if (!!draftFilterRule) onSave(draftFilterRule);
                            }}
                        >
                            Apply
                        </Button>
                    </Box>
                </Tooltip>
            </Flex>
        </Stack>
    );
};

export default FilterConfiguration;
