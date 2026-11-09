// Static query manifest: walks each src module's oxc AST, folds every
// `@lightdash/query-sdk` builder chain to JSON and emits dist/assets/queries.json.
// Mirrors DataAppQueryManifest in packages/common/src/ee/apps/queryManifest.ts.

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSync } from 'oxc-parser';

const SDK_SOURCE = '@lightdash/query-sdk';
const FACTORIES = new Set(['query', 'compose', 'savedChart']);
const SEMANTIC_LIMIT_DEFAULT = 500;

function lineOf(code, offset) {
    let line = 1;
    for (let i = 0; i < offset && i < code.length; i += 1) {
        if (code.charCodeAt(i) === 10) line += 1;
    }
    return line;
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

class Scope {
    constructor(parent) {
        this.parent = parent;
        this.bindings = new Map();
    }

    declare(name, binding) {
        this.bindings.set(name, binding);
    }

    lookup(name) {
        let scope = this;
        while (scope) {
            const found = scope.bindings.get(name);
            if (found) return found;
            scope = scope.parent;
        }
        return null;
    }
}

function patternNames(pattern, out = []) {
    if (!pattern) return out;
    switch (pattern.type) {
        case 'Identifier':
            out.push(pattern.name);
            break;
        case 'ObjectPattern':
            for (const prop of pattern.properties) {
                patternNames(
                    prop.type === 'RestElement' ? prop.argument : prop.value,
                    out,
                );
            }
            break;
        case 'ArrayPattern':
            for (const el of pattern.elements) patternNames(el, out);
            break;
        case 'RestElement':
            patternNames(pattern.argument, out);
            break;
        case 'AssignmentPattern':
            patternNames(pattern.left, out);
            break;
        default:
            break;
    }
    return out;
}

function declareDeclarator(scope, declarator, kind) {
    const { id, init } = declarator;
    if (id.type === 'Identifier') {
        scope.declare(id.name, { kind: 'variable', declKind: kind, init });
        return;
    }
    if (id.type === 'ArrayPattern') {
        id.elements.forEach((el, index) => {
            const target = el?.type === 'AssignmentPattern' ? el.left : el;
            if (target?.type === 'Identifier') {
                scope.declare(target.name, {
                    kind: 'arrayPattern',
                    init,
                    index,
                });
            } else {
                for (const name of patternNames(el)) {
                    scope.declare(name, { kind: 'opaque' });
                }
            }
        });
        return;
    }
    if (id.type === 'ObjectPattern') {
        for (const prop of id.properties) {
            if (prop.type === 'Property' && !prop.computed) {
                const target =
                    prop.value.type === 'AssignmentPattern'
                        ? prop.value.left
                        : prop.value;
                const key =
                    prop.key.type === 'Identifier'
                        ? prop.key.name
                        : String(prop.key.value);
                if (target.type === 'Identifier') {
                    scope.declare(target.name, {
                        kind: 'objectPattern',
                        init,
                        key,
                    });
                    continue;
                }
            }
            for (const name of patternNames(
                prop.type === 'RestElement' ? prop.argument : prop.value,
            )) {
                scope.declare(name, { kind: 'opaque' });
            }
        }
    }
}

function declareStatement(scope, statement) {
    let node = statement;
    if (
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportDefaultDeclaration'
    ) {
        node = node.declaration;
        if (!node) return;
    }
    switch (node.type) {
        case 'VariableDeclaration':
            for (const declarator of node.declarations) {
                declareDeclarator(scope, declarator, node.kind);
            }
            break;
        case 'FunctionDeclaration':
        case 'ClassDeclaration':
            if (node.id) scope.declare(node.id.name, { kind: 'opaque' });
            break;
        case 'ImportDeclaration':
            for (const spec of node.specifiers) {
                const imported =
                    spec.type === 'ImportSpecifier'
                        ? spec.imported.type === 'Identifier'
                            ? spec.imported.name
                            : String(spec.imported.value)
                        : spec.type === 'ImportDefaultSpecifier'
                          ? 'default'
                          : '*';
                scope.declare(spec.local.name, {
                    kind: 'import',
                    source: node.source.value,
                    imported,
                });
            }
            break;
        default:
            break;
    }
}

function declareParams(scope, fn) {
    for (const param of fn.params) {
        for (const name of patternNames(param)) {
            scope.declare(name, { kind: 'param' });
        }
    }
}

const isFunction = (node) =>
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression';

// ---------------------------------------------------------------------------
// Module analysis
// ---------------------------------------------------------------------------

class ModuleAnalyzer {
    constructor(code, relPath) {
        this.code = code;
        this.relPath = relPath;
        this.chains = []; // { node, scope, binding, entry }
        this.useLightdashCalls = []; // { node, scope, component }
        this.references = new Map(); // binding -> [{ node, parent, grandparent }]
    }

    source(node) {
        return this.code.slice(node.start, node.end);
    }

    loc(node) {
        return `${this.relPath}:${lineOf(this.code, node.start)}`;
    }

    // --- binding helpers -------------------------------------------------

    isSdkImport(binding, name) {
        return (
            binding?.kind === 'import' &&
            binding.source === SDK_SOURCE &&
            binding.imported === name
        );
    }

    isReactImport(binding, name) {
        return (
            binding?.kind === 'import' &&
            binding.source === 'react' &&
            binding.imported === name
        );
    }

    isCallOf(node, scope, predicate) {
        if (node?.type !== 'CallExpression') return false;
        const { callee } = node;
        if (callee.type === 'Identifier') {
            return predicate(scope.lookup(callee.name), callee.name);
        }
        if (
            callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.property.type === 'Identifier'
        ) {
            // React.useState(...) / React.useMemo(...)
            return predicate(null, callee.property.name);
        }
        return false;
    }

    isUseState(node, scope) {
        return this.isCallOf(
            node,
            scope,
            (binding, name) =>
                this.isReactImport(binding, 'useState') ||
                (binding === null && name === 'useState'),
        );
    }

    isUseMemo(node, scope) {
        return this.isCallOf(
            node,
            scope,
            (binding, name) =>
                this.isReactImport(binding, 'useMemo') ||
                (binding === null && name === 'useMemo'),
        );
    }

    isUseGlobalFilters(node, scope) {
        return this.isCallOf(
            node,
            scope,
            (binding, name) =>
                (binding?.kind === 'import' &&
                    binding.imported === 'useGlobalFilters') ||
                (binding === null && name === 'useGlobalFilters'),
        );
    }

    /** The expression a `const` evaluates to, seen through `useMemo(() => expr, deps)`. */
    valueExpr(binding, scope) {
        if (binding?.kind !== 'variable' || !binding.init) return null;
        return this.unwrapMemo(binding.init, scope);
    }

    unwrapMemo(node, scope) {
        let current = this.unwrapParens(node);
        if (this.isUseMemo(current, scope)) {
            const factory = current.arguments[0];
            if (!factory || !isFunction(factory)) return current;
            if (factory.expression || factory.body.type !== 'BlockStatement') {
                current = factory.body;
            } else {
                const ret = factory.body.body.find(
                    (s) => s.type === 'ReturnStatement',
                );
                if (!ret?.argument) return current;
                current = ret.argument;
            }
            return this.unwrapParens(current);
        }
        return current;
    }

    unwrapParens(node) {
        let current = node;
        while (
            current &&
            (current.type === 'ParenthesizedExpression' ||
                current.type === 'TSAsExpression' ||
                current.type === 'TSSatisfiesExpression' ||
                current.type === 'TSNonNullExpression' ||
                current.type === 'TSTypeAssertion')
        ) {
            current = current.expression;
        }
        return current;
    }

    // --- chains ----------------------------------------------------------

    /**
     * Flattens a builder chain to its factory root. Returns
     * { factory, root: CallExpression, steps: [{ method, args }] } or null.
     * Walks through `const` aliases (`base.filters(...)` where base is a chain).
     */
    flattenChain(node, scope, seen = new Set()) {
        const steps = [];
        let current = this.unwrapParens(node);
        while (current) {
            if (current.type === 'CallExpression') {
                const { callee } = current;
                if (
                    callee.type === 'MemberExpression' &&
                    !callee.computed &&
                    callee.property.type === 'Identifier'
                ) {
                    steps.unshift({
                        method: callee.property.name,
                        args: current.arguments,
                    });
                    current = this.unwrapParens(callee.object);
                    continue;
                }
                if (callee.type === 'Identifier') {
                    const binding = scope.lookup(callee.name);
                    if (
                        binding?.kind === 'import' &&
                        binding.source === SDK_SOURCE &&
                        FACTORIES.has(binding.imported)
                    ) {
                        return {
                            factory: binding.imported,
                            root: current,
                            steps,
                        };
                    }
                }
                return null;
            }
            if (current.type === 'Identifier') {
                const binding = scope.lookup(current.name);
                if (!binding || seen.has(binding)) return null;
                seen.add(binding);
                const value = this.valueExpr(binding, scope);
                if (!value) return null;
                const inner = this.flattenChain(value, scope, seen);
                if (!inner) return null;
                return { ...inner, steps: [...inner.steps, ...steps] };
            }
            return null;
        }
        return null;
    }

    isChainContinuation(parent, grandparent, node) {
        return (
            parent?.type === 'MemberExpression' &&
            parent.object === node &&
            grandparent?.type === 'CallExpression' &&
            grandparent.callee === parent
        );
    }

    // --- folding -----------------------------------------------------------

    fold(node, scope, ctx, seen = new Set()) {
        const n = this.unwrapParens(node);
        if (!n) return this.dynamic(node, ctx);
        switch (n.type) {
            case 'Literal':
                if (n.regex || typeof n.value === 'bigint') {
                    return this.dynamic(n, ctx);
                }
                return n.value;
            case 'TemplateLiteral':
                return this.foldTemplate(n, scope, ctx, seen);
            case 'UnaryExpression':
                if (
                    n.operator === '-' &&
                    n.argument.type === 'Literal' &&
                    typeof n.argument.value === 'number'
                ) {
                    return -n.argument.value;
                }
                return this.dynamic(n, ctx);
            case 'ArrayExpression': {
                const out = [];
                for (const el of n.elements) {
                    if (el === null) {
                        out.push(null);
                    } else if (el.type === 'SpreadElement') {
                        const spread = this.fold(el.argument, scope, ctx, seen);
                        if (Array.isArray(spread)) out.push(...spread);
                        else out.push(spread);
                    } else {
                        out.push(this.fold(el, scope, ctx, seen));
                    }
                }
                return out;
            }
            case 'ObjectExpression': {
                const out = {};
                for (const prop of n.properties) {
                    if (prop.type === 'SpreadElement') {
                        const spread = this.fold(
                            prop.argument,
                            scope,
                            ctx,
                            seen,
                        );
                        if (
                            spread &&
                            typeof spread === 'object' &&
                            !Array.isArray(spread) &&
                            !this.isMarker(spread)
                        ) {
                            Object.assign(out, spread);
                            continue;
                        }
                        return this.dynamic(n, ctx);
                    }
                    if (prop.computed || prop.kind !== 'init') {
                        return this.dynamic(n, ctx);
                    }
                    const key =
                        prop.key.type === 'Identifier'
                            ? prop.key.name
                            : String(prop.key.value);
                    out[key] = this.fold(prop.value, scope, ctx, seen);
                }
                return out;
            }
            case 'Identifier':
                return this.foldIdentifier(n, scope, ctx, seen);
            case 'CallExpression':
                return this.foldCall(n, scope, ctx, seen);
            default:
                return this.dynamic(n, ctx);
        }
    }

    isMarker(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }
        const keys = Object.keys(value);
        return (
            keys.length === 1 &&
            (keys[0] === 'source' ||
                keys[0] === 'slot' ||
                keys[0] === 'template')
        );
    }

    dynamic(node, ctx) {
        ctx.dynamic = true;
        return { source: this.source(node) };
    }

    foldIdentifier(node, scope, ctx, seen) {
        if (node.name === 'undefined') return null;
        const binding = scope.lookup(node.name);
        if (!binding || seen.has(binding)) return this.dynamic(node, ctx);
        if (binding.kind === 'variable' && binding.declKind === 'const') {
            if (!binding.init) return this.dynamic(node, ctx);
            const next = new Set(seen);
            next.add(binding);
            return this.fold(binding.init, scope, ctx, next);
        }
        if (
            binding.kind === 'arrayPattern' &&
            binding.index === 0 &&
            this.isUseState(binding.init, scope)
        ) {
            const defaultCtx = { dynamic: false, slots: new Map() };
            const initArg = binding.init.arguments[0];
            const def =
                initArg === undefined
                    ? null
                    : this.fold(initArg, scope, defaultCtx, seen);
            this.addSlot(ctx, {
                name: node.name,
                kind: 'local',
                explore: null,
                default: def,
            });
            return { slot: node.name };
        }
        return this.dynamic(node, ctx);
    }

    foldCall(node, scope, ctx, seen) {
        const { callee } = node;
        // filtersFor(explore) — destructured from useGlobalFilters(), or
        // useGlobalFilters().filtersFor(explore).
        let isFiltersFor = false;
        if (callee.type === 'Identifier') {
            const binding = scope.lookup(callee.name);
            isFiltersFor =
                binding?.kind === 'objectPattern' &&
                binding.key === 'filtersFor' &&
                this.isUseGlobalFilters(binding.init, scope);
        } else if (
            callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'filtersFor'
        ) {
            isFiltersFor = this.isUseGlobalFilters(callee.object, scope);
        }
        if (isFiltersFor) {
            const exploreArg = node.arguments[0];
            const exploreCtx = { dynamic: false, slots: new Map() };
            const explore =
                exploreArg === undefined
                    ? null
                    : this.fold(exploreArg, scope, exploreCtx, seen);
            const name =
                typeof explore === 'string'
                    ? `globalFilters:${explore}`
                    : 'globalFilters';
            if (exploreCtx.dynamic) ctx.dynamic = true;
            this.addSlot(ctx, {
                name,
                kind: 'globalFilter',
                explore,
                default: [],
            });
            return { slot: name };
        }
        return this.dynamic(node, ctx);
    }

    foldTemplate(node, scope, ctx, seen) {
        if (node.expressions.length === 0) {
            return node.quasis
                .map((q) => q.value.cooked ?? q.value.raw)
                .join('');
        }
        let out = '';
        let hasHole = false;
        for (let i = 0; i < node.quasis.length; i += 1) {
            out += node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
            const expr = node.expressions[i];
            if (!expr) continue;
            const holeCtx = { dynamic: false, slots: new Map() };
            const value = this.fold(expr, scope, holeCtx, seen);
            if (holeCtx.dynamic) return this.dynamic(node, ctx);
            if (value && typeof value === 'object' && 'slot' in value) {
                for (const slot of holeCtx.slots.values())
                    this.addSlot(ctx, slot);
                out += `\${${value.slot}}`;
                hasHole = true;
            } else if (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
            ) {
                out += String(value);
            } else {
                return this.dynamic(node, ctx);
            }
        }
        return hasHole ? { template: out } : out;
    }

    addSlot(ctx, slot) {
        if (!ctx.slots.has(slot.name)) ctx.slots.set(slot.name, slot);
    }

    // --- entries -----------------------------------------------------------

    foldArg(args, index, scope, ctx) {
        return args[index] === undefined
            ? null
            : this.fold(args[index], scope, ctx);
    }

    appendList(target, value) {
        if (Array.isArray(value)) target.push(...value);
        else target.push(value);
    }

    buildSemanticSpec(chain, scope, ctx) {
        const spec = {
            kind: 'semantic',
            id: null,
            title: null,
            description: null,
            explore: this.foldArg(chain.root.arguments, 0, scope, ctx),
            dimensions: [],
            metrics: [],
            filters: [],
            metricFilters: [],
            sorts: [],
            limit: SEMANTIC_LIMIT_DEFAULT,
            parameters: {},
        };
        for (const { method, args } of chain.steps) {
            switch (method) {
                case 'id':
                case 'title':
                case 'description':
                    spec[method] = this.foldArg(args, 0, scope, ctx);
                    break;
                case 'label':
                    spec.title = this.foldArg(args, 0, scope, ctx);
                    break;
                case 'dimensions':
                case 'metrics':
                case 'filters':
                case 'metricFilters':
                case 'sorts':
                    this.appendList(
                        spec[method],
                        this.foldArg(args, 0, scope, ctx),
                    );
                    break;
                case 'limit':
                    spec.limit = this.foldArg(args, 0, scope, ctx);
                    break;
                case 'parameters':
                    this.mergeParameters(spec, args, scope, ctx);
                    break;
                default:
                    break;
            }
        }
        return spec;
    }

    mergeParameters(spec, args, scope, ctx) {
        const value = this.foldArg(args, 0, scope, ctx);
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            !this.isMarker(value) &&
            spec.parameters &&
            typeof spec.parameters === 'object' &&
            !this.isMarker(spec.parameters)
        ) {
            Object.assign(spec.parameters, value);
        } else {
            spec.parameters = value;
        }
    }

    buildSavedChartSpec(chain, scope, ctx) {
        const spec = {
            kind: 'savedChart',
            id: null,
            title: this.foldArg(chain.root.arguments, 1, scope, ctx),
            description: null,
            chartUuid: this.foldArg(chain.root.arguments, 0, scope, ctx),
            limit: null,
            filters: [],
            parameters: {},
        };
        for (const { method, args } of chain.steps) {
            switch (method) {
                case 'id':
                case 'description':
                    spec[method] = this.foldArg(args, 0, scope, ctx);
                    break;
                case 'label':
                case 'title':
                    spec.title = this.foldArg(args, 0, scope, ctx);
                    break;
                case 'filters':
                    this.appendList(
                        spec.filters,
                        this.foldArg(args, 0, scope, ctx),
                    );
                    break;
                case 'limit':
                    spec.limit = this.foldArg(args, 0, scope, ctx);
                    break;
                case 'parameters':
                    this.mergeParameters(spec, args, scope, ctx);
                    break;
                default:
                    break;
            }
        }
        return spec;
    }

    /** A `.semantic()` source: an inline or const-bound query/savedChart chain. */
    foldNodeSource(node, scope, ctx) {
        if (!node) {
            ctx.dynamic = true;
            return null;
        }
        const chain = this.flattenChain(node, scope);
        if (chain?.factory === 'query') {
            return this.buildSemanticSpec(chain, scope, ctx);
        }
        if (chain?.factory === 'savedChart') {
            return this.buildSavedChartSpec(chain, scope, ctx);
        }
        return this.dynamic(node, ctx);
    }

    foldNodeOptions(args, index, scope, ctx) {
        const options = this.foldArg(args, index, scope, ctx);
        const read = (key) =>
            options && typeof options === 'object' && !this.isMarker(options)
                ? (options[key] ?? null)
                : null;
        return {
            title: read('title'),
            description: read('description'),
            reads: read('reads'),
            limit: read('limit'),
        };
    }

    buildComposerSpec(chain, scope, ctx) {
        const spec = {
            kind: 'composer',
            id: this.foldArg(chain.root.arguments, 0, scope, ctx),
            title: null,
            description: null,
            parameters: {},
            nodes: [],
            terminal: null,
        };
        for (const { method, args } of chain.steps) {
            switch (method) {
                case 'title':
                case 'description':
                    spec[method] = this.foldArg(args, 0, scope, ctx);
                    break;
                case 'id':
                    spec.id = this.foldArg(args, 0, scope, ctx);
                    break;
                case 'parameters':
                    this.mergeParameters(spec, args, scope, ctx);
                    break;
                case 'terminal':
                    spec.terminal = this.foldArg(args, 0, scope, ctx);
                    break;
                case 'semantic': {
                    const options = this.foldNodeOptions(args, 2, scope, ctx);
                    spec.nodes.push({
                        kind: 'semantic',
                        nodeId: this.foldArg(args, 0, scope, ctx),
                        title: options.title,
                        description: options.description,
                        query: this.foldNodeSource(args[1], scope, ctx),
                    });
                    break;
                }
                case 'duckdb':
                case 'python': {
                    const options = this.foldNodeOptions(args, 2, scope, ctx);
                    const body = this.foldArg(args, 1, scope, ctx);
                    spec.nodes.push({
                        kind: method,
                        nodeId: this.foldArg(args, 0, scope, ctx),
                        title: options.title,
                        description: options.description,
                        ...(method === 'duckdb'
                            ? { sql: body }
                            : { code: body }),
                        reads: options.reads ?? [],
                        limit: options.limit,
                    });
                    break;
                }
                default:
                    break;
            }
        }
        return spec;
    }

    buildEntry(node, chain, scope) {
        const ctx = { dynamic: false, slots: new Map() };
        let spec;
        if (chain.factory === 'query') {
            spec = this.buildSemanticSpec(chain, scope, ctx);
        } else if (chain.factory === 'savedChart') {
            spec = this.buildSavedChartSpec(chain, scope, ctx);
        } else {
            spec = this.buildComposerSpec(chain, scope, ctx);
        }
        const slots = [...ctx.slots.values()];
        const bucket = ctx.dynamic
            ? 'dynamic'
            : slots.length > 0
              ? 'parametric'
              : 'static';
        return { ...spec, loc: this.loc(node), bucket, slots };
    }

    // --- walk --------------------------------------------------------------

    analyze() {
        const lang = this.relPath.endsWith('.tsx')
            ? 'tsx'
            : this.relPath.endsWith('.ts')
              ? 'ts'
              : this.relPath.endsWith('.jsx')
                ? 'jsx'
                : 'js';
        const result = parseSync(this.relPath, this.code, {
            sourceType: 'module',
            lang,
        });
        if (result.errors?.length) {
            throw new Error(
                `${this.relPath}: ${result.errors[0].message ?? 'parse error'}`,
            );
        }
        const program = result.program;
        const root = new Scope(null);
        for (const statement of program.body) declareStatement(root, statement);
        this.walk(program, null, null, root, {
            component: null,
            inChain: false,
        });
        return this.collect();
    }

    walk(node, parent, grandparent, scope, state) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (const child of node)
                this.walk(child, parent, grandparent, scope, state);
            return;
        }
        if (typeof node.type !== 'string') return;
        if (
            node.type.startsWith('TS') &&
            node.type !== 'TSAsExpression' &&
            node.type !== 'TSSatisfiesExpression' &&
            node.type !== 'TSNonNullExpression'
        ) {
            return;
        }

        let currentScope = scope;
        let currentState = state;

        if (isFunction(node)) {
            currentScope = new Scope(scope);
            declareParams(currentScope, node);
            const name = this.functionName(node, parent);
            if (name) currentState = { ...state, component: name };
        } else if (
            node.type === 'BlockStatement' ||
            node.type === 'StaticBlock'
        ) {
            currentScope = new Scope(scope);
            for (const statement of node.body)
                declareStatement(currentScope, statement);
        } else if (node.type === 'CatchClause') {
            currentScope = new Scope(scope);
            if (node.param) {
                for (const name of patternNames(node.param)) {
                    currentScope.declare(name, { kind: 'opaque' });
                }
            }
        } else if (
            node.type === 'ForStatement' ||
            node.type === 'ForInStatement' ||
            node.type === 'ForOfStatement'
        ) {
            currentScope = new Scope(scope);
            const init = node.type === 'ForStatement' ? node.init : node.left;
            if (init?.type === 'VariableDeclaration')
                declareStatement(currentScope, init);
        }

        if (node.type === 'Identifier' && this.isReference(node, parent)) {
            const binding = scope.lookup(node.name);
            if (binding) {
                const refs = this.references.get(binding) ?? [];
                refs.push({ node, parent, grandparent, scope });
                this.references.set(binding, refs);
            }
        }

        if (node.type === 'CallExpression') {
            if (
                !state.inChain &&
                !this.isChainContinuation(parent, grandparent, node)
            ) {
                const chain = this.flattenChain(node, scope);
                if (chain) {
                    this.chains.push({
                        node,
                        scope,
                        binding: this.boundTo(node, parent, grandparent, scope),
                        entry: this.buildEntry(node, chain, scope),
                    });
                    currentState = { ...currentState, inChain: true };
                }
            }
            if (
                node.callee.type === 'Identifier' &&
                this.isSdkImport(scope.lookup(node.callee.name), 'useLightdash')
            ) {
                this.useLightdashCalls.push({
                    node,
                    scope,
                    component: state.component,
                });
            }
        }

        for (const key of Object.keys(node)) {
            if (
                key === 'parent' ||
                key === 'start' ||
                key === 'end' ||
                key === 'type'
            )
                continue;
            const child = node[key];
            if (child && typeof child === 'object') {
                this.walk(child, node, parent, currentScope, currentState);
            }
        }
    }

    isReference(node, parent) {
        if (!parent) return false;
        switch (parent.type) {
            case 'MemberExpression':
                return parent.object === node || parent.computed;
            case 'Property':
                return (
                    parent.value === node ||
                    (parent.computed && parent.key === node)
                );
            case 'VariableDeclarator':
                return parent.init === node;
            case 'FunctionDeclaration':
            case 'FunctionExpression':
            case 'ClassDeclaration':
            case 'ClassExpression':
                return false;
            case 'ArrowFunctionExpression':
                return parent.body === node;
            case 'ImportSpecifier':
            case 'ImportDefaultSpecifier':
            case 'ImportNamespaceSpecifier':
            case 'ExportSpecifier':
            case 'LabeledStatement':
            case 'BreakStatement':
            case 'ContinueStatement':
            case 'RestElement':
            case 'ArrayPattern':
            case 'ObjectPattern':
                return false;
            case 'AssignmentPattern':
                return parent.right === node;
            case 'MethodDefinition':
            case 'PropertyDefinition':
                return parent.computed && parent.key === node;
            default:
                return true;
        }
    }

    functionName(node, parent) {
        if (node.type === 'FunctionDeclaration' && node.id) return node.id.name;
        if (
            parent?.type === 'VariableDeclarator' &&
            parent.id.type === 'Identifier'
        ) {
            return parent.id.name;
        }
        if (parent?.type === 'ExportDefaultDeclaration') return 'default';
        return null;
    }

    /** The const (or useMemo-wrapped const) a chain's value is stored in, if any. */
    boundTo(node, parent, grandparent, scope) {
        if (parent?.type === 'VariableDeclarator' && parent.init === node) {
            return parent.id.type === 'Identifier'
                ? scope.lookup(parent.id.name)
                : null;
        }
        if (parent?.type === 'ExportDefaultDeclaration') return null;
        return this.memoBinding(node, scope);
    }

    memoBinding(node, scope) {
        // Resolve via the enclosing component: find a const whose useMemo value is this node.
        let current = scope;
        while (current) {
            for (const binding of current.bindings.values()) {
                if (binding.kind !== 'variable' || !binding.init) continue;
                if (this.unwrapMemo(binding.init, current) === node)
                    return binding;
            }
            current = current.parent;
        }
        return null;
    }

    // --- collect -----------------------------------------------------------

    isIntermediate(chain) {
        const { binding } = chain;
        if (!binding) return false;
        const refs = this.references.get(binding) ?? [];
        if (refs.length === 0) return false;
        return refs.every(({ node, parent, grandparent, scope }) => {
            if (this.isChainContinuation(parent, grandparent, node))
                return true;
            if (
                parent?.type === 'CallExpression' &&
                parent.arguments.includes(node)
            ) {
                return this.flattenChain(parent, scope) !== null;
            }
            return false;
        });
    }

    collect() {
        const kept = this.chains.filter((chain) => !this.isIntermediate(chain));
        const entryByNode = new Map(
            kept.map((chain) => [chain.node, chain.entry]),
        );
        const entryByBinding = new Map();
        for (const chain of kept) {
            if (chain.binding) entryByBinding.set(chain.binding, chain.entry);
        }
        const bindings = this.useLightdashCalls.map(
            ({ node, scope, component }) => {
                const arg = this.unwrapParens(node.arguments[0]);
                let entry = null;
                if (arg?.type === 'Identifier') {
                    const binding = scope.lookup(arg.name);
                    entry = binding
                        ? (entryByBinding.get(binding) ?? null)
                        : null;
                } else if (arg) {
                    entry = entryByNode.get(arg) ?? null;
                }
                return {
                    component,
                    loc: this.loc(node),
                    query: entry?.id ?? null,
                    queryLoc: entry?.loc ?? null,
                };
            },
        );
        return { queries: kept.map((chain) => chain.entry), bindings };
    }
}

