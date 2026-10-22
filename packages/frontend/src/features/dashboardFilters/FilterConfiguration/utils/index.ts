import {
    assertUnreachable,
    DimensionType,
    FilterOperator,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromItem,
    getFilterTypeFromItemType,
    getItemId,
    isDashboardDataAppTileType,
    isDashboardFieldTarget,
    isRelativeDateFilterOperator,
    isWithValueFilter,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterRule,
    type ResultColumn,
} from '@lightdash/common';
import { produce } from 'immer';
import isEqual from 'lodash/isEqual';

/**
 * Describes the relationship between a filter and a tile based on tileTargets configuration.
 *
 * - 'auto': Filter automatically applies to tiles that have the matching field
 * - 'disabled': Tile is explicitly disabled/excluded from this filter
 * - 'mapped': Tile is explicitly mapped with a specific field configuration
 */
export type FilterTileRelation = 'auto' | 'disabled' | 'mapped';

export const getValidSqlColumnReferences = (
    columns: ReadonlyArray<{ reference?: unknown }>,
): string[] =>
    columns.flatMap(({ reference }) =>
        typeof reference === 'string' ? [reference] : [],
    );

export const getDefaultField = (
    fields: DashboardFilterableField[],
    selectedField: DashboardFilterableField,
) => {
    return (
        fields.find(matchFieldExact(selectedField)) ??
        fields.find(matchFieldByTypeAndName(selectedField)) ??
        fields.find(matchFieldByType(selectedField))
    );
};

// One entry per column name across the SQL chart tiles
export const getUniqueSqlColumns = (
    sqlChartTilesMetadata: Record<string, { columns: ResultColumn[] }>,
): ResultColumn[] => {
    const allColumns = Object.values(sqlChartTilesMetadata).flatMap(
        (tileMetadata) => tileMetadata.columns,
    );
    const uniqueColumnsMap = new Map(
        allColumns.map((column) => [column.reference, column]),
    );
    return Array.from(uniqueColumnsMap.values());
};

// The filter type of a SQL column filter: the column's, else the target's
export const getSqlColumnFilterType = (
    columns: ResultColumn[],
    fieldId: string,
    fallbackType: DimensionType | undefined,
): FilterType => {
    const selectedColumn = columns.find(
        (column) => column.reference === fieldId,
    );
    return getFilterTypeFromItemType(
        selectedColumn?.type ?? fallbackType ?? DimensionType.STRING,
    );
};

/**
 * Gets the relationship between a filter and a tile based on tileTargets configuration.
 *
 * @param filterRule - The filter rule to check
 * @param tileUuid - The tile UUID to check
 * @returns The relationship type and the tileConfig if it exists
 */
export const getFilterTileRelation = (
    filterRule: DashboardFilterRule,
    tileUuid: string,
): {
    relation: FilterTileRelation;
    tileConfig: DashboardFieldTarget | false | undefined;
} => {
    if (!filterRule.tileTargets) {
        return { relation: 'auto', tileConfig: undefined };
    }

    const tileConfig = filterRule.tileTargets[tileUuid];

    if (tileConfig === false) {
        return { relation: 'disabled', tileConfig };
    }

    if (tileConfig && isDashboardFieldTarget(tileConfig)) {
        return { relation: 'mapped', tileConfig };
    }

    // Tile not mentioned in tileTargets - applies automatically
    return { relation: 'auto', tileConfig: undefined };
};

/**
 * Checks if a tile has the filter's target field available.
 */
const tileHasFilterField = (
    filterRule: DashboardFilterRule,
    tile: DashboardTile,
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined,
): boolean => {
    if (!filterableFieldsByTileUuid) return false;
    const tileFields = filterableFieldsByTileUuid[tile.uuid];
    return (
        tileFields?.some(
            (field) => getItemId(field) === filterRule.target.fieldId,
        ) ?? false
    );
};

/**
 * Determines if a filter applies to a specific tile based on tileTargets configuration.
 *
 * tileTargets[uuid] can be:
 * - undefined (not in object): applies by default IF tile has the filter's field
 * - false: explicitly excluded
 * - config object: explicitly included with field mapping
 *
 * @returns true if the filter applies to the tile
 */
export const doesFilterApplyToTile = (
    filterRule: DashboardFilterRule,
    tile: DashboardTile,
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined,
): boolean => {
    const { relation } = getFilterTileRelation(filterRule, tile.uuid);

    switch (relation) {
        case 'auto':
            if (isDashboardDataAppTileType(tile)) return true;

            // Filter automatically applies to tiles that have the field
            return tileHasFilterField(
                filterRule,
                tile,
                filterableFieldsByTileUuid,
            );
        case 'disabled':
            return false;
        case 'mapped':
            return true;
        default:
            return assertUnreachable(
                relation,
                `Unknown filter tile relation: ${relation}`,
            );
    }
};

