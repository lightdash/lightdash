import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { LearnWorkspaceModel } from './LearnWorkspaceModel';

describe('LearnWorkspaceModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new LearnWorkspaceModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('upsertFile writes an insert with on conflict update', async () => {
        tracker.on.insert('learn_workspace_files').response([]);
        await model.upsertFile('p1', 'models/orders.yml', 'version: 2\n');
        const [q] = tracker.history.insert;
        expect(q.sql).toMatch(/on conflict/i);
        expect(q.bindings).toEqual(
            expect.arrayContaining(['p1', 'models/orders.yml', 'version: 2\n']),
        );
    });

    it('appendOutput is a no-op for an empty batch and one insert otherwise', async () => {
        await model.appendOutput('c1', []);
        expect(tracker.history.insert).toHaveLength(0);
        tracker.on.insert('learn_command_output').response([]);
        await model.appendOutput('c1', [
            { seq: 1, stream: 'stdout', text: 'a' },
            { seq: 2, stream: 'stderr', text: 'b' },
        ]);
        expect(tracker.history.insert).toHaveLength(1);
    });

    it('readOutput filters by seq and orders ascending', async () => {
        tracker.on
            .select('learn_command_output')
            .response([{ seq: 3, stream: 'stdout', text: 'x' }]);
        const rows = await model.readOutput('c1', 2);
        expect(rows).toEqual([{ seq: 3, stream: 'stdout', text: 'x' }]);
        const [q] = tracker.history.select;
        expect(q.sql).toMatch(/"seq" > \$\d/);
        expect(q.sql).toMatch(/order by "seq" asc/i);
    });

    it('findActiveCommand looks for queued or running', async () => {
        tracker.on.select('learn_commands').response([]);
        await model.findActiveCommand('p1');
        const [q] = tracker.history.select;
        expect(q.bindings).toEqual(
            expect.arrayContaining(['p1', 'queued', 'running']),
        );
    });

    it('listCommandsWithTokens returns finished commands that still hold a token', async () => {
        tracker.on
            .select('learn_commands')
            .response([{ command_uuid: 'c1', pat_uuid: 't1', status: 'done' }]);
        const rows = await model.listCommandsWithTokens();
        expect(rows).toEqual([
            { command_uuid: 'c1', pat_uuid: 't1', status: 'done' },
        ]);
        const [q] = tracker.history.select;
        expect(q.sql).toMatch(/"pat_uuid" is not null/i);
    });
});
