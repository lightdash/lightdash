import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    config,
    down,
    up,
} from '../20260720223000_unique_onboarding_organization';

const isConstraintCheck = ({ sql }: { sql: string }) =>
    sql.includes('pg_constraint') && !sql.includes('DO $$');
const isInvalidIndexCheck = ({ sql }: { sql: string }) =>
    sql.includes('indisvalid');
const isMerge = ({ sql }: { sql: string }) => sql.includes('merged_progress');
const isDelete = ({ sql }: { sql: string }) =>
    sql.includes('DELETE FROM onboarding duplicate');
const isCreateIndex = ({ sql }: { sql: string }) =>
    sql.includes('CREATE UNIQUE INDEX CONCURRENTLY');
const isDropIndex = ({ sql }: { sql: string }) =>
    sql.trim().startsWith('DROP INDEX');
const isAddConstraint = ({ sql }: { sql: string }) =>
    sql.includes('ADD CONSTRAINT');

describe('unique onboarding organization migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('runs without a transaction so CONCURRENTLY is allowed', () => {
        expect(config).toEqual({ transaction: false });
    });

    it('merges duplicates with MIN and builds the constraint concurrently', async () => {
        tracker.on.any(isConstraintCheck).response({ rows: [] });
        tracker.on.any(isInvalidIndexCheck).response({ rows: [] });
        tracker.on.any(() => true).response({});

        await up(database);

        const statements = tracker.history.all.map(({ sql }) => sql);
        expect(statements).toHaveLength(6);

        const [
            constraintCheck,
            invalidIndexCheck,
            merge,
            removeDuplicates,
            createIndex,
            addConstraint,
        ] = statements;
        expect(constraintCheck).toContain('pg_constraint');
        expect(invalidIndexCheck).toContain('indisvalid');
        expect(merge).toContain('MIN(onboarding_id) AS survivor_id');
        expect(merge).toContain('MIN("ranQuery_at") AS "ranQuery_at"');
        expect(merge).toContain('MIN("shownSuccess_at") AS "shownSuccess_at"');
        expect(merge).toContain(
            'MIN(playground_project_deleted_at) AS playground_project_deleted_at',
        );
        expect(merge).not.toMatch(/MAX\s*\(/);
        expect(removeDuplicates).toContain(
            'duplicate.onboarding_id > original.onboarding_id',
        );
        expect(createIndex).toContain(
            'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS onboarding_organization_id_unique',
        );
        expect(addConstraint).toContain('IF NOT EXISTS');
        expect(addConstraint).toContain(
            'ADD CONSTRAINT onboarding_organization_id_unique',
        );
        expect(addConstraint).toContain(
            'UNIQUE USING INDEX onboarding_organization_id_unique',
        );
    });

    it('does nothing when the constraint already exists', async () => {
        tracker.on.any(isConstraintCheck).response({ rows: [{ exists: 1 }] });
        tracker.on.any(() => true).response({});

        await up(database);

        expect(tracker.history.all).toHaveLength(1);
        expect(tracker.history.all[0].sql).toContain('pg_constraint');
    });

    it('drops invalid leftovers, re-dedupes, and retries a failed concurrent build', async () => {
        tracker.on.any(isConstraintCheck).response({ rows: [] });
        tracker.on
            .any(isInvalidIndexCheck)
            .responseOnce({ rows: [{ exists: 1 }] });
        tracker.on
            .any(isInvalidIndexCheck)
            .responseOnce({ rows: [{ exists: 1 }] });
        tracker.on.any(isInvalidIndexCheck).response({ rows: [] });
        tracker.on
            .any(isCreateIndex)
            .simulateErrorOnce(
                'could not create unique index "onboarding_organization_id_unique"',
            );
        tracker.on.any(() => true).response({});

        await up(database);

        const statements = tracker.history.all.map(({ sql }) => sql);
        expect(statements.filter((sql) => isDropIndex({ sql }))).toHaveLength(
            2,
        );
        expect(statements.filter((sql) => isMerge({ sql }))).toHaveLength(2);
        expect(statements.filter((sql) => isDelete({ sql }))).toHaveLength(2);
        expect(statements.filter((sql) => isCreateIndex({ sql }))).toHaveLength(
            2,
        );
        expect(
            statements.filter((sql) => isAddConstraint({ sql })),
        ).toHaveLength(1);
        expect(statements[statements.length - 1]).toContain('ADD CONSTRAINT');
    });

    it('gives up after repeated concurrent build failures', async () => {
        tracker.on.any(isConstraintCheck).response({ rows: [] });
        tracker.on.any(isInvalidIndexCheck).response({ rows: [] });
        tracker.on
            .any(isCreateIndex)
            .simulateError('could not create unique index');
        tracker.on.any(() => true).response({});

        await expect(up(database)).rejects.toThrow(
            'could not create unique index',
        );

        const statements = tracker.history.all.map(({ sql }) => sql);
        expect(statements.filter((sql) => isCreateIndex({ sql }))).toHaveLength(
            3,
        );
        expect(
            statements.filter((sql) => isAddConstraint({ sql })),
        ).toHaveLength(0);
    });

    it('drops the constraint and any leftover index idempotently', async () => {
        tracker.on.any(() => true).response({});

        await down(database);

        expect(tracker.history.all).toHaveLength(2);
        expect(tracker.history.all[0].sql).toContain(
            'DROP CONSTRAINT IF EXISTS onboarding_organization_id_unique',
        );
        expect(tracker.history.all[1].sql).toContain(
            'DROP INDEX IF EXISTS onboarding_organization_id_unique',
        );
    });
});
