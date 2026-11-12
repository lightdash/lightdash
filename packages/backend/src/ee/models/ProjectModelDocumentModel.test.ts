import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ProjectModelDocumentModel } from './ProjectModelDocumentModel';

describe('ProjectModelDocumentModel', () => {
    const model = new ProjectModelDocumentModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('gives a model made again a version after the one it was removed at', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).response([]);
        tracker.on.select('project_model_documents').response([]);
        tracker.on
            .insert('project_model_change_sets')
            .response([{ project_model_change_set_uuid: 'change-set' }]);
        tracker.on
            .select('project_model_revisions')
            .response([{ name: 'orders', version: 2 }]);
        tracker.on.insert('project_model_documents').response([]);
        tracker.on.insert('project_model_revisions').response([]);
        tracker.on.update('project_model_change_sets').response(0);
        await model.createChangeSet(
            {
                projectUuid: 'project',
                userUuid: 'user',
                source: { kind: 'undo', reverts: [] },
                readVersions: new Map(),
                documents: [{ name: 'orders', content: 'type: model' }],
            },
            async () => undefined,
        );
        expect(
            tracker.history.insert
                .filter(({ sql }) => sql.includes('project_model_documents'))
                .map(({ bindings }) => bindings),
        ).toEqual([['type: model', 3, 'orders', 'project']]);
    });

    it('reads where each open change is based, so keeping a draft moves the state', async () => {
        tracker.on.select('project_model_documents').response([]);
        tracker.on.select('project_model_draft_changes').response([]);
        await model.findDraftState('project');
        expect(
            tracker.history.select.some(
                ({ sql }) =>
                    sql.includes('project_model_draft_changes') &&
                    sql.includes('"base_versions"'),
            ),
        ).toBe(true);
    });
});
