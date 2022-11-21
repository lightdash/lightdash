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
import { Select2 } from '@blueprintjs/select';
import {
    applyDefaultTileConfigToFilterRule,
    AvailableFiltersForSavedQuery,
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    fieldId,
    fieldMatchExact,
    fieldMatchType,
    fieldMatchTypeAndName,
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromField,
} from '@lightdash/common';
import produce from 'immer';
import { FC, useMemo, useState } from 'react';
import { FilterTypeConfig } from '../../common/Filters/configs';
import {
    FieldIcon,
    FieldLabel,
    renderItem,
} from '../../common/Filters/FieldAutoComplete';
import SimpleButton from '../../common/SimpleButton';
import {
    ConfigureFilterWrapper,
    InputsWrapper,
    Title,
} from './FilterConfiguration.styled';

enum FilterActions {
    ADD = 'add',
    REMOVE = 'remove',
}

export enum FilterTabs {
    SETTINGS = 'settings',
    TILES = 'tiles',
}

const DEFAULT_TAB = FilterTabs.SETTINGS;

interface Props {
    field: FilterableField;
    tilesWithFilters: Record<string, AvailableFiltersForSavedQuery>;
    filterRule?: DashboardFilterRule;
    popoverProps?: Popover2Props;
    selectedTabId?: string;
    onTabChange: (tabId: FilterTabs) => void;
    onSave: (value: DashboardFilterRule) => void;
    onBack?: () => void;
}

const FilterConfiguration: FC<Props> = ({
    selectedTabId = DEFAULT_TAB,
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

    const applicableTiles = useMemo(
        () =>
            Object.values(tilesWithFilters).filter((tile) =>
                tile.filters.some(fieldMatchType(field)),
            ),
        [tilesWithFilters, field],
    );

    const [internalFilterRule, setInternalFilterRule] =
        useState<DashboardFilterRule>(
            filterRule
                ? applyDefaultTileConfigToFilterRule(
                      filterRule,
                      field,
                      applicableTiles,
                  )
                : createDashboardFilterRuleFromField(field, applicableTiles),
        );

    const handleChange = (
        action: FilterActions,
        tile: AvailableFiltersForSavedQuery,
        filterUuid?: FilterableField,
    ) => {
        setInternalFilterRule((prevState) =>
            produce(prevState, (draftState) => {
                draftState.tileConfigs =
                    draftState.tileConfigs?.filter((tileConfig) => {
                        return tileConfig.tileUuid !== tile.uuid;
                    }) || [];

                if (action === FilterActions.ADD) {
                    const filterableField =
                        filterUuid ??
                        tile.filters.find(fieldMatchExact(field)) ??
                        tile.filters.find(fieldMatchTypeAndName(field)) ??
                        tile.filters.find(fieldMatchType(field));

                    if (!filterableField) return draftState;

                    draftState.tileConfigs.push({
                        tileUuid: tile.uuid,
                        fieldId: fieldId(filterableField),
                    });
                }
            }),
        );
    };

    const sortByAvailability = (
        a: AvailableFiltersForSavedQuery,
        b: AvailableFiltersForSavedQuery,
    ) => {
        const isAApplicable = applicableTiles?.some((t) => t.uuid === a.uuid);
        const isBApplicable = applicableTiles?.some((t) => t.uuid === b.uuid);

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
            {/* TODO: styled? */}
            <div style={{ marginBottom: 10 }}>
                <FieldLabel item={field} />
            </div>

            <Tabs
                selectedTabId={selectedTabId}
                onChange={onTabChange}
                renderActiveTabPanelOnly
            >
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
                                            applicableTiles?.some(
                                                (t) => t.uuid === tile.uuid,
                                            );

                                        const tileConfig =
                                            internalFilterRule.tileConfigs?.find(
                                                (t) => t.tileUuid === tile.uuid,
                                            );

                                        const isChecked =
                                            isApplicable && !!tileConfig;

                                        const filterableFieldId =
                                            tileConfig?.fieldId;
                                        const filterableField =
                                            tile.filters.find(
                                                (f) =>
                                                    fieldId(f) ===
                                                    filterableFieldId,
                                            );

                                        const sortedItems = tile.filters
                                            .filter(fieldMatchType(field))
                                            .sort((a, b) =>
                                                fieldMatchExact(a)(field) &&
                                                !fieldMatchExact(b)(field)
                                                    ? -1
                                                    : 1,
                                            );

                                        return (
                                            <FormGroup key={tile.uuid}>
                                                <Checkbox
                                                    label={tile.name}
                                                    disabled={!isApplicable}
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        handleChange(
                                                            isChecked
                                                                ? FilterActions.REMOVE
                                                                : FilterActions.ADD,
                                                            tile,
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
                                                        items={sortedItems}
                                                        itemRenderer={
                                                            renderItem
                                                        }
                                                        noResults={
                                                            <MenuItem2
                                                                disabled
                                                                text="No results."
                                                            />
                                                        }
                                                        activeItem={
                                                            filterableField
                                                        }
                                                        onItemSelect={(
                                                            newFilterableField,
                                                        ) => {
                                                            handleChange(
                                                                FilterActions.ADD,
                                                                tile,
                                                                newFilterableField,
                                                            );
                                                        }}
                                                        popoverProps={{
                                                            minimal: true,
                                                            matchTargetWidth:
                                                                true,
                                                            captureDismiss:
                                                                !popoverProps?.isOpen,
                                                            canEscapeKeyClose:
                                                                !popoverProps?.isOpen,
                                                            ...popoverProps,
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
                                                            icon={
                                                                filterableField && (
                                                                    <FieldIcon
                                                                        item={
                                                                            filterableField
                                                                        }
                                                                    />
                                                                )
                                                            }
                                                            text={
                                                                isApplicable ? (
                                                                    filterableField ? (
                                                                        <FieldLabel
                                                                            item={
                                                                                filterableField
                                                                            }
                                                                        />
                                                                    ) : (
                                                                        'Select field'
                                                                    )
                                                                ) : (
                                                                    'Not applicable'
                                                                )
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

            {/* TODO: style */}
            <div
                style={{
                    display: 'flex',
                    marginTop: 24,
                }}
            >
                {onBack && (
                    <SimpleButton small fill={false} onClick={onBack}>
                        Back
                    </SimpleButton>
                )}

                {/* TODO: style */}
                <Button
                    style={{
                        marginLeft: 'auto',
                    }}
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
