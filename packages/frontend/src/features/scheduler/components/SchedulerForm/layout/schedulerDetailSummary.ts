import {
    FilterType,
    friendlyName,
    getConditionalRuleLabel,
    getFilterRules,
    isChartScheduler,
    isDashboardScheduler,
    isEmptyDashboardFilterRule,
    ThresholdOperator,
    type DashboardFilterRule,
    type FilterRule,
    type ParametersValuesMap,
    type SchedulerAndTargets,
    type ThresholdOptions,
} from '@lightdash/common'; // pragma: allowlist secret
import i18n from '../../../../../i18n/i18n';

export type ConditionSummary = {
    field: string;
    operator: string;
    value: string;
};

export const THRESHOLD_OPERATOR_KEYS: Record<ThresholdOperator, string> = {
    [ThresholdOperator.GREATER_THAN]: 'thresholdOperators.greaterThan',
    [ThresholdOperator.LESS_THAN]: 'thresholdOperators.lessThan',
    [ThresholdOperator.INCREASED_BY]: 'thresholdOperators.increasedBy',
    [ThresholdOperator.DECREASED_BY]: 'thresholdOperators.decreasedBy',
};

export const getAlertConditionSummaries = (
    thresholds: ThresholdOptions[] | undefined,
): ConditionSummary[] => {
    if (!thresholds?.length) return [];

    return thresholds.map((threshold) => {
        const isPercent =
            threshold.operator === ThresholdOperator.INCREASED_BY ||
            threshold.operator === ThresholdOperator.DECREASED_BY;
        return {
            field: friendlyName(threshold.fieldId),
            operator: THRESHOLD_OPERATOR_KEYS[threshold.operator]
                ? i18n.t(THRESHOLD_OPERATOR_KEYS[threshold.operator], {
                      ns: 'scheduler',
                  })
                : threshold.operator,
            value: `${threshold.value}${isPercent ? '%' : ''}`,
        };
    });
};

const getFilterTargetLabel = (
    rule: FilterRule,
    fallbackLabel?: string | null,
): string => {
    if (fallbackLabel) return fallbackLabel;
    const target = rule.target as { fieldId?: string; fieldRef?: string };
    return friendlyName(target.fieldId ?? target.fieldRef ?? '');
};

const formatFilterRule = (
    rule: FilterRule,
    fallbackLabel?: string | null,
): ConditionSummary => {
    const { field, operator, value } = getConditionalRuleLabel(
        rule,
        rule.settings ? FilterType.DATE : FilterType.STRING,
        getFilterTargetLabel(rule, fallbackLabel),
    );
    return {
        field,
        operator,
        value: value ?? '',
    };
};

const isActiveFilterRule = (rule: FilterRule): boolean =>
    !rule.disabled && !isEmptyDashboardFilterRule(rule);

export const getSchedulerFilterSummaries = (
    scheduler: SchedulerAndTargets,
): ConditionSummary[] => {
    if (isDashboardScheduler(scheduler) && Array.isArray(scheduler.filters)) {
        return scheduler.filters
            .filter(isActiveFilterRule)
            .map((rule: DashboardFilterRule) =>
                formatFilterRule(rule, rule.label),
            );
    }

    if (
        isChartScheduler(scheduler) &&
        scheduler.filters &&
        !Array.isArray(scheduler.filters)
    ) {
        return getFilterRules(scheduler.filters)
            .filter(isActiveFilterRule)
            .map((rule) => formatFilterRule(rule));
    }

    return [];
};

export const getSchedulerParameterSummaries = (
    parameters: ParametersValuesMap | undefined,
): ConditionSummary[] => {
    if (!parameters) return [];

    return Object.entries(parameters).map(([key, value]) => ({
        field: friendlyName(key),
        operator: i18n.t('detail.parameterOperator', { ns: 'scheduler' }),
        value: Array.isArray(value) ? value.join(', ') : String(value),
    }));
};
