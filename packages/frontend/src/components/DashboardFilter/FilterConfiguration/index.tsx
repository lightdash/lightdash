import {
    Checkbox,
    FormGroup,
    HTMLSelect,
    Intent,
    Tab,
    Tabs,
} from '@blueprintjs/core';
import { Classes, Popover2Props } from '@blueprintjs/popover2';
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
import {
    ApplyFilterButton,
    BackButton,
    ConfigureFilterWrapper,
    FieldTitle,
    InputsWrapper,
    Title,
} from './FilterConfiguration.styled';

interface Props {
    field: FilterableField;
    filterRule?: DashboardFilterRule;
    popoverProps?: Popover2Props;
    onSave: (value: DashboardFilterRule) => void;
    onBack?: () => void;
}

const FilterConfiguration: FC<Props> = ({
    field,
    filterRule,
    popoverProps,
    onSave,
    onBack,
}) => {
    const { dashboardTiles } = useDashboardContext();
    const { data: tilesWithFilters } =
        useDashboardTilesWithFilters(dashboardTiles);

    const [internalFilterRule, setInternalFilterRule] =
        useState<DashboardFilterRule>(
            filterRule || createDashboardFilterRuleFromField(field),
        );

    const filterType = field
        ? getFilterTypeFromField(field)
        : FilterType.STRING;

    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    const applicableTileUuids = useMemo(
        () =>
            tilesWithFilters &&
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

    const handleToggleTile = (tileUuid: string, isChecked: boolean) => {
        setInternalFilterRule((prevState) =>
            produce(prevState, (draftState) => {
                if (isChecked) {
                    draftState.tileUuids.push(tileUuid);
                } else {
                    draftState.tileUuids = draftState.tileUuids.filter(
                        (uuid) => uuid !== tileUuid,
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

    return (
        <ConfigureFilterWrapper>
            {onBack && (
                <BackButton small fill={false} onClick={onBack}>
                    Back
                </BackButton>
            )}

            {/* <FieldTitle>{field.label}</FieldTitle> */}

            <Tabs>
                <Tab
                    id="settings"
                    title="Settings"
                    panel={
                        <InputsWrapper>
                            <Title>{field.label}</Title>

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

                            <FormGroup>
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
                                                <Checkbox
                                                    key={tile.uuid}
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
                                            );
                                        })}
                            </FormGroup>
                        </>
                    }
                />
            </Tabs>

            <ApplyFilterButton
                type="submit"
                className={Classes.POPOVER2_DISMISS}
                intent={Intent.PRIMARY}
                text="Apply"
                disabled={
                    ![FilterOperator.NULL, FilterOperator.NOT_NULL].includes(
                        internalFilterRule.operator,
                    ) &&
                    (!internalFilterRule.values ||
                        internalFilterRule.values.length <= 0)
                }
                onClick={() => onSave(internalFilterRule)}
            />
        </ConfigureFilterWrapper>
    );
};

export default FilterConfiguration;
