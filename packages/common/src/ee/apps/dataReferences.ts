import { parse } from '@babel/parser';
import type * as t from '@babel/types';

/**
 * Static extraction of Lightdash data references (query fields, saved-chart
 * uuids, external-connection aliases) from data-app source bundles.
 * Resolution is deliberately bounded: anything not statically recoverable
 * degrades to a counted unresolved part — never a guess, never a failure.
 */

// Bump when the extractor learns new patterns so persisted results can be
// detected as stale and re-extracted.
export const DATA_REFERENCE_EXTRACTOR_VERSION = 1;

export type DataAppSourceFile = {
    path: string; // relative to the bundle root, forward slashes
    content: string;
};

export type DataReferenceLocation = {
    path: string;
    line: number; // 1-based
    column: number; // 1-based
};

export type QueryReferenceUnresolvedPart =
    | 'explore'
    | 'dimensions'
    | 'metrics'
    | 'filters'
    | 'sorts'
    | 'parameters'
    | 'localFields';

export type ExtractedQueryReference = {
    kind: 'query';
    /** null = the explore name did not resolve to exactly one string. */
    explore: string | null;
    dimensions: string[];
    metrics: string[];
    filterFields: string[];
    sortFields: string[];
    parameterKeys: string[];
    /** Fields defined inline (table calcs, additional metrics, custom
     *  dimensions) — checkers must not flag these as unknown explore fields. */
    localFields: string[];
    unresolved: QueryReferenceUnresolvedPart[];
    location: DataReferenceLocation;
};

export type SavedChartReferenceUnresolvedPart = 'chartUuid' | 'filters';

export type ExtractedSavedChartReference = {
    kind: 'savedChart';
    /** null = the uuid did not resolve to exactly one string. */
    chartUuid: string | null;
    /** Qualified field ids passed to `.filters()` (ANDed server-side). */
    filterFields: string[];
    unresolved: SavedChartReferenceUnresolvedPart[];
    location: DataReferenceLocation;
};

export type ExtractedExternalFetchReference = {
    kind: 'externalFetch';
    /** null = the alias did not resolve to exactly one string. */
    alias: string | null;
    /** Request path when statically known. Informational only. */
    path: string | null;
    unresolved: 'alias'[];
    location: DataReferenceLocation;
};

export type GlobalFilterReferenceUnresolvedPart = 'explore' | 'field';

/**
 * An `addFilter({ field, explore })` call from the template's
 * `useGlobalFilters()` hook — the entry points of the fields that flow into
 * queries through the (otherwise dynamic) `.filters(filtersFor(explore))`.
 */
export type ExtractedGlobalFilterReference = {
    kind: 'globalFilter';
    explore: string | null;
    field: string | null;
    unresolved: GlobalFilterReferenceUnresolvedPart[];
    location: DataReferenceLocation;
};

export type ExtractedDataReference =
    | ExtractedQueryReference
    | ExtractedSavedChartReference
    | ExtractedExternalFetchReference
    | ExtractedGlobalFilterReference;

export type DataReferenceParseError = {
    path: string;
    message: string;
};

export type DataReferenceStats = {
    callSites: number;
    fullyResolved: number;
    /** Some data recovered, but at least one part could not be resolved. */
    partiallyResolved: number;
    /** The reference's primary identity (explore/uuid/alias) is unknown. */
    unresolved: number;
};

export type DataAppDataReferences = {
    extractorVersion: number;
    references: ExtractedDataReference[];
    parseErrors: DataReferenceParseError[];
    stats: DataReferenceStats;
};

export function isReferenceFullyResolved(ref: ExtractedDataReference): boolean {
    return ref.unresolved.length === 0;
}

export function computeDataReferenceStats(
    references: ExtractedDataReference[],
): DataReferenceStats {
    let fullyResolved = 0;
    let partiallyResolved = 0;
    let unresolved = 0;
    for (const ref of references) {
        if (ref.unresolved.length === 0) {
            fullyResolved += 1;
        } else {
            const identityKnown =
                (ref.kind === 'query' && ref.explore !== null) ||
                (ref.kind === 'savedChart' && ref.chartUuid !== null) ||
                (ref.kind === 'externalFetch' && ref.alias !== null) ||
                (ref.kind === 'globalFilter' && ref.field !== null);
            if (identityKnown) partiallyResolved += 1;
            else unresolved += 1;
        }
    }
    return {
        callSites: references.length,
        fullyResolved,
        partiallyResolved,
        unresolved,
    };
}

const SDK_MODULE = '@lightdash/query-sdk';
const MAX_RESOLUTION_DEPTH = 12;
const PARSEABLE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

type Binding =
    | { kind: 'init'; init: t.Node | null; scope: Scope }
    | { kind: 'import'; source: string; imported: string; module: ModuleInfo }
    | {
          kind: 'useState';
          init: t.Node | null;
          setterArgs: t.Node[];
          setterEscapes: boolean;
          scope: Scope;
      }
    | { kind: 'stateSetter'; target: Extract<Binding, { kind: 'useState' }> }
    // Destructured property of a call result: `const { addFilter } = useGlobalFilters()`.
    | { kind: 'callProp'; calleeName: string; prop: string }
    | { kind: 'opaque' };

type Scope = {
    parent: Scope | null;
    module: ModuleInfo;
    bindings: Map<string, Binding>;
};

type ModuleExport =
    | { kind: 'local'; name: string }
    | { kind: 'reexport'; source: string; imported: string };

type ModuleInfo = {
    path: string;
    program: t.Program | null;
    programScope: Scope | null;
    exports: Map<string, ModuleExport>;
};

/** A statically known string value set. `complete` = the set is exhaustive. */
type ResolvedStrings = { values: Set<string>; complete: boolean };

const unresolvedStrings = (): ResolvedStrings => ({
    values: new Set(),
    complete: false,
});

const singleValue = (r: ResolvedStrings): string | null =>
    r.complete && r.values.size === 1 ? [...r.values][0] : null;

/** Containers (object/array literals) a value expression may evaluate to. */
type ResolvedContainers = {
    containers: {
        node: t.ObjectExpression | t.ArrayExpression;
        scope: Scope;
    }[];
    complete: boolean;
};

type MutableQueryReference = {
    kind: 'query';
    explore: string | null;
    dimensions: Set<string>;
    metrics: Set<string>;
    filterFields: Set<string>;
    sortFields: Set<string>;
    parameterKeys: Set<string>;
    localFields: Set<string>;
    unresolved: Set<QueryReferenceUnresolvedPart>;
    location: DataReferenceLocation;
};

type MutableSavedChartReference = {
    kind: 'savedChart';
    chartUuid: string | null;
    filterFields: Set<string>;
    unresolved: Set<SavedChartReferenceUnresolvedPart>;
    location: DataReferenceLocation;
};

const isNode = (value: unknown): value is t.Node =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string';

/** Unwrap TS assertions and other transparent expression wrappers. */
function unwrapExpression(node: t.Node): t.Node {
    let current = node;
    for (;;) {
        if (
            current.type === 'TSAsExpression' ||
            current.type === 'TSSatisfiesExpression' ||
            current.type === 'TSNonNullExpression' ||
            current.type === 'TSTypeAssertion' ||
            current.type === 'TSInstantiationExpression' ||
            current.type === 'TypeCastExpression'
        ) {
            current = current.expression;
        } else if (current.type === 'ParenthesizedExpression') {
            current = current.expression;
        } else {
            return current;
        }
    }
}

const isCall = (
    node: t.Node,
): node is t.CallExpression | t.OptionalCallExpression =>
    node.type === 'CallExpression' || node.type === 'OptionalCallExpression';

const isMember = (
    node: t.Node,
): node is t.MemberExpression | t.OptionalMemberExpression =>
    node.type === 'MemberExpression' ||
    node.type === 'OptionalMemberExpression';

/** Static property name of a member expression, or null when computed/dynamic. */
function memberPropertyName(
    node: t.MemberExpression | t.OptionalMemberExpression,
): string | null {
    if (!node.computed && node.property.type === 'Identifier') {
        return node.property.name;
    }
    if (node.property.type === 'StringLiteral') return node.property.value;
    return null;
}

