import { type Knex } from 'knex';

export const createDatabase = () => {
    const raw = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(
        async (callback: (trx: Knex.Transaction) => unknown) =>
            callback({ raw } as unknown as Knex.Transaction),
    );
    return { database: { transaction } as unknown as Knex, transaction, raw };
};

export const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};
