import {
    interpolateUiString,
    isEmptyDashboardFilterRule,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type UiStringResolver,
} from '@lightdash/common';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import {
    getFilterRuleLabels,
    showsComposedFilterValue,
} from '../dashboardFilters/ActiveFilters/filterLabels';
import { getTruncatedValuesDisplay } from '../dashboardFilters/ActiveFilters/utils';
import { formatFieldCount, formatTileCount } from './fieldLabels';

// The name and value a pill shows, as one line of text
export const getFilterRuleSummary = (
    rule: DashboardFilterRule,
    field: DashboardFilterableField | undefined,
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>,
    getUiString: UiStringResolver,
): { name: string; value: string } => {
    const labels = getFilterRuleLabels(
        rule,
        field,
        sqlChartTilesMetadata,
        getUiString,
    );
    const name = rule.label || labels.field;
    if (rule.disabled || (!rule.required && isEmptyDashboardFilterRule(rule)))
        return { name, value: getUiString('filters.isAnyValue') };
    const truncated = getTruncatedValuesDisplay(
        rule.values,
        showsComposedFilterValue(field?.type, rule.target.fallbackType),
        rule.operator,
    );
    const values =
        truncated.displayedValues.length > 0
            ? truncated.displayedValues.join(', ')
            : labels.value;
    const more = truncated.hasMore
        ? ` +${truncated.additionalValues.length}`
        : '';
    return {
        name,
        value: `${[labels.operator, values].filter(Boolean).join(' ')}${more}`,
    };
};

export type LockState =
    | { hasTabs: false; isLocked: boolean }
    | { hasTabs: true; lockedTabNames: string[]; tabCount: number };

/** Null when the filter is locked nowhere. */
export const getLockSummary = (lock: LockState): string | null => {
    if (!lock.hasTabs) return lock.isLocked ? 'Locked' : null;
    const { lockedTabNames, tabCount } = lock;
    if (lockedTabNames.length === 0) return null;
    if (lockedTabNames.length === tabCount) return 'Locked';
    if (lockedTabNames.length === 1) return `Locked on ${lockedTabNames[0]}`;
    return `Locked on ${lockedTabNames.length} tabs`;
};

/** Null when the filter is not required. */
export const getRequiredSummary = (
    isRequired: boolean,
    alternativeLabels: string[],
): string | null => {
    if (!isRequired) return null;
    return alternativeLabels.length > 0
        ? `Required, or ${alternativeLabels.join(' or ')}`
        : 'Required';
};

export const getTilesSummary = (
    tileCount: number,
    fieldCount: number,
    getUiString: UiStringResolver,
) =>
    interpolateUiString(getUiString('filters.rail.tilesSummary'), {
        tiles: formatTileCount(getUiString, tileCount),
        fields: formatFieldCount(getUiString, fieldCount),
    });