/** Static key name of an object property, or null when computed/dynamic. */
function objectPropertyKeyName(prop: t.ObjectProperty): string | null {
    if (!prop.computed && prop.key.type === 'Identifier') return prop.key.name;
    if (prop.key.type === 'StringLiteral') return prop.key.value;
    return null;
}

function nodeLocation(node: t.Node, path: string): DataReferenceLocation {
    return {
        path,
        line: node.loc?.start.line ?? 1,
        column: (node.loc?.start.column ?? 0) + 1,
    };
}

type ChainRoot = {
    type: 'query' | 'savedChart';
    call: t.CallExpression | t.OptionalCallExpression;
    scope: Scope;
};

/** All identifier names bound by a pattern (params, destructures, rest). */
function patternNames(pattern: t.Node): string[] {
    const names: string[] = [];
    const visit = (node: t.Node | null | undefined): void => {
        if (!node) return;
        switch (node.type) {
            case 'Identifier':
                names.push(node.name);
                break;
            case 'ObjectPattern':
                for (const prop of node.properties) visit(prop);
                break;
            case 'ObjectProperty':
                visit(node.value);
                break;
            case 'ArrayPattern':
                for (const element of node.elements) visit(element);
                break;
            case 'AssignmentPattern':
                visit(node.left);
                break;
            case 'RestElement':
                visit(node.argument);
                break;
            default:
                break;
        }
    };
    visit(pattern);
    return names;
}

/** Names declared by a declaration statement (for export tables). */
function declaredNames(decl: t.Declaration): string[] {
    if (decl.type === 'VariableDeclaration') {
        return decl.declarations.flatMap((d) => patternNames(d.id));
    }
    if (
        (decl.type === 'FunctionDeclaration' ||
            decl.type === 'ClassDeclaration') &&
        decl.id
    ) {
        return [decl.id.name];
    }
    return [];
}

/** Return expressions of a function: expression body or top-level returns. */
function functionReturnExpressions(
    fn: t.ArrowFunctionExpression | t.FunctionExpression,
): t.Node[] {
    if (fn.body.type !== 'BlockStatement') return [fn.body];
    const returns: t.Node[] = [];
    const visit = (node: t.Node): void => {
        if (
            node.type === 'ArrowFunctionExpression' ||
            node.type === 'FunctionExpression' ||
            node.type === 'FunctionDeclaration'
        ) {
            return; // don't cross into nested functions
        }
        if (node.type === 'ReturnStatement') {
            if (node.argument) returns.push(node.argument);
            return;
        }
        for (const key of Object.keys(node)) {
            const value = (node as unknown as Record<string, unknown>)[key];
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (isNode(item)) visit(item);
                }
            } else if (isNode(value)) {
                visit(value);
            }
        }
    };
    visit(fn.body);
    return returns;
}

class DataReferenceExtractor {
    private readonly modules = new Map<string, ModuleInfo>();

    private readonly parseErrors: DataReferenceParseError[] = [];

    /** Query/savedChart references keyed by their chain-root call node. */
    private readonly queryRefs = new Map<t.Node, MutableQueryReference>();

    private readonly savedChartRefs = new Map<
        t.Node,
        MutableSavedChartReference
    >();

    private readonly otherRefs: (
        | ExtractedExternalFetchReference
        | ExtractedGlobalFilterReference
    )[] = [];

    /** Chain calls already consumed by an outer chain walk. */
    private readonly processedCalls = new Set<t.Node>();

    /** Deferred value resolutions — bindings that accumulate during the walk
     *  (useState setter args) must be complete before anything resolves. */
    private readonly pending: (() => void)[] = [];

    extract(files: DataAppSourceFile[]): DataAppDataReferences {
        const parseable = files.filter((f) =>
            PARSEABLE_EXTENSIONS.some((ext) => f.path.endsWith(ext)),
        );
        for (const file of parseable) this.parseModule(file);
        for (const module of this.modules.values()) {
            if (module.program && module.programScope) {
                this.walk(module.program, module.programScope, null, null);
            }
        }
        for (const resolve of this.pending) resolve();

        const references = [
            ...[...this.queryRefs.values()].map(
                (ref): ExtractedQueryReference => ({
                    kind: 'query',
                    explore: ref.explore,
                    dimensions: [...ref.dimensions].sort(),
                    metrics: [...ref.metrics].sort(),
                    filterFields: [...ref.filterFields].sort(),
                    sortFields: [...ref.sortFields].sort(),
                    parameterKeys: [...ref.parameterKeys].sort(),
                    localFields: [...ref.localFields].sort(),
                    unresolved: [...ref.unresolved].sort(),
                    location: ref.location,
                }),
            ),
            ...[...this.savedChartRefs.values()].map(
                (ref): ExtractedSavedChartReference => ({
                    kind: 'savedChart',
                    chartUuid: ref.chartUuid,
                    filterFields: [...ref.filterFields].sort(),
                    unresolved: [...ref.unresolved].sort(),
                    location: ref.location,
                }),
            ),
            ...this.otherRefs,
        ].sort(
            (a, b) =>
                a.location.path.localeCompare(b.location.path) ||
                a.location.line - b.location.line ||
                a.location.column - b.location.column,
        );

        return {
            extractorVersion: DATA_REFERENCE_EXTRACTOR_VERSION,
            references,
            parseErrors: this.parseErrors,
            stats: computeDataReferenceStats(references),
        };
    }

    // -- Parsing & scopes ---------------------------------------------------

