import { SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import { type Knex } from 'knex';
import { getTestContext } from '../vitest.setup.integration';
import { AppModel } from './AppModel';

const projectUuid = SEED_PROJECT.project_uuid;
const userUuid = SEED_ORG_1_ADMIN.user_uuid;

describe('AppModel naming PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: AppModel;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new AppModel({ database: transaction });
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    const createApp = (name?: string) =>
        model.createWithVersion(
            {
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                ...(name === undefined ? {} : { name }),
            },
            { version: 1, prompt: 'first prompt' },
            'pending',
        );

    it('derives the slug from a supplied name, suffixing a conflict', async () => {
        const first = await createApp('Revenue Overview');
        const second = await createApp('Revenue Overview');

        expect(first.app.slug).toBe('revenue-overview');
        expect(second.app.slug).toBe('revenue-overview-1');
    });

    it('leaves the name and slug of a named app untouched, filling only the empty description', async () => {
        const { app } = await createApp('Revenue Overview');

        const updated = await model.setMetadataIfUnset(
            app.app_id,
            projectUuid,
            { name: 'Something Else', description: 'What the app shows' },
        );

        expect(updated.name).toBe('Revenue Overview');
        expect(updated.slug).toBe('revenue-overview');
        expect(updated.description).toBe('What the app shows');
    });

    it('names an unnamed app and rewrites its placeholder slug', async () => {
        const { app } = await createApp();
        expect(app.slug).toMatch(/^app-\d+$/);

        const updated = await model.setMetadataIfUnset(
            app.app_id,
            projectUuid,
            { name: 'Auto Named', description: 'From the builder' },
        );

        expect(updated.name).toBe('Auto Named');
        expect(updated.slug).toBe('auto-named');
    });
});
