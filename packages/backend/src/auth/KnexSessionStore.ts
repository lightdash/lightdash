import { ConnectSessionKnexStore } from 'connect-session-knex';
import { Store, type SessionData } from 'express-session';
import type { Knex } from 'knex';
import { callbackify } from 'node:util';

export class KnexSessionStore extends Store {
    private readonly store: ConnectSessionKnexStore;

    readonly ready: Promise<unknown>;

    constructor(database: Knex, options: { cleanupInterval?: number } = {}) {
        super();
        this.store = new ConnectSessionKnexStore({
            knex: database,
            createTable: false,
            tableName: 'sessions',
            sidFieldName: 'sid',
            ...options,
        });
        this.ready = this.store.ready;
        void this.ready.catch(() => {});
    }

    get(sid: string, callback: Parameters<Store['get']>[1]): void {
        callbackify(() => this.store.get(sid, () => {}))(callback);
    }

    set(
        sid: string,
        session: SessionData,
        callback: (error?: unknown) => void = () => {},
    ): void {
        callbackify(() => this.store.set(sid, session))(callback);
    }

    touch(
        sid: string,
        session: SessionData,
        callback: (error?: unknown) => void = () => {},
    ): void {
        callbackify(() => this.store.touch(sid, session))(callback);
    }

    destroy(sid: string, callback: (error?: unknown) => void = () => {}): void {
        callbackify(() => this.store.destroy(sid))(callback);
    }

    all(callback: Parameters<NonNullable<Store['all']>>[0]): void {
        callbackify(() => this.store.all(() => {}))(callback);
    }

    length(callback: Parameters<NonNullable<Store['length']>>[0]): void {
        callbackify(() => this.store.length(() => {}))(callback);
    }

    clear(callback: (error?: unknown) => void = () => {}): void {
        callbackify(() => this.store.clear())(callback);
    }
}
