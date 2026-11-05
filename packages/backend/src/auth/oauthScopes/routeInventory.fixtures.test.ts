import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    collectOAuthRoutes,
    collectOAuthRoutesFromSources,
    parseSource,
} from './testing/routeInventory';

it('inherits authentication from cross-file mounts, including nested default exports', () => {
    const child = parseSource(
        'child.ts',
        `export const child = Router(); child.post('/write', handler);`,
    );
    const parent = parseSource(
        'parent.ts',
        `import { child as nested } from './child'; const parent = Router(); parent.use('/nested', nested); export default parent;`,
    );
    const app = parseSource(
        'App.ts',
        `import parent from './parent'; app.use('/private', allowApiKeyAuthentication, parent);`,
    );
    expect(
        collectOAuthRoutes(child, [child, parent, app]).map(({ id }) => id),
    ).toEqual(['child POST /write']);
});

it('resolves imported middleware arrays through barrel exports in decorators and router calls', () => {
    const middleware = parseSource(
        'middleware.ts',
        `export const auth = [allowApiKeyAuthentication, requireOAuthScopeOperation('write')];`,
    );
    const barrel = parseSource(
        'index.ts',
        `export { auth as authenticated } from './middleware';`,
    );
    const source = parseSource(
        'controller.ts',
        `
        import { authenticated as middleware } from './index';
        @Middlewares(middleware)
        class Controller { @Post('/write') write() {} }
        router.post('/write', ...middleware, handler);
    `,
    );
    expect(
        collectOAuthRoutes(source, [source, barrel, middleware]).map(
            ({ id, guards, invalidOrder }) => ({ id, guards, invalidOrder }),
        ),
    ).toEqual([
        { id: 'Controller.write', guards: ['write'], invalidOrder: false },
        { id: 'router POST /write', guards: ['write'], invalidOrder: false },
    ]);
});

it('inherits parent use middleware before child mounts regardless of child declaration position', () => {
    const child = parseSource(
        'child.ts',
        `export const child = Router(); child.post('/write', handler);`,
    );
    const parent = parseSource(
        'parent.ts',
        `import { child } from './child'; parent.use(allowApiKeyAuthentication); parent.use('/private', child);`,
    );
    expect(
        collectOAuthRoutes(child, [child, parent]).map(({ id }) => id),
    ).toEqual(['child POST /write']);
});

it('does not inherit middleware registered after a child mount or on a different prefix', () => {
    const child = parseSource(
        'child.ts',
        `export const child = Router(); child.post('/write', handler);`,
    );
    const parent = parseSource(
        'parent.ts',
        `import { child } from './child'; parent.use('/other', allowApiKeyAuthentication); parent.use('/private', child); parent.use(allowApiKeyAuthentication);`,
    );
    expect(collectOAuthRoutes(child, [child, parent])).toEqual([]);
});

it.each([
    `const middleware = enabled ? [allowApiKeyAuthentication] : []; router.post('/write', ...middleware, handler);`,
    `router.post('/write', ...getMiddleware(), handler);`,
    `@Middlewares(middlewareByMode[mode]) class Controller { @Post('/write') write() {} }`,
])('fails closed on an unresolved middleware list: %s', (code) => {
    expect(() => collectOAuthRoutes(parseSource('dynamic.ts', code))).toThrow(
        /Unresolved OAuth middleware.*dynamic.ts:1/,
    );
});

it('retains authentication order across mounts and imported middleware arrays', () => {
    const child = parseSource(
        'child.ts',
        `export const child = Router(); child.post('/write', allowOauthAuthentication, handler);`,
    );
    const parent = parseSource(
        'parent.ts',
        `import { child } from './child'; parent.use('/private', requireOAuthScopeOperation('write'), child);`,
    );
    expect(collectOAuthRoutes(child, [child, parent])[0].invalidOrder).toBe(
        true,
    );
});

it('keeps routers with identical initializers distinct', () => {
    const source = parseSource(
        'fixture.ts',
        `
        const privateRouter = Router();
        const publicRouter = Router();
        privateRouter.use(allowApiKeyAuthentication);
        privateRouter.post('/write', handler);
        publicRouter.post('/write', handler);
    `,
    );
    expect(collectOAuthRoutes(source).map(({ id }) => id)).toEqual([
        'privateRouter POST /write',
    ]);
});

it('requires every OAuth mount of a shared route to have a guard', () => {
    const child = parseSource(
        'child.ts',
        `export const child = Router(); child.post('/write', handler);`,
    );
    const parent = parseSource(
        'parent.ts',
        `import { child } from './child'; parent.use('/guarded', allowApiKeyAuthentication, requireOAuthScopeOperation('write'), child); parent.use('/unguarded', allowApiKeyAuthentication, child);`,
    );
    const routes = collectOAuthRoutes(child, [child, parent]);
    expect(routes).toHaveLength(1);
    expect(routes[0].guards).toEqual([]);
});

