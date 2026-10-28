import signature from 'cookie-signature';
import express, { type ErrorRequestHandler } from 'express';
import session, { type SessionData } from 'express-session';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import fetch from 'node-fetch';
import { AsyncLocalStorage } from 'node:async_hooks';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { KnexSessionStore } from './KnexSessionStore';

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
const secret = 'session-store-test-secret';
const fixture = (): SessionData => ({
    oauth: {},
    slack: {},
    cookie: {
        originalMaxAge: 60000,
        expires: new Date(Date.now() + 60000),
        httpOnly: true,
        path: '/',
    },
});
const operations = {
    get: (store: KnexSessionStore, cb: (error?: unknown) => void) =>
        store.get('sid', cb),
    set: (store: KnexSessionStore, cb: (error?: unknown) => void) =>
        store.set('sid', fixture(), cb),
    touch: (store: KnexSessionStore, cb: (error?: unknown) => void) =>
        store.touch('sid', fixture(), cb),
    destroy: (store: KnexSessionStore, cb: (error?: unknown) => void) =>
        store.destroy('sid', cb),
    all: (store: KnexSessionStore, cb: (error?: unknown) => void) =>
        store.all(cb),
    length: (store: KnexSessionStore, cb: (error?: unknown) => void) =>
        store.length(cb),
    clear: (store: KnexSessionStore, cb: (error?: unknown) => void) =>
        store.clear(cb),
};

const createStore = async () => {
    tracker.on.any(/information_schema/).responseOnce(true);
    const store = new KnexSessionStore(database, { cleanupInterval: 0 });
    await store.ready;
    return store;
};

beforeEach(() => tracker.reset());
afterAll(async () => database.destroy());

