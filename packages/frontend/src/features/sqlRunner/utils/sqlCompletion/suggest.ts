import { type ParameterValue } from '@lightdash/common';
import type { WarehouseTableFieldWithContext } from '../../hooks/useTableFields';
import {
    applyCasePreference,
    formatIdentifier,
    getCatalogScopeSuggestions,
    tablePathSegments,
    type SqlCatalog,
} from '../sqlCompletionScope';
import type { SqlEditorPreferences } from '../sqlEditorPreferences';
import type { CompletionContext, TableReference } from './analyze';
import type { SqlFunction } from './vocabulary';

export type SqlSuggestionKind =
    | 'keyword'
    | 'function'
    | 'column'
    | 'table'
    | 'schema'
    | 'database'
    | 'alias'
    | 'parameter';

export type SqlSuggestion = {
    label: string;
    // Shown right after the label, e.g. a column type
    detail: string | null;
    // Shown right-aligned, e.g. the owning table
    description: string | null;
    documentation: string | null;
    kind: SqlSuggestionKind;
    insertText: string;
    isSnippet: boolean;
    filterText: string | null;
    sortText: string;
    // 1-based columns on the cursor line to replace
    range: { startColumn: number; endColumn: number };
    // Reopen the suggestion list right after inserting
    triggersSuggest: boolean;
};

export type SqlParameters = Record<
    string,
    { label: string; description?: string; default?: ParameterValue }
>;

export type SqlSuggestionData = {
    quoteChar: string;
    catalog: SqlCatalog | undefined;
    fields: WarehouseTableFieldWithContext[];
    parameters: SqlParameters;
    functions: SqlFunction[];
    settings: SqlEditorPreferences | undefined;
    // Table selected in the sidebar, whose columns are already loaded
    activeTable: { schema: string; table: string } | null;
};

export type SqlSuggestionInput = {
    context: CompletionContext;
    // Text on the cursor line before the cursor
    linePrefix: string;
    // Character right after the cursor
    nextChar: string;
    triggerCharacter: string | null;
    data: SqlSuggestionData;
};

type ScopedColumn = {
    name: string;
    type: string | null;
    owner: string;
};

const equalsIgnoreCase = (a: string, b: string) =>
    a.toLowerCase() === b.toLowerCase();

const refName = (ref: TableReference) =>
    ref.alias ?? ref.path[ref.path.length - 1] ?? null;

const fieldBelongsTo = (
    field: WarehouseTableFieldWithContext,
    ref: TableReference,
) => {
    const table = ref.path[ref.path.length - 1];
    const schema = ref.path[ref.path.length - 2];
    return (
        table !== undefined &&
        equalsIgnoreCase(field.table, table) &&
        (schema === undefined || equalsIgnoreCase(field.schema, schema))
    );
};

const getRefColumns = (
    ref: TableReference,
    fields: WarehouseTableFieldWithContext[],
): ScopedColumn[] => {
    const owner = refName(ref) ?? 'subquery';
    if (ref.columns) {
        return ref.columns.map((name) => ({ name, type: null, owner }));
    }
    return fields
        .filter((field) => fieldBelongsTo(field, ref))
        .map((field) => ({ name: field.name, type: field.type, owner }));
};

const resolveQualifier = (
    qualifiers: string[],
    tables: TableReference[],
): TableReference | null => {
    if (qualifiers.length === 1) {
        const [name] = qualifiers;
        return (
            tables.find((t) => t.alias && equalsIgnoreCase(t.alias, name)) ??
            tables.find(
                (t) =>
                    t.path.length > 0 &&
                    equalsIgnoreCase(t.path[t.path.length - 1], name),
            ) ??
            null
        );
    }
    return (
        tables.find(
            (t) =>
                t.path.length >= qualifiers.length &&
                qualifiers.every((q, i) =>
                    equalsIgnoreCase(
                        t.path[t.path.length - qualifiers.length + i],
                        q,
                    ),
                ),
        ) ?? null
    );
};

const matchKeywordCase = (keyword: string, partial: string) =>
    partial.length > 0 && partial === partial.toLowerCase()
        ? keyword.toLowerCase()
        : keyword;

