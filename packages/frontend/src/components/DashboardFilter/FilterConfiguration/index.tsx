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
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromField,
} from '@lightdash/common';
import React, { FC, useMemo, useState } from 'react';
import { useDashboardTilesWithFilters } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { FilterTypeConfig } from '../../common/Filters/configs';
import {
    ApplyFilterButton,
    BackButton,
    ConfigureFilterWrapper,
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
    const { dashboardTiles, dashboardTemporaryFilters } = useDashboardContext();
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

    return (
        <ConfigureFilterWrapper>
            {onBack && (
                <BackButton small fill={false} onClick={onBack}>
                    Back
                </BackButton>
            )}

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

                            {tilesWithFilters &&
                                Object.entries(tilesWithFilters).map(
                                    ([uuid, tile]) => {
                                        return (
                                            <FormGroup key={uuid}>
                                                <Checkbox
                                                    label={tile.name}
                                                    disabled={
                                                        !tile.filters.find(
                                                            (filter) =>
                                                                filter.name ===
                                                                    field.name &&
                                                                filter.table ===
                                                                    field.table,
                                                        )
                                                    }
                                                />
                                            </FormGroup>
                                        );
                                    },
                                )}
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
