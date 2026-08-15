import {
    FilterType,
    friendlyName,
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
    getFilterExpression,
    isEmptyDashboardFilterRule,
    isFilterableItem,
    isFilterExpression,
    type FilterExpression,
    type FilterRule,
    type Filters,
    type ItemsMap,
} from '@lightdash/common';

export const NO_ACTIVE_FILTERS_MESSAGE = 'No active filters applied';

const formatRule = (rule: FilterRule, itemMap: ItemsMap): string => {
    const fieldId = 'fieldId' in rule.target ? rule.target.fieldId : '';
    const item = itemMap[fieldId];
    const { field, operator, value } =
        item && isFilterableItem(item)
            ? getConditionalRuleLabelFromItem(rule, item)
            : getConditionalRuleLabel(
                  rule,
                  rule.settings ? FilterType.DATE : FilterType.STRING,
                  friendlyName(fieldId),
              );
    return [field, operator, value]
        .filter((part) => part !== undefined && part !== '')
        .join(' ');
};

const formatExpression = (
    filterExpression: FilterExpression,
    itemMap: ItemsMap,
    nested = false,
): string => {
    const operator = filterExpression.operator.toUpperCase();
    const expressions = filterExpression.items.map((item) => {
        if (isFilterExpression(item)) {
            return formatExpression(item, itemMap, true);
        }

        return formatRule(item, itemMap);
    });

    const expression = expressions.join(` ${operator} `);
    return nested && expressions.length > 1 ? `(${expression})` : expression;
};

export const buildGoogleSheetsFilterSummaryRows = (
    filters: Filters | undefined,
    itemMap: ItemsMap,
): string[][] => {
    const filterExpression = filters
        ? getFilterExpression(
              filters,
              (rule) =>
                  rule.disabled !== true && !isEmptyDashboardFilterRule(rule),
          )
        : undefined;
    const summary = filterExpression
        ? formatExpression(filterExpression, itemMap)
        : NO_ACTIVE_FILTERS_MESSAGE;

    return [['Active filters'], [summary], []];
};
