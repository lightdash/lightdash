import {
    AgentCapability,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { ProjectAgentCapabilityPoliciesTableName } from '../../entities/agentCapabilityPolicies';
import { ProjectTableName } from '../../entities/projects';
import { WarehouseCredentialTableName } from '../../entities/warehouseCredentials';

// One project per agent restriction case. The seed project itself has no row,
// so it follows the organization setting.
const EXAMPLES: {
    projectUuid: string;
    name: string;
    slug: string;
    allowedCapabilities: AgentCapability[] | null;
}[] = [
    {
        projectUuid: '5a1f7c1e-0b7d-4d0e-9c11-a6e1d0000001',
        name: 'Agents: no restrictions',
        slug: 'agents-no-restrictions',
        allowedCapabilities: null,
    },
    {
        projectUuid: '5a1f7c1e-0b7d-4d0e-9c11-a6e1d0000002',
        name: 'Agents: no raw SQL',
        slug: 'agents-no-raw-sql',
        allowedCapabilities: Object.values(AgentCapability).filter(
            (capability) => capability !== AgentCapability.RawSql,
        ),
    },
    {
        projectUuid: '5a1f7c1e-0b7d-4d0e-9c11-a6e1d0000003',
        name: 'Agents: find and query only',
        slug: 'agents-find-and-query-only',
        allowedCapabilities: [
            AgentCapability.ReadDiscover,
            AgentCapability.Query,
        ],
    },
    {
        projectUuid: '5a1f7c1e-0b7d-4d0e-9c11-a6e1d0000004',
        name: 'Agents: nothing allowed',
        slug: 'agents-nothing-allowed',
        allowedCapabilities: [],
    },
];

export async function seed(knex: Knex): Promise<void> {
    const source = await knex(ProjectTableName)
        .where('project_uuid', SEED_PROJECT.project_uuid)
        .first();
    if (!source) return;

    const {
        project_id: sourceProjectId,
        project_uuid: _projectUuid,
        created_at: _createdAt,
        dbt_source_uuid: _dbtSourceUuid,
        ...projectColumns
    } = source as Record<string, unknown> & { project_id: number };

    const credentials = await knex(WarehouseCredentialTableName)
        .where('project_id', sourceProjectId)
        .first();

    const projectModel = new ProjectModel({
        database: knex,
        lightdashConfig,
        encryptionUtil: new EncryptionUtil({ lightdashConfig }),
    });
    const explores = Object.values(
        await projectModel.getAllExploresFromCache(SEED_PROJECT.project_uuid),
    );

    await knex(ProjectTableName)
        .whereIn(
            'project_uuid',
            EXAMPLES.map((example) => example.projectUuid),
        )
        .delete();

    for (const example of EXAMPLES) {
        const project = {
            ...projectColumns,
            project_uuid: example.projectUuid,
            name: example.name,
            slug: example.slug,
        };
        // eslint-disable-next-line no-await-in-loop
        const [{ project_id: projectId }] = await knex(ProjectTableName)
            .insert(project as never)
            .returning('project_id');

        if (credentials) {
            // eslint-disable-next-line no-await-in-loop
            await knex(WarehouseCredentialTableName).insert({
                project_id: projectId,
                encrypted_credentials: credentials.encrypted_credentials,
                warehouse_type: credentials.warehouse_type,
            });
        }

        // eslint-disable-next-line no-await-in-loop
        await projectModel.saveExploresToCache(
            example.projectUuid,
            explores,
            true,
        );

        // eslint-disable-next-line no-await-in-loop
        await knex(ProjectAgentCapabilityPoliciesTableName).insert({
            project_uuid: example.projectUuid,
            allowed_capabilities: example.allowedCapabilities,
            updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
    }
}
