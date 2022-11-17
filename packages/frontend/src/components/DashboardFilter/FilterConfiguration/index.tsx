import {
    Button,
    Checkbox,
    FormGroup,
    HTMLSelect,
    Intent,
    Tab,
    Tabs,
} from '@blueprintjs/core';
import { Classes, MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { ItemRenderer, Select2 } from '@blueprintjs/select';
import {
    AvailableFiltersForSavedQuery,
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromField,
} from '@lightdash/common';
import produce from 'immer';
import React, { FC, useMemo, useState } from 'react';
import { useDashboardTilesWithFilters } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { FilterTypeConfig } from '../../common/Filters/configs';
import SimpleButton from '../../common/SimpleButton';
import {
    ConfigureFilterWrapper,
    InputsWrapper,
    Title,
} from './FilterConfiguration.styled';

interface Props {
    field: FilterableField;
    tilesWithFilters: Record<string, AvailableFiltersForSavedQuery>;
    filterRule?: DashboardFilterRule;
    popoverProps?: Popover2Props;
    selectedTabId: string;
    onTabChange: (tabId: string) => void;
    onSave: (value: DashboardFilterRule) => void;
    onBack?: () => void;
}

const exactMatch = (field: FilterableField, filterField: FilterableField) => {
    return field.name === filterField.name && field.type === filterField.type;
};

const typeMatch = (field: FilterableField, filterField: FilterableField) => {
    return field.type === filterField.type;
};

const FilterConfiguration: FC<Props> = ({
    selectedTabId,
    onTabChange,
    field,
    tilesWithFilters,
    filterRule,
    popoverProps,
    onSave,
    onBack,
}) => {
    const filterType = field
        ? getFilterTypeFromField(field)
        : FilterType.STRING;

    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    const applicableTileUuids = useMemo(
        () =>
            Object.values(tilesWithFilters)
                .filter((tile) =>
                    tile.filters.some(
                        (filter) =>
                            filter.name === field.name &&
                            filter.table === field.table,
                    ),
                )
                .map((tile) => tile.uuid),
        [tilesWithFilters, field.name, field.table],
    );

    const [internalFilterRule, setInternalFilterRule] =
        useState<DashboardFilterRule>(
            filterRule ||
                createDashboardFilterRuleFromField(field, applicableTileUuids),
        );

    const handleToggleTile = (tileUuid: string, isChecked: boolean) => {
        setInternalFilterRule((prevState) =>
            produce(prevState, (draftState) => {
                if (isChecked) {
                    draftState.tileUuids?.push(tileUuid);
                } else {
                    draftState.tileUuids?.splice(
                        draftState.tileUuids.indexOf(tileUuid),
                        1,
                    );
                }
            }),
        );
    };

    const sortByAvailability = (
        a: AvailableFiltersForSavedQuery,
        b: AvailableFiltersForSavedQuery,
    ) => {
        const isAApplicable = applicableTileUuids?.includes(a.uuid);
        const isBApplicable = applicableTileUuids?.includes(b.uuid);

        if (isAApplicable && !isBApplicable) {
            return -1;
        } else if (!isAApplicable && isBApplicable) {
            return 1;
        } else {
            return 0;
        }
    };

    const renderItem: ItemRenderer<FilterableField> = (
        filter,
        { handleClick, handleFocus, modifiers, query },
    ) => {
        if (!modifiers.matchesPredicate) {
            return null;
        }

        return (
            <MenuItem2
                active={modifiers.active}
                disabled={modifiers.disabled}
                key={filter.name}
                label={filter.type}
                text={
                    <>
                        {filter.tableLabel} <b>{filter.label}</b>
                    </>
                }
                onClick={handleClick}
                onFocus={handleFocus}
                roleStructure="listoption"
            />
        );
    };

    return (
        <ConfigureFilterWrapper>
            <div style={{ marginBottom: 10 }}>
                {field.tableLabel} <Title>{field.label}</Title>
            </div>

            <Tabs selectedTabId={selectedTabId} onChange={onTabChange}>
                <Tab
                    id="settings"
                    title="Settings"
                    panel={
                        <InputsWrapper>
                            <HTMLSelect
                                fill
                                onChange={(e) =>
                                    setInternalFilterRule((prevState) =>
                                        getFilterRuleWithDefaultValue(field, {
                                            ...prevState,
                                            operator: e.target
                                                .value as FilterRule['operator'],
                                        }),
                                    )
                                }
                                options={filterConfig.operatorOptions}
                                value={internalFilterRule.operator}
                            />
                            <filterConfig.inputs
                                popoverProps={popoverProps}
                                filterType={filterType}
                                field={field}
                                filterRule={internalFilterRule}
                                onChange={setInternalFilterRule as any}
                            />
                        </InputsWrapper>
                    }
                />

                <Tab
                    id="tiles"
                    title="Tiles"
                    panel={
                        <>
                            <Title>Select tiles to apply filter to</Title>

                            {tilesWithFilters &&
                                Object.values(tilesWithFilters)
                                    .sort(sortByAvailability)
                                    .map((tile) => {
                                        const isApplicable =
                                            applicableTileUuids?.includes(
                                                tile.uuid,
                                            );

                                        const isChecked =
                                            isApplicable &&
                                            !internalFilterRule.tileUuids
                                                ? true
                                                : internalFilterRule.tileUuids?.includes(
                                                      tile.uuid,
                                                  );

                                        return (
                                            <FormGroup key={tile.uuid}>
                                                <Checkbox
                                                    label={tile.name}
                                                    disabled={!isApplicable}
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        handleToggleTile(
                                                            tile.uuid,
                                                            !isChecked,
                                                        );
                                                    }}
                                                />

                                                <div
                                                    style={{
                                                        marginLeft: 24,
                                                    }}
                                                >
                                                    <Select2<FilterableField>
                                                        disabled={!isChecked}
                                                        fill
                                                        filterable={false}
                                                        items={tile.filters
                                                            .filter((f) =>
                                                                typeMatch(
                                                                    f,
                                                                    field,
                                                                ),
                                                            )
                                                            .sort((a, b) =>
                                                                exactMatch(
                                                                    a,
                                                                    field,
                                                                ) &&
                                                                !exactMatch(
                                                                    b,
                                                                    field,
                                                                )
                                                                    ? -1
                                                                    : 1,
                                                            )}
                                                        itemRenderer={
                                                            renderItem
                                                        }
                                                        noResults={
                                                            <MenuItem2
                                                                disabled
                                                                text="No results."
                                                            />
                                                        }
                                                        onItemSelect={(
                                                            item,
                                                        ) => {
                                                            console.log(item);
                                                        }}
                                                        popoverProps={{
                                                            minimal: true,
                                                            matchTargetWidth:
                                                                true,
                                                        }}
                                                    >
                                                        <Button
                                                            minimal
                                                            alignText="left"
                                                            disabled={
                                                                !isChecked
                                                            }
                                                            outlined
                                                            fill
                                                            text={
                                                                isApplicable
                                                                    ? 'Select field'
                                                                    : 'Not applicable'
                                                            }
                                                            rightIcon="caret-down"
                                                            placeholder="Select a film"
                                                        />
                                                    </Select2>
                                                </div>
                                            </FormGroup>
                                        );
                                    })}
                        </>
                    }
                />
            </Tabs>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 24,
                }}
            >
                {onBack && (
                    <SimpleButton small fill={false} onClick={onBack}>
                        Back
                    </SimpleButton>
                )}

                <Button
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
            </div>
        </ConfigureFilterWrapper>
    );
};

export default FilterConfiguration;
