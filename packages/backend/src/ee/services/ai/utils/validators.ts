import {
    AdditionalMetric,
    assertUnreachable,
    booleanFilterSchema,
    CompiledField,
    convertAdditionalMetric,
    convertAiTableCalcsSchemaToTableCalcs,
    CustomMetricBase,
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
    isTableCalculation,
    MetricType,
    numberFilterSchema,
    renderFilterRuleSql,
    renderFilterRuleSqlFromField,
    renderTableCalculationFilterRuleSql,
    stringFilterSchema,
    SupportedDbtAdapter,
    TableCalcSchema,
    TableCalcsSchema,
    TableCalculation,
    ToolSortField,
    WeekDay,
} from '@lightdash/common';
import Logger from '../../../../logging/logger';
import { populateCustomMetricsSQL } from './populateCustomMetricsSQL';
import { serializeData } from './serializeData';
/**
 * Validate that all selected fields exist in the explore, custom metrics or table calculations
 * @param explore
 * @param selectedFieldIds
 * @param customMetrics
 * @param tableCalculations
 */
export function validateSelectedFieldsExistence(
    explore: Explore,
    selectedFieldIds: string[],
    customMetrics?: (CustomMetricBase | Omit<AdditionalMetric, 'sql'>)[] | null,
    tableCalculations?: TableCalcsSchema | TableCalculation[],
) {
    const exploreFieldIds = getFields(explore).map(getItemId);
    const customMetricIds = customMetrics?.map(getItemId);
    const tableCalculationNames = tableCalculations?.map((tc) => tc.name);
    const nonExploreFields = selectedFieldIds
        .filter((f) => !exploreFieldIds.includes(f))
        .filter((f) => !customMetricIds?.includes(f))
        .filter((f) => !tableCalculationNames?.includes(f));

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
    field: CompiledField | AdditionalMetric | TableCalculation,
) {
    if (!field.type) {
        throw new Error('Field type is required');
    }

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
        } else if (isTableCalculation(field)) {
            renderTableCalculationFilterRuleSql(
                filterRule,
                field,
                // ! The following args are used to actually render the SQL, we don't care about the ouput, just that it doesn't throw
                '"',
                "'",
                (string: string) => string.replaceAll('\\', '\\\\'),
                SupportedDbtAdapter.BIGQUERY,
                WeekDay.SUNDAY,
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
    tableCalculations?: TableCalcsSchema | null,
) {
    const exploreFields = getFields(explore);
    const customMetricFields = populateCustomMetricsSQL(
        customMetrics || [],
        explore,
    );
    const tableCalcFields = tableCalculations
        ? convertAiTableCalcsSchemaToTableCalcs(tableCalculations)
        : [];
    const allFields = [
        ...exploreFields,
        ...customMetricFields,
        ...tableCalcFields,
    ];
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
 * Validate that filter fields match their filter group type:
 * - Dimension filters should only contain dimension fields
 * - Metric filters should only contain metric fields
 * - Custom metric filters should only contain custom metric fields
 * - Table calculation filters should only contain table calculation fields
 * @param explore - The explore containing field definitions
 * @param filters - The filters object containing dimension, metric, and table calculation filter groups
 * @param customMetrics - Custom metrics that may be used in filters
 * @param tableCalculations - Table calculations that may be used in filters
 */
export function validateMetricDimensionFilterPlacement(
    explore: Explore,
    customMetrics: CustomMetricBase[] | null,
    tableCalculations: TableCalcsSchema | null,
    filters?: Filters,
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
    const tableCalcFields = tableCalculations
        ? convertAiTableCalcsSchemaToTableCalcs(tableCalculations)
        : [];
    const allFields = [
        ...exploreFields,
        ...customMetricFields,
        ...tableCalcFields,
    ];
    const allFieldIds = allFields.map(getItemId);
    const errors: string[] = [];

    // Extract filter rules from filter groups
    const dimensionFilterRules = getFilterRulesFromGroup(filters.dimensions);
    const metricFilterRules = getFilterRulesFromGroup(filters.metrics);
    const tableCalcFilterRules = getFilterRulesFromGroup(
        filters.tableCalculations,
    );

    // Check if any dimension filter rules contain metric or table calc fields
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
        } else if (field && isTableCalculation(field)) {
            errors.push(
                `Error: Table calculation field "${rule.target.fieldId}" (${
                    field.displayName || field.name
                }) cannot be used in dimension filters. Table calculations should be placed in table calculation filters instead.

Field Details:
- Field ID: ${rule.target.fieldId}
- Display Name: ${field.displayName || field.name}

FilterRule:
${serializeData(rule, 'json')}`,
            );
        }
    });

    // Check if any metric filter rules contain dimension or table calc fields
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
        } else if (field && isTableCalculation(field)) {
            errors.push(
                `Error: Table calculation field "${rule.target.fieldId}" (${
                    field.displayName || field.name
                }) cannot be used in metric filters. Table calculations should be placed in table calculation filters instead.

Field Details:
- Field ID: ${rule.target.fieldId}
- Display Name: ${field.displayName || field.name}

FilterRule:
${serializeData(rule, 'json')}`,
            );
        }
    });

    // Check if any table calc filter rules contain dimension or metric fields
    tableCalcFilterRules.forEach((rule) => {
        const fieldIndex = allFieldIds.indexOf(rule.target.fieldId);
        const field = allFields[fieldIndex];

        if (field && isDimension(field)) {
            errors.push(
                `Error: Dimension field "${rule.target.fieldId}" (${
                    field.label
                }) cannot be used in table calculation filters. Dimensions should be placed in dimension filters instead.

Field Details:
- Field ID: ${rule.target.fieldId}
- Field Label: ${field.label}
- Field Type: ${field.fieldType}
- Table: ${field.table}

FilterRule:
${serializeData(rule, 'json')}`,
            );
        } else if (field && isMetric(field)) {
            const fieldSource = customMetricFields.includes(field)
                ? 'custom metric'
                : 'explore metric';
            errors.push(
                `Error: Metric field "${rule.target.fieldId}" (${
                    field.label
                }) from ${fieldSource} cannot be used in table calculation filters. Metrics should be placed in metric filters instead.

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

    if (errors.length > 0) {
        const errorMessage = `Invalid field placement in filters:

${errors.join('\n\n')}

Remember:
- Dimension fields (fieldType: "dimension") should only be used in dimension filters
- Metric fields (fieldType: "metric", including custom metrics) should only be used in metric filters
- Table calculation fields should only be used in table calculation filters`;

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
 * @param tableCalculations - Table calculations that may be used in sorts
 */
export function validateSortFieldsAreSelected(
    sorts: ToolSortField[],
    selectedDimensions: string[],
    selectedMetrics: string[],
    customMetrics?: CustomMetricBase[] | null,
    tableCalculations?: TableCalcsSchema,
) {
    if (!sorts || sorts.length === 0) {
        return;
    }

    const customMetricIds = customMetrics?.map(getItemId) || [];
    const tableCalculationNames = tableCalculations?.map((tc) => tc.name) || [];
    const allSelectedFieldIds = [
        ...selectedDimensions,
        ...selectedMetrics,
        ...customMetricIds,
        ...tableCalculationNames,
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
    customMetrics?: CustomMetricBase[] | null,
) {
    const exploreFields = getFields(explore);
    const customMetricsProvided =
        customMetrics?.length && customMetrics.length > 0;
    const customMetricFields = (customMetrics as AdditionalMetric[]) ?? [];
    const allFields = [...exploreFields, ...customMetricFields];
    const errors: string[] = [];

    fieldIds.forEach((fieldId) => {
        const field = allFields.find((f) => getItemId(f) === fieldId);

        if (!field) {
            errors.push(
                `Error: Field with id "${fieldId}" does not exist in the explore or custom metrics.`,
            );
            return;
        }

        const isValidType =
            (expectedEntityType === 'dimension' && isDimension(field)) ||
            (expectedEntityType === 'metric' &&
                (isMetric(field) ||
                    (customMetricsProvided && isAdditionalMetric(field))));

        if (!isValidType) {
            const isCustomMetric = customMetricFields.some(
                (cm) => getItemId(cm) === fieldId,
            );
            const fieldSource = isCustomMetric ? 'custom metric' : 'explore';
            const fieldType =
                'fieldType' in field ? field.fieldType : 'custom metric';

            errors.push(
                `Error: Field "${fieldId}" from ${fieldSource} is a ${fieldType}, but expected a ${expectedEntityType}.

Field Details:
- Field ID: ${fieldId}
- Field Label: ${field.label}
- Field Type: ${fieldType}
- Table: ${field.table}
- Source: ${fieldSource}
- Expected Type: ${expectedEntityType}`,
            );
        }
    });

    if (errors.length > 0) {
        const errorMessage = `Invalid field entity type:

${errors.join('\n\n')}

Available fields:
${exploreFields.map((f) => `- ${getItemId(f)} (${f.fieldType})`).join('\n')}
${customMetricFields
    .map((f) => `- ${getItemId(f)} (custom metric)`)
    .join('\n')}`;

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

// Numeric metric types that support most table calculations
const NUMERIC_METRIC_TYPES: MetricType[] = [
    MetricType.NUMBER,
    MetricType.PERCENTILE,
    MetricType.MEDIAN,
    MetricType.AVERAGE,
    MetricType.COUNT,
    MetricType.COUNT_DISTINCT,
    MetricType.SUM,
    // MIN and MAX can be of non-numeric types, like dates
];

// Table calculation types that require numeric metrics
const NUMERIC_CALCULATION_TYPES: TableCalcSchema['type'][] = [
    'percent_change_from_previous',
    'percent_of_previous_value',
    'percent_of_column_total',
    'running_total',
];

/**
 * Validate table calculations to ensure fieldId and orderBy.fieldId reference valid metrics/custom metrics
 * with compatible types for the calculation being performed
 */
export function validateTableCalculations(
    explore: Explore,
    tableCalcs: TableCalcsSchema,
    selectedMetrics: string[],
    customMetrics: CustomMetricBase[] | null,
) {
    if (!tableCalcs?.length) return;

    const exploreFields = getFields(explore);
    const customMetricFields = customMetrics
        ? populateCustomMetricsSQL(customMetrics, explore)
        : [];
    const customMetricIds = customMetricFields.map(getItemId);
    const allFields = [...exploreFields, ...customMetricFields];
    const errors: string[] = [];

    // Validate orderBy fields exist
    const orderByFieldIds = tableCalcs
        .filter((calc) => 'orderBy' in calc)
        .flatMap((calc) => calc.orderBy.map((order) => order.fieldId));

    if (orderByFieldIds.length > 0) {
        try {
            validateSelectedFieldsExistence(
                explore,
                orderByFieldIds,
                customMetrics,
                tableCalcs,
            );
        } catch (e) {
            errors.push(
                `OrderBy field validation failed: ${getErrorMessage(e)}`,
            );
        }
    }

    // Helper to find field by ID
    const findField = (fieldId: string) =>
        allFields.find((f) => getItemId(f) === fieldId);

    tableCalcs.forEach((tableCalc) => {
        const { fieldId, type, name, displayName } = tableCalc;
        const isSelectedMetric = selectedMetrics.includes(fieldId);
        const isCustomMetric = customMetricIds.includes(fieldId);

        // Check field is selected
        if (!isSelectedMetric && !isCustomMetric) {
            errors.push(
                `Table calculation "${name}" references unselected field "${fieldId}". ` +
                    'The field must be included in metrics or custom metrics.',
            );
            return;
        }

        // Find and validate field
        const field = findField(fieldId);
        if (!field) {
            errors.push(
                `Table calculation "${name}" references non-existent field "${fieldId}".`,
            );
            return;
        }

        // Check field is a metric
        if (!isMetric(field) && !isAdditionalMetric(field)) {
            errors.push(
                `Table calculation "${name}" references "${fieldId}" which is not a metric. ` +
                    'Table calculations can only be applied to metric fields.',
            );
            return;
        }

        // Check type compatibility for numeric calculations
        if (
            NUMERIC_CALCULATION_TYPES.includes(type) &&
            !NUMERIC_METRIC_TYPES.includes(field.type)
        ) {
            errors.push(
                `Table calculation "${name}" of type "${type}" requires a numeric metric, ` +
                    `but field "${fieldId}" has type "${field.type}".`,
            );
        }
    });

    if (errors.length > 0) {
        const errorMessage = `Invalid table calculation configuration:\n\n${errors.join(
            '\n',
        )}`;
        Logger.error(`[AiAgent][Validate Table Calculations] ${errorMessage}`);
        throw new Error(errorMessage);
    }
}
