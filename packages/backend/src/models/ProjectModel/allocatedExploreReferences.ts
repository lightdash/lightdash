import { type Explore, type ExploreError } from '@lightdash/common';

const tableProperties = new Set([
    'table',
    'tableName',
    'baseTable',
    'canonicalName',
    'parentTable',
    'sourceExploreName',
    'tablesReferences',
]);
const fieldProperties = new Set([
    'fieldId',
    'defaultShowUnderlyingValues',
    'showUnderlyingValues',
    'requiredDimensions',
    'dimensionReferences',
    'metricReferences',
    'dimensions',
    'metrics',
    'drivers',
]);
const sqlProperties = new Set([
    'sql',
    'compiledSql',
    'sqlOn',
    'compiledSqlOn',
    'sqlWhere',
    'uncompiledSqlWhere',
    'conditionSql',
    'elementSql',
    'offsetSql',
    'joinCondition',
    'compiledValueSql',
    'compiledDistinctKeys',
]);

const allocatedName = (
    name: string,
    names: ReadonlyMap<string, string>,
): string => {
    const exact = names.get(name);
    if (exact !== undefined) return exact;
    let longest: [string, string] | undefined;
    for (const [before, after] of names) {
        if (
            name.startsWith(`${before}__`) &&
            before.length > (longest?.[0].length ?? 0)
        )
            longest = [before, after];
    }
    return longest ? `${longest[1]}${name.slice(longest[0].length)}` : name;
};

export const rewriteAllocatedSql = (
    sql: string,
    names: ReadonlyMap<string, string>,
    standaloneAliases: ReadonlySet<string> = new Set(),
): string =>
    sql.replace(
        /'(?:''|\\.|[^'\\])*'|--[^\n]*|\/\*[\s\S]*?\*\/|\$(?<dollarTag>[a-zA-Z_]\w*|)\$[\s\S]*?\$\k<dollarTag>\$|\$\{([^}]+)\}|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]|\b[a-zA-Z_][\w]*(?=\s*\.)/g,
        (
            token: string,
            _dollarTag: string | undefined,
            template: string | undefined,
            offset: number,
        ) => {
            if (template !== undefined) {
                const [table, ...field] = template.split('.');
                const assigned = allocatedName(table, names);
                return assigned !== table
                    ? `\${${[assigned, ...field].join('.')}}`
                    : token;
            }
            if (
                token.startsWith("'") ||
                token.startsWith('--') ||
                token.startsWith('/*') ||
                token.startsWith('$')
            )
                return token;
            const quote = token[0];
            const quoted = quote === '"' || quote === '`' || quote === '[';
            const identifier = quoted ? token.slice(1, -1) : token;
            if (
                quoted &&
                !/^\s*\./.test(sql.slice(offset + token.length)) &&
                !standaloneAliases.has(identifier) &&
                !identifier.startsWith('__model_')
            )
                return token;
            const assigned = allocatedName(identifier, names);
            if (assigned === identifier) return token;
            if (quoted)
                return `${quote}${assigned}${quote === '[' ? ']' : quote}`;
            return assigned;
        },
    );

export const rewriteAllocatedExplore = <T extends Explore | ExploreError>(
    explore: T,
    names: ReadonlyMap<string, string>,
): T => {
    const standaloneAliases = new Set(
        Object.values(explore.tables ?? {})
            .filter((table) => table.nestedFrom !== undefined)
            .flatMap((table) => [table.name, `${table.name}__offset`]),
    );
    const orderedNames = [...names].sort(
        ([left], [right]) => right.length - left.length,
    );
    const field = (value: string): string => {
        for (const [before, after] of orderedNames) {
            if (
                value.startsWith(`${before}.`) ||
                value.startsWith(`${before}_`)
            )
                return `${after}${value.slice(before.length)}`;
        }
        return value;
    };
    const visit = (
        value: unknown,
        property: string,
        tableObject = false,
    ): unknown => {
        if (typeof value === 'string') {
            if (tableProperties.has(property))
                return allocatedName(value, names);
            if (fieldProperties.has(property)) return field(value);
            if (sqlProperties.has(property) || /sql$/i.test(property))
                return rewriteAllocatedSql(value, names, standaloneAliases);
            return value.replace(
                /__model_[0-9a-f]+(?:__[a-zA-Z0-9_]+)?/g,
                (name) => allocatedName(name, names),
            );
        }
        if (Array.isArray(value))
            return value.map((entry) => visit(entry, property));
        if (value === null || typeof value !== 'object') return value;
        return Object.fromEntries(
            Object.entries(value)
                .map(([key, entry]) => {
                    const tableMap =
                        property === 'tables' ||
                        property === 'unfilteredTables';
                    const renameKey =
                        tableMap ||
                        property === 'lineageGraph' ||
                        property === 'tablesRequiredAttributes' ||
                        property === 'tablesAnyAttributes';
                    const renamedKey = renameKey
                        ? allocatedName(key, names)
                        : key;
                    if (
                        key === 'sqlTable' &&
                        tableObject &&
                        typeof entry === 'string'
                    )
                        return [
                            key,
                            'nestedFrom' in value
                                ? rewriteAllocatedSql(
                                      entry,
                                      names,
                                      standaloneAliases,
                                  )
                                : entry,
                        ];
                    if (
                        key === 'name' &&
                        tableObject &&
                        typeof entry === 'string'
                    )
                        return [key, allocatedName(entry, names)];
                    if (
                        key === 'name' &&
                        property === 'lineageGraph' &&
                        typeof entry === 'string'
                    )
                        return [key, allocatedName(entry, names)];
                    if (
                        key === 'originalName' &&
                        tableObject &&
                        typeof entry === 'string' &&
                        entry ===
                            allocatedName(
                                (value as { name: string }).name,
                                names,
                            )
                    )
                        return null;
                    if (property === 'lineageGraph')
                        return [
                            renamedKey,
                            Array.isArray(entry)
                                ? entry.map((dependency) => ({
                                      ...dependency,
                                      name: allocatedName(
                                          dependency.name,
                                          names,
                                      ),
                                  }))
                                : entry,
                        ];
                    return [renamedKey, visit(entry, key, tableMap)];
                })
                .filter((entry): entry is [string, unknown] => entry !== null),
        );
    };
    const rewritten = visit(explore, '') as T;
    rewritten.name = names.get(explore.name) ?? explore.name;
    return rewritten;
};
