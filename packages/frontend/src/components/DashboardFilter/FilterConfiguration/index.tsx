import {
    assertUnreachable,
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    DashboardTile,
    Field,
    fieldId,
    FilterableField,
    getFilterRuleWithDefaultValue,
    isField,
    isFilterableField,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
} from '@lightdash/common';
import {
    Box,
    Button,
    Flex,
    Group,
    PopoverProps,
    Stack,
    Switch,
    Tabs,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
import produce from 'immer';
import { FC, useCallback, useMemo, useState } from 'react';
import FieldSelect from '../../common/FieldSelect';
import FieldIcon from '../../common/Filters/FieldIcon';
import FieldLabel from '../../common/Filters/FieldLabel';
import MantineIcon from '../../common/MantineIcon';
import FilterSettings from './FilterSettings';
import TileFilterConfiguration from './TileFilterConfiguration';
import {
    getFilterRuleRevertableObject,
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
    userCanManageExplore: boolean;
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
    userCanManageExplore,
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

    const handleChangeField = useCallback(
        (newField: FilterableField) => {
            const isCreatingTemporary = isCreatingNew && !isEditMode;

            if (newField && isField(newField) && isFilterableField(newField)) {
                setDraftFilterRule(
                    createDashboardFilterRuleFromField(
                        newField,
                        availableTileFilters,
                        false,
                        isCreatingTemporary,
                    ),
                );

                setSelectedField(newField);
            }
        },
        [availableTileFilters, isCreatingNew, isEditMode],
    );

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
            setDraftFilterRule((oldFilterRule) => {
                // TODO: Maybe this isn't the best place to do this.
                // All this says is if a filter *was* disabled and had no
                // value but now has a value, enable it. This is a way of
                // keeping disabled and 'no value' in sync.
                return oldFilterRule &&
                    !oldFilterRule?.values?.length &&
                    oldFilterRule?.disabled &&
                    newFilterRule.values?.length
                    ? { ...newFilterRule, disabled: false }
                    : newFilterRule;
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

    const handleToggleFilterDisabled = useCallback(
        (toggle: boolean) => {
            if (!draftFilterRule || !selectedField) return;

            const newFilter: DashboardFilterRule = {
                ...draftFilterRule,
                disabled: toggle,
            };

            handleChangeFilterRule(
                toggle
                    ? newFilter
                    : getFilterRuleWithDefaultValue(
                          selectedField,
                          newFilter,
                          null,
                      ),
            );
        },
        [selectedField, draftFilterRule, handleChangeFilterRule],
    );

    const isFilterDisabled = !!draftFilterRule?.disabled;

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

                <Tabs.Panel value={FilterTabs.SETTINGS} w={350}>
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
                                    <FieldLabel item={selectedField} />
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

            <Flex gap="sm" align="center">
                {selectedField && selectedTabId === FilterTabs.SETTINGS && (
                    <>
                        {isCreatingNew && (
                            <Tooltip
                                withinPortal
                                position="right"
                                label={
                                    isFilterDisabled
                                        ? 'Toggle on to set a default filter value'
                                        : 'Toggle off to leave the filter value empty, allowing users to populate it in view mode'
                                }
                            >
                                <div>
                                    <Switch
                                        label={
                                            <Text size="xs" mt="two" fw={500}>
                                                Provide default value
                                            </Text>
                                        }
                                        labelPosition="right"
                                        checked={!isFilterDisabled}
                                        onChange={(e) =>
                                            handleToggleFilterDisabled(
                                                !e.currentTarget.checked,
                                            )
                                        }
                                    />
                                </div>
                            </Tooltip>
                        )}

                        {!isCreatingNew && userCanManageExplore && (
                            <Tooltip
                                withinPortal
                                position="right"
                                label={
                                    isFilterDisabled
                                        ? 'Toggle off to set to a default value'
                                        : 'Toggle on to set to any value'
                                }
                            >
                                <div>
                                    <Switch
                                        label={
                                            <Text size="xs" mt="two" fw={500}>
                                                Set to any value
                                            </Text>
                                        }
                                        labelPosition="right"
                                        checked={isFilterDisabled}
                                        onChange={(e) => {
                                            handleToggleFilterDisabled(
                                                e.currentTarget.checked,
                                            );
                                        }}
                                    />
                                </div>
                            </Tooltip>
                        )}
                    </>
                )}

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
