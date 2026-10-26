import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { bindSessionStoreCallbacks } from './contextSafeSessionStore';

// The exact Bluebird instance connect-session-knex settles its callbacks with.
const storeRequire = createRequire(require.resolve('connect-session-knex'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Bluebird = storeRequire('bluebird') as {
    resolve: (value: unknown) => {
        asCallback: (fn: (...args: unknown[]) => void) => unknown;
    };
};

const als = new AsyncLocalStorage<string>();
const dbRoundTrip = () =>
    new Promise((resolve) => {
        setTimeout(() => resolve('row'), 2);
    });

type Callback = (...args: unknown[]) => void;
// Mirrors KnexStore.prototype.get/touch: resolve(knexQuery).asCallback(fn)
const bluebirdStore = () =>
    ({
        get: (_sid: string, fn: Callback) =>
            Bluebird.resolve(dbRoundTrip()).asCallback(fn),
        touch: (_sid: string, _sess: unknown, fn: Callback) =>
            Bluebird.resolve(dbRoundTrip()).asCallback(fn),
    }) as unknown as import('express-session').Store;

const countLeaks = async (store: import('express-session').Store) => {
    let leaks = 0;
    const rounds = 100;
    for (let i = 0; i < rounds; i += 1) {
        // MCP response ends inside the agent scope -> express-session touches
        als.run('AGENT', () => store.touch!('mcp', {} as never, () => {}));
        // Person request loads its session -> next() runs in the callback
        // eslint-disable-next-line no-await-in-loop
        const seen = await new Promise<string>((done) => {
            store.get('person', () => done(als.getStore() ?? 'none'));
        });
        if (seen === 'AGENT') leaks += 1;
    }
    return { leaks, rounds };
};

describe('session store callbacks and AsyncLocalStorage', () => {
    test('reproduces the Bluebird queue leak with the raw store', async () => {
        const { leaks, rounds } = await countLeaks(bluebirdStore());
        // eslint-disable-next-line no-console
        console.log(
            `raw store: person callback saw AGENT in ${leaks}/${rounds}`,
        );
        expect(leaks).toBeGreaterThan(0);
    });
    test('binding callbacks keeps each request in its own context', async () => {
        const { leaks } = await countLeaks(
            bindSessionStoreCallbacks(bluebirdStore()),
        );
        expect(leaks).toBe(0);
    });
    test('an agent-scoped touch still sees its own scope', async () => {
        const store = bindSessionStoreCallbacks(bluebirdStore());
        const seen = await als.run(
            'AGENT',
            () =>
                new Promise<string | undefined>((done) => {
                    store.touch!('mcp', {} as never, () =>
                        done(als.getStore()),
                    );
                }),
        );
        expect(seen).toBe('AGENT');
    });
});