const getParameterSuggestions = (
    linePrefix: string,
    parameters: SqlParameters,
    wordRange: SqlSuggestion['range'],
    defaultSortGroup: string,
): SqlSuggestion[] => {
    // `$word` is not a parameter reference; only `${...}`, `ld.` or a bare `$`
    if (/\$\w+$/.test(linePrefix)) return [];
    const cursorColumn = linePrefix.length + 1;
    const parameterMatch = linePrefix.match(
        /\$\{(ld(?:\.(?:parameters(?:\.\w*)?|\w*))?)\}?$/,
    );
    const insideBracketsMatch = linePrefix.match(/\$\{([^}]*?)$/);
    const ldMatch = linePrefix.match(
        /\b(ld(?:\.(?:parameters(?:\.\w*)?|\w*))?)$/,
    );
    const isRelevant =
        !!parameterMatch ||
        !!insideBracketsMatch ||
        !!ldMatch ||
        /\$$/.test(linePrefix);

    return Object.entries(parameters).map(([name, config]) => {
        let insertText = `\${ld.parameters.${name}}`;
        let range = wordRange;
        if (parameterMatch) {
            insertText = `ld.parameters.${name}`;
            range = {
                startColumn: linePrefix.lastIndexOf(parameterMatch[1]) + 1,
                endColumn: cursorColumn,
            };
        } else if (insideBracketsMatch) {
            insertText = `ld.parameters.${name}`;
            range = {
                startColumn: insideBracketsMatch.index! + 3,
                endColumn: cursorColumn,
            };
        } else if (ldMatch) {
            range = {
                startColumn: linePrefix.lastIndexOf(ldMatch[1]) + 1,
                endColumn: cursorColumn,
            };
        } else if (/\$$/.test(linePrefix)) {
            insertText = `{ld.parameters.${name}}`;
        }
        return {
            label: `ld.parameters.${name}`,
            detail: config.description ? ` - ${config.description}` : null,
            description: null,
            documentation: config.description ?? null,
            kind: 'parameter',
            insertText,
            isSnippet: false,
            filterText: null,
            sortText: `${isRelevant ? '0' : defaultSortGroup}${name}`,
            range,
            triggersSuggest: false,
        };
    });
};

