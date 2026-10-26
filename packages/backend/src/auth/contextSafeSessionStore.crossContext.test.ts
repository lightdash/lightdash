import {
    createContextKey,
    context as otelContext,
    ROOT_CONTEXT,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import ExecutionContext from 'node-execution-context';
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
type Callback = (...args: unknown[]) => void;
type FakeStore = import('express-session').Store;
const dbRoundTrip = () =>
    new Promise((resolve) => {
        setTimeout(() => resolve('row'), 2);
    });
const bluebirdStore = () =>
    ({
        get: (_sid: string, fn: Callback) =>
            Bluebird.resolve(dbRoundTrip()).asCallback(fn),
        touch: (_sid: string, _sess: unknown, fn: Callback) =>
            Bluebird.resolve(dbRoundTrip()).asCallback(fn),
    }) as unknown as FakeStore;

const REQUEST_KEY = createContextKey('request');
const manager = new AsyncLocalStorageContextManager();
beforeAll(() => {
    manager.enable();
    otelContext.setGlobalContextManager(manager);
});
afterAll(() => {
    otelContext.disable();
    manager.disable();
});

// Request A (any cookie request, no agent involved) ends its response inside
// its own OpenTelemetry context and ExecutionContext; request B's session
// `get` callback is what express-session calls `next()` from.
const runRound = async (store: FakeStore) => {
    const contextA = ROOT_CONTEXT.setValue(REQUEST_KEY, 'request-A');
    const executionA: Record<string, unknown> = { organization_uuid: 'org-A' };
    let organizationSeenByA: unknown = null;
    const requestA = ExecutionContext.run(async () => {
        otelContext.with(contextA, () => {
            store.touch!('sid-A', {} as never, () => {});
        });
        // A keeps working after its response ended (e.g. a background log)
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
        organizationSeenByA =
            ExecutionContext.get<Record<string, unknown>>().organization_uuid;
    }, executionA);
    const seenByB = await new Promise<{
        otelRequest: unknown;
        executionExists: boolean;
    }>((done) => {
        store.get('sid-B', () => {
            // What requestExecutionContextMiddleware does when a context exists
            const executionExists = ExecutionContext.exists();
            if (executionExists)
                ExecutionContext.update({ organization_uuid: 'org-B' });
            done({
                otelRequest: otelContext.active().getValue(REQUEST_KEY),
                executionExists,
            });
        });
    });
    await requestA;
    return { ...seenByB, organizationSeenByA };
};

const rounds = async (store: FakeStore) => {
    const tally = { otelLeaks: 0, executionLeaks: 0, overwrittenA: 0, n: 40 };
    for (let i = 0; i < tally.n; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const seen = await runRound(store);
        if (seen.otelRequest === 'request-A') tally.otelLeaks += 1;
        if (seen.executionExists) tally.executionLeaks += 1;
        if (seen.organizationSeenByA === 'org-B') tally.overwrittenA += 1;
    }
    return tally;
};

describe('session store callbacks and the other per-request contexts', () => {
    test('raw store: request B inherits request A trace context and overwrites A log context', async () => {
        const tally = await rounds(bluebirdStore());
        // eslint-disable-next-line no-console
        console.log('raw store cross-context tally', tally);
        expect(tally.otelLeaks).toBeGreaterThan(0);
        expect(tally.executionLeaks).toBeGreaterThan(0);
        expect(tally.overwrittenA).toBeGreaterThan(0);
    });
    test('bound store: no trace, Sentry-scope carrier or log context crosses requests', async () => {
        const tally = await rounds(bindSessionStoreCallbacks(bluebirdStore()));
        expect(tally).toMatchObject({
            otelLeaks: 0,
            executionLeaks: 0,
            overwrittenA: 0,
        });
    });
});
