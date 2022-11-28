import { Intent, Tab, Tabs } from '@blueprintjs/core';
import { Classes, Popover2Props } from '@blueprintjs/popover2';

import {
    applyDefaultTileFieldTargetOverride,
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
    tilesSavedQueryFilters: Record<string, FilterableField[]>;
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
    tilesSavedQueryFilters,
    filterRule,
    popoverProps,
    onSave,
    onBack,
    onTabChange,
}) => {
    const [internalFilterRule, setInternalFilterRule] =
        useState<DashboardFilterRule>(
            filterRule
                ? applyDefaultTileFieldTargetOverride(
                      filterRule,
                      field,
                      tilesSavedQueryFilters,
                  )
                : createDashboardFilterRuleFromField(
                      field,
                      tilesSavedQueryFilters,
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
        (
            action: FilterActions,
            tileUuid: string,
            filterUuid?: FilterableField,
        ) => {
            const savedQuery = tilesSavedQueryFilters[tileUuid];

            setInternalFilterRule((prevState) =>
                produce(prevState, (draftState) => {
                    draftState.tileTargetOverride =
                        draftState.tileTargetOverride?.filter((tileConfig) => {
                            return tileConfig.tileUuid !== tileUuid;
                        }) || [];

                    const filters = savedQuery;

                    if (action === FilterActions.ADD) {
                        const filterableField =
                            filterUuid ??
                            filters.find(matchFieldExact(field)) ??
                            filters.find(matchFieldByTypeAndName(field)) ??
                            filters.find(matchFieldByType(field));

                        if (!filterableField) return draftState;

                        draftState.tileTargetOverride.push({
                            tileUuid,
                            fieldId: fieldId(filterableField),
                            tableName: filterableField.table,
                        });
                    }
                }),
            );
        },
        [field, tilesSavedQueryFilters],
    );

    const filterSettings = (
        <FilterSettings
            field={field}
            filterRule={internalFilterRule}
            onChangeFilterOperator={handleChangeFilterOperator}
            onChangeFilterRule={handleChangeFilterRule}
            popoverProps={popoverProps}
        />
    );

    return (
        <ConfigureFilterWrapper>
            <FieldLabel item={field} />

            {localStorage.getItem('dashboard_filters') ? (
                <Tabs
                    selectedTabId={selectedTabId}
                    onChange={onTabChange}
                    renderActiveTabPanelOnly
                >
                    <Tab
                        id="settings"
                        title="Settings"
                        panel={filterSettings}
                    />

                    <Tab
                        id="tiles"
                        title="Tiles"
                        panel={
                            <TileFilterConfiguration
                                field={field}
                                filterRule={internalFilterRule}
                                popoverProps={popoverProps}
                                tiles={tiles}
                                tilesSavedQueryFilters={tilesSavedQueryFilters}
                                onChange={handleChangeTileConfiguration}
                            />
                        }
                    />
                </Tabs>
            ) : (
                filterSettings
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