    private parseModule(file: DataAppSourceFile): void {
        const module: ModuleInfo = {
            path: file.path,
            program: null,
            programScope: null,
            exports: new Map(),
        };
        this.modules.set(file.path, module);
        try {
            const isTs =
                file.path.endsWith('.ts') || file.path.endsWith('.tsx');
            const allowJsx = !file.path.endsWith('.ts');
            const ast = parse(file.content, {
                sourceType: 'module',
                errorRecovery: true,
                plugins: [
                    ...(isTs ? (['typescript'] as const) : []),
                    ...(allowJsx ? (['jsx'] as const) : []),
                ],
            });
            module.program = ast.program;
            module.programScope = {
                parent: null,
                module,
                bindings: new Map(),
            };
            this.declareStatements(
                ast.program.body,
                module.programScope,
                module,
            );
        } catch (err) {
            this.parseErrors.push({
                path: file.path,
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /** Register declarations of a statement list into `scope` (pre-scan, so
     *  later-declared consts resolve from earlier references). */
    private declareStatements(
        statements: t.Statement[],
        scope: Scope,
        module: ModuleInfo | null,
    ): void {
        for (const stmt of statements) {
            switch (stmt.type) {
                case 'VariableDeclaration':
                    this.declareVariableDeclaration(stmt, scope);
                    break;
                case 'FunctionDeclaration':
                case 'ClassDeclaration':
                    if (stmt.id)
                        scope.bindings.set(stmt.id.name, { kind: 'opaque' });
                    break;
                case 'ImportDeclaration':
                    this.declareImport(stmt, scope);
                    break;
                case 'ExportNamedDeclaration':
                    if (stmt.declaration) {
                        this.declareStatements([stmt.declaration], scope, null);
                        if (module) {
                            for (const name of declaredNames(
                                stmt.declaration,
                            )) {
                                module.exports.set(name, {
                                    kind: 'local',
                                    name,
                                });
                            }
                        }
                    }
                    for (const spec of stmt.specifiers) {
                        if (spec.type === 'ExportSpecifier' && module) {
                            const exported =
                                spec.exported.type === 'Identifier'
                                    ? spec.exported.name
                                    : spec.exported.value;
                            module.exports.set(
                                exported,
                                stmt.source
                                    ? {
                                          kind: 'reexport',
                                          source: stmt.source.value,
                                          imported: spec.local.name,
                                      }
                                    : { kind: 'local', name: spec.local.name },
                            );
                        }
                    }
                    break;
                default:
                    break;
            }
        }
    }

    private declareVariableDeclaration(
        decl: t.VariableDeclaration,
        scope: Scope,
    ): void {
        for (const declarator of decl.declarations) {
            if (declarator.id.type !== 'VoidPattern') {
                this.declarePattern(
                    declarator.id,
                    declarator.init ?? null,
                    scope,
                );
            }
        }
    }

    private declarePattern(
        id: t.LVal,
        init: t.Node | null,
        scope: Scope,
    ): void {
        if (id.type === 'Identifier') {
            scope.bindings.set(id.name, { kind: 'init', init, scope });
            return;
        }
        const initExpr = init ? unwrapExpression(init) : null;
        if (id.type === 'ArrayPattern' && initExpr && isCall(initExpr)) {
            // `const [value, setValue] = useState(init)`
            const callee = unwrapExpression(initExpr.callee);
            let calleeName: string | null = null;
            if (callee.type === 'Identifier') {
                calleeName = callee.name;
            } else if (isMember(callee)) {
                calleeName = memberPropertyName(callee);
            }
            if (calleeName === 'useState') {
                const [valueId, setterId] = id.elements;
                if (valueId?.type === 'Identifier') {
                    const stateBinding: Extract<Binding, { kind: 'useState' }> =
                        {
                            kind: 'useState',
                            init: initExpr.arguments[0] ?? null,
                            setterArgs: [],
                            setterEscapes: false,
                            scope,
                        };
                    scope.bindings.set(valueId.name, stateBinding);
                    if (setterId?.type === 'Identifier') {
                        scope.bindings.set(setterId.name, {
                            kind: 'stateSetter',
                            target: stateBinding,
                        });
                    }
                    return;
                }
            }
        }
        if (id.type === 'ObjectPattern' && initExpr && isCall(initExpr)) {
            // `const { addFilter, filtersFor } = useGlobalFilters()`
            const callee = unwrapExpression(initExpr.callee);
            if (callee.type === 'Identifier') {
                for (const prop of id.properties) {
                    let bound = false;
                    if (
                        prop.type === 'ObjectProperty' &&
                        prop.value.type === 'Identifier'
                    ) {
                        const key = objectPropertyKeyName(prop);
                        if (key) {
                            scope.bindings.set(prop.value.name, {
                                kind: 'callProp',
                                calleeName: callee.name,
                                prop: key,
                            });
                            bound = true;
                        }
                    }
                    if (!bound) {
                        for (const name of patternNames(prop)) {
                            scope.bindings.set(name, { kind: 'opaque' });
                        }
                    }
                }
                return;
            }
        }
        for (const name of patternNames(id)) {
            scope.bindings.set(name, { kind: 'opaque' });
        }
    }

    private declareImport(stmt: t.ImportDeclaration, scope: Scope): void {
        const source = stmt.source.value;
        for (const spec of stmt.specifiers) {
            if (spec.type === 'ImportSpecifier') {
                const imported =
                    spec.imported.type === 'Identifier'
                        ? spec.imported.name
                        : spec.imported.value;
                scope.bindings.set(spec.local.name, {
                    kind: 'import',
                    source,
                    imported,
                    module: scope.module,
                });
            } else if (spec.type === 'ImportDefaultSpecifier') {
                scope.bindings.set(spec.local.name, {
                    kind: 'import',
                    source,
                    imported: 'default',
                    module: scope.module,
                });
            } else {
                scope.bindings.set(spec.local.name, { kind: 'opaque' });
            }
        }
    }

    private lookupBinding(name: string, scope: Scope): Binding | null {
        let current: Scope | null = scope;
        while (current) {
            const binding = current.bindings.get(name);
            if (binding) return binding;
            current = current.parent;
        }
        return null;
    }

    // -- Module graph -------------------------------------------------------

    private resolveModulePath(
        fromPath: string,
        source: string,
    ): ModuleInfo | null {
        let base: string;
        if (source.startsWith('@/')) {
            base = `src/${source.slice(2)}`;
        } else if (source.startsWith('.')) {
            const dir = fromPath.split('/').slice(0, -1);
            const segments = [...dir, ...source.split('/')];
            const normalized: string[] = [];
            for (const segment of segments) {
                if (segment === '..') {
                    if (normalized.length === 0) return null;
                    normalized.pop();
                } else if (segment !== '.' && segment !== '') {
                    normalized.push(segment);
                }
            }
            base = normalized.join('/');
        } else {
            return null; // bare package import
        }
        const candidates = [
            base,
            ...PARSEABLE_EXTENSIONS.map((ext) => `${base}${ext}`),
            ...PARSEABLE_EXTENSIONS.map((ext) => `${base}/index${ext}`),
        ];
        for (const candidate of candidates) {
            const module = this.modules.get(candidate);
            if (module) return module;
        }
        return null;
    }

    /** Resolve an exported name of a module to its initializer expression. */
    private resolveModuleExport(
        module: ModuleInfo,
        name: string,
        depth: number,
    ): { node: t.Node; scope: Scope } | null {
        if (depth > MAX_RESOLUTION_DEPTH || !module.programScope) return null;
        const exported = module.exports.get(name);
        if (!exported) return null;
        if (exported.kind === 'reexport') {
            const target = this.resolveModulePath(module.path, exported.source);
            return target
                ? this.resolveModuleExport(target, exported.imported, depth + 1)
                : null;
        }
        const binding = module.programScope.bindings.get(exported.name);
        if (binding?.kind === 'init' && binding.init) {
            return { node: binding.init, scope: binding.scope };
        }
        if (binding?.kind === 'import') {
            const target = this.resolveModulePath(module.path, binding.source);
            return target
                ? this.resolveModuleExport(target, binding.imported, depth + 1)
                : null;
        }
        return null;
    }

    /** Follow an import binding to the initializer it refers to, if static. */
    private resolveImportBinding(
        binding: Extract<Binding, { kind: 'import' }>,
        depth: number,
    ): { node: t.Node; scope: Scope } | null {
        const target = this.resolveModulePath(
            binding.module.path,
            binding.source,
        );
        return target
            ? this.resolveModuleExport(target, binding.imported, depth + 1)
            : null;
    }

    /** True when `name` refers to the SDK export: imported (possibly
     *  aliased) or unbound (doc snippets omit imports). Local bindings win. */
    private isSdkName(name: string, scope: Scope, exportName: string): boolean {
        const binding = this.lookupBinding(name, scope);
        if (!binding) return name === exportName;
        return (
            binding.kind === 'import' &&
            binding.source.startsWith(SDK_MODULE) &&
            binding.imported === exportName
        );
    }

    // -- Walk ---------------------------------------------------------------

    private walk(
        node: t.Node,
        scope: Scope,
        parent: t.Node | null,
        parentKey: string | null,
    ): void {
        // Skip TS type-land subtrees (identifiers there are not values), but
        // keep the expression-carrying TS wrappers.
        if (
            node.type.startsWith('TS') &&
            node.type !== 'TSAsExpression' &&
            node.type !== 'TSSatisfiesExpression' &&
            node.type !== 'TSNonNullExpression' &&
            node.type !== 'TSTypeAssertion' &&
            node.type !== 'TSInstantiationExpression'
        ) {
            return;
        }

        let childScope = scope;
        if (
            node.type === 'FunctionDeclaration' ||
            node.type === 'FunctionExpression' ||
            node.type === 'ArrowFunctionExpression' ||
            node.type === 'ObjectMethod' ||
            node.type === 'ClassMethod'
        ) {
            childScope = {
                parent: scope,
                module: scope.module,
                bindings: new Map(),
            };
            for (const param of node.params) {
                for (const name of patternNames(param)) {
                    childScope.bindings.set(name, { kind: 'opaque' });
                }
            }
        } else if (
            node.type === 'BlockStatement' ||
            node.type === 'StaticBlock'
        ) {
            childScope = {
                parent: scope,
                module: scope.module,
                bindings: new Map(),
            };
            this.declareStatements(node.body, childScope, null);
        } else if (node.type === 'CatchClause' && node.param) {
            childScope = {
                parent: scope,
                module: scope.module,
                bindings: new Map(),
            };
            for (const name of patternNames(node.param)) {
                childScope.bindings.set(name, { kind: 'opaque' });
            }
        }

        if (isCall(node) && !this.processedCalls.has(node)) {
            this.processCall(node, childScope);
        }

        if (node.type === 'Identifier' && parent) {
            // A setter that escapes as a value may be called with values we
            // cannot see — poison that state's set.
            const isDirectCallee =
                (parent && isCall(parent) && parentKey === 'callee') ||
                (isMember(parent) && parentKey === 'property');
            if (!isDirectCallee) {
                const binding = this.lookupBinding(node.name, childScope);
                if (binding?.kind === 'stateSetter') {
                    binding.target.setterEscapes = true;
                }
            }
        }

        for (const key of Object.keys(node)) {
            const skipKey =
                key === 'loc' ||
                key === 'leadingComments' ||
                key === 'trailingComments' ||
                key === 'innerComments' ||
                key === 'extra' ||
                // Declarator binding patterns are declarations, not value
                // uses — they must not trip the setter-escape check.
                (node.type === 'VariableDeclarator' && key === 'id');
            if (!skipKey) {
                const value = (node as unknown as Record<string, unknown>)[key];
                if (Array.isArray(value)) {
                    for (const item of value) {
                        if (isNode(item)) {
                            this.walk(item, childScope, node, key);
                        }
                    }
                } else if (isNode(value)) {
                    this.walk(value, childScope, node, key);
                }
            }
        }
    }

    // -- Call classification ------------------------------------------------

    private processCall(
        call: t.CallExpression | t.OptionalCallExpression,
        scope: Scope,
    ): void {
        const callee = unwrapExpression(call.callee);

        if (callee.type === 'Identifier') {
            const binding = this.lookupBinding(callee.name, scope);
            if (binding?.kind === 'stateSetter') {
                const arg = call.arguments[0];
                if (arg && isNode(arg) && arg.type !== 'ArgumentPlaceholder') {
                    if (
                        arg.type === 'ArrowFunctionExpression' ||
                        arg.type === 'FunctionExpression'
                    ) {
                        binding.target.setterEscapes = true;
                    } else if (arg.type !== 'SpreadElement') {
                        binding.target.setterArgs.push(arg);
                    } else {
                        binding.target.setterEscapes = true;
                    }
                }
                return;
            }

            if (this.isSdkName(callee.name, scope, 'drillDown')) {
                this.processDrillDown(call, scope);
                return;
            }
            if (
                binding?.kind === 'callProp' &&
                binding.calleeName === 'useGlobalFilters' &&
                binding.prop === 'addFilter'
            ) {
                this.processAddFilter(call, scope);
                return;
            }
        }

        if (isMember(callee)) {
            const chain = this.unrollChain(call, scope);
            if (chain) return;
            if (memberPropertyName(callee) === 'externalFetch') {
                this.processExternalFetch(call, scope);
            }
            return;
        }

        // A bare `query('orders')` whose builder methods are chained elsewhere.
        if (callee.type === 'Identifier') {
            this.unrollChain(call, scope);
        }
    }

    /** Walks a member-call chain outermost→root, classifies the root, and
     *  folds every step into its reference. True when consumed. */
    private unrollChain(
        outer: t.CallExpression | t.OptionalCallExpression,
        scope: Scope,
    ): boolean {
        type Step = {
            name: string;
            call: t.CallExpression | t.OptionalCallExpression;
        };
        const steps: Step[] = [];
        let current: t.Node = outer;
        let receiver: t.Node;
        for (;;) {
            if (!isCall(current)) {
                receiver = current;
                break;
            }
            const callee = unwrapExpression(current.callee);
            if (isMember(callee)) {
                const name = memberPropertyName(callee);
                if (name === null) {
                    receiver = current;
                    break;
                }
                steps.unshift({
                    name,
                    call: current,
                });
                current = unwrapExpression(callee.object);
            } else {
                receiver = current;
                break;
            }
        }

        let resolved = this.resolveChainRoot(receiver, scope, 0);
        if (
            !resolved &&
            steps[0]?.name === 'model' &&
            this.isSdkClient(receiver, scope, 0)
        ) {
            // `client.model('orders')...` — the peel consumed `.model` as a
            // step, so classify it as the query root here.
            resolved = {
                root: {
                    type: 'query',
                    call: steps[0].call,
                    scope,
                },
            };
        }
        if (!resolved) {
            // externalFetch is receiver-independent: extract it even when the
            // receiver cannot be traced to the SDK client.
            for (const step of steps) {
                if (step.name === 'externalFetch') {
                    this.markChainProcessed(outer);
                    this.processExternalFetch(step.call, scope);
                    return true;
                }
            }
            // Builder methods on an untraceable receiver: record an
            // unresolved-explore reference rather than drop fields silently.
            const sdkSteps = steps.filter((s) =>
                ['dimensions', 'metrics', 'filters', 'sorts'].includes(s.name),
            );
            if (
                sdkSteps.length > 0 &&
                (receiver.type === 'Identifier' || isMember(receiver))
            ) {
                this.markChainProcessed(outer);
                const ref = this.getQueryRef(receiver, scope.module.path);
                ref.explore = null;
                ref.unresolved.add('explore');
                this.pending.push(() => {
                    for (const step of steps) {
                        this.applyQueryStep(ref, step.name, step.call, scope);
                    }
                });
                return true;
            }
            return false;
        }

        this.markChainProcessed(outer);
        const { root } = resolved;
        if (root.type === 'query') {
            const ref = this.getQueryRefForRoot(root);
            // When the root is this chain's own `.model(...)` step, the step
            // list still contains it — it is the root, not a builder method.
            const chainSteps =
                steps.length > 0 && steps[0].call === root.call
                    ? steps.slice(1)
                    : steps;
            this.pending.push(() => {
                for (const step of chainSteps) {
                    this.applyQueryStep(ref, step.name, step.call, scope);
                }
            });
        } else {
            const ref = this.getSavedChartRefForRoot(root);
            this.pending.push(() => {
                for (const step of steps) {
                    this.applySavedChartStep(ref, step.name, step.call, scope);
                }
            });
        }
        return true;
    }

    /** Marks every member-call along a chain as consumed. */
    private markChainProcessed(outer: t.Node): void {
        let current: t.Node = outer;
        while (isCall(current)) {
            this.processedCalls.add(current);
            const callee = unwrapExpression(current.callee);
            if (!isMember(callee)) break;
            current = unwrapExpression(callee.object);
        }
    }

    private chainRootCache = new Map<t.Node, ChainRoot | null>();

    /** Resolves an expression to the `query()`/`.model()`/`savedChart()`
     *  call that created it, through const bindings, imports, and useMemo. */
    private resolveChainRoot(
        node: t.Node,
        scope: Scope,
        depth: number,
    ): { root: ChainRoot } | null {
        if (depth > MAX_RESOLUTION_DEPTH) return null;
        const expr = unwrapExpression(node);

        if (isCall(expr)) {
            const callee = unwrapExpression(expr.callee);
            if (callee.type === 'Identifier') {
                if (this.isSdkName(callee.name, scope, 'query')) {
                    return {
                        root: { type: 'query', call: expr, scope },
                    };
                }
                if (this.isSdkName(callee.name, scope, 'savedChart')) {
                    return {
                        root: {
                            type: 'savedChart',
                            call: expr,
                            scope,
                        },
                    };
                }
                if (
                    callee.name === 'useMemo' ||
                    callee.name === 'useCallback'
                ) {
                    const factory = expr.arguments[0];
                    if (
                        factory &&
                        isNode(factory) &&
                        (factory.type === 'ArrowFunctionExpression' ||
                            factory.type === 'FunctionExpression')
                    ) {
                        const returned = functionReturnExpressions(factory);
                        if (returned.length === 1) {
                            return this.resolveChainRootThroughChain(
                                returned[0],
                                scope,
                                depth + 1,
                            );
                        }
                    }
                    return null;
                }
            }
            if (isMember(callee) && memberPropertyName(callee) === 'model') {
                // `client.model('orders')` — only when the receiver traces to
                // an SDK client (createClient()/useLightdashClient()).
                const receiver = unwrapExpression(callee.object);
                if (this.isSdkClient(receiver, scope, depth)) {
                    return {
                        root: {
                            type: 'query',
                            call: expr,
                            scope,
                        },
                    };
                }
            }
            return null;
        }

        if (expr.type === 'Identifier') {
            const binding = this.lookupBinding(expr.name, scope);
            if (!binding) return null;
            if (binding.kind === 'init' && binding.init) {
                return this.resolveChainRootThroughChain(
                    binding.init,
                    binding.scope,
                    depth + 1,
                );
            }
            if (binding.kind === 'import') {
                const target = this.resolveImportBinding(binding, depth);
                if (target) {
                    return this.resolveChainRootThroughChain(
                        target.node,
                        target.scope,
                        depth + 1,
                    );
                }
            }
            return null;
        }

        return null;
    }

    /** Like resolveChainRoot, but the expression may itself be a chain —
     *  peel to the innermost call. */
    private resolveChainRootThroughChain(
        node: t.Node,
        scope: Scope,
        depth: number,
    ): { root: ChainRoot } | null {
        let current = unwrapExpression(node);
        for (;;) {
            if (!isCall(current)) {
                return this.resolveChainRoot(current, scope, depth);
            }
            const callee = unwrapExpression(current.callee);
            if (!isMember(callee) || memberPropertyName(callee) === null) {
                return this.resolveChainRoot(current, scope, depth);
            }
            const inner = unwrapExpression(callee.object);
            if (!isCall(inner)) {
                // Chain hanging off an identifier: `base.filters(...)`.
                const viaMember = this.resolveChainRoot(current, scope, depth);
                if (viaMember) return viaMember;
                return this.resolveChainRoot(inner, scope, depth + 1);
            }
            const rootAttempt = this.resolveChainRoot(current, scope, depth);
            if (rootAttempt) return rootAttempt;
            current = inner;
        }
    }

    /** True when `expr` statically evaluates to the SDK client. */
    private isSdkClient(expr: t.Node, scope: Scope, depth: number): boolean {
        if (depth > MAX_RESOLUTION_DEPTH) return false;
        const node = unwrapExpression(expr);
        if (isCall(node)) {
            const callee = unwrapExpression(node.callee);
            return (
                callee.type === 'Identifier' &&
                (this.isSdkName(callee.name, scope, 'createClient') ||
                    this.isSdkName(callee.name, scope, 'useLightdashClient'))
            );
        }
        if (node.type === 'Identifier') {
            const binding = this.lookupBinding(node.name, scope);
            if (binding?.kind === 'init' && binding.init) {
                return this.isSdkClient(binding.init, binding.scope, depth + 1);
            }
            if (binding?.kind === 'import') {
                const target = this.resolveImportBinding(binding, depth);
                return target
                    ? this.isSdkClient(target.node, target.scope, depth + 1)
                    : false;
            }
        }
        return false;
    }

    // -- Reference registry -------------------------------------------------

    private getQueryRef(rootNode: t.Node, path: string): MutableQueryReference {
        const existing = this.queryRefs.get(rootNode);
        if (existing) return existing;
        const ref: MutableQueryReference = {
            kind: 'query',
            explore: null,
            dimensions: new Set(),
            metrics: new Set(),
            filterFields: new Set(),
            sortFields: new Set(),
            parameterKeys: new Set(),
            localFields: new Set(),
            unresolved: new Set(),
            location: nodeLocation(rootNode, path),
        };
        this.queryRefs.set(rootNode, ref);
        return ref;
    }

    private getQueryRefForRoot(root: ChainRoot): MutableQueryReference {
        const existing = this.queryRefs.get(root.call);
        if (existing) return existing;
        const ref = this.getQueryRef(root.call, root.scope.module.path);
        this.pending.push(() => {
            const exploreArg = root.call.arguments[0];
            const resolvedExplore =
                exploreArg &&
                isNode(exploreArg) &&
                exploreArg.type !== 'SpreadElement' &&
                exploreArg.type !== 'ArgumentPlaceholder'
                    ? this.resolveStrings(exploreArg, root.scope, 0)
                    : unresolvedStrings();
            ref.explore = singleValue(resolvedExplore);
            if (ref.explore === null) ref.unresolved.add('explore');
        });
        return ref;
    }

    private getSavedChartRefForRoot(
        root: ChainRoot,
    ): MutableSavedChartReference {
        const existing = this.savedChartRefs.get(root.call);
        if (existing) return existing;
        const ref: MutableSavedChartReference = {
            kind: 'savedChart',
            chartUuid: null,
            filterFields: new Set(),
            unresolved: new Set(),
            location: nodeLocation(root.call, root.scope.module.path),
        };
        this.savedChartRefs.set(root.call, ref);
        this.pending.push(() => {
            const uuidArg = root.call.arguments[0];
            const resolvedUuid =
                uuidArg &&
                isNode(uuidArg) &&
                uuidArg.type !== 'SpreadElement' &&
                uuidArg.type !== 'ArgumentPlaceholder'
                    ? this.resolveStrings(uuidArg, root.scope, 0)
                    : unresolvedStrings();
            ref.chartUuid = singleValue(resolvedUuid);
            if (ref.chartUuid === null) ref.unresolved.add('chartUuid');
        });
        return ref;
    }

    // -- Chain steps --------------------------------------------------------

    private applyQueryStep(
        ref: MutableQueryReference,
        name: string,
        call: t.CallExpression | t.OptionalCallExpression,
        scope: Scope,
    ): void {
        const arg = call.arguments[0];
        const argNode =
            arg && isNode(arg) && arg.type !== 'ArgumentPlaceholder'
                ? arg
                : null;
        switch (name) {
            case 'dimensions':
            case 'metrics': {
                const target =
                    name === 'dimensions' ? ref.dimensions : ref.metrics;
                const resolved = argNode
                    ? this.resolveStringArray(argNode, scope, 0)
                    : unresolvedStrings();
                for (const value of resolved.values) target.add(value);
                if (!resolved.complete) ref.unresolved.add(name);
                break;
            }
            case 'filters':
            case 'sorts': {
                const target =
                    name === 'filters' ? ref.filterFields : ref.sortFields;
                const resolved = argNode
                    ? this.resolveFilterFields(argNode, scope, 0)
                    : unresolvedStrings();
                for (const value of resolved.values) target.add(value);
                if (!resolved.complete) ref.unresolved.add(name);
                break;
            }
            case 'parameters': {
                const resolved = argNode
                    ? this.resolveObjectKeys(argNode, scope, 0)
                    : unresolvedStrings();
                for (const value of resolved.values)
                    ref.parameterKeys.add(value);
                if (!resolved.complete) ref.unresolved.add('parameters');
                break;
            }
            case 'tableCalculations':
            case 'additionalMetrics':
            case 'customDimensions': {
                const resolved = argNode
                    ? this.resolveDefinitionNames(
                          argNode,
                          scope,
                          0,
                          name === 'customDimensions' ? 'id' : 'name',
                      )
                    : unresolvedStrings();
                for (const value of resolved.values) ref.localFields.add(value);
                if (!resolved.complete) ref.unresolved.add('localFields');
                break;
            }
            case 'model':
                // Consumed as the chain root (`client.model('orders')`).
                break;
            case 'externalFetch':
                this.processExternalFetch(call, scope);
                break;
            default:
                // label/limit/build/parameters-free methods carry no refs.
                break;
        }
    }

    private applySavedChartStep(
        ref: MutableSavedChartReference,
        name: string,
        call: t.CallExpression | t.OptionalCallExpression,
        scope: Scope,
    ): void {
        if (name !== 'filters') return; // structural methods are SDK no-ops
        const arg = call.arguments[0];
        const argNode =
            arg && isNode(arg) && arg.type !== 'ArgumentPlaceholder'
                ? arg
                : null;
        const resolved = argNode
            ? this.resolveFilterFields(argNode, scope, 0)
            : unresolvedStrings();
        for (const value of resolved.values) ref.filterFields.add(value);
        if (!resolved.complete) ref.unresolved.add('filters');
    }

    // -- Non-chain call sites -----------------------------------------------

    /** Explore name of a query root, resolved directly from its argument. */
    private resolveRootExplore(root: ChainRoot): string | null {
        const exploreArg = root.call.arguments[0];
        if (
            !exploreArg ||
            !isNode(exploreArg) ||
            exploreArg.type === 'SpreadElement' ||
            exploreArg.type === 'ArgumentPlaceholder'
        ) {
            return null;
        }
        return singleValue(this.resolveStrings(exploreArg, root.scope, 0));
    }

    private processDrillDown(
        call: t.CallExpression | t.OptionalCallExpression,
        scope: Scope,
    ): void {
        this.processedCalls.add(call);
        const ref = this.getQueryRef(call, scope.module.path);
        this.pending.push(() => {
            const arg = call.arguments[0];
            if (!arg || !isNode(arg) || arg.type !== 'ObjectExpression') {
                ref.unresolved.add('explore');
                ref.unresolved.add('dimensions');
                ref.unresolved.add('metrics');
                return;
            }
            const props = new Map<string, t.Node>();
            let hasSpread = false;
            for (const prop of arg.properties) {
                if (prop.type === 'ObjectProperty') {
                    const key = objectPropertyKeyName(prop);
                    if (key) props.set(key, prop.value);
                } else if (prop.type === 'SpreadElement') {
                    hasSpread = true;
                }
            }

            const sourceQuery = props.get('sourceQuery');
            const sourceRoot = sourceQuery
                ? this.resolveChainRootThroughChain(sourceQuery, scope, 0)
                : null;
            if (sourceRoot && sourceRoot.root.type === 'query') {
                ref.explore = this.resolveRootExplore(sourceRoot.root);
            }
            if (ref.explore === null) ref.unresolved.add('explore');

            for (const [prop, part] of [
                ['dimension', 'dimensions'],
                ['metric', 'metrics'],
            ] as const) {
                const value = props.get(prop);
                const resolved = value
                    ? this.resolveStrings(value, scope, 0)
                    : unresolvedStrings();
                const target =
                    part === 'dimensions' ? ref.dimensions : ref.metrics;
                for (const v of resolved.values) target.add(v);
                if (!resolved.complete || (hasSpread && !value)) {
                    ref.unresolved.add(part);
                }
            }
        });
    }

    private processAddFilter(
        call: t.CallExpression | t.OptionalCallExpression,
        scope: Scope,
    ): void {
        this.processedCalls.add(call);
        this.pending.push(() => this.resolveAddFilter(call, scope));
    }

    private resolveAddFilter(
        call: t.CallExpression | t.OptionalCallExpression,
        scope: Scope,
    ): void {
        const arg = call.arguments[0];
        const unresolved = new Set<GlobalFilterReferenceUnresolvedPart>();
        let field: string | null = null;
        let explore: string | null = null;
        if (arg && isNode(arg) && arg.type === 'ObjectExpression') {
            let fieldSeen = false;
            let exploreSeen = false;
            for (const prop of arg.properties) {
                if (prop.type === 'ObjectProperty') {
                    const key = objectPropertyKeyName(prop);
                    if (key === 'field') {
                        fieldSeen = true;
                        field = singleValue(
                            this.resolveStrings(prop.value, scope, 0),
                        );
                    } else if (key === 'explore') {
                        exploreSeen = true;
                        explore = singleValue(
                            this.resolveStrings(prop.value, scope, 0),
                        );
                    }
                }
            }
            if (!fieldSeen || field === null) unresolved.add('field');
            if (!exploreSeen || explore === null) unresolved.add('explore');
        } else {
            unresolved.add('field');
            unresolved.add('explore');
        }
        this.otherRefs.push({
            kind: 'globalFilter',
            explore,
            field,
            unresolved: [...unresolved].sort(),
            location: nodeLocation(call, scope.module.path),
        });
    }

    private processExternalFetch(
        call: t.CallExpression | t.OptionalCallExpression,
        scope: Scope,
    ): void {
        this.processedCalls.add(call);
        this.pending.push(() => this.resolveExternalFetch(call, scope));
    }

    private resolveExternalFetch(
        call: t.CallExpression | t.OptionalCallExpression,
        scope: Scope,
    ): void {
        const aliasArg = call.arguments[0];
        const alias =
            aliasArg &&
            isNode(aliasArg) &&
            aliasArg.type !== 'SpreadElement' &&
            aliasArg.type !== 'ArgumentPlaceholder'
                ? singleValue(this.resolveStrings(aliasArg, scope, 0))
                : null;
        let path: string | null = null;
        const optsArg = call.arguments[1];
        if (optsArg && isNode(optsArg) && optsArg.type === 'ObjectExpression') {
            for (const prop of optsArg.properties) {
                if (
                    prop.type === 'ObjectProperty' &&
                    objectPropertyKeyName(prop) === 'path'
                ) {
                    path = singleValue(
                        this.resolveStrings(prop.value, scope, 0),
                    );
                }
            }
        }
        this.otherRefs.push({
            kind: 'externalFetch',
            alias,
            path,
            unresolved: alias === null ? ['alias'] : [],
            location: nodeLocation(call, scope.module.path),
        });
    }

    // -- Value resolution ---------------------------------------------------

    /** `useMemo(() => X, deps)` is value-transparent: resolves to the
     *  factory's single return expression. Null for anything else. */
    private static unwrapUseMemo(expr: t.Node): t.Node | null {
        if (!isCall(expr)) return null;
        const callee = unwrapExpression(expr.callee);
        if (callee.type !== 'Identifier' || callee.name !== 'useMemo') {
            return null;
        }
        const factory = expr.arguments[0];
        if (
            !factory ||
            !isNode(factory) ||
            (factory.type !== 'ArrowFunctionExpression' &&
                factory.type !== 'FunctionExpression')
        ) {
            return null;
        }
        const returned = functionReturnExpressions(factory);
        return returned.length === 1 ? returned[0] : null;
    }

    /** Resolves an expression to the set of string values it can take. */
    private resolveStrings(
        node: t.Node,
        scope: Scope,
        depth: number,
    ): ResolvedStrings {
        if (depth > MAX_RESOLUTION_DEPTH) return unresolvedStrings();
        const expr = unwrapExpression(node);
        const memoized = DataReferenceExtractor.unwrapUseMemo(expr);
        if (memoized) return this.resolveStrings(memoized, scope, depth + 1);

        switch (expr.type) {
            case 'StringLiteral':
                return { values: new Set([expr.value]), complete: true };
            case 'TemplateLiteral':
                if (expr.expressions.length === 0) {
                    const cooked = expr.quasis[0]?.value.cooked;
                    return cooked !== undefined
                        ? { values: new Set([cooked]), complete: true }
                        : unresolvedStrings();
                }
                return unresolvedStrings();
            case 'ConditionalExpression': {
                const left = this.resolveStrings(
                    expr.consequent,
                    scope,
                    depth + 1,
                );
                const right = this.resolveStrings(
                    expr.alternate,
                    scope,
                    depth + 1,
                );
                return {
                    values: new Set([...left.values, ...right.values]),
                    complete: left.complete && right.complete,
                };
            }
            case 'LogicalExpression': {
                const left = this.resolveStrings(expr.left, scope, depth + 1);
                const right = this.resolveStrings(expr.right, scope, depth + 1);
                return {
                    values: new Set([...left.values, ...right.values]),
                    complete: left.complete && right.complete,
                };
            }
            case 'Identifier': {
                const binding = this.lookupBinding(expr.name, scope);
                if (!binding) return unresolvedStrings();
                if (binding.kind === 'init') {
                    return binding.init
                        ? this.resolveStrings(
                              binding.init,
                              binding.scope,
                              depth + 1,
                          )
                        : unresolvedStrings();
                }
                if (binding.kind === 'import') {
                    const target = this.resolveImportBinding(binding, depth);
                    return target
                        ? this.resolveStrings(
                              target.node,
                              target.scope,
                              depth + 1,
                          )
                        : unresolvedStrings();
                }
                if (binding.kind === 'useState') {
                    const values = new Set<string>();
                    let complete = !binding.setterEscapes;
                    const candidates = binding.init
                        ? [binding.init, ...binding.setterArgs]
                        : binding.setterArgs;
                    if (!binding.init) complete = false;
                    for (const candidate of candidates) {
                        const resolved = this.resolveStrings(
                            candidate,
                            binding.scope,
                            depth + 1,
                        );
                        for (const value of resolved.values) values.add(value);
                        if (!resolved.complete) complete = false;
                    }
                    return { values, complete };
                }
                return unresolvedStrings();
            }
            case 'MemberExpression':
            case 'OptionalMemberExpression': {
                return this.resolveMemberStrings(expr, scope, depth);
            }
            default:
                return unresolvedStrings();
        }
    }

    /** `CONTAINER.key` / `CONTAINER[dynamic]` → union over matching values. */
    private resolveMemberStrings(
        expr: t.MemberExpression | t.OptionalMemberExpression,
        scope: Scope,
        depth: number,
    ): ResolvedStrings {
        const containers = this.resolveContainers(
            expr.object,
            scope,
            depth + 1,
        );
        if (containers.containers.length === 0) return unresolvedStrings();

        const staticName = memberPropertyName(expr);
        let keySet: Set<string> | null = null;
        if (
            staticName !== null &&
            !(expr.computed && expr.property.type !== 'StringLiteral')
        ) {
            keySet = new Set([staticName]);
        } else if (expr.computed && isNode(expr.property)) {
            const resolvedKey = this.resolveStrings(
                expr.property as t.Node,
                scope,
                depth + 1,
            );
            if (resolvedKey.complete && resolvedKey.values.size > 0) {
                keySet = resolvedKey.values;
            }
        }

        const values = new Set<string>();
        let { complete } = containers;
        for (const {
            node: container,
            scope: containerScope,
        } of containers.containers) {
            if (container.type === 'ObjectExpression') {
                for (const prop of container.properties) {
                    if (prop.type === 'SpreadElement') {
                        complete = false;
                    } else if (prop.type === 'ObjectProperty') {
                        const key = objectPropertyKeyName(prop);
                        if (key === null) {
                            complete = false;
                        } else if (keySet === null || keySet.has(key)) {
                            const resolved = this.resolveStrings(
                                prop.value,
                                containerScope,
                                depth + 1,
                            );
                            for (const value of resolved.values) {
                                values.add(value);
                            }
                            if (!resolved.complete) complete = false;
                        }
                    }
                }
            } else {
                // Array container: numeric index → element; dynamic → union.
                const index =
                    expr.computed &&
                    isNode(expr.property) &&
                    (expr.property as t.Node).type === 'NumericLiteral'
                        ? (expr.property as t.NumericLiteral).value
                        : null;
                const elements =
                    index !== null
                        ? [container.elements[index] ?? null]
                        : container.elements;
                for (const element of elements) {
                    if (!element) {
                        complete = false;
                    } else {
                        const resolved =
                            element.type === 'SpreadElement'
                                ? this.resolveStringArray(
                                      element.argument,
                                      containerScope,
                                      depth + 1,
                                  )
                                : this.resolveStrings(
                                      element,
                                      containerScope,
                                      depth + 1,
                                  );
                        for (const value of resolved.values) {
                            values.add(value);
                        }
                        if (!resolved.complete) complete = false;
                    }
                }
            }
        }
        if (values.size === 0) return unresolvedStrings();
        return { values, complete };
    }

    /** Resolves an expression to its possible object/array literal values. */
    private resolveContainers(
        node: t.Node,
        scope: Scope,
        depth: number,
    ): ResolvedContainers {
        if (depth > MAX_RESOLUTION_DEPTH) {
            return { containers: [], complete: false };
        }
        const expr = unwrapExpression(node);
        const memoized = DataReferenceExtractor.unwrapUseMemo(expr);
        if (memoized) {
            return this.resolveContainers(memoized, scope, depth + 1);
        }
        if (
            expr.type === 'ObjectExpression' ||
            expr.type === 'ArrayExpression'
        ) {
            return { containers: [{ node: expr, scope }], complete: true };
        }
        if (expr.type === 'ConditionalExpression') {
            const left = this.resolveContainers(
                expr.consequent,
                scope,
                depth + 1,
            );
            const right = this.resolveContainers(
                expr.alternate,
                scope,
                depth + 1,
            );
            return {
                containers: [...left.containers, ...right.containers],
                complete: left.complete && right.complete,
            };
        }
        if (expr.type === 'Identifier') {
            const binding = this.lookupBinding(expr.name, scope);
            if (binding?.kind === 'init' && binding.init) {
                return this.resolveContainers(
                    binding.init,
                    binding.scope,
                    depth + 1,
                );
            }
            if (binding?.kind === 'import') {
                const target = this.resolveImportBinding(binding, depth);
                if (target) {
                    return this.resolveContainers(
                        target.node,
                        target.scope,
                        depth + 1,
                    );
                }
            }
            return { containers: [], complete: false };
        }
        if (isMember(expr)) {
            // e.g. `VIEWS[mode].fields` — pick matching property values
            const parents = this.resolveContainers(
                expr.object,
                scope,
                depth + 1,
            );
            const staticName = memberPropertyName(expr);
            const containers: ResolvedContainers['containers'] = [];
            let { complete } = parents;
            for (const {
                node: container,
                scope: containerScope,
            } of parents.containers) {
                if (container.type !== 'ObjectExpression') {
                    complete = false;
                } else {
                    for (const prop of container.properties) {
                        if (prop.type === 'SpreadElement') {
                            complete = false;
                        } else if (prop.type === 'ObjectProperty') {
                            const key = objectPropertyKeyName(prop);
                            if (key === null) {
                                complete = false;
                            } else if (
                                staticName === null ||
                                key === staticName
                            ) {
                                const child = this.resolveContainers(
                                    prop.value,
                                    containerScope,
                                    depth + 1,
                                );
                                containers.push(...child.containers);
                                if (!child.complete) complete = false;
                            }
                        }
                    }
                }
            }
            return { containers, complete };
        }
        return { containers: [], complete: false };
    }

    /** Resolves an expression expected to be an array of field strings. */
    private resolveStringArray(
        node: t.Node,
        scope: Scope,
        depth: number,
    ): ResolvedStrings {
        if (depth > MAX_RESOLUTION_DEPTH) return unresolvedStrings();
        const expr = unwrapExpression(node);
        const memoized = DataReferenceExtractor.unwrapUseMemo(expr);
        if (memoized) {
            return this.resolveStringArray(memoized, scope, depth + 1);
        }

        if (expr.type === 'ArrayExpression') {
            const values = new Set<string>();
            let complete = true;
            for (const element of expr.elements) {
                if (element) {
                    const resolved =
                        element.type === 'SpreadElement'
                            ? this.resolveStringArray(
                                  element.argument,
                                  scope,
                                  depth + 1,
                              )
                            : this.resolveStrings(element, scope, depth + 1);
                    for (const value of resolved.values) values.add(value);
                    if (!resolved.complete) complete = false;
                }
            }
            return { values, complete };
        }
        if (expr.type === 'ConditionalExpression') {
            const left = this.resolveStringArray(
                expr.consequent,
                scope,
                depth + 1,
            );
            const right = this.resolveStringArray(
                expr.alternate,
                scope,
                depth + 1,
            );
            return {
                values: new Set([...left.values, ...right.values]),
                complete: left.complete && right.complete,
            };
        }
        if (expr.type === 'Identifier') {
            const binding = this.lookupBinding(expr.name, scope);
            if (binding?.kind === 'init' && binding.init) {
                return this.resolveStringArray(
                    binding.init,
                    binding.scope,
                    depth + 1,
                );
            }
            if (binding?.kind === 'import') {
                const target = this.resolveImportBinding(binding, depth);
                if (target) {
                    return this.resolveStringArray(
                        target.node,
                        target.scope,
                        depth + 1,
                    );
                }
            }
            if (binding?.kind === 'useState') {
                // Array-valued state: resolve init + setter args as arrays.
                const values = new Set<string>();
                let complete = !binding.setterEscapes && binding.init !== null;
                const candidates = binding.init
                    ? [binding.init, ...binding.setterArgs]
                    : binding.setterArgs;
                for (const candidate of candidates) {
                    const resolved = this.resolveStringArray(
                        candidate,
                        binding.scope,
                        depth + 1,
                    );
                    for (const value of resolved.values) values.add(value);
                    if (!resolved.complete) complete = false;
                }
                return { values, complete };
            }
            return unresolvedStrings();
        }
        if (isMember(expr)) {
            // e.g. `FIELD_SETS[mode]` where every value is an array.
            const containers = this.resolveContainers(expr, scope, depth + 1);
            if (containers.containers.length === 0) return unresolvedStrings();
            const values = new Set<string>();
            let { complete } = containers;
            for (const {
                node: container,
                scope: containerScope,
            } of containers.containers) {
                if (container.type !== 'ArrayExpression') {
                    complete = false;
                } else {
                    const resolved = this.resolveStringArray(
                        container,
                        containerScope,
                        depth + 1,
                    );
                    for (const value of resolved.values) values.add(value);
                    if (!resolved.complete) complete = false;
                }
            }
            return { values, complete };
        }
        return unresolvedStrings();
    }

    /** `.filters([...])` / `.sorts([...])` argument → its `field` values.
     *  `filtersFor(...)` is a recognized dynamic source (its fields enter via
     *  `addFilter` call sites) and does not mark the argument unresolved. */
    private resolveFilterFields(
        node: t.Node,
        scope: Scope,
        depth: number,
    ): ResolvedStrings {
        if (depth > MAX_RESOLUTION_DEPTH) return unresolvedStrings();
        const expr = unwrapExpression(node);
        const memoized = DataReferenceExtractor.unwrapUseMemo(expr);
        if (memoized) {
            return this.resolveFilterFields(memoized, scope, depth + 1);
        }

        if (this.isGlobalFiltersCall(expr, scope)) {
            return { values: new Set(), complete: true };
        }
        if (expr.type === 'ArrayExpression') {
            const values = new Set<string>();
            let complete = true;
            for (const element of expr.elements) {
                if (element) {
                    const resolved =
                        element.type === 'SpreadElement'
                            ? this.resolveFilterFields(
                                  element.argument,
                                  scope,
                                  depth + 1,
                              )
                            : this.resolveFilterObjectField(
                                  element,
                                  scope,
                                  depth + 1,
                              );
                    for (const value of resolved.values) values.add(value);
                    if (!resolved.complete) complete = false;
                }
            }
            return { values, complete };
        }
        if (expr.type === 'ConditionalExpression') {
            const left = this.resolveFilterFields(
                expr.consequent,
                scope,
                depth + 1,
            );
            const right = this.resolveFilterFields(
                expr.alternate,
                scope,
                depth + 1,
            );
            return {
                values: new Set([...left.values, ...right.values]),
                complete: left.complete && right.complete,
            };
        }
        if (expr.type === 'Identifier') {
            const binding = this.lookupBinding(expr.name, scope);
            if (binding?.kind === 'init' && binding.init) {
                return this.resolveFilterFields(
                    binding.init,
                    binding.scope,
                    depth + 1,
                );
            }
            if (binding?.kind === 'import') {
                const target = this.resolveImportBinding(binding, depth);
                if (target) {
                    return this.resolveFilterFields(
                        target.node,
                        target.scope,
                        depth + 1,
                    );
                }
            }
            return unresolvedStrings();
        }
        return unresolvedStrings();
    }

    /** A single filter/sort object → its `field` value(s). */
    private resolveFilterObjectField(
        node: t.Node,
        scope: Scope,
        depth: number,
    ): ResolvedStrings {
        const containers = this.resolveContainers(node, scope, depth);
        if (containers.containers.length === 0) return unresolvedStrings();
        const values = new Set<string>();
        let { complete } = containers;
        for (const {
            node: container,
            scope: containerScope,
        } of containers.containers) {
            if (container.type !== 'ObjectExpression') {
                complete = false;
            } else {
                let fieldSeen = false;
                for (const prop of container.properties) {
                    if (prop.type === 'SpreadElement') {
                        complete = false;
                    } else if (
                        prop.type === 'ObjectProperty' &&
                        objectPropertyKeyName(prop) === 'field'
                    ) {
                        fieldSeen = true;
                        const resolved = this.resolveStrings(
                            prop.value,
                            containerScope,
                            depth + 1,
                        );
                        for (const value of resolved.values) values.add(value);
                        if (!resolved.complete) complete = false;
                    }
                }
                if (!fieldSeen) complete = false;
            }
        }
        return { values, complete };
    }

    /** `filtersFor(...)` traced to `useGlobalFilters()` (or unbound). */
    private isGlobalFiltersCall(expr: t.Node, scope: Scope): boolean {
        if (!isCall(expr)) return false;
        const callee = unwrapExpression(expr.callee);
        if (callee.type !== 'Identifier') return false;
        const binding = this.lookupBinding(callee.name, scope);
        if (!binding) return callee.name === 'filtersFor';
        return (
            binding.kind === 'callProp' &&
            binding.calleeName === 'useGlobalFilters' &&
            binding.prop === 'filtersFor'
        );
    }

    /** Static keys of an object literal (for `.parameters({...})`). */
    private resolveObjectKeys(
        node: t.Node,
        scope: Scope,
        depth: number,
    ): ResolvedStrings {
        const containers = this.resolveContainers(node, scope, depth);
        if (containers.containers.length === 0) return unresolvedStrings();
        const values = new Set<string>();
        let { complete } = containers;
        for (const { node: container } of containers.containers) {
            if (container.type !== 'ObjectExpression') {
                complete = false;
            } else {
                for (const prop of container.properties) {
                    if (prop.type === 'SpreadElement') {
                        complete = false;
                    } else if (prop.type === 'ObjectProperty') {
                        const key = objectPropertyKeyName(prop);
                        if (key === null) complete = false;
                        else values.add(key);
                    }
                }
            }
        }
        return { values, complete };
    }

    /** Collects one definition object's referenceable names into `values`;
     *  false when its `nameKey` could not be fully resolved. */
    private collectDefinitionNames(
        container: t.ObjectExpression,
        scope: Scope,
        depth: number,
        nameKey: 'name' | 'id',
        values: Set<string>,
    ): boolean {
        let nameSeen = false;
        let complete = true;
        for (const prop of container.properties) {
            if (prop.type === 'ObjectProperty') {
                const key = objectPropertyKeyName(prop);
                // `name` on custom dimensions (nameKey 'id') is also referenceable.
                if (key === nameKey || (nameKey === 'id' && key === 'name')) {
                    const resolved = this.resolveStrings(
                        prop.value,
                        scope,
                        depth + 1,
                    );
                    for (const value of resolved.values) values.add(value);
                    if (key === nameKey) {
                        nameSeen = true;
                        if (!resolved.complete) complete = false;
                    }
                }
            }
        }
        return nameSeen && complete;
    }

    /** `name`/`id` values of definition objects (table calcs etc.). */
    private resolveDefinitionNames(
        node: t.Node,
        scope: Scope,
        depth: number,
        nameKey: 'name' | 'id',
    ): ResolvedStrings {
        if (depth > MAX_RESOLUTION_DEPTH) return unresolvedStrings();
        const expr = unwrapExpression(node);
        if (expr.type === 'ArrayExpression') {
            const values = new Set<string>();
            let complete = true;
            for (const element of expr.elements) {
                if (element?.type === 'SpreadElement') {
                    const spread = this.resolveDefinitionNames(
                        element.argument,
                        scope,
                        depth + 1,
                        nameKey,
                    );
                    for (const value of spread.values) values.add(value);
                    if (!spread.complete) complete = false;
                } else if (element) {
                    const containers = this.resolveContainers(
                        element,
                        scope,
                        depth + 1,
                    );
                    if (
                        containers.containers.length === 0 ||
                        !containers.complete
                    ) {
                        complete = false;
                    }
                    for (const {
                        node: container,
                        scope: containerScope,
                    } of containers.containers) {
                        if (container.type !== 'ObjectExpression') {
                            complete = false;
                        } else if (
                            !this.collectDefinitionNames(
                                container,
                                containerScope,
                                depth,
                                nameKey,
                                values,
                            )
                        ) {
                            complete = false;
                        }
                    }
                }
            }
            return { values, complete };
        }
        if (expr.type === 'Identifier') {
            const binding = this.lookupBinding(expr.name, scope);
            if (binding?.kind === 'init' && binding.init) {
                return this.resolveDefinitionNames(
                    binding.init,
                    binding.scope,
                    depth + 1,
                    nameKey,
                );
            }
            if (binding?.kind === 'import') {
                const target = this.resolveImportBinding(binding, depth);
                if (target) {
                    return this.resolveDefinitionNames(
                        target.node,
                        target.scope,
                        depth + 1,
                        nameKey,
                    );
                }
            }
        }
        return unresolvedStrings();
    }
}

/** Non-JS files are ignored; files that fail to parse are reported in
 *  `parseErrors` and skipped. */
export function extractDataAppDataReferences(
    files: DataAppSourceFile[],
): DataAppDataReferences {
    return new DataReferenceExtractor().extract(files);
}
