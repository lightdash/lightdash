import { Intent, Tab, Tabs } from '@blueprintjs/core';
import { Classes, Popover2Props } from '@blueprintjs/popover2';

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
import produce from 'immer';
import { FC, useCallback, useState } from 'react';
import FieldLabel from '../../common/Filters/FieldLabel';
import SimpleButton from '../../common/SimpleButton';
import {
    ActionsWrapper,
    ApplyButton,
    ConfigureFilterWrapper,
    TabWrapper,
} from './FilterConfiguration.styled';
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
    availableTileFilters: Record<string, FilterableField[]>;
    filterRule?: DashboardFilterRule;
    popoverProps?: Popover2Props;
    selectedTabId?: string;
    onTabChange: (tabId: FilterTabs) => void;
    onSave: (value: DashboardFilterRule) => void;
    onBack?: () => void;
}

const FilterConfiguration: FC<Props> = ({
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
            <TabWrapper>
                <FieldLabel item={field} />

                <Tabs
                    selectedTabId={selectedTabId}
                    onChange={onTabChange}
                    renderActiveTabPanelOnly
                >
                    <Tab id="settings" title="Settings" />
                    <Tab id="tiles" title="Tiles" />
                </Tabs>
            </TabWrapper>

            {selectedTabId === FilterTabs.SETTINGS && (
                <FilterSettings
                    field={field}
                    filterRule={internalFilterRule}
                    onChangeFilterOperator={handleChangeFilterOperator}
                    onChangeFilterRule={handleChangeFilterRule}
                    popoverProps={popoverProps}
                />
            )}

            {selectedTabId === FilterTabs.TILES && (
                <TileFilterConfiguration
                    field={field}
                    filterRule={internalFilterRule}
                    popoverProps={popoverProps}
                    tiles={tiles}
                    availableTileFilters={availableTileFilters}
                    onChange={handleChangeTileConfiguration}
                />
            )}

            <ActionsWrapper>
                {onBack && (
                    <SimpleButton small onClick={onBack}>
                        Back
                    </SimpleButton>
                )}

                <ApplyButton
                    type="submit"
                    className={Classes.POPOVER2_DISMISS}
                    intent={Intent.PRIMARY}
                    text="Apply"
                    disabled={
                        ![
                            FilterOperator.NULL,
                            FilterOperator.NOT_NULL,
                        ].includes(internalFilterRule.operator) &&
                        (!internalFilterRule.values ||
                            internalFilterRule.values.length <= 0)
                    }
                    onClick={() => onSave(internalFilterRule)}
                />
            </ActionsWrapper>
        </ConfigureFilterWrapper>
    );
};

export default FilterConfiguration;