/**
 * Checks if a filter applies to any tile in the dashboard.
 *
 * @param filterRule - The filter rule to check
 * @param dashboardTiles - All tiles in the dashboard
 * @param filterableFieldsByTileUuid - Map of tile UUID to available filterable fields
 * @returns true if the filter applies to at least one tile
 */
export const doesFilterApplyToAnyTile = (
    filterRule: DashboardFilterRule,
    dashboardTiles: DashboardTile[] | undefined,
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined,
): boolean => {
    return (
        dashboardTiles?.some((tile) =>
            doesFilterApplyToTile(filterRule, tile, filterableFieldsByTileUuid),
        ) ?? false
    );
};

/**
 * Computes which tab UUIDs a filter applies to based on its tileTargets configuration.
 *
 * A filter applies to a tab if:
 * - The tab has at least one tile that supports the filter's field
 * - The tile is not explicitly excluded via tileTargets
 *
 * @param filterRule - The filter rule to check
 * @param dashboardTiles - All tiles in the dashboard
 * @param sortedTabUuids - Tab UUIDs in display order
 * @param filterableFieldsByTileUuid - Map of tile UUID to available filterable fields
 * @returns Array of tab UUIDs where the filter applies to at least one tile
 */
export const getTabsForFilterRule = (
    filterRule: DashboardFilterRule,
    dashboardTiles: DashboardTile[] | undefined,
    sortedTabUuids: string[],
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined,
): string[] => {
    // Find which tabs have tiles targeted by this filter
    const tabsWithTargetedTiles = new Set<string>();
    dashboardTiles?.forEach((tile) => {
        if (!tile.tabUuid) return;

        if (
            doesFilterApplyToTile(filterRule, tile, filterableFieldsByTileUuid)
        ) {
            tabsWithTargetedTiles.add(tile.tabUuid);
        }
    });

    return sortedTabUuids.filter((tabUuid) =>
        tabsWithTargetedTiles.has(tabUuid),
    );
};

export const hasFilterValueSet = (filterRule: DashboardFilterRule) => {
    switch (filterRule.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
        case FilterOperator.IN_PERIOD_TO_DATE:
            return true;
        case FilterOperator.EQUALS:
            return (
                filterRule.includeNull === true ||
                (filterRule.values && filterRule.values.length > 0)
            );
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.LESS_THAN:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.ENDS_WITH:
        case FilterOperator.STARTS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return filterRule.values && filterRule.values.length > 0;
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
            return (
                filterRule.settings &&
                filterRule.settings.unitOfTime &&
                filterRule.values &&
                filterRule.values.length > 0
            );
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return filterRule.settings && filterRule.settings.unitOfTime;
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_BETWEEN:
            return (
                filterRule.values &&
                filterRule.values.length === 2 &&
                filterRule.values.every((val) => val != null && val !== '')
            );
        default:
            return assertUnreachable(filterRule.operator, 'unknown operator');
    }
};

// What every edit of a rule in the configuration goes through before it is kept
export const getFilterRuleWithDisabledState = (
    newFilterRule: DashboardFilterRule,
    isEditMode: boolean,
): DashboardFilterRule => {
    // When a disabled filter has a value set, it should be enabled by setting it to false
    const isNewFilterDisabled =
        newFilterRule.disabled && !hasFilterValueSet(newFilterRule);

    // In view mode: if values cleared and not required, set to "any value"
    const shouldDisableInViewMode =
        !isEditMode &&
        !newFilterRule.required &&
        !hasFilterValueSet(newFilterRule);

    // In edit mode a required filter without a value is valueless
    // by definition (dashboard save normalizes it to disabled),
    // so it must not block Apply by demanding a default value
    const isRequiredWithoutValue =
        isEditMode &&
        (!!newFilterRule.required || !!newFilterRule.requiredGroupId) &&
        !hasFilterValueSet(newFilterRule);

    return {
        ...newFilterRule,
        disabled:
            isNewFilterDisabled ||
            shouldDisableInViewMode ||
            isRequiredWithoutValue,
    };
};

// The rule after choosing another operator in the settings form
export const getFilterRuleWithOperator = (
    filterType: FilterType,
    field: DashboardFilterableField | undefined,
    filterRule: DashboardFilterRule,
    operator: FilterRule['operator'],
): DashboardFilterRule => {
    // Absolute date values are already normalized. Running them through
    // the defaults again can shift timezones.
    const shouldPreserveValues =
        filterType === FilterType.DATE &&
        (filterRule.values?.length ?? 0) > 0 &&
        isWithValueFilter(filterRule.operator) &&
        isWithValueFilter(operator) &&
        !isRelativeDateFilterOperator(filterRule.operator) &&
        !isRelativeDateFilterOperator(operator);

    return shouldPreserveValues
        ? {
              ...filterRule,
              operator,
              settings: undefined,
          }
        : getFilterRuleWithDefaultValue(filterType, field, {
              ...filterRule,
              operator,
          });
};

