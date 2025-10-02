import {
    AdditionalMetric,
    assertUnreachable,
    booleanFilterSchema,
    CompiledField,
    convertAdditionalMetric,
    dateFilterSchema,
    Explore,
    FilterRule,
    Filters,
    FilterType,
    getCustomMetricType,
    getErrorMessage,
    getFields,
    getFilterRulesFromGroup,
    getFilterTypeFromItemType,
    getItemId,
    isAdditionalMetric,
    isDimension,
    isMetric,
    numberFilterSchema,
    renderFilterRuleSql,
    renderFilterRuleSqlFromField,
    stringFilterSchema,
    SupportedDbtAdapter,
    ToolSortField,
    WeekDay,
    type CustomMetricBase,
} from '@lightdash/common';
import Logger from '../../../../logging/logger';
import { populateCustomMetricsSQL } from './populateCustomMetricsSQL';
import { serializeData } from './serializeData';
/**
 * Validate that all selected fields exist in the explore
 * @param explore
 * @param selectedFieldIds
 */
export function validateSelectedFieldsExistence(
    explore: Explore,
    selectedFieldIds: string[],
    customMetrics?: (CustomMetricBase | Omit<AdditionalMetric, 'sql'>)[] | null,
) {
    const exploreFieldIds = getFields(explore).map(getItemId);
    const customMetricIds = customMetrics?.map(getItemId);
    const nonExploreFields = selectedFieldIds
        .filter((f) => !exploreFieldIds.includes(f))
        .filter((f) => !customMetricIds?.includes(f));

    if (nonExploreFields.length) {
        const errorMessage = `The following fields are neither in the explore nor in the custom metrics.

Fields:
\`\`\`json
${nonExploreFields.join('\n')}
\`\`\``;

        Logger.error(
            `[AiAgent][Validate Selected Fields Existence] ${errorMessage}`,
        );

        throw new Error(errorMessage);
    }
}

/**
 * Validate that the custom metrics have a base dimension name that exists in the explore
 * Checks:
 * - The base dimension name exists in the explore
 * - The base dimension name is a dimension in the explore
 * - The base dimension name has the same sql as the custom metric
 * @param explore
 * @param customMetrics
 */
export function validateCustomMetricsDefinition(
    explore: Explore,
    customMetrics: CustomMetricBase[] | null,
) {
    if (!customMetrics || customMetrics.length === 0) {
        return;
    }
    const exploreFields = getFields(explore);
    const errors: string[] = [];

    customMetrics.forEach((metric) => {
        if (!metric.baseDimensionName) {
            errors.push(
                `Error: the base dimension name is required for custom metrics.`,
            );
            return;
        }

        const field = exploreFields.find(
            (f) =>
                metric.baseDimensionName &&
                getItemId(f) ===
                    getItemId({
                        name: metric.baseDimensionName,
                        table: metric.table,
                    }),
        );

        if (!field) {
            errors.push(
                `Error: the base dimension name "${metric.baseDimensionName}" does not exist in the explore.`,
            );
            return;
        }

        if (!isDimension(field)) {
            errors.push(
                `Error: the base dimension name "${metric.baseDimensionName}" is not a dimension in the explore.`,
            );
            return;
        }

        // Check type compatibility between metric type and field type (e.g. average on string is not allowed)
        if (metric.type && field.type) {
            const isCompatible = getCustomMetricType(field.type).includes(
                metric.type,
            );
            if (!isCompatible) {
                errors.push(
                    `Error: cannot apply ${metric.type} aggregation to ${field.type} dimension "${metric.baseDimensionName}".`,
                );
            }
        }
    });
    if (errors.length > 0) {
        const errorMessage = `The following custom metrics are invalid:
        Errors:
        ${errors.join('\n\n')}
        Remember:
        - Custom metrics should have a base dimension name
        - The aggregation type must be compatible with the dimension's data type`;
        Logger.error(
            `[AiAgent][Validate Custom Metric Definition] ${errorMessage}`,
        );
        throw new Error(errorMessage);
    }
}

