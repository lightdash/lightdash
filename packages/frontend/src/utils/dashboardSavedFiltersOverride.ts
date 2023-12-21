import { ConditionalOperator, DashboardFilterRule } from '@lightdash/common';
import isEqual from 'lodash/isEqual';

const noValueRequiredOperators = [
    ConditionalOperator.NULL,
    ConditionalOperator.NOT_NULL,
];

const getDifferences = (
    original: DashboardFilterRule,
    updated: DashboardFilterRule,
): (keyof DashboardFilterRule)[] => {
    return Object.keys(updated).reduce((acc, key) => {
        const typedKey = key as keyof DashboardFilterRule;
        if (
            !original.hasOwnProperty(typedKey) ||
            !isEqual(updated[typedKey], original[typedKey])
        ) {
            acc.push(typedKey);
        }
        return acc;
    }, [] as (keyof DashboardFilterRule)[]);
};

const constructOverrideString = (
    original: DashboardFilterRule,
    updated: DashboardFilterRule,
    diffs: (keyof DashboardFilterRule)[],
): string | null => {
    if (diffs.length === 0) return null;

    let overrideString = `${updated.target.fieldId}.${
        updated.operator || original.operator
    }`;

    if (
        diffs.includes('values') &&
        updated.values &&
        updated.values?.length > 0 &&
        !noValueRequiredOperators.includes(updated.operator)
    ) {
        overrideString += `:${encodeURI(
            Array.isArray(updated.values)
                ? updated.values.join(',')
                : updated.values,
        )}`;
    }

    if (diffs.includes('settings') && updated.settings) {
        overrideString += `;${Object.entries(updated.settings)
            .map(([key, value]) => `${key}:${value}`)
            .join(';')}`;
    }

    return overrideString;
};

/**
 * Creates a subparam for the overrideDashboardSavedFiltersUrlParam
 * @param originalFilter  The original filter
 * @param newFilter    The new filter
 * @returns The subparam string
 */
export const createOverrideDashboardSavedFiltersUrlSubParam = (
    originalFilter: DashboardFilterRule,
    newFilter: DashboardFilterRule,
): string | null => {
    const diffs = getDifferences(originalFilter, newFilter);
    return constructOverrideString(originalFilter, newFilter, diffs);
};
