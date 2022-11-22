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
    byFieldExact,
    byType,
    byTypeAndName,
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    fieldId,
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
    tilesWithSavedQuery: Record<string, AvailableFiltersForSavedQuery>;
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
    tilesWithSavedQuery,
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

    const availableFilters = useMemo(
        () =>
            Object.values(tilesWithSavedQuery).filter((tile) =>
                tile.filters.some(byType(field)),
            ),
        [tilesWithSavedQuery, field],
    );

    console.log({ tilesWithSavedQuery });

    const [internalFilterRule, setInternalFilterRule] =
        useState<DashboardFilterRule>(
            filterRule
                ? applyDefaultTileConfigToFilterRule(
                      filterRule,
                      field,
                      tilesWithSavedQuery,
                  )
                : createDashboardFilterRuleFromField(
                      field,
                      tilesWithSavedQuery,
                  ),
        );

    const handleChange = (
        action: FilterActions,
        tileUuid: string,
        filterUuid?: FilterableField,
    ) => {
        const savedQuery = tilesWithSavedQuery[tileUuid];

        setInternalFilterRule((prevState) =>
            produce(prevState, (draftState) => {
                draftState.tileConfigs =
                    draftState.tileConfigs?.filter((tileConfig) => {
                        return tileConfig.tileUuid !== tileUuid;
                    }) || [];

                if (action === FilterActions.ADD) {
                    const filterableField =
                        filterUuid ??
                        savedQuery.filters.find(byFieldExact(field)) ??
                        savedQuery.filters.find(byTypeAndName(field)) ??
                        savedQuery.filters.find(byType(field));

                    if (!filterableField) return draftState;

                    draftState.tileConfigs.push({
                        tileUuid,
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
        const isAApplicable = availableFilters?.some((t) => t.uuid === a.uuid);
        const isBApplicable = availableFilters?.some((t) => t.uuid === b.uuid);

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
                            <Title>
                                Select tiles to apply filter to and which field
                                to filter by
                            </Title>

                            {tilesWithSavedQuery &&
                                Object.entries(tilesWithSavedQuery).map(
                                    ([tileUuid, savedQuery]) => {
                                        // TODO: fix sort
                                        // .sort(sortByAvailability)
                                        const isApplicable = true;
                                        // TODO: fix availability
                                        // availableFilters?.some(
                                        //     (t) => t.uuid === tileUuid,
                                        // );

                                        const tileConfig =
                                            internalFilterRule.tileConfigs?.find(
                                                (t) => t.tileUuid === tileUuid,
                                            );

                                        const isChecked =
                                            isApplicable && !!tileConfig;

                                        const filterableFieldId =
                                            tileConfig?.fieldId;
                                        const filterableField =
                                            savedQuery.filters.find(
                                                (f) =>
                                                    fieldId(f) ===
                                                    filterableFieldId,
                                            );

                                        const sortedItems = savedQuery.filters
                                            .filter(byType(field))
                                            .sort((a, b) =>
                                                byFieldExact(a)(field) &&
                                                !byFieldExact(b)(field)
                                                    ? -1
                                                    : 1,
                                            );

                                        return (
                                            // TODO: extract to component
                                            <FormGroup key={tileUuid}>
                                                <Checkbox
                                                    label={savedQuery.name}
                                                    disabled={!isApplicable}
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        handleChange(
                                                            isChecked
                                                                ? FilterActions.REMOVE
                                                                : FilterActions.ADD,
                                                            tileUuid,
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
                                                                tileUuid,
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
                                    },
                                )}
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