/** Analyze one source module. Throws on parse errors. */
export function analyzeModule(code, relPath) {
    return new ModuleAnalyzer(code, relPath).analyze();
}

/** Analyze several modules into one manifest; errors never throw. */
export function buildQueryManifest(modules) {
    const queries = [];
    const bindings = [];
    const errors = [];
    for (const { code, relPath } of modules) {
        try {
            const result = analyzeModule(code, relPath);
            queries.push(...result.queries);
            bindings.push(...result.bindings);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }
    return {
        version: 1,
        queries,
        bindings,
        error: errors.length > 0 ? errors.join('; ') : null,
    };
}

export const QUERY_MANIFEST_FILE = 'assets/queries.json';

/**
 * Vite plugin: records every src module Vite loads (returning null so the
 * next loader still runs) and emits assets/queries.json in generateBundle.
 */
export function queryManifestVitePlugin() {
    let cwd = process.cwd();
    const modules = new Map();
    return {
        name: 'lightdash-query-manifest',
        enforce: 'pre',
        configResolved(config) {
            cwd = config.root;
        },
        async load(id) {
            const filename = id.split('?')[0];
            if (!/\.(js|jsx|ts|tsx)$/.test(filename)) return null;
            const srcDir = path.join(cwd, 'src') + path.sep;
            if (!filename.startsWith(srcDir)) return null;
            const relPath = path.relative(cwd, filename).replace(/\\/g, '/');
            try {
                const code = await fs.readFile(filename, 'utf-8');
                modules.set(relPath, { code, relPath });
            } catch {
                modules.delete(relPath);
            }
            return null;
        },
        generateBundle() {
            let manifest;
            try {
                manifest = buildQueryManifest(
                    [...modules.values()].sort((a, b) =>
                        a.relPath.localeCompare(b.relPath),
                    ),
                );
            } catch (error) {
                manifest = {
                    version: 1,
                    queries: [],
                    bindings: [],
                    error:
                        error instanceof Error ? error.message : String(error),
                };
            }
            if (manifest.error) {
                this.warn(`query manifest: ${manifest.error}`);
            }
            this.emitFile({
                type: 'asset',
                fileName: QUERY_MANIFEST_FILE,
                source: JSON.stringify(manifest, null, 2),
            });
        },
    };
}