function validateFilterRule(
    filterRule: FilterRule,
    field: CompiledField | AdditionalMetric,
) {
    const filterType = getFilterTypeFromItemType(field.type);

    switch (filterType) {
        case FilterType.BOOLEAN:
            const parsedBooleanFilterRule = booleanFilterSchema.safeParse({
                fieldId: filterRule.target.fieldId,
                fieldType: field.type,
                fieldFilterType: 'boolean',
                operator: filterRule.operator,
                values: filterRule.values,
            });

            if (!parsedBooleanFilterRule.success) {
                throw new Error(
                    `Expected boolean filter rule for field ${filterRule.target.fieldId}. Error: ${parsedBooleanFilterRule.error.message}`,
                );
            }

            break;
        case FilterType.DATE:
            const parsedDateFilterRule = dateFilterSchema.safeParse({
                fieldId: filterRule.target.fieldId,
                fieldType: field.type,
                fieldFilterType: 'date',
                operator: filterRule.operator,
                values: filterRule.values,
                settings: filterRule.settings,
            });

            if (!parsedDateFilterRule.success) {
                throw new Error(
                    `Expected date filter rule for field ${filterRule.target.fieldId}. Error: ${parsedDateFilterRule.error.message}`,
                );
            }

            break;
        case FilterType.NUMBER:
            const parsedNumberFilterRule = numberFilterSchema.safeParse({
                fieldId: filterRule.target.fieldId,
                fieldType: field.type,
                fieldFilterType: 'number',
                operator: filterRule.operator,
                values: filterRule.values,
            });

            if (!parsedNumberFilterRule.success) {
                throw new Error(
                    `Expected number filter rule for field ${filterRule.target.fieldId}. Error: ${parsedNumberFilterRule.error.message}`,
                );
            }

            break;
        case FilterType.STRING:
            const parsedStringFilterRule = stringFilterSchema.safeParse({
                fieldId: filterRule.target.fieldId,
                fieldType: field.type,
                fieldFilterType: 'string',
                operator: filterRule.operator,
                values: filterRule.values,
            });

            if (!parsedStringFilterRule.success) {
                throw new Error(
                    `Expected string filter rule for field ${filterRule.target.fieldId}. Error: ${parsedStringFilterRule.error.message}`,
                );
            }

            break;
        default:
            assertUnreachable(filterType, `Invalid field type: ${filterType}`);
    }

    try {
        if (isAdditionalMetric(field)) {
            renderFilterRuleSql(
                filterRule,
                field.type,
                field.sql,
                // ! The following args are used to actually render the SQL, we don't care about the ouput, just that it doesn't throw
                '"',
                (string: string) => string.replaceAll('\\', '\\\\'),
                WeekDay.SUNDAY,
                SupportedDbtAdapter.BIGQUERY,
            );
        } else {
            renderFilterRuleSqlFromField(
                filterRule,
                field,
                // ! The following args are used to actually render the SQL, we don't care about the ouput, just that it doesn't throw
                '"',
                "'",
                (string: string) => string.replaceAll('\\', '\\\\'),
                WeekDay.SUNDAY,
                SupportedDbtAdapter.BIGQUERY,
            );
        }
    } catch (e) {
        const errorMessage = `Error: ${getErrorMessage(e)}

Filter Rule:
${serializeData(filterRule, 'json')}`;

        Logger.error(`[AiAgent][Validate Filter Rule] ${errorMessage}`);

        throw new Error(errorMessage);
    }
}

