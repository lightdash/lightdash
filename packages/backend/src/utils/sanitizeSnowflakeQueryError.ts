const SNOWFLAKE_QUERY_ID =
    /\b01[0-9a-f]{6}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function sanitizeSnowflakeQueryError(message: string): string;
export function sanitizeSnowflakeQueryError(message: null): null;
export function sanitizeSnowflakeQueryError(
    message: string | null,
): string | null;
export function sanitizeSnowflakeQueryError(
    message: string | null,
): string | null {
    return message?.replace(SNOWFLAKE_QUERY_ID, '[query id removed]') ?? null;
}
