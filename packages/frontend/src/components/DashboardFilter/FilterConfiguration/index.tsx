import { Classes, Popover2Props } from '@blueprintjs/popover2';

import {
    applyDefaultTileTargets,
    assertUnreachable,
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    DashboardTile,
    fieldId,
    FilterableField,
    FilterRule,
    getFilterRuleWithDefaultValue,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
} from '@lightdash/common';
import { Box, Button, Flex, Group, Tabs, Tooltip } from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
import produce from 'immer';
import isEqual from 'lodash-es/isEqual';
import { FC, useCallback, useMemo, useState } from 'react';
import FieldIcon from '../../common/Filters/FieldIcon';
import FieldLabel from '../../common/Filters/FieldLabel';
import MantineIcon from '../../common/MantineIcon';
import { ConfigureFilterWrapper } from './FilterConfiguration.styled';
import FilterSettings from './FilterSettings';
import TileFilterConfiguration from './TileFilterConfiguration';
import { isFilterConfigurationApplyButtonEnabled } from './utils';

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
    originalFilterRule?: DashboardFilterRule;
    filterRule?: DashboardFilterRule;
    popoverProps?: Popover2Props;
    selectedTabId?: string;
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    onTabChange: (tabId: FilterTabs) => void;
    onSave: (value: DashboardFilterRule) => void;
    onBack?: () => void;
}

const FilterConfiguration: FC<Props> = ({
    isEditMode,
    isCreatingNew = false,
    isTemporary = false,
    selectedTabId = DEFAULT_TAB,
    tiles,
    field,
    availableTileFilters,
    originalFilterRule,
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

    const isFilterModified = useMemo(() => {
        if (!originalFilterRule) return false;

        if (
            originalFilterRule.disabled &&
            internalFilterRule.values === undefined
        ) {
            return false;
        }

        // fixes serialization of date values
        const serializedInternalFilterRule = produce(
            internalFilterRule,
            (draft) => {
                if (draft.values && draft.values.length > 0) {
                    draft.values = draft.values.map((v) =>
                        v instanceof Date ? v.toISOString() : v,
                    );
                }
            },
        );

        const originalFilterRuleWithTileTargets = applyDefaultTileTargets(
            originalFilterRule,
            field,
            availableTileFilters,
        );

        return !isEqual(
            originalFilterRuleWithTileTargets,
            serializedInternalFilterRule,
        );
    }, [originalFilterRule, internalFilterRule, field, availableTileFilters]);

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
                    operator,
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
        <ConfigureFilterWrapper>
            <Group spacing="xs">
                <FieldIcon item={field} />
                <FieldLabel item={field} />
            </Group>

            <Tabs
                value={selectedTabId}
                onTabChange={(tabId: FilterTabs) => onTabChange(tabId)}
            >
                {isCreatingNew || isEditMode || isTemporary ? (
                    <Tabs.List mb="md">
                        <Tooltip
                            label="Select the value you want to filter your dimension by"
                            position="top-start"
                        >
                            <Tabs.Tab value="settings">Settings</Tabs.Tab>
                        </Tooltip>

                        <Tooltip
                            label="Select tiles to apply filter to and which field to filter by"
                            position="top-start"
                        >
                            <Tabs.Tab value="tiles">Tiles</Tabs.Tab>
                        </Tooltip>
                    </Tabs.List>
                ) : null}

                <Tabs.Panel value="settings">
                    <FilterSettings
                        isEditMode={isEditMode}
                        field={field}
                        filterRule={internalFilterRule}
                        onChangeFilterOperator={handleChangeFilterOperator}
                        onChangeFilterRule={handleChangeFilterRule}
                        popoverProps={popoverProps}
                    />
                </Tabs.Panel>

                <Tabs.Panel value="tiles">
                    <TileFilterConfiguration
                        field={field}
                        filterRule={internalFilterRule}
                        popoverProps={popoverProps}
                        tiles={tiles}
                        availableTileFilters={availableTileFilters}
                        onChange={handleChangeTileConfiguration}
                    />
                </Tabs.Panel>
            </Tabs>

            <Flex gap="sm">
                {onBack && (
                    <Button size="xs" variant="subtle" onClick={onBack}>
                        Back
                    </Button>
                )}

                <Box sx={{ flexGrow: 1 }} />

                {isFilterModified && selectedTabId === FilterTabs.SETTINGS && (
                    <Tooltip label="Reset to original value" position="left">
                        <Button
                            size="xs"
                            variant="default"
                            color="gray"
                            onClick={() => {
                                if (!originalFilterRule) return;
                                handleChangeFilterRule(originalFilterRule);
                            }}
                        >
                            <MantineIcon icon={IconRotate2} />
                        </Button>
                    </Tooltip>
                )}

                <Button
                    size="xs"
                    variant="filled"
                    className={Classes.POPOVER2_DISMISS}
                    disabled={
                        !isFilterConfigurationApplyButtonEnabled(
                            internalFilterRule,
                        )
                    }
                    onClick={() => onSave(internalFilterRule)}
                >
                    Apply
                </Button>
            </Flex>
        </ConfigureFilterWrapper>
    );
};

export default FilterConfiguration;
