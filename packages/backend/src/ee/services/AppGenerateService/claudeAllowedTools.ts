/**
 * Which files the sandbox coding agent may write. `source` is every build's
 * default: the app's src tree. `manifest` is the seeding build of a seeded
 * organization template: only src/template.json is writable, so the agent
 * binds the template and cannot reshape it. Anything else it wants to change
 * needs approval it does not have, which is the point: it explains instead.
 */
export type CodingAgentEditScope = 'source' | 'manifest';

const READ_TOOLS = [
    'Read(//app/**)',
    'Read(//tmp/dbt-repo/**)',
    'Read(//tmp/images/**)',
    'Read(//tmp/uploads/**)',
    'Read(//tmp/metric-queries/**)',
    'Read(//tmp/dashboard/**)',
    'Read(//tmp/external-data/**)',
];

const SEARCH_TOOLS = [
    'Glob(//app/**)',
    'Glob(//tmp/dbt-repo/**)',
    'Glob(//tmp/uploads/**)',
    'Glob(//tmp/metric-queries/**)',
    'Glob(//tmp/dashboard/**)',
    'Glob(//tmp/external-data/**)',
    'Grep(//app/**)',
    'Grep(//tmp/dbt-repo/**)',
    'Grep(//tmp/uploads/**)',
    'Grep(//tmp/external-data/**)',
];

const WRITE_TOOLS: Record<CodingAgentEditScope, string[]> = {
    source: ['Write(//app/src/**)', 'Edit(//app/src/**)'],
    manifest: [
        'Write(//app/src/template.json)',
        'Edit(//app/src/template.json)',
    ],
};

export const buildClaudeAllowedTools = (
    editScope: CodingAgentEditScope,
): string =>
    [...READ_TOOLS, ...WRITE_TOOLS[editScope], ...SEARCH_TOOLS].join(',');
