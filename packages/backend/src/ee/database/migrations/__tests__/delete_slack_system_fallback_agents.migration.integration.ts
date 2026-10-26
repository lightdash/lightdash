import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { AiAgentModel } from '../../../models/AiAgentModel';
import { unusedAgentsSql } from '../../../models/ManagedAgentModelSql';
import {
    down,
    up,
} from '../20261026161219_delete_slack_system_fallback_agents';

describe('delete Slack system fallback agents migration', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let organizationUuid: string;
    let organizationId: number;
    let userUuid: string;
    const createdAgentUuids: string[] = [];

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        const [org] = await database('organizations')
            .insert({ organization_name: 'Fallback cleanup' })
            .returning('*');
        organizationUuid = org.organization_uuid;
        organizationId = org.organization_id;
        const [person] = await database('users')
            .insert({
                first_name: 'Fallback',
                last_name: 'Cleanup',
                is_active: true,
                is_marketing_opted_in: false,
                is_setup_complete: true,
                is_tracking_anonymized: false,
            })
            .returning('*');
        userUuid = person.user_uuid;
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await database('ai_agent')
            .whereIn('ai_agent_uuid', createdAgentUuids)
            .delete();
        createdAgentUuids.length = 0;
    });

    const createProject = async (
        name: string,
    ): Promise<{ projectUuid: string; projectId: number }> => {
        const [project] = await database('projects')
            .insert({
                name,
                organization_id: organizationId,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: userUuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning(['project_uuid', 'project_id']);
        return {
            projectUuid: project.project_uuid,
            projectId: project.project_id,
        };
    };

    const createAgent = async (
        projectUuid: string,
        name: string,
        isSystem: boolean,
    ): Promise<string> => {
        const [row] = await database('ai_agent')
            .insert({
                organization_uuid: organizationUuid,
                project_uuid: projectUuid,
                name,
                slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${
                    isSystem ? 'system' : 'user'
                }`,
                description: null,
                image_url: null,
                image_url_source: null,
                tags: null,
                enable_data_access: true,
                enable_self_improvement: false,
                enable_content_tools: false,
                enable_user_context: false,
                enable_sql_mode: true,
                enable_sql_auto_approval: false,
                enable_composer_queries: true,
                admin_only: false,
                model_config: null,
                ai_organization_provider_credential_uuid: null,
                version: 1,
                thread_retention_hours: null,
                is_system: isSystem,
            } as never)
            .returning('ai_agent_uuid');
        createdAgentUuids.push(row.ai_agent_uuid);
        return row.ai_agent_uuid;
    };

    const remainingAgents = async (agentUuids: string[]): Promise<string[]> =>
        (
            await database('ai_agent')
                .whereIn('ai_agent_uuid', agentUuids)
                .pluck('ai_agent_uuid')
        ).sort();

    it('deletes hidden fallback agents with their threads and keeps configured agents', async () => {
        const { projectUuid: projectA } =
            await createProject('Fallback project A');
        const { projectUuid: projectB } =
            await createProject('Fallback project B');
        const configured = await createAgent(
            projectA,
            'Configured agent',
            false,
        );
        const fallback = await createAgent(
            projectA,
            'Lightdash Assistant',
            true,
        );
        const flaggedWithAccess = await createAgent(
            projectB,
            'Flagged but configured',
            true,
        );
        await database('ai_agent_user_access').insert({
            ai_agent_uuid: flaggedWithAccess,
            user_uuid: userUuid,
        });
        const [thread] = await database('ai_thread')
            .insert({
                organization_uuid: organizationUuid,
                project_uuid: projectA,
                created_from: 'web_app',
                agent_uuid: fallback,
            } as never)
            .returning('ai_thread_uuid');

        await up(database);

        expect(
            await remainingAgents([configured, fallback, flaggedWithAccess]),
        ).toEqual([configured, flaggedWithAccess].sort());
        expect(
            await database('ai_thread')
                .where('ai_thread_uuid', thread.ai_thread_uuid)
                .first(),
        ).toBeUndefined();
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Keeping 1 agent row(s)'),
            [expect.objectContaining({ ai_agent_uuid: flaggedWithAccess })],
        );
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Deleting 1 built-in'),
            [expect.objectContaining({ ai_agent_uuid: fallback })],
        );
    });

    it('keeps flagged rows with an integration, group access or space access and stays idempotent', async () => {
        const withIntegration = await createProject('Guard integration');
        const withGroup = await createProject('Guard group');
        const withSpace = await createProject('Guard space');
        const unguarded = await createProject('Guard none');
        const integrationAgent = await createAgent(
            withIntegration.projectUuid,
            'Flagged with integration',
            true,
        );
        const groupAgent = await createAgent(
            withGroup.projectUuid,
            'Flagged with group access',
            true,
        );
        const spaceAgent = await createAgent(
            withSpace.projectUuid,
            'Flagged with space access',
            true,
        );
        const fallback = await createAgent(
            unguarded.projectUuid,
            'Lightdash Assistant',
            true,
        );
        await database('ai_agent_integration').insert({
            ai_agent_uuid: integrationAgent,
            integration_type: 'slack',
        });
        const [group] = await database('groups')
            .insert({
                organization_id: organizationId,
                name: 'Fallback cleanup group',
                created_by_user_uuid: userUuid,
                updated_by_user_uuid: userUuid,
            })
            .returning('group_uuid');
        await database('ai_agent_group_access').insert({
            ai_agent_uuid: groupAgent,
            group_uuid: group.group_uuid,
        });
        const [space] = await database('spaces')
            .insert({
                name: 'Fallback cleanup space',
                slug: 'fallback-cleanup-space',
                path: 'fallback_cleanup_space',
                project_id: withSpace.projectId,
                parent_space_uuid: null,
                inherit_parent_permissions: true,
                is_default_user_space: false,
            })
            .returning('space_uuid');
        await database('ai_agent_space_access').insert({
            ai_agent_uuid: spaceAgent,
            space_uuid: space.space_uuid,
        });
        const all = [integrationAgent, groupAgent, spaceAgent, fallback];
        const guarded = [integrationAgent, groupAgent, spaceAgent].sort();

        await up(database);

        expect(await remainingAgents(all)).toEqual(guarded);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Keeping 3 agent row(s)'),
            expect.arrayContaining(
                guarded.map((uuid) =>
                    expect.objectContaining({ ai_agent_uuid: uuid }),
                ),
            ),
        );

        await up(database);

        expect(await remainingAgents(all)).toEqual(guarded);
        expect(console.log).toHaveBeenLastCalledWith(
            expect.stringContaining('Deleting 0 built-in'),
            [],
        );
    });

    it('keeps a system row written by an old pod after the migration out of every listing', async () => {
        const { projectUuid } = await createProject('Old writer project');
        const configured = await createAgent(
            projectUuid,
            'Configured agent',
            false,
        );

        await up(database);

        const oldWriterRow = await createAgent(
            projectUuid,
            'Lightdash Assistant',
            true,
        );
        await database('ai_agent')
            .whereIn('ai_agent_uuid', [configured, oldWriterRow])
            .update({ created_at: database.raw("now() - interval '60 days'") });
        const aiAgentModel = new AiAgentModel({
            database,
            lightdashConfig: lightdashConfigMock,
        } as ConstructorParameters<typeof AiAgentModel>[0]);

        const listed = (await aiAgentModel.findAllAgents({ organizationUuid }))
            .map((agent) => agent.uuid)
            .sort();
        const forCode = (
            await aiAgentModel.findAgentsForCode({
                organizationUuid,
                projectUuid,
            })
        )
            .map((agent) => agent.uuid)
            .sort();
        const unused = await database.raw<{
            rows: Array<{ agent_uuid: string }>;
        }>(unusedAgentsSql(), [
            30,
            5,
            projectUuid,
            organizationUuid,
            projectUuid,
            30,
        ]);

        expect(listed).toContain(configured);
        expect(listed).not.toContain(oldWriterRow);
        expect(forCode).toEqual([configured]);
        expect(unused.rows.map((row) => row.agent_uuid)).toEqual([configured]);
    });

    it('changes nothing when no fallback agents exist and cannot be rolled back', async () => {
        const { projectUuid } = await createProject('Fallback project C');
        const configured = await createAgent(projectUuid, 'Only agent', false);

        await up(database);

        expect(await remainingAgents([configured])).toEqual([configured]);
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Deleting 0 built-in'),
            [],
        );
        await expect(down()).rejects.toThrow(/^irreversible:/);
    });
});
