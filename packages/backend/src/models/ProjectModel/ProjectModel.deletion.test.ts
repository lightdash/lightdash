import { ConflictError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { withPeerDbtSourcesOperation } from '../../utils/peerDbtSourcesOperation';
import { PeerProjectDeletionModel } from '../PeerProjectDeletionModel';
import { ProjectModel } from './ProjectModel';
import { encryptionUtilMock } from './ProjectModel.mock';

const projectUuid = 'synthetic-project';
const finalDeletes = [
    'delete from "catalog_search" where "project_uuid" = $1',
    'delete from "cached_explores" where "project_uuid" = $1',
    'delete from "cached_explore" where "project_uuid" = $1',
    'delete from "spaces" where "project_id" = $1',
    'delete from "jobs" where "project_uuid" = $1',
    'delete from "projects" where "project_uuid" = $1',
];

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

describe('ProjectModel deletion phases', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ProjectModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil: encryptionUtilMock,
    });
    let tracker: Tracker;
    let statements: string[];

    beforeAll(() => {
        tracker = getTracker();
    });

    beforeEach(() => {
        statements = [];
        tracker.on.select('projects').response(({ sql }) => {
            statements.push(sql);
            return [{ project_id: 11 }];
        });
        tracker.on
            .delete(() => true)
            .response(({ sql }) => {
                statements.push(sql);
                return 0;
            });
    });

    afterAll(async () => database.destroy());

    afterEach(() => {
        tracker.reset();
        vi.restoreAllMocks();
    });

    test.each(['absent', 'disabled'] as const)(
        'keeps the exact legacy query sequence with an %s peer operation',
        async (operation) => {
            const begin = vi.spyOn(PeerProjectDeletionModel.prototype, 'begin');
            const final = vi.spyOn(
                PeerProjectDeletionModel.prototype,
                'withFinalDeletion',
            );
            const transaction = vi.spyOn(database, 'transaction');
            const remove = () => model.delete(projectUuid);
            if (operation === 'disabled') {
                await withPeerDbtSourcesOperation(false, remove);
            } else {
                await remove();
            }
            expect(begin).not.toHaveBeenCalled();
            expect(final).not.toHaveBeenCalled();
            expect(transaction).toHaveBeenCalledOnce();
            expect(
                tracker.history.select.map(({ sql, bindings }) => ({
                    sql,
                    bindings,
                })),
            ).toEqual([
                {
                    sql: 'select "project_id" from "projects" where "project_uuid" = $1 limit $2',
                    bindings: [projectUuid, 1],
                },
                {
                    sql: 'select "project_id" from "projects" where "project_uuid" = $1',
                    bindings: [projectUuid],
                },
            ]);
            expect(tracker.history.delete.map(({ sql }) => sql)).toEqual([
                'delete from "saved_queries" where "saved_query_id" in (select "saved_query_id" from "saved_queries" where "project_uuid" = $1 limit $2)',
                'delete from "saved_sql" where "saved_sql_uuid" in (select "saved_sql_uuid" from "saved_sql" where "project_uuid" = $1 limit $2)',
                'delete from "dashboards" where "dashboard_id" in (select "dashboard_id" from "dashboards" where "project_uuid" = $1 limit $2)',
                'delete from "spaces" where "space_id" in (select "space_id" from "spaces" where "project_id" = $1 limit $2)',
                ...finalDeletes,
            ]);
            expect(
                tracker.history.delete.map(({ bindings }) => bindings),
            ).toEqual([
                [projectUuid, 100],
                [projectUuid, 100],
                [projectUuid, 100],
                [11, 100],
                [projectUuid],
                [projectUuid],
                [projectUuid],
                [11],
                [projectUuid],
                [projectUuid],
            ]);
            expect(statements).toEqual([
                tracker.history.select[0].sql,
                ...tracker.history.delete.slice(0, 4).map(({ sql }) => sql),
                tracker.history.select[1].sql,
                ...finalDeletes,
            ]);
            expect(tracker.history.update).toHaveLength(0);
        },
    );

    test('keeps the legacy explicit transaction free of batches and peer queries', async () => {
        await database.transaction(async (trx) => {
            const transaction = vi.spyOn(database, 'transaction');
            const batches = vi.spyOn(model, 'deleteContentInBatches');
            await withPeerDbtSourcesOperation(false, () =>
                model.delete(projectUuid, trx, ['ignored-group-member']),
            );
            expect(batches).not.toHaveBeenCalled();
            expect(transaction).not.toHaveBeenCalled();
            expect(trx.isCompleted()).toBe(false);
        });
        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.delete.map(({ sql }) => sql)).toEqual(
            finalDeletes,
        );
        expect(tracker.history.update).toHaveLength(0);
    });

    test('waits for begin to commit before starting batches and waits for batches before final deletion', async () => {
        const entered = deferred();
        const releaseBegin = deferred();
        const releaseContent = deferred();
        const begin = vi
            .spyOn(PeerProjectDeletionModel.prototype, 'begin')
            .mockImplementation(async () => {
                entered.resolve();
                await releaseBegin.promise;
            });
        const batches = vi
            .spyOn(model, 'deleteContentInBatches')
            .mockImplementation(async () => releaseContent.promise);
        const final = vi
            .spyOn(PeerProjectDeletionModel.prototype, 'withFinalDeletion')
            .mockResolvedValue(undefined);
        const deletion = withPeerDbtSourcesOperation(true, () =>
            model.delete(projectUuid),
        );
        try {
            await entered.promise;
            expect(batches).not.toHaveBeenCalled();
            expect(final).not.toHaveBeenCalled();
            releaseBegin.resolve();
            await vi.waitFor(() => expect(batches).toHaveBeenCalledOnce());
            expect(final).not.toHaveBeenCalled();
            releaseContent.resolve();
            await deletion;
            expect(begin).toHaveBeenCalledExactlyOnceWith([projectUuid]);
            expect(final).toHaveBeenCalledExactlyOnceWith(
                projectUuid,
                expect.any(Function),
                undefined,
                [projectUuid],
            );
        } finally {
            releaseBegin.resolve();
            releaseContent.resolve();
            await deletion;
        }
    });

    test('refuses a consumer before batches and final deletion', async () => {
        vi.spyOn(PeerProjectDeletionModel.prototype, 'begin').mockRejectedValue(
            new ConflictError('Synthetic external consumer'),
        );
        const batches = vi.spyOn(model, 'deleteContentInBatches');
        const final = vi.spyOn(
            PeerProjectDeletionModel.prototype,
            'withFinalDeletion',
        );
        await expect(
            withPeerDbtSourcesOperation(true, () => model.delete(projectUuid)),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(batches).not.toHaveBeenCalled();
        expect(final).not.toHaveBeenCalled();
        expect(tracker.history.delete).toHaveLength(0);
    });

    test('drains caches and jobs with content batches without a transaction or project and registry row locks', async () => {
        const transaction = vi.spyOn(database, 'transaction');
        await withPeerDbtSourcesOperation(true, () =>
            model.deleteContentInBatches(projectUuid),
        );
        expect(transaction).not.toHaveBeenCalled();
        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.select[0].sql).not.toContain('for update');
        expect(tracker.history.delete.map(({ sql }) => sql)).toEqual([
            'delete from "catalog_search" where "catalog_search_uuid" in (select "catalog_search_uuid" from "catalog_search" where "project_uuid" = $1 limit $2)',
            'delete from "cached_explores" where "project_uuid" in (select "project_uuid" from "cached_explores" where "project_uuid" = $1 limit $2)',
            'delete from "cached_explore" where "cached_explore_uuid" in (select "cached_explore_uuid" from "cached_explore" where "project_uuid" = $1 limit $2)',
            'delete from "saved_queries" where "saved_query_id" in (select "saved_query_id" from "saved_queries" where "project_uuid" = $1 limit $2)',
            'delete from "saved_sql" where "saved_sql_uuid" in (select "saved_sql_uuid" from "saved_sql" where "project_uuid" = $1 limit $2)',
            'delete from "dashboards" where "dashboard_id" in (select "dashboard_id" from "dashboards" where "project_uuid" = $1 limit $2)',
            'delete from "spaces" where "space_id" in (select "space_id" from "spaces" where "project_id" = $1 limit $2)',
            'delete from "jobs" where "job_uuid" in (select "job_uuid" from "jobs" where "project_uuid" = $1 limit $2)',
        ]);
        expect(tracker.history.update).toHaveLength(0);
    });

    test('passes the complete group and explicit short transaction to the final helper without starting begin or batches', async () => {
        const begin = vi.spyOn(PeerProjectDeletionModel.prototype, 'begin');
        const batches = vi.spyOn(model, 'deleteContentInBatches');
        const final = vi
            .spyOn(PeerProjectDeletionModel.prototype, 'withFinalDeletion')
            .mockResolvedValue(undefined);
        await database.transaction(async (trx) => {
            const transaction = vi.spyOn(database, 'transaction');
            const group = [projectUuid, 'synthetic-copy'];
            await withPeerDbtSourcesOperation(true, () =>
                model.delete(projectUuid, trx, group),
            );
            expect(final).toHaveBeenCalledExactlyOnceWith(
                projectUuid,
                expect.any(Function),
                trx,
                group,
            );
            expect(transaction).not.toHaveBeenCalled();
            expect(trx.isCompleted()).toBe(false);
        });
        expect(begin).not.toHaveBeenCalled();
        expect(batches).not.toHaveBeenCalled();
    });
});
