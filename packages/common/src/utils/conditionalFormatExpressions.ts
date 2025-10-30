/**
 * Utilities for evaluating conditional expressions in format strings with parameters
 */

/**
 * Strips the ld.parameters. prefix from a parameter name if present
 * Examples:
 *   - "ld.parameters.currency" -> "currency"
 *   - "currency" -> "currency"
 */
function stripParameterPrefix(paramName: string): string {
    const ldPrefix = 'ld.parameters.';
    const lightdashPrefix = 'lightdash.parameters.';

    if (paramName.startsWith(ldPrefix)) {
        return paramName.substring(ldPrefix.length);
    }
    if (paramName.startsWith(lightdashPrefix)) {
        return paramName.substring(lightdashPrefix.length);
    }
    return paramName;
}

/**
 * Removes surrounding quotes from a string if present
 */
function removeQuotes(value: string): string {
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1);
    }
    return value;
}

/**
 * Gets the value from either a parameter or a literal (quoted string)
 */
function getConditionValue(
    value: string,
    parameters: Record<string, unknown>,
): unknown {
    // Check if it's a quoted string literal
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1);
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
): boolean {
    // Check for != operator
    if (condition.includes('!=')) {
        const [left, right] = condition
            .split('!=')
            .map((s: string) => s.trim());
        const leftValue = getConditionValue(left, parameters);
        const rightValue = getConditionValue(right, parameters);
        return leftValue !== rightValue;
    }

    // Check for == operator
    if (condition.includes('==')) {
        const [left, right] = condition
            .split('==')
            .map((s: string) => s.trim());
        const leftValue = getConditionValue(left, parameters);
        const rightValue = getConditionValue(right, parameters);
        return leftValue === rightValue;
    }

    // If no operator, treat as truthy check
    const value = getConditionValue(condition, parameters);
    return Boolean(value);
}

/**
 * Evaluates a ternary expression: condition ? trueValue : falseValue
 * Supports == and != operators
 */
function evaluateTernaryExpression(
    expression: string,
    parameters: Record<string, unknown>,
): string {
    // Split by ? to get condition and values
    const [conditionPart, valuesPart] = expression
        .split('?')
        .map((s: string) => s.trim());

    if (!valuesPart) {
        return expression; // Invalid ternary, return as-is
    }

    // Split values by : to get trueValue and falseValue
    const colonIndex = valuesPart.indexOf(':');
    if (colonIndex === -1) {
        return expression; // Invalid ternary, return as-is
    }

    const trueValue = valuesPart.substring(0, colonIndex).trim();
    const falseValue = valuesPart.substring(colonIndex + 1).trim();

    // Evaluate condition
    const conditionResult = evaluateCondition(conditionPart, parameters);

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
 */
export function evaluateConditionalFormatExpression(
    formatString: string,
    parameters: Record<string, unknown> = {},
): string {
    // Find all ${...} placeholders
    const placeholderRegex = /\$\{([^}]+)\}/g;

    const result = formatString.replace(
        placeholderRegex,
        (match: string, expression: string) => {
            const trimmedExpr = expression.trim();

            // Check if it's a ternary expression (contains ? and :)
            if (trimmedExpr.includes('?') && trimmedExpr.includes(':')) {
                return evaluateTernaryExpression(trimmedExpr, parameters);
            }

            // Simple parameter substitution - strip ld.parameters. prefix if present
            const paramName = stripParameterPrefix(trimmedExpr);
            const value = parameters[paramName];
            return value !== undefined ? String(value) : match;
        },
    );

    return result;
}
