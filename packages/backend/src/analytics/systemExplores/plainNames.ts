// Plain names for values that are recorded as code names ("saved_chart", "agent-subtask", true).
// A table or legend shows these instead of the recorded value. Filters keep using the recorded field.

export type PlainNames = {
    // Names for particular recorded values. Any other value is shown in sentence case, with its
    // underscores and hyphens as spaces ("interactive_viewer" reads "Interactive viewer").
    names?: Record<string, string>;
    // What to show when nothing was recorded. Left empty when not given.
    missing?: string;
};

const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;

export const plainNameSql = (
    column: string,
    { names = {}, missing }: PlainNames = {},
): string => {
    const value = `CAST(${column} AS VARCHAR)`;
    return `CASE ${Object.entries(names)
        .map(
            ([recorded, name]) =>
                `WHEN ${value} = ${quote(recorded)} THEN ${quote(name)}`,
        )
        .join(
            ' ',
        )} WHEN ${column} IS NULL THEN ${missing ? quote(missing) : 'NULL'} ELSE upper(left(${value}, 1)) || replace(replace(substr(${value}, 2), '_', ' '), '-', ' ') END`;
};

// The same names as AI token usage > Feature
export const aiFeatureNames: PlainNames = {
    names: {
        agent: 'Agents',
        'agent-subtask': 'Agent tools',
        'deep-research': 'Deep research',
        'data-app': 'Data app',
        compaction: 'Compaction',
        'table-calc': 'Table calculation',
    },
    missing: 'Unknown feature',
};

// Where an AI call came from
export const aiChannelNames: PlainNames = {
    names: {
        web: 'Web app',
        api: 'API',
        evals: 'Evaluations',
        mcp: 'MCP',
        data_app: 'Data app',
    },
    missing: 'Unknown channel',
};

// Whose provider key paid for an AI call
export const aiKeyNames: PlainNames = {
    names: {
        'lightdash-managed': 'Lightdash key',
        'self-managed': 'Your own key',
    },
    missing: 'Unknown key',
};

export const aiOutcomeNames: PlainNames = {
    names: { complete: 'Success', error: 'Error' },
    missing: 'Unknown outcome',
};
