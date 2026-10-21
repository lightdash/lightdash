import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { AiAgentModel } from '../../../models/AiAgentModel';
import { backfillEmbedSpaceUuids } from '../20261021150000_add_embed_space_uuids_to_ai_web_app_thread';

vi.mock('../../../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

type Fixture = {
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
    agentUuid: string;
    spaces: Record<'shared' | 'tenantA' | 'tenantB', string>;
};

const seed = async (database: Knex): Promise<Fixture> => {
    const [org] = await database('organizations')
        .insert({ organization_name: 'Embed thread spaces' })
        .returning('*');
    const [user] = await database('users')
        .insert({
            first_name: 'Embed',
            last_name: 'Actor',
            is_active: true,
            is_marketing_opted_in: false,
            is_setup_complete: true,
            is_tracking_anonymized: false,
        })
        .returning('*');
    const [project] = await database('projects')
        .insert({
            name: 'Embed project',
            organization_id: org.organization_id,
            project_type: ProjectType.DEFAULT,
            dbt_connection: null,
            dbt_connection_type: null,
            copied_from_project_uuid: null,
            dbt_version: DefaultSupportedDbtVersion,
            created_by_user_uuid: user.user_uuid,
            organization_warehouse_credentials_uuid: null,
        })
        .returning('*');
    const spaceRows = await database('spaces')
        .insert(
            ['shared', 'tenantA', 'tenantB'].map((name) => ({
                name,
                slug: name.toLowerCase(),
                path: name.toLowerCase(),
                project_id: project.project_id,
                parent_space_uuid: null,
                inherit_parent_permissions: true,
                is_default_user_space: false,
            })),
        )
        .returning('*');
    const [agent] = await database('ai_agent')
        .insert({
            organization_uuid: org.organization_uuid,
            project_uuid: project.project_uuid,
            name: 'Embed agent',
            slug: 'embed-agent',
            description: '',
            image_url: null,
            image_url_source: null,
            tags: null,
            enable_data_access: true,
            enable_content_tools: true,
            enable_sql_mode: false,
            enable_sql_auto_approval: false,
            enable_composer_queries: false,
            enable_user_context: false,
            enable_self_improvement: false,
            admin_only: false,
            model_config: null,
            ai_organization_provider_credential_uuid: null,
            is_system: false,
            version: 1,
            thread_retention_hours: null,
        })
        .returning('*');
    return {
        organizationUuid: org.organization_uuid,
        projectUuid: project.project_uuid,
        userUuid: user.user_uuid,
        agentUuid: agent.ai_agent_uuid,
        spaces: {
            shared: spaceRows[0].space_uuid,
            tenantA: spaceRows[1].space_uuid,
            tenantB: spaceRows[2].space_uuid,
        },
    };
};

describe('embedded AI thread write spaces', () => {
    let migrated: MigratedDatabase;
    let model: AiAgentModel;
    let f: Fixture;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        model = new AiAgentModel({
            database: migrated.database,
            lightdashConfig: lightdashConfigMock,
        } as ConstructorParameters<typeof AiAgentModel>[0]);
        f = await seed(migrated.database);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    const createThread = (embedSpaceUuids: string[] | undefined) =>
        model.createWebAppThread({
            organizationUuid: f.organizationUuid,
            projectUuid: f.projectUuid,
            userUuid: f.userUuid,
            createdFrom: 'web_app',
            agentUuid: f.agentUuid,
            embedSpaceUuids,
            threadContext: 'Embedded conversation',
        });

    const listThreadUuids = async (writeSpaceUuids: string[]) =>
        (
            await model.findThreads({
                organizationUuid: f.organizationUuid,
                agentUuid: f.agentUuid,
                userUuid: f.userUuid,
                createdFrom: ['web_app'],
                embedWriteSpaceUuids: writeSpaceUuids,
            })
        ).map((thread) => thread.uuid);

    const readThread = async (threadUuid: string) => {
        const { rows } = await migrated.database.raw<{
            rows: {
                embed_space_uuid: string | null;
                embed_space_uuids: string[] | null;
            }[];
        }>(
            'SELECT embed_space_uuid, embed_space_uuids FROM ai_web_app_thread WHERE ai_thread_uuid = ?',
            [threadUuid],
        );
        return rows[0];
    };

    test('stores every write space and keeps the first for attribution', async () => {
        const threadUuid = await createThread([
            f.spaces.shared,
            f.spaces.tenantA,
        ]);
        const row = await readThread(threadUuid);
        expect(row.embed_space_uuid).toBe(f.spaces.shared);
        expect(row.embed_space_uuids).toEqual([
            f.spaces.shared,
            f.spaces.tenantA,
        ]);
    });

    test('matches regardless of order and fails closed for a shared first space', async () => {
        const tenantAThread = await createThread([
            f.spaces.shared,
            f.spaces.tenantA,
        ]);

        await expect(
            model.isWebAppThreadInEmbedSpaces(tenantAThread, [
                f.spaces.tenantA,
                f.spaces.shared,
            ]),
        ).resolves.toBe(true);
        await expect(
            model.isWebAppThreadInEmbedSpaces(tenantAThread, [
                f.spaces.shared,
                f.spaces.tenantB,
            ]),
        ).resolves.toBe(false);
        await expect(
            model.isWebAppThreadInEmbedSpaces(tenantAThread, [
                f.spaces.shared,
                f.spaces.tenantA,
                f.spaces.tenantB,
            ]),
        ).resolves.toBe(true);
        await expect(
            model.isWebAppThreadInEmbedSpaces(tenantAThread, [
                f.spaces.tenantA,
            ]),
        ).resolves.toBe(false);

        expect(
            await listThreadUuids([f.spaces.tenantA, f.spaces.shared]),
        ).toContain(tenantAThread);
        expect(
            await listThreadUuids([f.spaces.shared, f.spaces.tenantB]),
        ).not.toContain(tenantAThread);
    });

    test('reads threads written by older pods through embed_space_uuid', async () => {
        const threadUuid = await createThread(undefined);
        await migrated.database.raw(
            'UPDATE ai_web_app_thread SET embed_space_uuid = ? WHERE ai_thread_uuid = ?',
            [f.spaces.tenantB, threadUuid],
        );

        await expect(
            model.isWebAppThreadInEmbedSpaces(threadUuid, [
                f.spaces.shared,
                f.spaces.tenantB,
            ]),
        ).resolves.toBe(true);
        expect(await listThreadUuids([f.spaces.tenantB])).toContain(threadUuid);

        await backfillEmbedSpaceUuids(migrated.database);
        const row = await readThread(threadUuid);
        expect(row.embed_space_uuids).toEqual([f.spaces.tenantB]);
    });

    test('never matches a non-embed thread', async () => {
        const threadUuid = await createThread(undefined);
        await expect(
            model.isWebAppThreadInEmbedSpaces(threadUuid, [f.spaces.tenantA]),
        ).resolves.toBe(false);
        expect(await listThreadUuids([f.spaces.tenantA])).not.toContain(
            threadUuid,
        );
    });
});
