import { ParameterError } from '@lightdash/common';

/**
 * UUID validation regex (matches standard UUID format)
 */
const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses and validates a comma-separated list of UUIDs from a query parameter.
 *
 * @param input - The raw query parameter value (e.g., "uuid1,uuid2,uuid3")
 * @param paramName - The parameter name for error messages
 * @returns Array of validated UUIDs, or undefined if input is empty
 * @throws {ParameterError} If any UUID has invalid format
 *
 * @example
 * // Valid input
 * parseUuidList("550e8400-e29b-41d4-a716-446655440000", "projectUuids")
 * // Returns: ["550e8400-e29b-41d4-a716-446655440000"]
 *
 * @example
 * // Invalid input
 * parseUuidList("not-a-uuid", "projectUuids")
 * // Throws: ParameterError("Invalid UUID format in projectUuids: not-a-uuid")
 */
export function parseUuidList(
    input: string | undefined,
    paramName: string,
): string[] | undefined {
    if (!input) return undefined;

    const uuids = input.split(',').map((uuid) => uuid.trim());

    for (const uuid of uuids) {
        if (!UUID_REGEX.test(uuid)) {
            throw new ParameterError(
                `Invalid UUID format in ${paramName}: ${uuid}`,
            );
        }
    }

    return uuids;
}

/**
 * Parses and validates a comma-separated list of enum values from a query parameter.
 *
 * @param input - The raw query parameter value (e.g., "value1,value2")
 * @param validValues - Array or object of valid enum values
 * @param paramName - The parameter name for error messages
 * @returns Array of validated enum values, or undefined if input is empty
 * @throws {ParameterError} If any value is not in the valid set
 *
 * @example
 * // Valid input
 * parseEnumList("COMPLETED,FAILED", SchedulerRunStatus, "statuses")
 * // Returns: [SchedulerRunStatus.COMPLETED, SchedulerRunStatus.FAILED]
 *
 * @example
 * // Invalid input
 * parseEnumList("INVALID", SchedulerRunStatus, "statuses")
 * // Throws: ParameterError("Invalid status value: INVALID. Must be one of: completed, failed, ...")
 */
export function parseEnumList<T extends string>(
    input: string | undefined,
    validValues: Record<string, T> | readonly T[],
    paramName: string,
): T[] | undefined {
    if (!input) return undefined;

    const validSet = Array.isArray(validValues)
        ? validValues
        : Object.values(validValues);

    const values = input.split(',').map((value) => value.trim() as T);

    for (const value of values) {
        if (!validSet.includes(value)) {
            throw new ParameterError(
                `Invalid ${paramName} value: ${value}. Must be one of: ${validSet.join(
                    ', ',
                )}`,
            );
        }
    }

    return values;
}

/**
 * Parses and validates a comma-separated list of values against a whitelist.
 *
 * @param input - The raw query parameter value (e.g., "value1,value2")
 * @param allowedValues - Array of allowed string values
 * @param paramName - The parameter name for error messages
 * @returns Array of validated values, or undefined if input is empty
 * @throws {ParameterError} If any value is not in the whitelist
 *
 * @example
 * // Valid input
 * parseWhitelistedList("email,slack", ["email", "slack", "msteams"], "destinations")
 * // Returns: ["email", "slack"]
 *
 * @example
 * // Invalid input
 * parseWhitelistedList("invalid", ["email", "slack"], "destinations")
 * // Throws: ParameterError("Invalid destinations value: invalid. Must be one of: email, slack")
 */
export function parseWhitelistedList(
    input: string | undefined,
    allowedValues: readonly string[],
    paramName: string,
): string[] | undefined {
    if (!input) return undefined;

    const values = input.split(',').map((value) => value.trim());

    for (const value of values) {
        if (!(allowedValues as readonly string[]).includes(value)) {
            throw new ParameterError(
                `Invalid ${paramName} value: ${value}. Must be one of: ${allowedValues.join(
                    ', ',
                )}`,
            );
        }
    }

    return values;
}
