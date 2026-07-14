import { Knex } from 'knex';
import { AiWritebackRunModel } from './AiWritebackRunModel';

type AnyType = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const buildQueryBuilder = (
    overrides: Partial<Record<string, AnyType>> = {},
) => {
    const qb: AnyType = {
        insert: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        whereNotIn: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        returning: vi
            .fn()
            .mockResolvedValue([{ ai_writeback_run_uuid: 'run-1' }]),
        update: vi.fn().mockResolvedValue(1),
        first: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    return qb;
};

const buildModel = (qb: AnyType) => {
    const database = vi.fn().mockReturnValue(qb) as unknown as Knex;
    (database as AnyType).fn = { now: vi.fn().mockReturnValue('NOW()') };
    (database as AnyType).raw = vi.fn().mockReturnValue('RAW_INTERVAL');
    const model = new AiWritebackRunModel({ database });
    return { model, database };
};

describe('AiWritebackRunModel', () => {
    describe('create', () => {
        it('inserts a pending row and returns it', async () => {
            const qb = buildQueryBuilder();
            const { model } = buildModel(qb);

            const row = await model.create({
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
                aiThreadUuid: 'thread-1',
                createdByUserUuid: 'user-1',
                source: 'web',
                promptUuid: 'prompt-1',
                toolCallId: 'tool-1',
            });

            expect(qb.insert).toHaveBeenCalledWith({
                organization_uuid: 'org-1',
                project_uuid: 'proj-1',
                ai_thread_uuid: 'thread-1',
                created_by_user_uuid: 'user-1',
                source: 'web',
                prompt_uuid: 'prompt-1',
                tool_call_id: 'tool-1',
            });
            expect(row).toEqual({ ai_writeback_run_uuid: 'run-1' });
        });

        it('allows a null aiThreadUuid and null tool-call linkage for a one-shot run', async () => {
            const qb = buildQueryBuilder();
            const { model } = buildModel(qb);

            await model.create({
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
                aiThreadUuid: null,
                createdByUserUuid: 'user-1',
                source: 'api',
                promptUuid: null,
                toolCallId: null,
            });

            expect(qb.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    ai_thread_uuid: null,
                    prompt_uuid: null,
                    tool_call_id: null,
                }),
            );
        });
    });

    describe('markStaleRunsAsError', () => {
        it('errors only non-terminal runs older than the threshold and returns their tool-call linkage', async () => {
            const qb = buildQueryBuilder({
                update: vi.fn().mockReturnThis(),
                returning: vi.fn().mockResolvedValue([
                    {
                        ai_writeback_run_uuid: 'run-1',
                        prompt_uuid: 'prompt-1',
                        tool_call_id: 'tool-1',
                        source: 'web',
                    },
                    {
                        ai_writeback_run_uuid: 'run-2',
                        prompt_uuid: null,
                        tool_call_id: null,
                        source: 'mcp',
                    },
                ]),
            });
            const { model, database } = buildModel(qb);

            const rows = await model.markStaleRunsAsError(45, 'stuck');

            // Never overwrites a terminal run, and never touches a 'pending' one
            // (still queued behind an earlier edit — not a worker's to reclaim).
            expect(qb.whereNotIn).toHaveBeenCalledWith('status', [
                'ready',
                'error',
                'pending',
            ]);
            // Only touches rows whose last progress predates the threshold.
            expect((database as AnyType).raw).toHaveBeenCalledWith(
                "now() - (? * interval '1 minute')",
                [45],
            );
            expect(qb.andWhere).toHaveBeenCalledWith(
                'updated_at',
                '<',
                'RAW_INTERVAL',
            );
            expect(qb.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'error',
                    error_message: 'stuck',
                }),
            );
            expect(qb.returning).toHaveBeenCalledWith('*');
            expect(rows).toHaveLength(2);
        });
    });

    describe('updateStageIfInProgress', () => {
        it('updates status and excludes terminal statuses from the where clause', async () => {
            const qb = buildQueryBuilder({
                update: vi.fn().mockResolvedValue(1),
            });
            const { model } = buildModel(qb);

            await model.updateStageIfInProgress('run-1', 'agent');

            expect(qb.where).toHaveBeenCalledWith(
                'ai_writeback_run_uuid',
                'run-1',
            );
            expect(qb.whereNotIn).toHaveBeenCalledWith('status', [
                'ready',
                'error',
            ]);
            expect(qb.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'agent' }),
            );
        });
    });

    describe('markReady', () => {
        it('returns true when the row was updated', async () => {
            const qb = buildQueryBuilder({
                update: vi.fn().mockResolvedValue(1),
            });
            const { model } = buildModel(qb);

            const updated = await model.markReady('run-1', {
                branchName: 'lightdash-ai-writeback/abc',
                prUrl: 'https://github.com/acme/analytics/pull/1',
            });

            expect(updated).toBe(true);
            expect(qb.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'ready',
                    branch_name: 'lightdash-ai-writeback/abc',
                    pr_url: 'https://github.com/acme/analytics/pull/1',
                }),
            );
        });

        it('returns false when the run had already reached a terminal status', async () => {
            const qb = buildQueryBuilder({
                update: vi.fn().mockResolvedValue(0),
            });
            const { model } = buildModel(qb);

            const updated = await model.markReady('run-1', {
                branchName: null,
                prUrl: null,
            });

            expect(updated).toBe(false);
        });
    });

    describe('markError', () => {
        it('returns true when the row was updated', async () => {
            const qb = buildQueryBuilder({
                update: vi.fn().mockResolvedValue(1),
            });
            const { model } = buildModel(qb);

            const updated = await model.markError('run-1', 'boom');

            expect(updated).toBe(true);
            expect(qb.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'error',
                    error_message: 'boom',
                }),
            );
        });

        it('returns false when a previous write already made the run terminal', async () => {
            const qb = buildQueryBuilder({
                update: vi.fn().mockResolvedValue(0),
            });
            const { model } = buildModel(qb);

            const updated = await model.markError('run-1', 'boom');

            expect(updated).toBe(false);
        });
    });

    describe('findByUuid', () => {
        it('returns the row when found', async () => {
            const qb = buildQueryBuilder({
                first: vi
                    .fn()
                    .mockResolvedValue({ ai_writeback_run_uuid: 'run-1' }),
            });
            const { model } = buildModel(qb);

            const row = await model.findByUuid('run-1');

            expect(row).toEqual({ ai_writeback_run_uuid: 'run-1' });
        });

        it('returns undefined when not found', async () => {
            const qb = buildQueryBuilder({
                first: vi.fn().mockResolvedValue(undefined),
            });
            const { model } = buildModel(qb);

            const row = await model.findByUuid('missing');

            expect(row).toBeUndefined();
        });
    });
});
