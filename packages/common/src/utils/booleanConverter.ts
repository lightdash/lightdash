/**
 * Converts various types of values to boolean, with special handling for string representations
 * of boolean values that should be interpreted literally rather than using JavaScript's
 * truthy/falsy evaluation.
 *
 * @param value - The value to convert to boolean
 * @returns The boolean representation of the value
 */
export function convertToBooleanValue(value: unknown): boolean {
    // Handle native boolean values
    if (typeof value === 'boolean') {
        return value;
    }

    // Handle string representations
    if (typeof value === 'string') {
        const trimmedValue = value.trim().toLowerCase();
        if (trimmedValue === 'false') {
            return false;
        }
        if (trimmedValue === 'true') {
            return true;
        }
    }

    // Fallback to existing behavior for other types
    return !!value;
}
