import { readdirSync, readFileSync } from 'node:fs';
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

export const collectOAuthRoutes = (source: ts.SourceFile): OAuthRoute[] => {
    const aliases = new Map<string, string>();
    const declarations = new Map<string, ts.Node>();
    for (const node of descendants(source)) {
        if (ts.isImportSpecifier(node))
            aliases.set(node.name.text, (node.propertyName ?? node.name).text);
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer
        )
            declarations.set(node.name.text, node.initializer);
        if (ts.isFunctionDeclaration(node) && node.name && node.body)
            declarations.set(node.name.text, node.body);
    }
    const nameOf = (node: ts.Node): string => {
        if (ts.isIdentifier(node)) return aliases.get(node.text) ?? node.text;
        if (ts.isCallExpression(node)) return nameOf(node.expression);
        if (ts.isPropertyAccessExpression(node)) return node.name.text;
        return '';
    };
    const expand = (node: ts.Node, seen = new Set<string>()): ts.Node[] => {
        if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
            return expand(node.expression, seen);
        if (ts.isArrayLiteralExpression(node))
            return node.elements.flatMap((element) => expand(element, seen));
        if (ts.isSpreadElement(node)) return expand(node.expression, seen);
        if (
            ts.isIdentifier(node) &&
            declarations.has(node.text) &&
            !seen.has(node.text)
        )
            return expand(
                declarations.get(node.text)!,
                new Set([...seen, node.text]),
            );
        return [node];
    };
    const isAuthentication = (node: ts.Node): boolean =>
        expand(node).some((expanded) =>
            descendants(expanded).some((child) =>
                authenticationNames.has(nameOf(child)),
            ),
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
                        `Nonliteral OAuth operation in ${source.fileName}`,
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
    const routes: OAuthRoute[] = [];
    const add = (id: string, middlewareNodes: ts.Node[], handler: ts.Node) => {
        const middlewares = middlewareNodes.flatMap((node) => expand(node));
        const authenticationIndex = middlewares.findLastIndex(isAuthentication);
        if (authenticationIndex < 0) return;
        routes.push({
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
                    guardsIn(node).length > 0 && index <= authenticationIndex,
            ),
            handler,
            authentication: middlewares[authenticationIndex],
        });
    };
    const routerMiddleware = descendants(source)
        .filter(ts.isCallExpression)
        .filter(
            (call) =>
                ts.isPropertyAccessExpression(call.expression) &&
                call.expression.name.text === 'use',
        )
        .map((call) => {
            const expression = call.expression as ts.PropertyAccessExpression;
            const [first, ...rest] = call.arguments;
            return {
                router: expression.expression.getText(source),
                prefix: first && ts.isStringLiteral(first) ? first.text : '/',
                handlers:
                    first && ts.isStringLiteral(first)
                        ? rest
                        : [...call.arguments],
                position: call.pos,
            };
        });
    const chainedRoute = (
        node: ts.Expression,
    ): { router: string; routePath: ts.Expression } | null => {
        if (
            !ts.isCallExpression(node) ||
            !ts.isPropertyAccessExpression(node.expression)
        )
            return null;
        if (node.expression.name.text === 'route' && node.arguments[0])
            return {
                router: node.expression.expression.getText(source),
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
                add(
                    `${className}.${member.name.getText(source)}`,
                    [...middleware(node), ...middleware(member)],
                    member.body ?? member,
                );
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
        const router =
            chained?.router ?? node.expression.expression.getText(source);
        const paths = ts.isArrayLiteralExpression(routePath)
            ? routePath.elements
            : [routePath];
        for (const route of paths) {
            const inherited = routerMiddleware
                .filter(
                    (entry) =>
                        entry.router === router &&
                        entry.position < node.pos &&
                        ts.isStringLiteral(route) &&
                        (entry.prefix === '/' ||
                            route.text === entry.prefix ||
                            route.text.startsWith(`${entry.prefix}/`)),
                )
                .flatMap((entry) => entry.handlers);
            const middlewares = [...inherited, ...handlers];
            if (
                middlewares.some(isAuthentication) &&
                !ts.isStringLiteral(route)
            )
                throw new Error(`Nonliteral OAuth route in ${source.fileName}`);
            if (ts.isStringLiteral(route))
                add(
                    `${router} ${node.expression.name.text.toUpperCase()} ${route.text}`,
                    middlewares,
                    handlers[handlers.length - 1],
                );
        }
    });
    return routes;
};
