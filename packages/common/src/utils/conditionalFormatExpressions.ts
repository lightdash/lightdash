/**
 * Utilities for evaluating conditional expressions in format strings with parameters
 * and values from the current result row.
 */

import { LightdashParameters } from '../compiler/parameters';

/**
 * Strips the ld.parameters. prefix from a parameter name if present
 * Examples:
 *   - "ld.parameters.currency" -> "currency"
 *   - "currency" -> "currency"
 */
function stripParameterPrefix(paramName: string): string {
    const shortPrefix = `${LightdashParameters.PREFIX_SHORT}.`;
    const longPrefix = `${LightdashParameters.PREFIX}.`;

    if (paramName.startsWith(shortPrefix)) {
        return paramName.substring(shortPrefix.length);
    }
    if (paramName.startsWith(longPrefix)) {
        return paramName.substring(longPrefix.length);
    }
    return paramName;
}

function stripFieldPrefix(fieldName: string): string | undefined {
    const shortPrefix = 'ld.fields.';
    const longPrefix = 'lightdash.fields.';

    if (fieldName.startsWith(shortPrefix)) {
        return fieldName.substring(shortPrefix.length);
    }
    if (fieldName.startsWith(longPrefix)) {
        return fieldName.substring(longPrefix.length);
    }
    return undefined;
}

function getFieldValue(
    fieldValues: Record<string, unknown>,
    fieldName: string,
): unknown {
    const fieldValue = fieldValues[fieldName];
    if (fieldValue !== null && typeof fieldValue === 'object') {
        if ('value' in fieldValue) {
            const { value } = fieldValue;
            if (value !== null && typeof value === 'object' && 'raw' in value) {
                return value.raw;
            }
        }
        if ('raw' in fieldValue) {
            return fieldValue.raw;
        }
    }
    return fieldValue;
}

/**
 * Removes surrounding quotes from a string if present and handles escape sequences
 */
function removeQuotes(value: string): string {
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        const unquoted = value.slice(1, -1);
        // Process escape sequences: \" -> " and \' -> '
        return unquoted.replace(/\\"/g, '"').replace(/\\'/g, "'");
    }
    return value;
}

/**
 * Gets the value from either a parameter or a literal (quoted string)
 */
function getExpressionValue(
    value: string,
    parameters: Record<string, unknown>,
    fieldValues: Record<string, unknown>,
): unknown {
    // Check if it's a quoted string literal
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1);
    }

    const fieldName = stripFieldPrefix(value);
    if (fieldName !== undefined) {
        return getFieldValue(fieldValues, fieldName);
    }

    // Otherwise, treat as parameter name - strip ld.parameters. prefix if present
    const paramName = stripParameterPrefix(value);
    return parameters[paramName];
}

/**
 * Evaluates a condition like: paramName=="value" or paramName!="value"
 */
function evaluateCondition(
    condition: string,
    parameters: Record<string, unknown>,
    fieldValues: Record<string, unknown>,
): boolean {
    // Check for != operator
    if (condition.includes('!=')) {
        const [left, right] = condition
            .split('!=')
            .map((s: string) => s.trim());
        const leftValue = getExpressionValue(left, parameters, fieldValues);
        const rightValue = getExpressionValue(right, parameters, fieldValues);
        return leftValue !== rightValue;
    }

    // Check for == operator
    if (condition.includes('==')) {
        const [left, right] = condition
            .split('==')
            .map((s: string) => s.trim());
        const leftValue = getExpressionValue(left, parameters, fieldValues);
        const rightValue = getExpressionValue(right, parameters, fieldValues);
        return leftValue === rightValue;
    }

    // If no operator, treat as truthy check
    const value = getExpressionValue(condition, parameters, fieldValues);
    return Boolean(value);
}

/**
 * Finds the index of a character outside of quoted strings
 * Returns -1 if the character is not found outside quotes
 */
function findIndexOutsideQuotes(str: string, searchChar: string): number {
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let i = 0;

    while (i < str.length) {
        const char = str[i];

        // Handle escape sequences - skip the next character
        if (char === '\\' && (inDoubleQuote || inSingleQuote)) {
            i += 2; // Skip the backslash and the next character
        } else {
            // Track quote state
            if (char === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
            } else if (char === "'" && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
            }

            // Check if we found the character outside quotes
            if (!inDoubleQuote && !inSingleQuote && char === searchChar) {
                return i;
            }

            i += 1;
        }
    }

    return -1;
}

/**
 * Evaluates a ternary expression: condition ? trueValue : falseValue
 * Supports == and != operators
 * Properly handles ? and : characters inside quoted strings
 */
function evaluateTernaryExpression(
    expression: string,
    parameters: Record<string, unknown>,
    fieldValues: Record<string, unknown>,
): string {
    // Find the ? operator outside of quotes
    const questionIndex = findIndexOutsideQuotes(expression, '?');
    if (questionIndex === -1) {
        return expression; // Invalid ternary, return as-is
    }

    const conditionPart = expression.substring(0, questionIndex).trim();
    const valuesPart = expression.substring(questionIndex + 1);

    // Find the : operator outside of quotes in the values part
    const colonIndex = findIndexOutsideQuotes(valuesPart, ':');
    if (colonIndex === -1) {
        return expression; // Invalid ternary, return as-is
    }

    const trueValue = valuesPart.substring(0, colonIndex).trim();
    const falseValue = valuesPart.substring(colonIndex + 1).trim();

    // Evaluate condition
    const conditionResult = evaluateCondition(
        conditionPart,
        parameters,
        fieldValues,
    );

    // Return the appropriate value, removing quotes if present
    const result = conditionResult ? trueValue : falseValue;
    return removeQuotes(result);
}

/**
 * Evaluates a simple conditional expression from a format string
 * Supports ternary operators with equality checks
 * Examples:
 *   - ${ld.parameters.currency=="USD"?"$":"€"}0,0.00
 *   - ${ld.parameters.prefix}0,0.00  (simple substitution still works)
 *   - ${ld.fields.orders_currency_symbol}0,0.00
 */
export function evaluateConditionalFormatExpression(
    formatString: string,
    parameters: Record<string, unknown> = {},
    fieldValues: Record<string, unknown> = {},
): string {
    // Find all ${...} placeholders
    const placeholderRegex = /\$\{([^}]+)\}/g;

    const result = formatString.replace(
        placeholderRegex,
        (match: string, expression: string) => {
            const trimmedExpr = expression.trim();

            // Check if it's a ternary expression (contains ? and : outside of quotes)
            if (
                findIndexOutsideQuotes(trimmedExpr, '?') !== -1 &&
                findIndexOutsideQuotes(trimmedExpr, ':') !== -1
            ) {
                return evaluateTernaryExpression(
                    trimmedExpr,
                    parameters,
                    fieldValues,
                );
            }

            const fieldName = stripFieldPrefix(trimmedExpr);
            if (fieldName !== undefined) {
                const value = getFieldValue(fieldValues, fieldName);
                return value !== undefined ? String(value) : match;
            }

            // Simple parameter substitution - strip ld.parameters. prefix if present
            const paramName = stripParameterPrefix(trimmedExpr);
            const value = parameters[paramName];
            return value !== undefined ? String(value) : match;
        },
    );

    return result;
}
