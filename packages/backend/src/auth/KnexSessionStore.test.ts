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
        expect(tracker.history.update).toHaveLength(200);
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
