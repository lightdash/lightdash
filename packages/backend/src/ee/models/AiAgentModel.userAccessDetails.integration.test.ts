import {
    NotFoundError,
    SEED_ORG_1,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_ORG_1_VIEWER,
    SEED_ORG_1_VIEWER_EMAIL,
    SEED_ORG_2_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import {
    AiAgentTableName,
    AiAgentUserAccessTableName,
} from '../database/entities/aiAgent';
import { type AiAgentModel } from './AiAgentModel';

/**
 * The agent settings form labels its "Specific users" pills from the agent
 * itself, because the org user list it searches is paginated and a selected
 * user may not be on the first page. Each user in `userAccess` therefore
 * comes back with their name and email in `userAccessDetails`.
 */
describe('AiAgentModel user access details', () => {
    let database: Knex;
    let model: AiAgentModel;
    const agentUuids: string[] = [];

    const editor = {
        userUuid: SEED_ORG_1_EDITOR.user_uuid,
        firstName: SEED_ORG_1_EDITOR.first_name,
        lastName: SEED_ORG_1_EDITOR.last_name,
        email: SEED_ORG_1_EDITOR_EMAIL.email,
    };
    const viewer = {
        userUuid: SEED_ORG_1_VIEWER.user_uuid,
        firstName: SEED_ORG_1_VIEWER.first_name,
        lastName: SEED_ORG_1_VIEWER.last_name,
        email: SEED_ORG_1_VIEWER_EMAIL.email,
    };

    const createAgent = (userAccess: string[]) =>
        model.createAgent({
            name: `user access details ${Date.now()}`,
            description: null,
            projectUuid: SEED_PROJECT.project_uuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
            tags: null,
            integrations: [],
            instruction: null,
            imageUrl: null,
            groupAccess: [],
            userAccess,
            spaceAccess: [],
            enableDataAccess: false,
            enableSelfImprovement: false,
            version: 1,
        });

    beforeAll(() => {
        const context = getTestContext();
        database = context.db;
        model = getModels(context.app).aiAgentModel;
    });

    afterAll(async () => {
        // By name as well as uuid: a create that should have been rejected
        // but was not would otherwise leave an agent behind.
        await database(AiAgentTableName)
            .where('organization_uuid', SEED_ORG_1.organization_uuid)
            .where((builder) =>
                builder
                    .whereIn('ai_agent_uuid', agentUuids)
                    .orWhere('name', 'like', 'user access details %'),
            )
            .delete();
    });

    it('returns name and email for each user with access when reading an agent', async () => {
        const created = await createAgent([editor.userUuid, viewer.userUuid]);
        agentUuids.push(created.uuid);

        const agent = await model.getAgent({
            organizationUuid: SEED_ORG_1.organization_uuid,
            agentUuid: created.uuid,
        });

        expect(agent.userAccess).toEqual(
            expect.arrayContaining([editor.userUuid, viewer.userUuid]),
        );
        expect(agent.userAccessDetails).toEqual([editor, viewer]);
    });

    it('returns an empty list when the agent is open to everyone', async () => {
        const created = await createAgent([]);
        agentUuids.push(created.uuid);

        const agent = await model.getAgent({
            organizationUuid: SEED_ORG_1.organization_uuid,
            agentUuid: created.uuid,
        });

        expect(agent.userAccessDetails).toEqual([]);
    });

    it('includes the details on the agent returned from create and update', async () => {
        const created = await createAgent([editor.userUuid]);
        agentUuids.push(created.uuid);

        expect(created.userAccessDetails).toEqual([editor]);

        const updated = await model.updateAgent({
            agentUuid: created.uuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
            userAccess: [viewer.userUuid],
        });

        expect(updated.userAccessDetails).toEqual([viewer]);
    });

    it('rejects a user from another organization on create', async () => {
        await expect(
            createAgent([editor.userUuid, SEED_ORG_2_ADMIN.user_uuid]),
        ).rejects.toThrow(NotFoundError);
    });

    it('rejects a user from another organization on update and keeps the saved access', async () => {
        const created = await createAgent([editor.userUuid]);
        agentUuids.push(created.uuid);

        await expect(
            model.updateAgent({
                agentUuid: created.uuid,
                organizationUuid: SEED_ORG_1.organization_uuid,
                userAccess: [SEED_ORG_2_ADMIN.user_uuid],
            }),
        ).rejects.toThrow(NotFoundError);

        const agent = await model.getAgent({
            organizationUuid: SEED_ORG_1.organization_uuid,
            agentUuid: created.uuid,
        });
        expect(agent.userAccess).toEqual([editor.userUuid]);
        expect(agent.userAccessDetails).toEqual([editor]);
    });

    it('leaves out an access row for a user who is not a member of the organization', async () => {
        // A row that predates validation, or whose user has since left the
        // organization: the uuid stays, but no name or email is resolved.
        const created = await createAgent([editor.userUuid]);
        agentUuids.push(created.uuid);
        await database(AiAgentUserAccessTableName).insert({
            ai_agent_uuid: created.uuid,
            user_uuid: SEED_ORG_2_ADMIN.user_uuid,
        });

        const agent = await model.getAgent({
            organizationUuid: SEED_ORG_1.organization_uuid,
            agentUuid: created.uuid,
        });

        expect(agent.userAccess).toEqual(
            expect.arrayContaining([
                editor.userUuid,
                SEED_ORG_2_ADMIN.user_uuid,
            ]),
        );
        expect(agent.userAccessDetails).toEqual([editor]);
    });
});
