import {
    applyDefaultTileTargets,
    assertUnreachable,
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    DashboardTile,
    fieldId,
    FilterableField,
    FilterOperator,
    FilterRule,
    getFilterRuleWithDefaultValue,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
} from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    PopoverProps,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import produce from 'immer';
import { FC, useCallback, useState } from 'react';
import FieldIcon from '../../common/Filters/FieldIcon';
import FieldLabel from '../../common/Filters/FieldLabel';
import FilterSettings from './FilterSettings';
import TileFilterConfiguration from './TileFilterConfiguration';

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
    field: FilterableField;
    availableTileFilters: Record<string, FilterableField[] | undefined>;
    filterRule?: DashboardFilterRule;
    popoverProps?: Pick<PopoverProps, 'onOpen' | 'onClose'>;
    selectedTabId?: FilterTabs;
    isEditMode: boolean;
    onTabChange: (tabId: FilterTabs) => void;
    onSave: (value: DashboardFilterRule) => void;
    onBack?: () => void;
}

const FilterConfiguration: FC<Props> = ({
    isEditMode,
    selectedTabId = DEFAULT_TAB,
    tiles,
    field,
    availableTileFilters,
    filterRule,
    popoverProps,
    onSave,
    onBack,
    onTabChange,
}) => {
    const [internalFilterRule, setInternalFilterRule] =
        useState<DashboardFilterRule>(
            filterRule
                ? applyDefaultTileTargets(
                      filterRule,
                      field,
                      availableTileFilters,
                  )
                : createDashboardFilterRuleFromField(
                      field,
                      availableTileFilters,
                  ),
        );

    const handleChangeFilterRule = useCallback(
        (newFilterRule: DashboardFilterRule) => {
            setInternalFilterRule(newFilterRule);
        },
        [],
    );

    const handleChangeFilterOperator = useCallback(
        (operator: FilterRule['operator']) => {
            setInternalFilterRule((prevState) =>
                getFilterRuleWithDefaultValue(field, {
                    ...prevState,
                    operator: operator,
                }),
            );
        },
        [field],
    );

    const handleChangeTileConfiguration = useCallback(
        (action: FilterActions, tileUuid: string, filter?: FilterableField) => {
            const filters = availableTileFilters[tileUuid];
            if (!filters) return;

            setInternalFilterRule((prevState) =>
                produce(prevState, (draftState) => {
                    draftState.tileTargets = draftState.tileTargets ?? {};

                    if (action === FilterActions.ADD) {
                        const filterableField =
                            filter ??
                            filters.find(matchFieldExact(field)) ??
                            filters.find(matchFieldByTypeAndName(field)) ??
                            filters.find(matchFieldByType(field));

                        if (!filterableField) return draftState;

                        draftState.tileTargets[tileUuid] = {
                            fieldId: fieldId(filterableField),
                            tableName: filterableField.table,
                        };
                    } else if (action === FilterActions.REMOVE) {
                        delete draftState.tileTargets[tileUuid];
                    } else {
                        return assertUnreachable(
                            action,
                            'Invalid FilterActions',
                        );
                    }
                }),
            );
        },
        [field, availableTileFilters],
    );

    return (
        <Stack spacing="sm">
            <Group spacing="sm">
                <FieldIcon item={field} />
                <FieldLabel item={field} />
            </Group>

            <SegmentedControl
                data={[
                    {
                        label: (
                            <Tooltip
                                withArrow
                                label="Select the value you want to filter your dimension by"
                                position="top-start"
                                withinPortal
                            >
                                <span>Settings</span>
                            </Tooltip>
                        ),
                        value: FilterTabs.SETTINGS,
                    },
                    {
                        label: (
                            <Tooltip
                                withArrow
                                label="Select tiles to apply filter to and which field to filter by"
                                position="top-start"
                                withinPortal
                            >
                                <span>Tiles</span>
                            </Tooltip>
                        ),
                        value: FilterTabs.TILES,
                    },
                ]}
                value={selectedTabId}
                onChange={onTabChange}
            />

            {selectedTabId === FilterTabs.SETTINGS ? (
                <FilterSettings
                    isEditMode={isEditMode}
                    field={field}
                    filterRule={internalFilterRule}
                    onChangeFilterOperator={handleChangeFilterOperator}
                    onChangeFilterRule={handleChangeFilterRule}
                    popoverProps={popoverProps}
                />
            ) : selectedTabId === FilterTabs.TILES ? (
                <TileFilterConfiguration
                    field={field}
                    filterRule={internalFilterRule}
                    popoverProps={popoverProps}
                    tiles={tiles}
                    availableTileFilters={availableTileFilters}
                    onChange={handleChangeTileConfiguration}
                />
            ) : (
                assertUnreachable(selectedTabId, 'Invalid FilterTabs')
            )}

            <Flex>
                {onBack && (
                    <Button variant="subtle" onClick={onBack}>
                        Back
                    </Button>
                )}

                <Button
                    ml="auto"
                    disabled={
                        ![
                            FilterOperator.NULL,
                            FilterOperator.NOT_NULL,
                        ].includes(internalFilterRule.operator) &&
                        (!internalFilterRule.values ||
                            internalFilterRule.values.length <= 0)
                    }
                    onClick={() => onSave(internalFilterRule)}
                >
                    Apply
                </Button>
            </Flex>
        </Stack>
    );
};

export default FilterConfiguration;