describe('KnexSessionStore callback contract', () => {
    test.each(Object.entries(operations))(
        '%s reports query failure exactly once without a returned rejection',
        async (_name, invoke) => {
            const store = await createStore();
            tracker.on.any(/.*/).simulateError('injected query failure');
            const callback = vi.fn();
            await new Promise<void>((resolve) => {
                const returned = invoke(store, (error) => {
                    callback(error);
                    resolve();
                });
                expect(returned).toBeUndefined();
            });
            await nextTurn();
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
            expect(callback.mock.calls[0][0].message).toContain(
                'injected query failure',
            );
        },
    );

    test.each(Object.entries(operations))(
        '%s reports readiness failure after an idle startup',
        async (_name, invoke) => {
            tracker.on
                .any(/information_schema/)
                .simulateError('startup failure');
            const store = new KnexSessionStore(database, {
                cleanupInterval: 0,
            });
            await nextTurn();
            await nextTurn();
            const callback = vi.fn();
            await new Promise<void>((resolve) => {
                invoke(store, (error) => {
                    callback(error);
                    resolve();
                });
            });
            await nextTurn();
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback.mock.calls[0][0].message).toContain(
                'startup failure',
            );
        },
    );

    test('touch without an expiry completes once without a query', async () => {
        const store = await createStore();
        tracker.resetHistory();
        const callback = vi.fn();
        await new Promise<void>((resolve) => {
            store.touch('sid', { cookie: {} } as SessionData, (error) => {
                callback(error);
                resolve();
            });
        });
        await nextTurn();
        expect(callback).toHaveBeenCalledExactlyOnceWith(null);
        expect(tracker.history.all).toHaveLength(0);
    });

    test('keeps concurrent callers in their own context while readiness is pending', async () => {
        const als = new AsyncLocalStorage<string>();
        tracker.on.any(/information_schema/).responseOnce(true);
        tracker.on.select(/sessions/).response([{ sess: fixture() }]);
        const store = als.run(
            'startup',
            () => new KnexSessionStore(database, { cleanupInterval: 0 }),
        );
        const seen = await Promise.all(
            Array.from({ length: 200 }, (_, index) =>
                als.run(
                    `request-${index}`,
                    () =>
                        new Promise((resolve, reject) => {
                            store.get('sid', (error) => {
                                if (error) reject(error);
                                else resolve(als.getStore());
                            });
                        }),
                ),
            ),
        );
        expect(seen).toEqual(
            Array.from({ length: 200 }, (_, index) => `request-${index}`),
        );
    });

    test('continues each requesting scope after concurrent touch and get callbacks', async () => {
        const als = new AsyncLocalStorage<string>();
        const store = await createStore();
        tracker.on.select(/sessions/).response(async () => {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 2);
            });
            return [{ sess: fixture() }];
        });
        tracker.on.update(/sessions/).response(async () => {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 2);
            });
            return 1;
        });
        const scopes = Array.from({ length: 200 }, (_, index) => [
            `touch-request-${index}`,
            `get-request-${index}`,
        ]);
        const seen = await Promise.all(
            scopes.map(([touchScope, getScope]) => {
                const touched = als.run(
                    touchScope,
                    () =>
                        new Promise<string | undefined>((resolve, reject) => {
                            store.touch('sid', fixture(), (error) => {
                                if (error) reject(error);
                                else resolve(als.getStore());
                            });
                        }),
                );
                const loaded = als.run(
                    getScope,
                    () =>
                        new Promise<string | undefined>((resolve, reject) => {
                            store.get('sid', (error) => {
                                if (error) reject(error);
                                else {
                                    void nextTurn().then(() =>
                                        resolve(als.getStore()),
                                    );
                                }
                            });
                        }),
                );
                return Promise.all([touched, loaded]);
            }),
        );
        expect(seen).toEqual(scopes);
        expect(tracker.history.select).toHaveLength(200);
        expect(tracker.history.update).toHaveLength(1);
    });

    test.each([
        'get',
        'set',
        'touch',
        'destroy',
        'load',
        'regenerate',
    ] as const)(
        '%s query failure reaches Express and completes the response',
        async (method) => {
            const store = await createStore();
            if (method !== 'get') {
                tracker.on
                    .select(/sessions/)
                    .responseOnce([{ sess: fixture() }]);
            }
            tracker.on.any(/.*/).simulateError('request query failure');
            const app = express();
            const errors = vi.fn();
            app.use(
                session({
                    store,
                    secret,
                    resave: false,
                    saveUninitialized: false,
                    rolling: true,
                }),
            );
            app.get('/', (req, res, next) => {
                if (method === 'set') {
                    req.session.oauth = { returnTo: '/changed' };
                    res.end('complete');
                } else if (method === 'destroy') {
                    req.session.destroy((error) =>
                        error ? next(error) : res.end('complete'),
                    );
                } else if (method === 'load') {
                    req.session.reload((error) =>
                        error ? next(error) : res.end('complete'),
                    );
                } else if (method === 'regenerate') {
                    req.session.regenerate((error) =>
                        error ? next(error) : res.end('complete'),
                    );
                } else res.end('complete');
            });
            const errorHandler: ErrorRequestHandler = (
                error,
                req,
                res,
                _next,
            ) => {
                errors(error);
                if (!res.headersSent) {
                    delete (req as Partial<typeof req>).session;
                    res.status(500).end('failed');
                }
            };
            app.use(errorHandler);
            const server = app.listen(0, '127.0.0.1');
            await once(server, 'listening');
            try {
                const response = await fetch(
                    `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
                    {
                        headers: {
                            cookie: `connect.sid=${encodeURIComponent(
                                `s:${signature.sign('sid', secret)}`,
                            )}`,
                        },
                        timeout: 2000,
                    },
                );
                const body = await response.text();
                await nextTurn();
                expect(errors).toHaveBeenCalledTimes(1);
                expect(errors.mock.calls[0][0].message).toContain(
                    'request query failure',
                );
                expect([200, 500]).toContain(response.status);
                expect(['complete', 'failed']).toContain(body);
            } finally {
                server.closeAllConnections();
                await new Promise<void>((resolve) => {
                    server.close(() => resolve());
                });
            }
        },
    );
});

describe('KnexSessionStore touch throttling', () => {
    const minute = 60_000;
    const sessionExpiringAt = (
        expires: Date,
        originalMaxAge = 24 * 60 * minute,
    ): SessionData => ({
        ...fixture(),
        cookie: { ...fixture().cookie, originalMaxAge, expires },
    });
    const promisified = (run: (callback: (error?: unknown) => void) => void) =>
        new Promise<void>((resolve, reject) => {
            run((error) => (error ? reject(error) : resolve()));
        });
    const touchSid = (
        store: KnexSessionStore,
        sid: string,
        data: SessionData,
    ) => promisified((callback) => store.touch(sid, data, callback));
    const touch = (store: KnexSessionStore, data: SessionData) =>
        touchSid(store, 'sid', data);
    const set = (store: KnexSessionStore, data: SessionData) =>
        promisified((callback) => store.set('sid', data, callback));
    const destroy = (store: KnexSessionStore, sid: string) =>
        promisified((callback) => store.destroy(sid, callback));

    const createThrottledStore = async (
        touchInterval = 5 * minute,
        maxTrackedSessions?: number,
    ) => {
        tracker.on.any(/information_schema/).responseOnce(true);
        const store = new KnexSessionStore(database, {
            cleanupInterval: 0,
            touchInterval,
            maxTrackedSessions,
        });
        await store.ready;
        tracker.on.select(/sessions/).response([]);
        tracker.on.update(/sessions/).response(1);
        tracker.on.insert(/sessions/).response(1);
        tracker.on.delete(/sessions/).response(1);
        return store;
    };

    test('a burst of requests extends the stored session once', async () => {
        const store = await createThrottledStore();
        const start = Date.now();
        await touch(store, sessionExpiringAt(new Date(start)));
        await touch(store, sessionExpiringAt(new Date(start + 1_000)));
        await touch(store, sessionExpiringAt(new Date(start + 2 * minute)));
        expect(tracker.history.update).toHaveLength(1);
    });

    test('concurrent requests from one session collapse into a single write', async () => {
        const store = await createThrottledStore();
        const start = Date.now();
        await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
                touch(store, sessionExpiringAt(new Date(start + index))),
            ),
        );
        expect(tracker.history.update).toHaveLength(1);
    });

    test('an active session keeps sliding once the interval has elapsed', async () => {
        const store = await createThrottledStore();
        const start = Date.now();
        await touch(store, sessionExpiringAt(new Date(start)));
        await touch(store, sessionExpiringAt(new Date(start + 4 * minute)));
        await touch(store, sessionExpiringAt(new Date(start + 5 * minute)));
        await touch(store, sessionExpiringAt(new Date(start + 6 * minute)));
        expect(tracker.history.update).toHaveLength(2);
    });

    test('a short-lived cookie is extended before half its lifetime passes', async () => {
        const store = await createThrottledStore();
        const start = Date.now();
        const maxAge = 4 * minute;
        await touch(store, sessionExpiringAt(new Date(start), maxAge));
        await touch(
            store,
            sessionExpiringAt(new Date(start + 1 * minute), maxAge),
        );
        await touch(
            store,
            sessionExpiringAt(new Date(start + 2 * minute), maxAge),
        );
        expect(tracker.history.update).toHaveLength(2);
    });

    test('a session not seen since process start is always persisted', async () => {
        const store = await createThrottledStore();
        await touch(store, sessionExpiringAt(new Date()));
        expect(tracker.history.update).toHaveLength(1);
    });

    test('a saved session is not touched again within the interval', async () => {
        const store = await createThrottledStore();
        const start = Date.now();
        await set(store, sessionExpiringAt(new Date(start)));
        await touch(store, sessionExpiringAt(new Date(start + 1_000)));
        expect(tracker.history.insert).toHaveLength(1);
        expect(tracker.history.update).toHaveLength(0);
    });

    test('a failed write is retried on the next request', async () => {
        const store = await createThrottledStore();
        const start = Date.now();
        tracker.reset();
        tracker.on.update(/sessions/).simulateErrorOnce('db unavailable');
        tracker.on.update(/sessions/).response(1);
        await expect(
            touch(store, sessionExpiringAt(new Date(start))),
        ).rejects.toThrow('db unavailable');
        await touch(store, sessionExpiringAt(new Date(start + 1_000)));
        expect(tracker.history.update).toHaveLength(2);
    });

    test('a destroyed session id is persisted again if it reappears', async () => {
        const store = await createThrottledStore();
        const start = Date.now();
        await touch(store, sessionExpiringAt(new Date(start)));
        await destroy(store, 'sid');
        await touch(store, sessionExpiringAt(new Date(start + 1_000)));
        expect(tracker.history.update).toHaveLength(2);
    });

    test('sessions of different users are throttled independently', async () => {
        const store = await createThrottledStore();
        const start = Date.now();
        await touchSid(store, 'alice', sessionExpiringAt(new Date(start)));
        await touchSid(store, 'bob', sessionExpiringAt(new Date(start)));
        await touchSid(
            store,
            'alice',
            sessionExpiringAt(new Date(start + 1_000)),
        );
        await touchSid(
            store,
            'bob',
            sessionExpiringAt(new Date(start + 1_000)),
        );
        expect(tracker.history.update).toHaveLength(2);
    });

    test('a session forgotten by the tracking cap is persisted again', async () => {
        const store = await createThrottledStore(5 * minute, 2);
        const start = Date.now();
        await touchSid(store, 'first', sessionExpiringAt(new Date(start)));
        await touchSid(store, 'second', sessionExpiringAt(new Date(start)));
        await touchSid(store, 'third', sessionExpiringAt(new Date(start)));
        await touchSid(
            store,
            'first',
            sessionExpiringAt(new Date(start + 1_000)),
        );
        expect(tracker.history.update).toHaveLength(4);
    });
});