// The rule after the "Provide default value" switch of the settings form
export const getFilterRuleWithDefaultValueEnabled = (
    filterType: FilterType,
    field: DashboardFilterableField | undefined,
    filterRule: DashboardFilterRule,
    checked: boolean,
): DashboardFilterRule => {
    const newFilter: DashboardFilterRule = {
        ...filterRule,
        disabled: !checked,
        required:
            filterRule.required && !checked
                ? // If the filter is required and the user is disabling it, we should also disable the required flag
                  false
                : filterRule.required,
        // Toggling a default value removes the filter from any requirement rule
        requiredGroupId: undefined,
    };

    return checked
        ? newFilter
        : getFilterRuleWithDefaultValue(filterType, field, newFilter, null);
};

// The rule after the "Required" switch of the settings form
export const getFilterRuleWithRequired = (
    filterType: FilterType,
    field: DashboardFilterableField | undefined,
    filterRule: DashboardFilterRule,
    originalFilterRule: DashboardFilterRule | undefined,
    checked: boolean,
): DashboardFilterRule => {
    // Toggling on restores the saved rule membership if there is one,
    // otherwise it creates a one-member rule; off removes it from its rule.
    const restoredGroupId = checked
        ? originalFilterRule?.requiredGroupId
        : undefined;

    const newFilter: DashboardFilterRule = restoredGroupId
        ? {
              ...filterRule,
              required: false,
              requiredGroupId: restoredGroupId,
              disabled: true,
              values: [],
          }
        : {
              ...filterRule,
              required: checked,
              requiredGroupId: undefined,
          };

    return checked
        ? newFilter
        : getFilterRuleWithDefaultValue(filterType, field, newFilter, null);
};

// The Apply guard of the settings form: no viewer can satisfy this filter
export const isLockedRequiredMissingValue = (
    filterRule: DashboardFilterRule | undefined,
): boolean =>
    !!filterRule?.lockedTabUuids?.length &&
    !!filterRule?.required &&
    !hasFilterValueSet(filterRule);

// The filter type of the rule in the form: its field's, else its SQL column's
export const getFilterRuleFilterType = (
    field: DashboardFilterableField | undefined,
    columns: ResultColumn[],
    filterRule: DashboardFilterRule | undefined,
): FilterType => {
    if (field) {
        return getFilterTypeFromItem(field);
    }

    if (filterRule?.target.fieldId) {
        return getSqlColumnFilterType(
            columns,
            filterRule.target.fieldId,
            filterRule.target.fallbackType,
        );
    }

    return FilterType.STRING;
};

export const isFilterEnabled = (
    filterRule?: DashboardFilterRule,
    isEditMode?: boolean,
    isCreatingNew?: boolean,
) => {
    if (!filterRule) return false;

    const isFilterRuleDisabled = filterRule.disabled;
    if (
        (isFilterRuleDisabled && isEditMode) ||
        (isFilterRuleDisabled && !isCreatingNew)
    ) {
        return true;
    }

    return hasFilterValueSet(filterRule);
};

// Dashboard rules and chart rules share the fields a saved-value comparison
// reads, so scheduler overrides on either resource reuse these helpers.
type RevertableFilterRule = FilterRule & { label?: string };

export const getFilterRuleRevertableObject = (
    filterRule: RevertableFilterRule,
) => {
    return {
        disabled: filterRule.disabled,
        values: filterRule.values,
        includeNull: filterRule.includeNull,
        operator: filterRule.operator,
        settings: filterRule.settings,
        label: filterRule.label,
    };
};

// includeNull is tri-state in stored rules (absent/false/true) but binary in
// behavior, so a comparison must not read undefined vs false as a change.
const getComparableFilterRuleObject = (filterRule: RevertableFilterRule) => ({
    ...getFilterRuleRevertableObject(filterRule),
    includeNull: filterRule.includeNull === true,
});

export const hasSavedFilterValueChanged = (
    originalFilterRule: RevertableFilterRule,
    filterRule: RevertableFilterRule,
) => {
    if (
        originalFilterRule.disabled &&
        filterRule.values === undefined &&
        filterRule.includeNull !== true
    ) {
        return false;
    }

    // FIXME: remove this once we fix Date value serialization.
    // example: with date inputs we get a Date object originally but a string after we save the filter
    const serializedInternalFilterRule = produce(filterRule, (draft) => {
        if (draft.values && draft.values.length > 0) {
            draft.values = draft.values.map((v) =>
                v instanceof Date ? v.toISOString() : v,
            );
        }
    });

    return !isEqual(
        getComparableFilterRuleObject(originalFilterRule),
        getComparableFilterRuleObject(serializedInternalFilterRule),
    );
};
