import {
    AdditionalMetric,
    assertUnreachable,
    booleanFilterSchema,
    CompiledField,
    convertAdditionalMetric,
    convertAiTableCalcsSchemaToTableCalcs,
    CustomMetricBase,
    dateFilterSchema,
    DependencyNode,
    detectCircularDependencies,
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
    nullaryWindowFunctions,
    numberFilterSchema,
    renderFilterRuleSql,
    renderFilterRuleSqlFromField,
    renderTableCalculationFilterRuleSql,
    stringFilterSchema,
    SupportedDbtAdapter,
    TableCalcSchema,
    TableCalcsSchema,
    TableCalculation,
    ToolRunQueryArgsTransformed,
    ToolSortField,
    WeekDay,
    WindowFunctionType,
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

/**
 * Validate that an explore name exists in the list of available explores
 * @param availableExploreNames - Array of available explore names
 * @param exploreName - The explore name to validate
 */
export function validateExploreNameExists(
    availableExplores: Explore[],
    exploreName: string,
) {
    if (availableExplores.some((e) => e.name === exploreName)) return;

    const errorMessage = `Invalid explore name: "${exploreName}"

Available explores:
${availableExplores.map((e) => `- ${e.name}`).join('\n')}`;

    Logger.error(`[AiAgent][Validate Explore Name Exists] ${errorMessage}`);

    throw new Error(errorMessage);
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

function buildTableCalcSchemaDependencyGraph(
    tableCalcs: TableCalcsSchema,
): DependencyNode[] {
    if (!tableCalcs) return [];

    return tableCalcs.map((tc) => {
        const deps: string[] = [];

        // Add fieldId dependency if it exists
        if ('fieldId' in tc && tc.fieldId !== null) {
            deps.push(tc.fieldId);
        }

        // Add orderBy dependencies
        if ('orderBy' in tc && tc.orderBy !== null) {
            deps.push(...tc.orderBy.map((ob) => ob.fieldId));
        }

        // Add partitionBy dependencies
        if ('partitionBy' in tc && tc.partitionBy !== null) {
            deps.push(...tc.partitionBy);
        }

        return { name: tc.name, dependencies: deps };
    });
}

/**
 * Validate table calculations to ensure fieldId and orderBy.fieldId reference valid metrics/custom metrics
 * with compatible types for the calculation being performed, and that all referenced fields are selected
 */
export function validateTableCalculations(
    explore: Explore,
    tableCalcs: TableCalcsSchema,
    selectedDimensions: string[],
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
    const getTableCalcValidationError = (errs: string | string[]) =>
        `Invalid table calculation configuration:\n\n${
            Array.isArray(errs) ? errs.join('\n') : errs
        }`;

    // Check for circular dependencies
    const dependencies = buildTableCalcSchemaDependencyGraph(tableCalcs);
    try {
        detectCircularDependencies(dependencies, 'table calculations');
    } catch (e) {
        throw new Error(getTableCalcValidationError(getErrorMessage(e)));
    }

    // Collect orderBy fields with their calc names for validation
    const orderByFields = tableCalcs.flatMap((calc) => {
        if ('orderBy' in calc && calc.orderBy !== null) {
            return calc.orderBy.map((order) => ({
                fieldId: order.fieldId,
                calcName: calc.name,
            }));
        }
        return [];
    });

    // Collect partitionBy fields with their calc names for validation
    const partitionByFields = tableCalcs.flatMap((calc) => {
        if ('partitionBy' in calc && calc.partitionBy !== null) {
            return calc.partitionBy.map((fieldId) => ({
                fieldId,
                calcName: calc.name,
            }));
        }
        return [];
    });

    // Validate orderBy fields exist in explore/custom metrics/table calcs
    const orderByFieldIds = orderByFields.map((f) => f.fieldId);
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

    // Validate partitionBy fields exist in explore/custom metrics/table calcs
    const partitionByFieldIds = partitionByFields.map((f) => f.fieldId);
    if (partitionByFieldIds.length > 0) {
        try {
            validateSelectedFieldsExistence(
                explore,
                partitionByFieldIds,
                customMetrics,
                tableCalcs,
            );
        } catch (e) {
            errors.push(getErrorMessage(e));
        }
    }

    // Validate that partitionBy and orderBy fields are selected in the query
    // (not just that they exist in the explore)
    const tableCalculationNames = tableCalcs.map((tc) => tc.name);
    const allSelectedFieldIds = [
        ...selectedDimensions,
        ...selectedMetrics,
        ...customMetricIds,
        ...tableCalculationNames,
    ];

    // Check orderBy fields are selected
    orderByFields.forEach(({ fieldId, calcName }) => {
        if (!allSelectedFieldIds.includes(fieldId)) {
            errors.push(
                `Table calculation "${calcName}" uses orderBy field "${fieldId}" which is not selected in the query. The field must be included in dimensions, metrics, or be another table calculation.`,
            );
        }
    });

    // Check partitionBy fields are selected
    partitionByFields.forEach(({ fieldId, calcName }) => {
        if (!allSelectedFieldIds.includes(fieldId)) {
            errors.push(
                `Table calculation "${calcName}" uses partitionBy field "${fieldId}" which is not selected in the query. The field must be included in dimensions or metrics to be used for partitioning.`,
            );
        }
    });

    const findField = (fieldId: string) =>
        allFields.find((f) => getItemId(f) === fieldId);

    tableCalcs.forEach((tableCalc) => {
        const { type, name } = tableCalc;

        if (type === 'window_function') {
            const needsFieldId = !nullaryWindowFunctions.includes(
                tableCalc.windowFunction,
            );

            if (!needsFieldId) {
                return;
            }

            if (needsFieldId && tableCalc.fieldId === null) {
                errors.push(
                    `Window function "${name}" of type "${tableCalc.windowFunction}" requires a fieldId. ` +
                        'Aggregate window functions (sum, avg, count, min, max) must specify a field to aggregate.',
                );
                return;
            }
        }

        if (tableCalc.fieldId === null) {
            errors.push(
                `Table calculation "${name}" of type "${type}" requires a fieldId.`,
            );
            return;
        }

        const { fieldId } = tableCalc;
        const isSelectedMetric = selectedMetrics.includes(fieldId);
        const isCustomMetric = customMetricIds.includes(fieldId);

        // Check if fieldId references another table calculation (potential circular dependency)
        const isReferencingTableCalc = tableCalcs.some(
            (tc) => tc.name === fieldId,
        );

        // Check field is selected
        if (!isSelectedMetric && !isCustomMetric && !isReferencingTableCalc) {
            errors.push(
                `Table calculation "${name}" references unselected field "${fieldId}". ` +
                    'The field must be included in metrics or custom metrics.',
            );
            return;
        }

        if (isReferencingTableCalc) {
            // We already checked for circular dependencies
            // We know that the fieldId is a table calculation
            return;
        }

        const field = findField(fieldId);
        if (!field) {
            errors.push(
                `Table calculation "${name}" references non-existent field "${fieldId}".`,
            );
            return;
        }

        if (!isMetric(field) && !isAdditionalMetric(field)) {
            errors.push(
                `Table calculation "${name}" references "${fieldId}" which is not a metric. ` +
                    'Table calculations can only be applied to metric fields.',
            );
            return;
        }

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
        const errorMessage = getTableCalcValidationError(errors);
        Logger.error(`[AiAgent][Validate Table Calculations] ${errorMessage}`);
        throw new Error(errorMessage);
    }
}

/**
 * Validate that groupBy fields are valid dimensions that exist in the explore and are selected in the query
 * @param explore - The explore containing field definitions
 * @param groupByFields - Array of field IDs to use for grouping/series breakdown
 * @param selectedDimensions - Array of selected dimension field IDs in the query
 */
export function validateGroupByFields(
    explore: Explore,
    groupByFields: string[] | null | undefined,
    selectedDimensions: string[],
) {
    if (!groupByFields || groupByFields.length === 0) {
        return;
    }

    const exploreFields = getFields(explore);
    const errors: string[] = [];

    groupByFields.forEach((fieldId) => {
        const field = exploreFields.find((f) => getItemId(f) === fieldId);

        if (!field) {
            errors.push(
                `Error: groupBy field "${fieldId}" does not exist in the explore.`,
            );
            return;
        }

        if (!isDimension(field)) {
            errors.push(
                `Error: groupBy field "${fieldId}" (${field.label}) is not a dimension. Only selected dimensions can be used in groupBy for series breakdown.

Field Details:
- Field ID: ${fieldId}
- Field Label: ${field.label}
- Field Type: ${field.fieldType}
- Table: ${field.table}
- Expected Type: dimension`,
            );
            return;
        }

        if (!selectedDimensions.includes(fieldId)) {
            errors.push(
                `Error: groupBy field "${fieldId}" (${
                    field.label
                }) is not selected in the query dimensions. Fields used in groupBy must be included in the dimensions array.

Field Details:
- Field ID: ${fieldId}
- Field Label: ${field.label}
- Selected Dimensions: ${selectedDimensions.join(', ')}`,
            );
        }
    });

    if (errors.length > 0) {
        const errorMessage = `Invalid groupBy configuration:

${errors.join('\n\n')}

Remember:
- groupBy fields must be valid dimensions from the explore
- groupBy fields must be included in the query's dimensions array
- groupBy is used to split metrics into separate series (e.g., one line per region)
- Do NOT include the x-axis dimension in groupBy - only dimensions for series breakdown

Available dimensions:
${exploreFields
    .filter(isDimension)
    .map((f) => `- ${getItemId(f)} (${f.label})`)
    .join('\n')}`;

        Logger.error(`[AiAgent][Validate GroupBy Fields] ${errorMessage}`);

        throw new Error(errorMessage);
    }
}

/**
 * Validates that xAxisDimension is in the selected dimensions
 * @param xAxisDimension - The dimension to validate
 * @param selectedDimensions - Array of selected dimension field IDs in the query
 * @returns Array of error messages (empty if valid)
 */
export function validateXAxisField(
    xAxisDimension: string | null | undefined,
    selectedDimensions: string[],
): string[] {
    if (!xAxisDimension) {
        return [];
    }

    const errors: string[] = [];

    if (!selectedDimensions.includes(xAxisDimension)) {
        errors.push(
            `Error: xAxisDimension "${xAxisDimension}" is not included in queryConfig.dimensions. Selected dimensions: ${selectedDimensions.join(
                ', ',
            )}`,
        );
    }

    return errors;
}

/**
 * Validates that yAxisMetrics are in selected metrics or table calculations
 * @param yAxisMetrics - The metrics to validate
 * @param selectedMetrics - Array of selected metric field IDs in the query
 * @param tableCalculations - Table calculations that can be used as metrics
 * @returns Array of error messages (empty if valid)
 */
export function validateYAxisMetrics(
    yAxisMetrics: string[] | null | undefined,
    selectedMetrics: string[],
    tableCalculations?: TableCalcsSchema | TableCalculation[],
): string[] {
    if (!yAxisMetrics || yAxisMetrics.length === 0) {
        return [];
    }

    const errors: string[] = [];
    const tableCalculationNames = tableCalculations?.map((tc) => tc.name) || [];

    yAxisMetrics.forEach((metricId) => {
        const isTableCalc = tableCalculationNames.includes(metricId);
        const isSelectedMetric = selectedMetrics.includes(metricId);

        if (!isTableCalc && !isSelectedMetric) {
            errors.push(
                `Error: yAxisMetric "${metricId}" is not included in queryConfig.metrics or tableCalculations. Selected metrics: ${selectedMetrics.join(
                    ', ',
                )}`,
            );
        }
    });

    return errors;
}

/**
 * Validates that xAxisDimension and yAxisMetrics are properly specified
 * @param explore - The explore containing field definitions
 * @param chartConfig - Chart configuration with axis field definitions
 * @param selectedDimensions - Array of selected dimension field IDs in the query
 * @param selectedMetrics - Array of selected metric field IDs in the query
 * @param tableCalculations - Table calculations that can be used as metrics
 */
export function validateAxisFields(
    chartConfig: ToolRunQueryArgsTransformed['chartConfig'] | null | undefined,
    selectedDimensions: string[],
    selectedMetrics: string[],
    tableCalculations?: TableCalcsSchema | TableCalculation[],
) {
    if (!chartConfig) {
        return;
    }

    // Validate both axis fields
    const xAxisErrors = validateXAxisField(
        chartConfig.xAxisDimension,
        selectedDimensions,
    );
    const yAxisErrors = validateYAxisMetrics(
        chartConfig.yAxisMetrics,
        selectedMetrics,
        tableCalculations,
    );
    if (chartConfig.secondaryYAxisMetric) {
        yAxisErrors.push(
            ...validateYAxisMetrics(
                [chartConfig.secondaryYAxisMetric],
                selectedMetrics,
                tableCalculations,
            ),
        );
    }

    const errors = [...xAxisErrors, ...yAxisErrors];

    if (errors.length > 0) {
        const errorMessage = `Invalid axis field configuration:

${errors.join('\n\n')}

Remember:
- xAxisDimension must be included in queryConfig.dimensions
- yAxisMetrics must be included in queryConfig.metrics or tableCalculations`;

        Logger.error(`[AiAgent][Validate Axis Fields] ${errorMessage}`);

        throw new Error(errorMessage);
    }
}
