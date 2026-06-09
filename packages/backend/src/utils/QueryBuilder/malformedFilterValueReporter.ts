import {
    FilterOperator,
    isFilterTarget,
    isMetricFilterTarget,
    type FilterRule,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';

const MAX_PREVIEW_LENGTH = 500;

const getFilterTarget = (filterRule: FilterRule<FilterOperator, unknown>) => {
    if (isMetricFilterTarget(filterRule.target)) {
        return filterRule.target.fieldRef;
    }

    if (isFilterTarget(filterRule.target)) {
        return filterRule.target.fieldId;
    }

    return undefined;
};

const getValuePreview = (value: unknown) => {
    try {
        const serialized = JSON.stringify(value);
        return serialized?.slice(0, MAX_PREVIEW_LENGTH);
    } catch {
        return String(value).slice(0, MAX_PREVIEW_LENGTH);
    }
};

const reportMalformedFilterValue = ({
    filterRule,
    value,
    valueIndex,
}: {
    filterRule: FilterRule<FilterOperator, unknown>;
    value: unknown;
    valueIndex: number;
}) => {
    const target = getFilterTarget(filterRule);
    const valueType = Array.isArray(value) ? 'array' : typeof value;

    Sentry.captureException(new Error('Malformed filter value rendered'), {
        level: 'warning',
        tags: {
            'lightdash.filter.operator': filterRule.operator,
            'lightdash.filter.value_type': valueType,
            ...(target
                ? { 'lightdash.filter.target': target.slice(0, 200) }
                : {}),
        },
        extra: {
            filter: {
                id: filterRule.id,
                target,
                operator: filterRule.operator,
                valueIndex,
                valueType,
                valuesCount: filterRule.values?.length,
                caseSensitive: filterRule.caseSensitive,
                disabled: filterRule.disabled,
                valuePreview: getValuePreview(value),
            },
        },
    });
};

export const reportMalformedFilterValues = (
    filterRule: FilterRule<FilterOperator, unknown>,
) => {
    try {
        if (filterRule.disabled) {
            return;
        }

        // Monitoring only: check whether any filters are using an unexpected value shape.
        // TODO: review these events and decide whether we should enforce stricter filter validation.
        filterRule.values?.forEach((value, valueIndex) => {
            if (
                typeof value === 'object' &&
                value !== null &&
                !(value instanceof Date)
            ) {
                reportMalformedFilterValue({
                    filterRule,
                    value,
                    valueIndex,
                });
            }
        });
    } catch {
        // Best-effort monitoring must never affect query rendering.
    }
};