export function validateFilterRules(
    explore: Explore,
    filterRules: FilterRule[],
    customMetrics?: CustomMetricBase[] | null,
) {
    const exploreFields = getFields(explore);
    const customMetricFields = populateCustomMetricsSQL(
        customMetrics || [],
        explore,
    );
    const allFields = [...exploreFields, ...customMetricFields];
    const allFieldIds = allFields.map(getItemId);
    const filterRuleErrors: string[] = [];

    filterRules.forEach((rule) => {
        const fieldIndex = allFieldIds.indexOf(rule.target.fieldId);
        const field = allFields[fieldIndex];

        if (!field) {
            filterRuleErrors.push(
                `Error: the field with id "${
                    rule.target.fieldId
                }" does not exist.
FilterRule:
${serializeData(rule, 'json')}`,
            );
            return;
        }

        try {
            validateFilterRule(rule, field);
        } catch (e) {
            filterRuleErrors.push(getErrorMessage(e));
        }
    });

    if (filterRuleErrors.length) {
        const filterRuleErrorStrings = filterRuleErrors
            .map((e) => `<filterRuleError>${e}</filterRuleError>`)
            .join('\n');

        const errorMessage = `The following filter rules are invalid:

Errors:
${filterRuleErrorStrings}`;

        Logger.error(`[AiAgent][Validate Filter Rules] ${errorMessage}`);

        throw new Error(errorMessage);
    }
}

/**
 * Validate that metrics are not placed in dimension filters and vice versa
 * @param explore - The explore containing field definitions
 * @param filters - The filters object containing dimension and metric filter groups
 * @param customMetrics - Custom metrics that may be used in filters
 */
export function validateMetricDimensionFilterPlacement(
    explore: Explore,
    filters?: Filters,
    customMetrics?: CustomMetricBase[] | null,
) {
    if (!filters) return;

    const exploreFields = getFields(explore);
    const customMetricFields = customMetrics
        ? populateCustomMetricsSQL(customMetrics, explore).map((metric) =>
              convertAdditionalMetric({
                  additionalMetric: metric,
                  table: explore.tables[metric.table],
              }),
          )
        : [];
    const allFields = [...exploreFields, ...customMetricFields];
    const allFieldIds = allFields.map(getItemId);
    const errors: string[] = [];

    // Extract filter rules from filter groups
    const dimensionFilterRules = getFilterRulesFromGroup(filters.dimensions);
    const metricFilterRules = getFilterRulesFromGroup(filters.metrics);

    // Check if any dimension filter rules contain metric fields
    dimensionFilterRules.forEach((rule) => {
        const fieldIndex = allFieldIds.indexOf(rule.target.fieldId);
        const field = allFields[fieldIndex];

        if (field && isMetric(field)) {
            const fieldSource = customMetricFields.includes(field)
                ? 'custom metric'
                : 'explore metric';
            errors.push(
                `Error: Metric field "${rule.target.fieldId}" (${
                    field.label
                }) from ${fieldSource} cannot be used in dimension filters. Metrics should be placed in metric filters instead.

Field Details:
- Field ID: ${rule.target.fieldId}
- Field Label: ${field.label}
- Field Type: ${field.fieldType}
- Table: ${field.table}
- Source: ${fieldSource}

FilterRule:
${serializeData(rule, 'json')}`,
            );
        }
    });

    // Check if any metric filter rules contain dimension fields
    metricFilterRules.forEach((rule) => {
        const fieldIndex = allFieldIds.indexOf(rule.target.fieldId);
        const field = allFields[fieldIndex];

        if (field && isDimension(field)) {
            errors.push(
                `Error: Dimension field "${rule.target.fieldId}" (${
                    field.label
                }) cannot be used in metric filters. Dimensions should be placed in dimension filters instead.

Field Details:
- Field ID: ${rule.target.fieldId}
- Field Label: ${field.label}
- Field Type: ${field.fieldType}
- Table: ${field.table}

FilterRule:
${serializeData(rule, 'json')}`,
            );
        }
    });

    if (errors.length > 0) {
        const errorMessage = `Invalid field placement in filters:

${errors.join('\n\n')}

Remember:
- Dimension fields (fieldType: "dimension") should only be used in dimension filters
- Metric fields (fieldType: "metric", including custom metrics) should only be used in metric filters`;

        Logger.error(
            `[AiAgent][Validate Metric/Dimension Filter Placement] ${errorMessage}`,
        );

        throw new Error(errorMessage);
    }
}

