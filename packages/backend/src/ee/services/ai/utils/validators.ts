import {
    assertUnreachable,
    booleanFilterSchema,
    CompiledField,
    dateFilterSchema,
    Explore,
    FilterRule,
    FilterType,
    getErrorMessage,
    getFields,
    getFilterTypeFromItemType,
    getItemId,
    numberFilterSchema,
    renderFilterRuleSqlFromField,
    stringFilterSchema,
    SupportedDbtAdapter,
    WeekDay,
} from '@lightdash/common';
import Logger from '../../../../logging/logger';
import { serializeData } from './serializeData';

/**
 * Validate that all selected fields exist in the explore
 * @param explore
 * @param selectedFieldIds
 */
export function validateSelectedFieldsExistence(
    explore: Explore,
    selectedFieldIds: string[],
) {
    const exploreFieldIds = getFields(explore).map(getItemId);
    const nonExploreFields = selectedFieldIds.filter(
        (f) => !exploreFieldIds.includes(f),
    );

    if (nonExploreFields.length) {
        const errorMessage = `The following fields do not exist in the selected explore.

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

function validateFilterRule(filterRule: FilterRule, field: CompiledField) {
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
) {
    const exploreFields = getFields(explore);
    const exploreFieldIds = exploreFields.map(getItemId);
    const filterRuleErrors: string[] = [];

    filterRules.forEach((rule) => {
        const exploreFieldIndex = exploreFieldIds.indexOf(rule.target.fieldId);
        const field = exploreFields[exploreFieldIndex];

        if (!field) {
            filterRuleErrors.push(
                `Error: the field with id "${
                    rule.target.fieldId
                }" does not exist in the selected explore.
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
