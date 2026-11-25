import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { AiAgentModel } from '../../../models/AiAgentModel';
import { unusedAgentsSql } from '../../../models/ManagedAgentModelSql';

describe('built-in Semantic Studio agent', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let aiAgentModel: AiAgentModel;
    let organizationUuid: string;
    let projectUuid: string;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        aiAgentModel = new AiAgentModel({
            database,
            lightdashConfig: lightdashConfigMock,
        } as ConstructorParameters<typeof AiAgentModel>[0]);
        const [org] = await database('organizations')
            .insert({ organization_name: 'Studio agent' })
            .returning('*');
        organizationUuid = org.organization_uuid;
        const [person] = await database('users')
            .insert({
                first_name: 'Studio',
                last_name: 'Agent',
                is_active: true,
                is_marketing_opted_in: false,
                is_setup_complete: true,
                is_tracking_anonymized: false,
            })
            .returning('*');
        const [project] = await database('projects')
            .insert({
                name: 'Studio agent project',
                organization_id: org.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: person.user_uuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning('project_uuid');
        projectUuid = project.project_uuid;
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('is created once per project, even when two first requests race', async () => {
        const [first, second] = await Promise.all([
            aiAgentModel.getOrCreateSemanticStudioAgent({
                organizationUuid,
                projectUuid,
            }),
            aiAgentModel.getOrCreateSemanticStudioAgent({
                organizationUuid,
                projectUuid,
            }),
        ]);
        const third = await aiAgentModel.getOrCreateSemanticStudioAgent({
            organizationUuid,
            projectUuid,
        });

        expect(second.uuid).toBe(first.uuid);
        expect(third.uuid).toBe(first.uuid);
        expect(
            await database('ai_agent')
                .where('project_uuid', projectUuid)
                .where('agent_kind', 'semantic_studio')
                .pluck('ai_agent_uuid'),
        ).toEqual([first.uuid]);
    });

    it('stays out of every agent listing', async () => {
        const studio = await aiAgentModel.getOrCreateSemanticStudioAgent({
            organizationUuid,
            projectUuid,
        });
        const configured = await aiAgentModel.createAgent({
            name: 'Configured agent',
            description: null,
            projectUuid,
            organizationUuid,
            tags: null,
            integrations: [],
            instruction: null,
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
            enableDataAccess: true,
            enableSelfImprovement: false,
            modelConfig: null,
            version: 2,
            mcpServerUuids: [],
        });
        await database.raw(
            "UPDATE ai_agent SET created_at = now() - interval '60 days' WHERE project_uuid = ?",
            [projectUuid],
        );

        const listed = (
            await aiAgentModel.findAllAgents({ organizationUuid })
        ).map((agent) => agent.uuid);
        const forCode = (
            await aiAgentModel.findAgentsForCode({
                organizationUuid,
                projectUuid,
            })
        ).map((agent) => agent.uuid);
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

        expect(listed).toEqual([configured.uuid]);
        expect(forCode).toEqual([configured.uuid]);
        expect(unused.rows.map((row) => row.agent_uuid)).toEqual([
            configured.uuid,
        ]);
        expect(await aiAgentModel.isSemanticStudioAgent(studio.uuid)).toBe(
            true,
        );
        expect(await aiAgentModel.isSemanticStudioAgent(configured.uuid)).toBe(
            false,
        );
    });
});