export const getSqlSuggestions = ({
    context,
    linePrefix,
    nextChar,
    triggerCharacter,
    data,
}: SqlSuggestionInput): SqlSuggestion[] => {
    const { expectation, prefix, tables, ctes } = context;
    const { quoteChar, settings } = data;
    const cursorColumn = linePrefix.length + 1;
    const closesQuote = nextChar === quoteChar;
    const wordRange = {
        startColumn: prefix.partialStart + 1,
        endColumn: cursorColumn,
    };

    if (triggerCharacter === ' ' && !context.followsSeparator) return [];
    if (expectation.kind === 'none') return [];
    if (
        expectation.kind === 'parameter' ||
        prefix.qualifiers[0] === 'ld' ||
        /\$\{?$/.test(linePrefix)
    ) {
        return getParameterSuggestions(
            linePrefix,
            data.parameters,
            wordRange,
            '0',
        );
    }

    // Replaces the typed segment, including an unclosed opening quote and
    // its auto-closed pair
    const identifier = ({
        label,
        detail = null,
        description = null,
        documentation = null,
        kind,
        segments,
        sortText,
        isTerminal,
    }: {
        label: string;
        detail?: string | null;
        description?: string | null;
        documentation?: string | null;
        kind: SqlSuggestionKind;
        segments: string[];
        sortText: string;
        isTerminal: boolean;
    }): SqlSuggestion => {
        const base = {
            label,
            detail,
            description,
            documentation,
            kind,
            isSnippet: false,
            sortText,
            triggersSuggest: false,
        };
        if (prefix.isQuotedPath) {
            const insertText = segments
                .map((s) => applyCasePreference(s, settings))
                .join('.');
            return {
                ...base,
                insertText:
                    isTerminal && !closesQuote
                        ? `${insertText}${quoteChar}`
                        : insertText,
                filterText: null,
                range: {
                    startColumn: prefix.partialStart + 1,
                    endColumn: cursorColumn,
                },
            };
        }
        const insertText = segments
            .map((s) => formatIdentifier(s, quoteChar, settings))
            .join('.');
        if (prefix.openQuoteStart !== null) {
            return {
                ...base,
                insertText,
                filterText: `${quoteChar}${label}`,
                range: {
                    startColumn: prefix.openQuoteStart + 1,
                    endColumn: cursorColumn + (closesQuote ? 1 : 0),
                },
            };
        }
        return { ...base, insertText, filterText: null, range: wordRange };
    };

    const columnSegments = (name: string) =>
        // Backtick warehouses expose nested columns as dotted paths
        quoteChar === '`' ? name.split('.') : [name];

    const columnItems = (
        columns: ScopedColumn[],
        sortGroup: string,
    ): SqlSuggestion[] => {
        const seen = new Set<string>();
        return columns.flatMap((column) => {
            const key = `${column.owner}.${column.name}`.toLowerCase();
            if (seen.has(key)) return [];
            seen.add(key);
            const label = applyCasePreference(column.name, settings);
            return [
                identifier({
                    label,
                    detail: column.type ? ` ${column.type}` : null,
                    description: column.owner,
                    documentation: `Column of ${column.owner}${
                        column.type ? ` (${column.type})` : ''
                    }`,
                    kind: 'column',
                    segments: columnSegments(column.name),
                    sortText: `${sortGroup}${label.toLowerCase()}`,
                    isTerminal: true,
                }),
            ];
        });
    };

    const keywordItems = (keywords: string[], sortGroup: string) =>
        prefix.openQuoteStart !== null
            ? []
            : keywords.map(
                  (keyword, index): SqlSuggestion => ({
                      label: matchKeywordCase(keyword, prefix.partial),
                      detail: null,
                      description: null,
                      documentation: null,
                      kind: 'keyword',
                      insertText: matchKeywordCase(keyword, prefix.partial),
                      isSnippet: false,
                      filterText: null,
                      sortText: `${sortGroup}${String(index).padStart(3, '0')}`,
                      range: wordRange,
                      triggersSuggest: false,
                  }),
              );

    // Statement starters, from bare SELECT up to every column of the sidebar table
    const selectSnippets = (): SqlSuggestion[] => {
        if (prefix.openQuoteStart !== null) return [];
        const select = matchKeywordCase('SELECT', prefix.partial);
        const from = matchKeywordCase('FROM', prefix.partial);
        const snippet = (
            label: string,
            insertText: string,
            index: number,
            documentation: string | null,
            triggersSuggest: boolean,
        ): SqlSuggestion => ({
            label,
            detail: null,
            description: 'snippet',
            documentation,
            kind: 'keyword',
            insertText,
            isSnippet: false,
            filterText: select,
            sortText: `0000~${index}`,
            range: wordRange,
            triggersSuggest,
        });
        const items = [
            snippet(`${select} *`, `${select} *`, 1, null, false),
            snippet(
                `${select} * ${from}`,
                `${select} * ${from} `,
                2,
                null,
                true,
            ),
        ];
        const active = data.activeTable;
        const catalog = data.catalog;
        if (!active || !catalog) return items;
        const columns = data.fields.filter(
            (field) =>
                field.table === active.table && field.schema === active.schema,
        );
        if (columns.length === 0) return items;
        const path = tablePathSegments(
            catalog,
            active.schema,
            active.table,
            settings?.qualification,
        )
            .map((segment) => formatIdentifier(segment, quoteChar, settings))
            .join('.');
        const names = columns.map((column) =>
            formatIdentifier(column.name, quoteChar, settings),
        );
        const preview = columns
            .slice(0, 3)
            .map((column) => column.name)
            .join(', ');
        const body =
            names.length > 3
                ? `${select}\n    ${names.join(',\n    ')}\n${from} ${path}`
                : `${select} ${names.join(', ')} ${from} ${path}`;
        return [
            ...items,
            snippet(
                `${select} ${preview}${columns.length > 3 ? ', …' : ''} ${from} ${active.table}`,
                body,
                3,
                `All ${columns.length} columns of ${active.table}`,
                false,
            ),
        ];
    };

    const catalogItems = (schemas: string[], catalogTables: string[]) => [
        ...schemas.map((schema) =>
            identifier({
                label: schema,
                description: 'schema',
                kind: 'schema',
                segments: [schema],
                sortText: `0${schema}`,
                isTerminal: false,
            }),
        ),
        ...catalogTables.map((table) =>
            identifier({
                label: table,
                description: 'table',
                kind: 'table',
                segments: [table],
                sortText: `1${table}`,
                isTerminal: true,
            }),
        ),
    ];

    if (prefix.qualifiers.length > 0) {
        switch (expectation.kind) {
            case 'table': {
                const scoped = getCatalogScopeSuggestions(
                    data.catalog,
                    prefix.qualifiers,
                );
                return scoped
                    ? catalogItems(scoped.schemas, scoped.tables)
                    : [];
            }
            case 'value': {
                const ref = resolveQualifier(prefix.qualifiers, tables);
                return ref
                    ? columnItems(getRefColumns(ref, data.fields), '0')
                    : [];
            }
            default:
                return [];
        }
    }

    switch (expectation.kind) {
        case 'keyword':
            return [
                ...keywordItems(expectation.keywords, '0'),
                ...(expectation.keywords.includes('SELECT')
                    ? selectSnippets()
                    : []),
            ];
        case 'table': {
            const cteItems = ctes.map((cte) =>
                identifier({
                    label: cte.name,
                    description: 'CTE',
                    kind: 'table',
                    segments: [cte.name],
                    sortText: `0${cte.name}`,
                    isTerminal: true,
                }),
            );
            const catalog = data.catalog;
            const schemas = catalog?.tablesBySchema ?? [];
            const active = data.activeTable;
            // Bare labels keep fuzzy matching on the name; the full path is inserted
            const tableItems = schemas.flatMap(({ schema, tables: t }) =>
                Object.keys(t).map((table) => {
                    // The sidebar table sorts with CTEs so it tops the list
                    const isActive =
                        active?.schema === schema.toString() &&
                        active.table === table;
                    return identifier({
                        label: table,
                        description: isActive
                            ? `${schema.toString()} · selected`
                            : schema.toString(),
                        documentation: `${catalog!.database}.${schema.toString()}.${table}`,
                        kind: 'table',
                        segments: tablePathSegments(
                            catalog!,
                            schema.toString(),
                            table,
                            settings?.qualification,
                        ),
                        sortText: isActive ? `0${table}` : `1${table}`,
                        isTerminal: true,
                    });
                }),
            );
            const schemaItems = schemas.map(({ schema }) =>
                identifier({
                    label: schema.toString(),
                    description: 'schema',
                    kind: 'schema',
                    segments: [schema.toString()],
                    sortText: `2${schema.toString()}`,
                    isTerminal: false,
                }),
            );
            const databaseItems = catalog
                ? [
                      identifier({
                          label: catalog.database,
                          description: 'database',
                          kind: 'database',
                          segments: [catalog.database],
                          sortText: `3${catalog.database}`,
                          isTerminal: false,
                      }),
                  ]
                : [];
            return [
                ...cteItems,
                ...tableItems,
                ...schemaItems,
                ...databaseItems,
            ];
        }
        case 'value': {
            const scopedColumns = tables.flatMap((ref) =>
                getRefColumns(ref, data.fields),
            );
            const otherColumns = data.fields
                .filter(
                    (field) =>
                        !tables.some((ref) => fieldBelongsTo(field, ref)),
                )
                .map((field) => ({
                    name: field.name,
                    type: field.type,
                    owner: field.table,
                }));
            const qualifierItems = tables.flatMap((ref) => {
                const name = refName(ref);
                return name
                    ? [
                          identifier({
                              label: name,
                              description: ref.alias
                                  ? ref.path.join('.') || 'subquery'
                                  : 'table',
                              kind: 'alias',
                              segments: [name],
                              sortText: `2${name}`,
                              isTerminal: false,
                          }),
                      ]
                    : [];
            });
            const functionItems =
                prefix.openQuoteStart !== null
                    ? []
                    : data.functions.map((fn): SqlSuggestion => {
                          const takesArguments = fn.signature.includes('(');
                          const name = matchKeywordCase(
                              fn.name,
                              prefix.partial,
                          );
                          return {
                              label: name,
                              detail: null,
                              description: 'function',
                              documentation: fn.signature,
                              kind: 'function',
                              insertText: takesArguments ? `${name}($0)` : name,
                              isSnippet: takesArguments,
                              filterText: null,
                              sortText: `3${fn.name}`,
                              range: wordRange,
                              triggersSuggest: false,
                          };
                      });
            return [
                ...columnItems(scopedColumns, '0'),
                ...columnItems(otherColumns, '1'),
                ...qualifierItems,
                ...keywordItems(expectation.keywords, '3'),
                ...functionItems,
                ...(prefix.openQuoteStart !== null
                    ? []
                    : getParameterSuggestions(
                          linePrefix,
                          data.parameters,
                          wordRange,
                          '4',
                      )),
            ];
        }
        default:
            return [];
    }
};
