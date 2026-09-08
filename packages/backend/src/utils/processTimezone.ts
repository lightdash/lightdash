/**
 * GLITCH-507: bare DATE `raw` values are
 * formatted from the process timezone, so a non-UTC backend can shift them a
 * day on BigQuery/Snowflake. We warn rather than "fix" it in the formatter (no
 * single Date-component rule works across warehouses). Run the backend in UTC.
 * See https://docs.lightdash.com/timezones.
 *
 * @returns a warning message to log, or null when no warning is needed.
 */
export const getProcessTimezoneWarning = ({
    timezoneOffsetMinutes,
}: {
    timezoneOffsetMinutes: number;
}): string | null => {
    if (timezoneOffsetMinutes !== 0) {
        return (
            `The backend process timezone is not UTC. ` +
            `Bare DATE values may render off by one day on BigQuery/Snowflake — ` +
            `set TZ=UTC on all backend pods. See https://docs.lightdash.com/timezones`
        );
    }
    return null;
};