it.each([
    `@Middlewares(unknownMiddleware) class Controller { @Post('/write') write() {} }`,
    `import { middleware } from './missing'; @Middlewares(middleware) class Controller { @Post('/write') write() {} }`,
    `const child = Router(); parent.use(prefix, allowApiKeyAuthentication, child); child.post('/write', handler);`,
])(
    'reports unresolved lists or mount paths with a source location: %s',
    (code) => {
        expect(() =>
            collectOAuthRoutes(parseSource('dynamic.ts', code)),
        ).toThrow(/Unresolved OAuth middleware.*dynamic.ts:1/);
    },
);

it('loads router modules reached through mounts from the application entry point', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'oauth-routes-'));
    try {
        writeFileSync(
            path.join(directory, 'parent.ts'),
            `import child from './child'; const parent = Router(); parent.use('/child', child); export default parent;`,
        );
        writeFileSync(
            path.join(directory, 'child.ts'),
            `const child = Router(); child.post('/write', (req, res) => res.end()); export default child;`,
        );
        const app = parseSource(
            path.join(directory, 'App.ts'),
            `import parent from './parent'; app.use('/private', allowApiKeyAuthentication, parent);`,
        );
        expect(
            collectOAuthRoutesFromSources([app]).map(({ id }) => id),
        ).toEqual(['child POST /write']);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

it('resolves middleware arrays returned by a static factory', () => {
    const source = parseSource(
        'factory.ts',
        `const middleware = () => [allowApiKeyAuthentication]; router.post('/write', middleware(), handler);`,
    );
    expect(collectOAuthRoutes(source).map(({ id }) => id)).toEqual([
        'router POST /write',
    ]);
});

it('rejects dynamic middleware returned by a factory', () => {
    const source = parseSource(
        'factory.ts',
        `const middleware = () => enabled ? [allowApiKeyAuthentication] : []; router.post('/write', middleware(), handler);`,
    );
    expect(() => collectOAuthRoutes(source)).toThrow(
        /Unresolved OAuth middleware.*factory.ts:1/,
    );
});

it('inherits app middleware on generated controller routes', () => {
    const app = parseSource(
        'App.ts',
        `app.use('/api/private', allowApiKeyAuthentication); RegisterRoutes(app);`,
    );
    const controller = parseSource(
        'controller.ts',
        `@Route('/api/private') class Controller { @Post('/write') write() {} }`,
    );
    expect(
        collectOAuthRoutes(controller, [controller, app]).map(({ id }) => id),
    ).toEqual(['Controller.write']);
});

it('resolves middleware arrays imported as a namespace', () => {
    const middleware = parseSource(
        'middleware.ts',
        `export const auth = [allowApiKeyAuthentication];`,
    );
    const source = parseSource(
        'controller.ts',
        `import * as middleware from './middleware'; @Middlewares(middleware.auth) class Controller { @Post('/write') write() {} }`,
    );
    expect(
        collectOAuthRoutes(source, [source, middleware]).map(({ id }) => id),
    ).toEqual(['Controller.write']);
});

it('rejects a middleware property with no static definition', () => {
    const source = parseSource(
        'dynamic.ts',
        `@Middlewares(config.middleware) class Controller { @Post('/write') write() {} }`,
    );
    expect(() => collectOAuthRoutes(source)).toThrow(
        /Unresolved OAuth middleware.*dynamic.ts:1/,
    );
});

it.each([
    `@Middlewares(await loadMiddleware()) class Controller { @Post('/write') write() {} }`,
    `@Middlewares(registry.get('auth')) class Controller { @Post('/write') write() {} }`,
])('rejects unsupported dynamic middleware expressions: %s', (code) => {
    expect(() => collectOAuthRoutes(parseSource('dynamic.ts', code))).toThrow(
        /Unresolved OAuth middleware.*dynamic.ts:1/,
    );
});

it('inherits authentication across parameterized mount prefixes', () => {
    const child = parseSource(
        'child.ts',
        `export const child = Router(); child.post('/write', handler);`,
    );
    const parent = parseSource(
        'parent.ts',
        `import { child } from './child'; parent.use('/private/:account', allowApiKeyAuthentication); parent.use('/private/:user', child);`,
    );
    expect(
        collectOAuthRoutes(child, [child, parent]).map(({ id }) => id),
    ).toEqual(['child POST /write']);
});

it('resolves a middleware factory on a typed application property', () => {
    const source = parseSource(
        'App.ts',
        `
        class Authentication { middleware() { return [allowApiKeyAuthentication]; } }
        class App {
            authentication: Authentication;
            register() { app.use(this.authentication.middleware()); app.post('/write', handler); }
        }
    `,
    );
    expect(collectOAuthRoutes(source).map(({ id }) => id)).toEqual([
        'app POST /write',
    ]);
});

it('supports an array of mount paths', () => {
    const source = parseSource(
        'fixture.ts',
        `const child = Router(); parent.use(['/one', '/two'], allowApiKeyAuthentication, child); child.post('/write', handler);`,
    );
    expect(collectOAuthRoutes(source).map(({ id }) => id)).toEqual([
        'child POST /write',
    ]);
});
