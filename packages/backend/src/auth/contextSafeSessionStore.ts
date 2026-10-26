import type { Store } from 'express-session';
import { AsyncResource } from 'node:async_hooks';

// connect-session-knex settles its callbacks through Bluebird, which drains
// one queue inside the async context of whichever promise scheduled the
// drain. Binding every callback to the caller's context keeps a session
// `get` for one request out of the AsyncLocalStorage scope of another.
const CALLBACK_METHODS = [
    'get',
    'set',
    'touch',
    'destroy',
    'all',
    'length',
    'clear',
] as const;

type StoreCallback = (...args: unknown[]) => void;
type StoreMethod = (this: Store, ...args: unknown[]) => unknown;

const withBoundCallback = (original: StoreMethod): StoreMethod =>
    function boundStoreMethod(this: Store, ...args: unknown[]) {
        const last = args.length - 1;
        const callback = args[last];
        if (typeof callback === 'function') {
            args[last] = AsyncResource.bind(callback as StoreCallback);
        }
        return original.apply(this, args);
    };

export const bindSessionStoreCallbacks = <T extends Store>(store: T): T => {
    const methods = store as unknown as Record<string, StoreMethod | undefined>;
    CALLBACK_METHODS.forEach((name) => {
        const original = methods[name];
        if (typeof original === 'function') {
            methods[name] = withBoundCallback(original);
        }
    });
    return store;
};
