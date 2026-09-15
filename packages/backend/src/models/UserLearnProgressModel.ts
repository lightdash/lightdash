import { LearnProgress } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbUserLearnProgress,
    UserLearnProgressTableName,
} from '../database/entities/userLearnProgress';

type UserLearnProgressModelArguments = {
    database: Knex;
};

/**
 * The shape the library reads, from the rows the instance keeps: every
 * scope with a row was started, those with a completion time were
 * finished, and the most recently started one is what Resume points at.
 */
export const toLearnProgress = (
    rows: Pick<
        DbUserLearnProgress,
        'scope' | 'last_started_at' | 'completed_at'
    >[],
): LearnProgress => {
    const byRecency = [...rows].sort(
        (a, b) =>
            new Date(b.last_started_at).getTime() -
            new Date(a.last_started_at).getTime(),
    );
    return {
        completed: rows
            .filter((row) => row.completed_at !== null)
            .map((row) => row.scope),
        started: rows.map((row) => row.scope),
        lastStarted: byRecency[0]?.scope ?? null,
    };
};

export class UserLearnProgressModel {
    private readonly database: Knex;

    constructor({ database }: UserLearnProgressModelArguments) {
        this.database = database;
    }

    async get(userUuid: string): Promise<LearnProgress> {
        const rows = await this.database(UserLearnProgressTableName)
            .select('scope', 'last_started_at', 'completed_at')
            .where('user_uuid', userUuid);
        return toLearnProgress(rows);
    }

    /** A start: the row exists from now, and Resume points here. */
    async markStarted(userUuid: string, scope: string): Promise<void> {
        await this.database(UserLearnProgressTableName)
            .insert({ user_uuid: userUuid, scope })
            .onConflict(['user_uuid', 'scope'])
            .merge({ last_started_at: this.database.fn.now() });
    }

    /**
     * A completion keeps its first time: finishing again is a restart the
     * library already counts, not a later completion.
     */
    async markCompleted(userUuid: string, scope: string): Promise<void> {
        await this.database(UserLearnProgressTableName)
            .insert({
                user_uuid: userUuid,
                scope,
                completed_at: this.database.fn.now(),
            })
            .onConflict(['user_uuid', 'scope'])
            .merge({
                completed_at: this.database.raw(
                    `COALESCE(${UserLearnProgressTableName}.completed_at, excluded.completed_at)`,
                ),
            });
    }

    /**
     * Progress a browser held before the instance did, unioned in once.
     * Rows the instance already has keep their timestamps; imported rows
     * are dated at the epoch, in import order with the browser's Resume
     * scope last, so an import never outranks a start the instance saw and
     * the browser's Resume only holds when the user had nothing here.
     */
    async merge(userUuid: string, progress: LearnProgress): Promise<void> {
        const scopes = new Set([...progress.started, ...progress.completed]);
        if (scopes.size === 0) return;
        const completed = new Set(progress.completed);
        const ordered = [...scopes].filter(
            (scope) => scope !== progress.lastStarted,
        );
        if (progress.lastStarted && scopes.has(progress.lastStarted)) {
            ordered.push(progress.lastStarted);
        }
        const rows = ordered.map((scope, index) => ({
            user_uuid: userUuid,
            scope,
            first_started_at: new Date(index),
            last_started_at: new Date(index),
            completed_at: completed.has(scope) ? new Date(index) : null,
        }));
        await this.database(UserLearnProgressTableName)
            .insert(rows)
            .onConflict(['user_uuid', 'scope'])
            .merge({
                completed_at: this.database.raw(
                    `COALESCE(${UserLearnProgressTableName}.completed_at, excluded.completed_at)`,
                ),
            });
    }
}