/**
 * Validate that all sort fields are selected in either dimensions or metrics
 * @param sorts - Array of sort field configurations
 * @param selectedDimensions - Array of selected dimension field IDs
 * @param selectedMetrics - Array of selected metric field IDs
 * @param customMetrics - Custom metrics that may be used in sorts
 */
export function validateSortFieldsAreSelected(
    sorts: ToolSortField[],
    selectedDimensions: string[],
    selectedMetrics: string[],
    customMetrics?: CustomMetricBase[] | null,
) {
    if (!sorts || sorts.length === 0) {
        return;
    }

    const customMetricIds = customMetrics?.map(getItemId) || [];
    const allSelectedFieldIds = [
        ...selectedDimensions,
        ...selectedMetrics,
        ...customMetricIds,
    ];

    const errors: string[] = [];

    sorts.forEach((sort) => {
        if (!allSelectedFieldIds.includes(sort.fieldId)) {
            const isCustomMetric = customMetricIds.includes(sort.fieldId);
            const fieldSource = isCustomMetric ? 'custom metric' : 'field';

            errors.push(
                `Error: Sort field "${sort.fieldId}" is not selected in the query. The ${fieldSource} must be included in either dimensions or metrics to be used for sorting.`,
            );
        }
    });

    if (errors.length > 0) {
        const errorMessage = `Invalid sort configuration:

${errors.join('\n\n')}`;

        Logger.error(
            `[AiAgent][Validate Sort Fields Are Selected] ${errorMessage}`,
        );

        throw new Error(errorMessage);
    }
}

/**
 * Validate that fields exist and match the expected entity type
 * @param explore - The explore containing field definitions
 * @param fieldIds - Array of field IDs to validate
 * @param expectedEntityType - The expected entity type ('dimension' or 'metric')
 */
export function validateFieldEntityType(
    explore: Explore,
    fieldIds: string[],
    expectedEntityType: 'dimension' | 'metric',
) {
    const exploreFields = getFields(explore);
    const errors: string[] = [];

    fieldIds.forEach((fieldId) => {
        const field = exploreFields.find((f) => getItemId(f) === fieldId);

        if (!field) {
            errors.push(
                `Error: Field with id "${fieldId}" does not exist in the explore.`,
            );
            return;
        }

        const isValidType =
            (expectedEntityType === 'dimension' && isDimension(field)) ||
            (expectedEntityType === 'metric' && isMetric(field));

        if (!isValidType) {
            errors.push(
                `Error: Field "${fieldId}" is a ${field.fieldType}, but expected a ${expectedEntityType}.

Field Details:
- Field ID: ${fieldId}
- Field Label: ${field.label}
- Field Type: ${field.fieldType}
- Table: ${field.table}
- Expected Type: ${expectedEntityType}`,
            );
        }
    });

    if (errors.length > 0) {
        const errorMessage = `Invalid field entity type:

${errors.join('\n\n')}

Available fields:
${exploreFields.map((f) => `- ${getItemId(f)} (${f.fieldType})`).join('\n')}`;

        Logger.error(`[AiAgent][Validate Field Entity Type] ${errorMessage}`);

        throw new Error(errorMessage);
    }
}

/**
 * Validate that table names exist in the explore
 * @param explore - The explore containing table definitions
 * @param tableNames - Array of table names to validate
 */
export function validateTableNames(explore: Explore, tableNames: string[]) {
    const availableTableNames = Object.keys(explore.tables);
    const errors: string[] = [];

    tableNames.forEach((tableName) => {
        if (!availableTableNames.includes(tableName)) {
            errors.push(
                `Error: Table "${tableName}" does not exist in the explore.`,
            );
        }
    });

    if (errors.length > 0) {
        const errorMessage = `Invalid table names:

${errors.join('\n\n')}

Available tables:
${availableTableNames.map((t) => `- ${t}`).join('\n')}`;

        Logger.error(`[AiAgent][Validate Table Names] ${errorMessage}`);

        throw new Error(errorMessage);
    }
}
