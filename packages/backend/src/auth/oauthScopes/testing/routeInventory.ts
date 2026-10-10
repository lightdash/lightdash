import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript-compiler-api';

const authenticationNames = new Set([
    'allowApiKeyAuthentication',
    'allowApiKeyAuthenticationIfPresent',
    'allowOauthAuthentication',
]);
const httpMethods = new Set([
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'head',
    'options',
    'all',
]);

export type OAuthRoute = {
    id: string;
    file: string;
    guards: string[];
    invalidOrder: boolean;
    handler: ts.Node;
    authentication: ts.Node;
};

export const sourceFiles = (directory: string): string[] =>
    readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter(
            (entry) =>
                entry.isFile() &&
                entry.name.endsWith('.ts') &&
                !entry.name.endsWith('.test.ts') &&
                !entry.name.endsWith('.d.ts'),
        )
        .map((entry) => path.join(entry.parentPath, entry.name));

export const parseSource = (file: string, text = readFileSync(file, 'utf8')) =>
    ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

export const descendants = (node: ts.Node): ts.Node[] => {
    const children: ts.Node[] = [];
    const visit = (child: ts.Node) => {
        children.push(child);
        ts.forEachChild(child, visit);
    };
    visit(node);
    return children;
};

const createCollector = (sources: ts.SourceFile[]) => {
    const files = new Map(
        sources.map((source) => [path.resolve(source.fileName), source]),
    );
    const symbols = new Map<ts.SourceFile, Map<string, ts.Node>>();
    const declarationsFor = (source: ts.SourceFile) => {
        const cached = symbols.get(source);
        if (cached) return cached;
        const declarations = new Map<string, ts.Node>();
        for (const node of descendants(source)) {
            if (
                ts.isVariableDeclaration(node) &&
                ts.isIdentifier(node.name) &&
                node.initializer
            )
                declarations.set(node.name.text, node.initializer);
            if (
                (ts.isFunctionDeclaration(node) ||
                    ts.isClassDeclaration(node)) &&
                node.name
            ) {
                declarations.set(node.name.text, node);
                if (
                    node.modifiers?.some(
                        (modifier) =>
                            modifier.kind === ts.SyntaxKind.DefaultKeyword,
                    )
                )
                    declarations.set('default', node);
            }
            if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node))
                declarations.set(node.name.text, node);
            if (ts.isImportClause(node) && node.name)
                declarations.set(node.name.text, node);
            if (ts.isExportAssignment(node))
                declarations.set('default', node.expression);
        }
        symbols.set(source, declarations);
        return declarations;
    };
    const importedFile = (
        source: ts.SourceFile,
        specifier: ts.Expression,
    ): ts.SourceFile | null => {
        if (!ts.isStringLiteral(specifier) || !specifier.text.startsWith('.'))
            return null;
        const base = path.resolve(
            path.dirname(source.fileName),
            specifier.text,
        );
        for (const file of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
            const cached = files.get(file);
            if (cached) return cached;
            if (file.endsWith('.ts') && existsSync(file)) {
                const parsed = parseSource(file);
                files.set(file, parsed);
                return parsed;
            }
        }
        return null;
    };
    const exported = (
        source: ts.SourceFile,
        name: string,
        seen: Set<ts.Node>,
    ): ts.Node | null => {
        const local = declarationsFor(source).get(name);
        if (local) return local;
        for (const statement of source.statements.filter(
            ts.isExportDeclaration,
        )) {
            const target = statement.moduleSpecifier
                ? importedFile(source, statement.moduleSpecifier)
                : source;
            if (target && !seen.has(statement)) {
                const nextSeen = new Set([...seen, statement]);
                if (
                    statement.exportClause &&
                    ts.isNamedExports(statement.exportClause)
                ) {
                    const entry = statement.exportClause.elements.find(
                        (element) => element.name.text === name,
                    );
                    if (entry)
                        return exported(
                            target,
                            (entry.propertyName ?? entry.name).text,
                            nextSeen,
                        );
                } else if (!statement.exportClause) {
                    const entry = exported(target, name, nextSeen);
                    if (entry) return entry;
                }
            }
        }
        return null;
    };
    const resolve = (node: ts.Node, seen = new Set<ts.Node>()): ts.Node => {
        if (seen.has(node)) return node;
        const nextSeen = new Set([...seen, node]);
        if (ts.isIdentifier(node)) {
            const declaration = declarationsFor(node.getSourceFile()).get(
                node.text,
            );
            if (declaration) return resolve(declaration, nextSeen);
        }
        if (ts.isPropertyAccessExpression(node)) {
            let namespace = resolve(node.expression, nextSeen);
            if (node.expression.kind === ts.SyntaxKind.ThisKeyword) {
                let parent: ts.Node = node.parent;
                while (parent.parent && !ts.isClassDeclaration(parent))
                    parent = parent.parent;
                namespace = parent;
            }
            if (ts.isClassDeclaration(namespace)) {
                const member = namespace.members.find(
                    (entry) =>
                        entry.name &&
                        ts.isIdentifier(entry.name) &&
                        entry.name.text === node.name.text,
                );
                if (
                    member &&
                    ts.isPropertyDeclaration(member) &&
                    member.type &&
                    ts.isTypeReferenceNode(member.type)
                )
                    return resolve(member.type.typeName, nextSeen);
                if (member && ts.isMethodDeclaration(member)) return member;
            }
            if (ts.isNamespaceImport(namespace)) {
                const target = importedFile(
                    node.getSourceFile(),
                    namespace.parent.parent.moduleSpecifier,
                );
                if (target) {
                    const declaration = exported(
                        target,
                        node.name.text,
                        nextSeen,
                    );
                    if (declaration) return resolve(declaration, nextSeen);
                }
            }
        }
        if (ts.isImportSpecifier(node) || ts.isImportClause(node)) {
            const declaration = ts.isImportSpecifier(node)
                ? node.parent.parent.parent
                : node.parent;
            const name = ts.isImportSpecifier(node)
                ? (node.propertyName ?? node.name).text
                : 'default';
            const target = importedFile(
                node.getSourceFile(),
                declaration.moduleSpecifier,
            );
            if (target) {
                const exportedSymbol = exported(target, name, nextSeen);
                if (exportedSymbol) return resolve(exportedSymbol, nextSeen);
            }
        }
        return node;
    };
    const nameOf = (node: ts.Node): string => {
        if (ts.isIdentifier(node)) {
            const declaration = declarationsFor(node.getSourceFile()).get(
                node.text,
            );
            return declaration && ts.isImportSpecifier(declaration)
                ? (declaration.propertyName ?? declaration.name).text
                : node.text;
        }
        if (ts.isCallExpression(node)) return nameOf(node.expression);
        if (ts.isPropertyAccessExpression(node)) return node.name.text;
        return '';
    };
    const unresolved = (node: ts.Node): never => {
        const file = node.getSourceFile();
        const { line } = file.getLineAndCharacterOfPosition(node.getStart());
        throw new Error(
            `Unresolved OAuth middleware (possibly OAuth; classify or make the list static) in ${file.fileName}:${line + 1}: ${node.getText()}`,
        );
    };
    const factoryReturns = (node: ts.Node): ts.Expression[] => {
        if (ts.isArrowFunction(node) && !ts.isBlock(node.body))
            return [node.body];
        const results: ts.Expression[] = [];
        const visit = (child: ts.Node) => {
            if (child !== node && ts.isFunctionLike(child)) return;
            if (ts.isReturnStatement(child) && child.expression)
                results.push(child.expression);
            ts.forEachChild(child, visit);
        };
        visit(node);
        return results;
    };
    const expand = (
        node: ts.Node,
        seen = new Set<ts.Node>(),
        spread = false,
        allowUnresolvedHandler = false,
    ): ts.Node[] => {
        if (seen.has(node)) return unresolved(node);
        const nextSeen = new Set([...seen, node]);
        if (
            ts.isAsExpression(node) ||
            ts.isParenthesizedExpression(node) ||
            ts.isSatisfiesExpression(node)
        )
            return expand(
                node.expression,
                nextSeen,
                spread,
                allowUnresolvedHandler,
            );
        if (ts.isArrayLiteralExpression(node))
            return node.elements.flatMap((element) =>
                expand(element, nextSeen),
            );
        if (ts.isSpreadElement(node))
            return expand(node.expression, nextSeen, true);
        if (authenticationNames.has(nameOf(node))) return [node];
        if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
            const resolved = resolve(node);
            if (
                resolved !== node &&
                !ts.isImportSpecifier(resolved) &&
                !ts.isImportClause(resolved)
            )
                return expand(
                    resolved,
                    nextSeen,
                    spread,
                    allowUnresolvedHandler,
                );
        }
        if (ts.isIdentifier(node) && !allowUnresolvedHandler) {
            const resolved = resolve(node);
            if (resolved === node) return unresolved(node);
            if (ts.isImportSpecifier(resolved) || ts.isImportClause(resolved)) {
                const declaration = ts.isImportSpecifier(resolved)
                    ? resolved.parent.parent.parent
                    : resolved.parent;
                if (
                    ts.isStringLiteral(declaration.moduleSpecifier) &&
                    declaration.moduleSpecifier.text.startsWith('.')
                )
                    return unresolved(node);
            }
        }
        if (
            ts.isCallExpression(node) &&
            ![
                'requireOAuthScopeOperation',
                'assertOAuthScopeOperation',
                'Router',
                'express',
            ].includes(nameOf(node))
        ) {
            const factory = resolve(node.expression);
            if (
                ts.isArrowFunction(factory) ||
                ts.isFunctionExpression(factory) ||
                ts.isFunctionDeclaration(factory) ||
                ts.isMethodDeclaration(factory)
            ) {
                const results = factoryReturns(factory);
                if (results.length !== 1) return unresolved(node);
                return expand(
                    results[0],
                    nextSeen,
                    spread,
                    allowUnresolvedHandler,
                );
            }
            let root: ts.Node = node.expression;
            while (ts.isPropertyAccessExpression(root)) root = root.expression;
            const imported = resolve(root);
            let declaration: ts.ImportDeclaration | ts.JSDocImportTag | null =
                null;
            if (ts.isImportSpecifier(imported))
                declaration = imported.parent.parent.parent;
            if (ts.isImportClause(imported)) declaration = imported.parent;
            if (ts.isNamespaceImport(imported))
                declaration = imported.parent.parent;
            if (
                !declaration ||
                !ts.isStringLiteral(declaration.moduleSpecifier) ||
                declaration.moduleSpecifier.text.startsWith('.')
            )
                return unresolved(node);
        }
        if (
            spread ||
            ts.isPropertyAccessExpression(node) ||
            ts.isConditionalExpression(node) ||
            ts.isElementAccessExpression(node) ||
            ts.isBinaryExpression(node)
        )
            return unresolved(node);
        if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            ![
                'requireOAuthScopeOperation',
                'assertOAuthScopeOperation',
                'Router',
                'express',
            ].includes(nameOf(node)) &&
            resolve(node.expression) === node.expression
        )
            return unresolved(node);
        if (
            !ts.isIdentifier(node) &&
            !ts.isCallExpression(node) &&
            !ts.isArrowFunction(node) &&
            !ts.isFunctionExpression(node) &&
            !ts.isFunctionDeclaration(node) &&
            !ts.isMethodDeclaration(node) &&
            !ts.isBlock(node)
        )
            return unresolved(node);
        return [node];
    };
    const isAuthentication = (node: ts.Node): boolean =>
        descendants(node).some((child) =>
            authenticationNames.has(nameOf(child)),
        );
    const guardsIn = (node: ts.Node) =>
        descendants(node)
            .filter(ts.isCallExpression)
            .filter((call) =>
                [
                    'requireOAuthScopeOperation',
                    'assertOAuthScopeOperation',
                ].includes(nameOf(call)),
            )
            .map((call) => {
                const argument =
                    call.arguments[
                        nameOf(call) === 'assertOAuthScopeOperation' ? 1 : 0
                    ];
                if (!argument || !ts.isStringLiteral(argument))
                    throw new Error(
                        `Nonliteral OAuth operation in ${call.getSourceFile().fileName}`,
                    );
                return argument.text;
            });
    const middleware = (node: ts.Node): ts.Node[] =>
        (ts.canHaveDecorators(node)
            ? (ts.getDecorators(node) ?? [])
            : []
        ).flatMap((decorator) =>
            ts.isCallExpression(decorator.expression) &&
            nameOf(decorator.expression) === 'Middlewares'
                ? decorator.expression.arguments.flatMap((argument) =>
                      expand(argument),
                  )
                : [],
        );
    const key = (node: ts.Node): string => {
        const resolved = resolve(node);
        return `${path.resolve(resolved.getSourceFile().fileName)}:${ts.isIdentifier(resolved) ? resolved.text : resolved.pos}`;
    };
    const receivers = new Set(
        sources.flatMap((source) =>
            descendants(source)
                .filter(ts.isCallExpression)
                .filter(
                    (call) =>
                        ts.isPropertyAccessExpression(call.expression) &&
                        call.expression.name.text === 'use' &&
                        !['passport', 'refresh'].includes(
                            call.expression.expression.getText(),
                        ),
                )
                .map((call) =>
                    key(
                        (call.expression as ts.PropertyAccessExpression)
                            .expression,
                    ),
                ),
        ),
    );
    const isRouter = (node: ts.Node): boolean => {
        const resolved = resolve(node);
        return (
            (ts.isCallExpression(resolved) &&
                ['Router', 'express'].includes(nameOf(resolved))) ||
            /(?:router|app)$/i.test(node.getText()) ||
            receivers.has(key(node))
        );
    };
    type Mount = {
        router: string;
        prefix: string;
        handlers: ts.Node[];
        position: number;
        node: ts.CallExpression;
    };
    const routerMiddleware: Mount[] = [];
    for (const source of files.values()) {
        const uses = descendants(source)
            .filter(ts.isCallExpression)
            .filter(
                (call) =>
                    ts.isPropertyAccessExpression(call.expression) &&
                    call.expression.name.text === 'use' &&
                    isRouter(call.expression.expression),
            );
        for (const call of uses) {
            const expression = call.expression as ts.PropertyAccessExpression;
            const [first, ...rest] = call.arguments;
            const resolvedPath = first ? resolve(first) : null;
            let prefixes: string[] | null = null;
            if (resolvedPath && ts.isStringLiteral(resolvedPath)) {
                prefixes = [resolvedPath.text];
            } else if (
                resolvedPath &&
                ts.isArrayLiteralExpression(resolvedPath) &&
                resolvedPath.elements.every(ts.isStringLiteral)
            ) {
                prefixes = resolvedPath.elements
                    .filter(ts.isStringLiteral)
                    .map((entry) => entry.text);
            }
            const handlers = (prefixes ? rest : [...call.arguments]).flatMap(
                (node) => expand(node),
            );
            for (const prefix of prefixes ?? ['/']) {
                routerMiddleware.push({
                    router: key(expression.expression),
                    prefix,
                    handlers,
                    position: call.pos,
                    node: call,
                });
            }
        }
    }
    const matches = (prefix: string, route: string): boolean => {
        const prefixParts = prefix.split('/').filter(Boolean);
        const routeParts = route.split('/').filter(Boolean);
        for (let index = 0; index < prefixParts.length; index += 1) {
            const segment = prefixParts[index];
            const target = routeParts[index];
            if (
                /[*:()?+]/.test(segment) ||
                (target && /[*:()?+{]/.test(target))
            )
                return true;
            if (segment !== target) return false;
        }
        return true;
    };
    const inheritedMiddleware = (
        router: string,
        route: string,
        position: number,
        seen = new Set<string>(),
    ): ts.Node[][] => {
        if (seen.has(router))
            throw new Error(`Cyclic OAuth router mount: ${router}`);
        const nextSeen = new Set([...seen, router]);
        const local = routerMiddleware
            .filter(
                (entry) =>
                    entry.router === router &&
                    entry.position < position &&
                    matches(entry.prefix, route),
            )
            .flatMap((entry) =>
                entry.handlers.filter((handler) => !isRouter(handler)),
            );
        const mounts = routerMiddleware.flatMap((entry) =>
            entry.handlers.flatMap((handler, index) =>
                key(handler) === router ? [{ entry, index }] : [],
            ),
        );
        if (mounts.length === 0) return [local];
        return mounts.flatMap(({ entry, index }) =>
            inheritedMiddleware(
                entry.router,
                path.posix.join(entry.prefix, route),
                entry.position,
                nextSeen,
            ).map((parent) => [
                ...parent,
                ...entry.handlers
                    .slice(0, index)
                    .filter((handler) => !isRouter(handler)),
                ...local,
            ]),
        );
    };
    const registrations = [...files.values()].flatMap((source) =>
        descendants(source)
            .filter(ts.isCallExpression)
            .filter(
                (call) =>
                    nameOf(call) === 'RegisterRoutes' && call.arguments[0],
            ),
    );
    const collect = (source: ts.SourceFile): OAuthRoute[] => {
        const routes: OAuthRoute[] = [];
        const add = (
            id: string,
            middlewareNodes: ts.Node[],
            handler: ts.Node,
        ) => {
            const middlewares = middlewareNodes.flatMap((node) =>
                expand(node, new Set(), false, node === handler),
            );
            const authenticationIndex =
                middlewares.findLastIndex(isAuthentication);
            if (authenticationIndex < 0) return;
            const candidate: OAuthRoute = {
                id,
                file: source.fileName,
                guards: [
                    ...new Set([
                        ...middlewares.flatMap(guardsIn),
                        ...guardsIn(handler),
                    ]),
                ],
                invalidOrder: middlewares.some(
                    (node, index) =>
                        guardsIn(node).length > 0 &&
                        index <= authenticationIndex,
                ),
                handler,
                authentication: middlewares[authenticationIndex],
            };
            const previous = routes.find((route) => route.id === id);
            if (previous) {
                previous.guards = previous.guards.filter((guard) =>
                    candidate.guards.includes(guard),
                );
                previous.invalidOrder ||= candidate.invalidOrder;
            } else {
                routes.push(candidate);
            }
        };
        const chainedRoute = (
            node: ts.Expression,
        ): { router: ts.Expression; routePath: ts.Expression } | null => {
            if (
                !ts.isCallExpression(node) ||
                !ts.isPropertyAccessExpression(node.expression)
            )
                return null;
            if (node.expression.name.text === 'route' && node.arguments[0])
                return {
                    router: node.expression.expression,
                    routePath: node.arguments[0],
                };
            return chainedRoute(node.expression.expression);
        };
        descendants(source).forEach((node) => {
            if (ts.isClassDeclaration(node) && node.name) {
                const className = node.name.text;
                node.members.forEach((member) => {
                    if (!ts.isMethodDeclaration(member)) return;
                    const decorators = ts.getDecorators(member) ?? [];
                    if (
                        !decorators.some(
                            (decorator) =>
                                ts.isCallExpression(decorator.expression) &&
                                httpMethods.has(
                                    nameOf(decorator.expression).toLowerCase(),
                                ),
                        )
                    )
                        return;
                    const decoratorPath = (
                        target: ts.Node,
                        names: Set<string>,
                    ): string | null => {
                        const decorator = (
                            ts.canHaveDecorators(target)
                                ? (ts.getDecorators(target) ?? [])
                                : []
                        )
                            .map((entry) => entry.expression)
                            .filter(ts.isCallExpression)
                            .find((entry) =>
                                names.has(nameOf(entry).toLowerCase()),
                            );
                        if (!decorator) return null;
                        const argument = decorator.arguments[0];
                        if (!argument) return '/';
                        if (!ts.isStringLiteral(argument))
                            return unresolved(argument);
                        return argument.text;
                    };
                    const controllerPath = decoratorPath(
                        node,
                        new Set(['route']),
                    );
                    const methodPath = decoratorPath(member, httpMethods);
                    const parents =
                        controllerPath === null || registrations.length === 0
                            ? [[]]
                            : registrations.flatMap((call) =>
                                  inheritedMiddleware(
                                      key(call.arguments[0]),
                                      path.posix.join(
                                          controllerPath,
                                          methodPath ?? '/',
                                      ),
                                      call.pos,
                                  ),
                              );
                    for (const parent of parents) {
                        add(
                            `${className}.${member.name.getText(source)}`,
                            [
                                ...parent,
                                ...middleware(node),
                                ...middleware(member),
                            ],
                            member.body ?? member,
                        );
                    }
                });
            }
            if (
                !ts.isCallExpression(node) ||
                !ts.isPropertyAccessExpression(node.expression) ||
                !httpMethods.has(node.expression.name.text)
            )
                return;
            const chained = chainedRoute(node.expression.expression);
            const routePath = chained?.routePath ?? node.arguments[0];
            if (!routePath) return;
            const handlers = chained
                ? [...node.arguments]
                : node.arguments.slice(1);
            if (handlers.length === 0) return;
            const routerNode = chained?.router ?? node.expression.expression;
            if (!isRouter(routerNode)) return;
            const router = routerNode.getText(source);
            const paths = ts.isArrayLiteralExpression(routePath)
                ? routePath.elements
                : [routePath];
            for (const route of paths) {
                const inheritedPaths = inheritedMiddleware(
                    key(routerNode),
                    ts.isStringLiteral(route) ? route.text : '/',
                    node.pos,
                );
                for (const inherited of inheritedPaths) {
                    const handler = handlers[handlers.length - 1];
                    const middlewares = [...inherited, ...handlers].flatMap(
                        (entry) =>
                            expand(entry, new Set(), false, entry === handler),
                    );
                    if (
                        middlewares.some(isAuthentication) &&
                        !ts.isStringLiteral(route)
                    )
                        unresolved(route);
                    if (ts.isStringLiteral(route))
                        add(
                            `${router} ${node.expression.name.text.toUpperCase()} ${route.text}`,
                            middlewares,
                            handlers[handlers.length - 1],
                        );
                }
            }
        });
        return routes;
    };
    return { collect, sources: () => [...files.values()] };
};

export const collectOAuthRoutes = (
    source: ts.SourceFile,
    sources: ts.SourceFile[] = [source],
): OAuthRoute[] => createCollector(sources).collect(source);

export const collectOAuthRoutesFromSources = (
    sources: ts.SourceFile[],
): OAuthRoute[] => {
    const collector = createCollector(sources);
    return collector.sources().flatMap(collector.collect);
};
