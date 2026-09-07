const CSS_VAR_REGEX = /^var\((--[^,)]+)(?:,\s*(.+))?\)$/;

const readCssVariable = (variable: string): string =>
    getComputedStyle(document.documentElement).getPropertyValue(variable);

const resolveCssVariable = (
    value: string,
    readVariable: (variable: string) => string,
): string => {
    const match = value.match(CSS_VAR_REGEX);
    if (!match) return value;

    const [, varName, fallback] = match;
    const computed = readVariable(varName);
    return computed.trim() || fallback?.trim() || value;
};

// Canvas needs literal colors. Preserve inputs and formatter functions when resolving.
export const resolveCssVariablesInOptions = <T>(
    obj: T,
    readVariable: (variable: string) => string = readCssVariable,
): T => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        return resolveCssVariable(obj, readVariable) as unknown as T;
    }
    if (Array.isArray(obj)) {
        return obj.map((value) =>
            resolveCssVariablesInOptions(value, readVariable),
        ) as unknown as T;
    }
    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
            obj as Record<string, unknown>,
        )) {
            result[key] = resolveCssVariablesInOptions(value, readVariable);
        }
        return result as T;
    }
    return obj;
};
