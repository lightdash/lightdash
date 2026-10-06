export const AI_QUERY_READS_EARLIER_RESULTS_MESSAGE =
    'This query reads earlier query results, which AI cannot use.';

export const AI_QUERY_PROCEDURE_UNAVAILABLE_MESSAGE =
    'AI cannot run this query because the AI query procedure is missing or your Snowflake sign-in for AI cannot call it. Ask your Snowflake admin to finish the AI query procedure setup.';

export const AI_QUERY_PROCEDURE_BIND_VALUES_MESSAGE =
    'AI cannot run this query through the AI query procedure because it uses bound values.';

export const parseSnowflakeProcedureName = (value: string): string | null => {
    const name = value.trim();
    const parts: string[] = [];
    let position = 0;
    while (position < name.length) {
        const start = position;
        if (name[position] === '"') {
            position += 1;
            let contentLength = 0;
            let closed = false;
            while (position < name.length) {
                const character = name[position];
                if (character === '"') {
                    if (name[position + 1] === '"') {
                        position += 2;
                        contentLength += 1;
                    } else {
                        position += 1;
                        closed = true;
                        break;
                    }
                } else {
                    if (/\p{Cc}/u.test(character)) return null;
                    position += 1;
                    contentLength += 1;
                }
            }
            if (!closed || contentLength === 0) return null;
        } else {
            while (position < name.length && name[position] !== '.') {
                position += 1;
            }
            if (
                !/^[A-Za-z_][A-Za-z0-9_$]{0,254}$/.test(
                    name.slice(start, position),
                )
            )
                return null;
        }
        parts.push(name.slice(start, position));
        if (position === name.length) break;
        if (name[position] !== '.') return null;
        position += 1;
    }
    return parts.length === 3 && !name.endsWith('.') ? name : null;
};

export const getAiQueryProcedureCallSql = (procedure: string): string => {
    const name = parseSnowflakeProcedureName(procedure);
    if (name === null) throw new Error('Invalid AI query procedure name');
    return `CALL ${name}(?)`;
};
