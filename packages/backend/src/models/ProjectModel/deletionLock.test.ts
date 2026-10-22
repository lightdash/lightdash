import { ConflictError } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { PeerDbtSourcesModel } from '../PeerDbtSourcesModel';
import { ProjectModel } from './ProjectModel';
import { encryptionUtilMock } from './ProjectModel.mock';

describe('ProjectModel deletion locks', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ProjectModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil: encryptionUtilMock,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    beforeEach(() => {
        vi.spyOn(PeerDbtSourcesModel.prototype, 'isEnabled').mockResolvedValue(
            true,
        );
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes('"projects"') && !sql.includes('"project_id"'),
            )
            .response([
                { project_uuid: 'project-a' },
                { project_uuid: 'project-z' },
            ]);
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes('"project_dbt_sources"') &&
                    !sql.includes('distinct'),
            )
            .response([
                {
                    project_dbt_source_uuid: 'source-a',
                    dbt_repository_uuid: 'repo-z',
                },
                {
                    project_dbt_source_uuid: 'source-z',
                    dbt_repository_uuid: 'repo-a',
                },
            ]);
        tracker.on.select('dbt_repositories').response([
            {
                dbt_repository_uuid: 'repo-a',
                credential_project_uuid: null,
                credential_source_uuid: 'source-z',
                created_by_project_uuid: 'project-z',
            },
            {
                dbt_repository_uuid: 'repo-z',
                credential_project_uuid: 'project-a',
                credential_source_uuid: null,
                created_by_project_uuid: 'project-a',
            },
        ]);
    });

    afterEach(() => {
        tracker.reset();
        vi.restoreAllMocks();
    });

    test('keeps sorted project and registry locks until the cleanup callback finishes', async () => {
        tracker.on.select('distinct').response([]);
        let transaction: Knex.Transaction | undefined;
        let finishCleanup!: () => void;
        const cleanup = new Promise<void>((resolve) => {
            finishCleanup = resolve;
        });
        const callback = vi.fn(async (trx?: Knex.Transaction) => {
            transaction = trx;
            expect(trx?.isCompleted()).toBe(false);
            const queries = tracker.history.select;
            expect(queries[0].sql).toContain(
                'order by "project_uuid" asc for update',
            );
            expect(queries[0].bindings).toEqual(['project-a', 'project-z']);
            expect(queries[2].sql).toContain(
                'order by "dbt_repository_uuid" asc for update',
            );
            expect(queries[3].sql).toContain('"project_uuid" not in (');
            expect(queries[3].bindings).toEqual([
                'repo-a',
                'repo-z',
                'project-a',
                'project-z',
            ]);
            await cleanup;
            expect(trx?.isCompleted()).toBe(false);
            return 'deleted';
        });
        const deletion = model.withDeletionLock(
            ['project-z', 'project-a', 'project-z'],
            callback,
        );
        await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
        expect(transaction?.isCompleted()).toBe(false);
        finishCleanup();
        await expect(deletion).resolves.toBe('deleted');
        expect(transaction?.isCompleted()).toBe(true);
    });

    test('reuses the outer transaction and the complete deletion set for final copy deletes', async () => {
        tracker.on.select('distinct').response([]);
        tracker.on.select('select "project_id"').response([{ project_id: 1 }]);
        tracker.on.update('dbt_repositories').response(1);
        tracker.on.delete(() => true).response(1);
        const transactionSpy = vi.spyOn(database, 'transaction');
        await model.withDeletionLock(
            ['project-z', 'project-a'],
            async (trx) => {
                if (!trx) throw new Error('Missing deletion transaction');
                await model.delete('project-z', trx, [
                    'project-z',
                    'project-a',
                ]);
                await model.delete('project-a', trx, [
                    'project-z',
                    'project-a',
                ]);
                expect(trx.isCompleted()).toBe(false);
            },
        );
        expect(transactionSpy).toHaveBeenCalledOnce();
        const consumerQueries = tracker.history.select.filter(({ sql }) =>
            sql.includes('distinct'),
        );
        expect(consumerQueries).toHaveLength(3);
        consumerQueries.forEach(({ sql, bindings }) => {
            expect(sql).toContain('"project_uuid" not in (');
            expect(bindings.slice(-2)).toEqual(['project-a', 'project-z']);
        });
        expect(
            tracker.history.delete.filter(({ sql }) =>
                sql.startsWith('delete from "projects"'),
            ),
        ).toHaveLength(2);
    });

    test('rejects external consumers before any cleanup starts', async () => {
        tracker.on
            .select('distinct')
            .response([{ project_uuid: 'external-project' }]);
        const callback = vi.fn(async () => undefined);
        await expect(
            model.withDeletionLock(['project-z', 'project-a'], callback),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(callback).not.toHaveBeenCalled();
    });

    test('rolls back the lock transaction when cleanup fails', async () => {
        tracker.on.select('distinct').response([]);
        let transaction: Knex.Transaction | undefined;
        await expect(
            model.withDeletionLock(['project-a'], async (trx) => {
                transaction = trx;
                expect(trx?.isCompleted()).toBe(false);
                throw new Error('Cleanup failed');
            }),
        ).rejects.toThrow('Cleanup failed');
        expect(transaction?.isCompleted()).toBe(true);
    });

    test('runs legacy cleanup without a transaction or registry queries when disabled', async () => {
        vi.mocked(PeerDbtSourcesModel.prototype.isEnabled).mockResolvedValue(
            false,
        );
        const transactionSpy = vi.spyOn(database, 'transaction');
        const callback = vi.fn(async () => 'deleted');
        await expect(
            model.withDeletionLock(['project-a'], callback),
        ).resolves.toBe('deleted');
        expect(callback).toHaveBeenCalledWith(undefined);
        expect(transactionSpy).not.toHaveBeenCalled();
        expect(tracker.history.select).toHaveLength(0);
    });
});
