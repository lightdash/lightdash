import { type SqlRunnerLinkState } from '../../ContentLink';

/** The SQL Runner state a runSql call's args open with, if it carried SQL. */
export const getRunSqlLinkStateFromArgs = (
    toolArgs: unknown,
): SqlRunnerLinkState | null => {
    if (!toolArgs || typeof toolArgs !== 'object' || !('sql' in toolArgs)) {
        return null;
    }

    const { sql, limit } = toolArgs as { sql?: unknown; limit?: unknown };

    if (typeof sql !== 'string') {
        return null;
    }

    return typeof limit === 'number' ? { sql, limit } : { sql };
};
