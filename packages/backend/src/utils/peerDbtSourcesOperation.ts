import { AsyncLocalStorage } from 'node:async_hooks';

const peerDbtSourcesOperation = new AsyncLocalStorage<boolean>();

export const hasPeerDbtSourcesOperation = (): boolean =>
    peerDbtSourcesOperation.getStore() !== undefined;

export const getPeerDbtSourcesEnabled = (): boolean =>
    peerDbtSourcesOperation.getStore() ?? false;

export const withPeerDbtSourcesOperation = async <T>(
    enabled: boolean,
    callback: () => Promise<T>,
): Promise<T> =>
    hasPeerDbtSourcesOperation()
        ? callback()
        : peerDbtSourcesOperation.run(enabled, callback);
