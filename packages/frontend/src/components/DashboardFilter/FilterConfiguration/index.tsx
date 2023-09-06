import { Classes, Popover2Props } from '@blueprintjs/popover2';

import { FormGroup } from '@blueprintjs/core';
import {
    assertUnreachable,
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    DashboardTile,
    fieldId,
    FilterableField,
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
    Stack,
    Tabs,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
import produce from 'immer';
import { FC, useCallback, useMemo, useState } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import FieldIcon from '../../common/Filters/FieldIcon';
import FieldLabel from '../../common/Filters/FieldLabel';
import MantineIcon from '../../common/MantineIcon';
import FilterSettings from './FilterSettings';
import TileFilterConfiguration from './TileFilterConfiguration';
import {
    getFilterRuleRevertableObject,
    isFilterConfigRevertButtonEnabled,
    isFilterConfigurationApplyButtonEnabled,
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

// TODO: add a 'disabled' field to tileConfig.
// For now we use this empty tile config to indicate that
// a chart should not get the default filters applied to it.
// A clearer solution would be to add a 'disabled' field we could
// toggle to mark the filter as disabled for that tile.
const DISABLE_FILTER_TILE_CONFIG = {
    fieldId: '',
    tableName: '',
};

interface Props {
    tiles: DashboardTile[];
    field?: FilterableField;
    fields?: FilterableField[];
    availableTileFilters: Record<string, FilterableField[] | undefined>;
    originalFilterRule?: DashboardFilterRule;
    defaultFilterRule?: DashboardFilterRule;
    popoverProps?: Popover2Props;
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    onSave: (value: DashboardFilterRule) => void;
}

const getDefaultFilter = (
    filters: FilterableField[],
    selectedField: FilterableField,
) => {
    return (
        filters.find(matchFieldExact(selectedField)) ??
        filters.find(matchFieldByTypeAndName(selectedField)) ??
        filters.find(matchFieldByType(selectedField))
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
    const theme = useMantineTheme();
    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>(DEFAULT_TAB);

    const [selectedField, setSelectedField] = useState<
        FilterableField | undefined
    >(field);

    const [draftFilterRule, setDraftFilterRule] = useState<
        DashboardFilterRule | undefined
    >(defaultFilterRule);

    const isFilterModified = useMemo(() => {
        if (!originalFilterRule || !draftFilterRule) return false;

        return isFilterConfigRevertButtonEnabled(
            originalFilterRule,
            draftFilterRule,
        );
    }, [originalFilterRule, draftFilterRule]);

    const handleChangeField = (newField: FilterableField) => {
        if (!fields) return;

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
        (action: FilterActions, tileUuid: string, filter?: FilterableField) => {
            const filters = availableTileFilters[tileUuid];
            if (!filters) return;

            const changedFilterRule = produce(draftFilterRule, (draftState) => {
                if (!draftState || !selectedField) return;

                draftState.tileTargets = draftState.tileTargets ?? {};

                switch (action) {
                    case FilterActions.ADD:
                        const filterableField =
                            filter ?? getDefaultFilter(filters, selectedField);

                        if (!filterableField) return draftState;

                        draftState.tileTargets[tileUuid] = {
                            fieldId: fieldId(filterableField),
                            tableName: filterableField.table,
                        };

                        return draftState;

                    case FilterActions.REMOVE:
                        draftState.tileTargets[tileUuid] =
                            DISABLE_FILTER_TILE_CONFIG;
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
                            draftState.tileTargets[tileUuid] =
                                DISABLE_FILTER_TILE_CONFIG;
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

    const isApplyDisabled = !isFilterConfigurationApplyButtonEnabled(
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
                            <FormGroup
                                style={{ marginBottom: '5px' }}
                                label={
                                    <Text size="xs" fw={500}>
                                        Select a dimension to filter{' '}
                                        <Text color="red" span>
                                            *
                                        </Text>{' '}
                                    </Text>
                                }
                                labelFor="field-autocomplete"
                            >
                                <FieldAutoComplete
                                    hasGrouping
                                    id="field-autocomplete"
                                    fields={fields}
                                    activeField={selectedField}
                                    onChange={handleChangeField}
                                    inputProps={{
                                        style: {
                                            borderRadius: '4px',
                                            borderWidth: '1px',
                                            boxShadow: 'none',
                                            fontSize: theme.fontSizes.xs,
                                        },
                                    }}
                                    popoverProps={{
                                        lazy: true,
                                        matchTargetWidth: true,
                                        captureDismiss: !popoverProps?.isOpen,
                                        canEscapeKeyClose:
                                            !popoverProps?.isOpen,
                                        ...popoverProps,
                                    }}
                                />
                            </FormGroup>
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
                    disabled={isApplyDisabled}
                >
                    <Box>
                        <Button
                            size="xs"
                            variant="filled"
                            className={Classes.POPOVER2_DISMISS}
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
