import { ConnectSessionKnexStore } from 'connect-session-knex';
import { Store, type SessionData } from 'express-session';
import type { Knex } from 'knex';
import { callbackify } from 'node:util';

const DEFAULT_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_TRACKED_SESSIONS = 50_000;

type KnexSessionStoreOptions = {
    cleanupInterval?: number;
    touchInterval?: number;
    maxTrackedSessions?: number;
};

const expiresAtMs = (session: SessionData): number | null => {
    const { expires } = session.cookie;
    if (expires === null || expires === undefined) return null;
    const ms = new Date(expires).getTime();
    return Number.isNaN(ms) ? null : ms;
};

export class KnexSessionStore extends Store {
    private readonly store: ConnectSessionKnexStore;

    private readonly touchInterval: number;

    private readonly maxTrackedSessions: number;

    // Express touches on every request; writing only once the expiry has
    // drifted past the interval keeps the sessions table from churning.
    private readonly persistedExpiry = new Map<string, number>();

    readonly ready: Promise<unknown>;

    constructor(database: Knex, options: KnexSessionStoreOptions = {}) {
        super();
        const { touchInterval, maxTrackedSessions, ...storeOptions } = options;
        this.touchInterval = touchInterval ?? DEFAULT_TOUCH_INTERVAL_MS;
        this.maxTrackedSessions =
            maxTrackedSessions ?? DEFAULT_MAX_TRACKED_SESSIONS;
        this.store = new ConnectSessionKnexStore({
            knex: database,
            createTable: false,
            tableName: 'sessions',
            sidFieldName: 'sid',
            ...storeOptions,
        });
        this.ready = this.store.ready;
        void this.ready.catch(() => {});
    }

    private rememberSession(sid: string, session: SessionData): number | null {
        const expiresAt = expiresAtMs(session);
        if (expiresAt === null) return null;
        // Delete before set so Map insertion order doubles as LRU order for the cap
        this.persistedExpiry.delete(sid);
        this.persistedExpiry.set(sid, expiresAt);
        if (this.persistedExpiry.size > this.maxTrackedSessions) {
            const oldest = this.persistedExpiry.keys().next().value;
            if (oldest !== undefined) this.persistedExpiry.delete(oldest);
        }
        return expiresAt;
    }

    private forgetFailedWrite(sid: string, expiresAt: number | null): void {
        if (expiresAt !== null && this.persistedExpiry.get(sid) === expiresAt) {
            this.persistedExpiry.delete(sid);
        }
    }

    // Remember before awaiting so concurrent requests for one session
    // collapse into a single write; a failed write is forgotten again.
    private async persist(
        sid: string,
        session: SessionData,
        write: () => Promise<unknown>,
    ): Promise<void> {
        const expiresAt = this.rememberSession(sid, session);
        try {
            await write();
        } catch (error) {
            this.forgetFailedWrite(sid, expiresAt);
            throw error;
        }
    }

    private isTouchRedundant(sid: string, session: SessionData): boolean {
        const expiresAt = expiresAtMs(session);
        const persisted = this.persistedExpiry.get(sid);
        if (expiresAt === null || persisted === undefined) return false;
        // Never let the skipped window exceed half the session lifetime so
        // short-lived cookies still slide well before they expire in the DB.
        const maxAge = session.cookie.originalMaxAge ?? null;
        const interval =
            maxAge === null
                ? this.touchInterval
                : Math.min(this.touchInterval, maxAge / 2);
        return expiresAt - persisted < interval;
    }

    get(sid: string, callback: Parameters<Store['get']>[1]): void {
        callbackify(() => this.store.get(sid, () => {}))(callback);
    }

    set(
        sid: string,
        session: SessionData,
        callback: (error?: unknown) => void = () => {},
    ): void {
        callbackify(() =>
            this.persist(sid, session, () => this.store.set(sid, session)),
        )(callback);
    }

    touch(
        sid: string,
        session: SessionData,
        callback: (error?: unknown) => void = () => {},
    ): void {
        callbackify(async () => {
            if (this.isTouchRedundant(sid, session)) return;
            await this.persist(sid, session, () =>
                this.store.touch(sid, session),
            );
        })(callback);
    }

    destroy(sid: string, callback: (error?: unknown) => void = () => {}): void {
        this.persistedExpiry.delete(sid);
        callbackify(() => this.store.destroy(sid))(callback);
    }

    all(callback: Parameters<NonNullable<Store['all']>>[0]): void {
        callbackify(() => this.store.all(() => {}))(callback);
    }

    length(callback: Parameters<NonNullable<Store['length']>>[0]): void {
        callbackify(() => this.store.length(() => {}))(callback);
    }

    clear(callback: (error?: unknown) => void = () => {}): void {
        this.persistedExpiry.clear();
        callbackify(() => this.store.clear())(callback);
    }
}
