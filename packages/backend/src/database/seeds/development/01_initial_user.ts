import {
    CreatePostgresCredentials,
    DbtLocalProjectConfig,
    DbtProjectType,
    generateSlug,
    getLtreePathFromSlug,
    OrganizationMemberRole,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_ORG_1_ADMIN_ROLE,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_ORG_1_EDITOR_PASSWORD,
    SEED_ORG_1_EDITOR_ROLE,
    SEED_ORG_1_VIEWER,
    SEED_ORG_1_VIEWER_EMAIL,
    SEED_ORG_1_VIEWER_PASSWORD,
    SEED_ORG_1_VIEWER_ROLE,
    SEED_ORG_2,
    SEED_ORG_2_ADMIN,
    SEED_ORG_2_ADMIN_EMAIL,
    SEED_ORG_2_ADMIN_PASSWORD,
    SEED_ORG_2_ADMIN_ROLE,
    SEED_PROJECT,
    SEED_SPACE,
    SupportedDbtVersions,
    WarehouseTypes,
} from '@lightdash/common';
import bcrypt from 'bcrypt';
import { Knex } from 'knex';
import path from 'path';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { projectAdapterFromConfig } from '../../../projectAdapters/projectAdapter';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { DbEmailIn } from '../../entities/emails';
import { OnboardingTableName } from '../../entities/onboarding';
import { DbOrganizationIn } from '../../entities/organizations';
import { DbUserIn } from '../../entities/users';

export async function seed(knex: Knex): Promise<void> {
    // Deletes ALL existing entries
    await knex('users').del();
    await knex('organizations').del();

    const addOrganization = async (seedOrganization: DbOrganizationIn) => {
        const [organization] = await knex('organizations')
            .insert(seedOrganization)
            .returning(['organization_id', 'organization_uuid']);

        if (organization === undefined) {
            throw new Error('Organization was not created');
        }

        return {
            organizationId: organization.organization_id,
            organizationUuid: organization.organization_uuid,
        };
    };

    const addUser = async (
        {
            organizationId,
            organizationUuid,
        }: {
            organizationId: number;
            organizationUuid: string;
        },
        seedUser: DbUserIn,
        seedEmail: Omit<DbEmailIn, 'user_id'>,
        seedPassword: { password: string },
        seedUserRole: OrganizationMemberRole,
    ) => {
        const [user] = await knex('users').insert(seedUser).returning('*');
        if (user.user_id === undefined) {
            throw new Error('User was not created');
        }

        await knex('emails').insert({
            ...seedEmail,
            user_id: user.user_id,
        });

        await knex('emails')
            .update({
                is_verified: true,
            })
            .where({
                user_id: user.user_id,
                email: seedEmail.email,
            });

        await knex('password_logins').insert({
            user_id: user.user_id,
            password_hash: await bcrypt.hash(
                seedPassword.password,
                await bcrypt.genSalt(),
            ),
        });

        await knex('organization_memberships').insert({
            user_id: user.user_id,
            organization_id: organizationId,
            role: seedUserRole,
        });

        await knex(OnboardingTableName).insert({
            organization_id: organizationId,
            ranQuery_at: new Date(),
            shownSuccess_at: new Date(),
        });

        return { organizationId, user, organizationUuid };
    };

    const { organizationId, organizationUuid } = await addOrganization(
        SEED_ORG_1,
    );

    const { user } = await addUser(
        { organizationId, organizationUuid },
        SEED_ORG_1_ADMIN,
        SEED_ORG_1_ADMIN_EMAIL,
        SEED_ORG_1_ADMIN_PASSWORD,
        SEED_ORG_1_ADMIN_ROLE,
    );
    await addUser(
        { organizationId, organizationUuid },
        SEED_ORG_1_EDITOR,
        SEED_ORG_1_EDITOR_EMAIL,
        SEED_ORG_1_EDITOR_PASSWORD,
        SEED_ORG_1_EDITOR_ROLE,
    );
    await addUser(
        { organizationId, organizationUuid },
        SEED_ORG_1_VIEWER,
        SEED_ORG_1_VIEWER_EMAIL,
        SEED_ORG_1_VIEWER_PASSWORD,
        SEED_ORG_1_VIEWER_ROLE,
    );

    const org2 = await addOrganization(SEED_ORG_2);

    await addUser(
        org2,
        SEED_ORG_2_ADMIN,
        SEED_ORG_2_ADMIN_EMAIL,
        SEED_ORG_2_ADMIN_PASSWORD,
        SEED_ORG_2_ADMIN_ROLE,
    );

    // Try this with relative path
    const enc = new EncryptionUtil({ lightdashConfig });
    const demoDir = process.env.DBT_DEMO_DIR;
    if (!demoDir) {
        throw new Error(
            'Must specify absolute path to demo project with DBT_DEMO_DIR',
        );
    }
    const projectSettings: DbtLocalProjectConfig = {
        type: DbtProjectType.DBT,
        project_dir: path.join(demoDir, '/dbt'),
        profiles_dir: path.join(demoDir, '/profiles'),
    };
    const encryptedProjectSettings = enc.encrypt(
        JSON.stringify(projectSettings),
    );

    const [{ project_id: projectId, project_uuid: projectUuid }] = await knex(
        'projects',
    )
        .insert({
            ...SEED_PROJECT,
            organization_id: organizationId,
            dbt_connection: encryptedProjectSettings,
            dbt_version: SupportedDbtVersions.V1_7,
            created_by_user_uuid: user.user_uuid,
        })
        .returning(['project_id', 'project_uuid']);

    if (projectId === undefined) {
        throw new Error('Project was not created');
    }

    // Demo mode
    if (process.env.PGHOST === undefined) {
        throw new Error('Must specify PGHOST');
    }
    const port = parseInt(process.env.PGPORT || '', 10);
    if (Number.isNaN(port)) {
        throw new Error('Must specify a valid PGPORT');
    }
    if (process.env.PGPASSWORD === undefined) {
        throw new Error('Must specify PGPASSWORD');
    }
    if (process.env.PGUSER === undefined) {
        throw new Error('Must specify PGUSER in demo');
    }
    if (process.env.PGDATABASE === undefined) {
        throw new Error('Must specify PGDATABASE in demo');
    }
    const warehouseCredentials: CreatePostgresCredentials = {
        type: WarehouseTypes.POSTGRES,
        schema: 'jaffle',
        host: process.env.PGHOST,
        port,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        dbname: process.env.PGDATABASE,
        sslmode: 'disable',
    };

    await knex('warehouse_credentials').insert({
        project_id: projectId,
        encrypted_credentials: enc.encrypt(
            JSON.stringify(warehouseCredentials),
        ),
        warehouse_type: 'postgres',
    });

    const spaceSlug = generateSlug(SEED_SPACE.name);

    const [{ space_uuid: spaceUuid }] = await knex('spaces')
        .insert({
            ...SEED_SPACE,
            is_private: false,
            project_id: projectId,
            slug: spaceSlug,
            parent_space_uuid: null,
            path: getLtreePathFromSlug(spaceSlug),
        })
        .returning(['space_id', 'space_uuid']);

    await knex('space_user_access').insert({
        user_uuid: user.user_uuid,
        space_uuid: spaceUuid,
        space_role: 'admin',
    });

    try {
        const adapter = await projectAdapterFromConfig(
            projectSettings,
            warehouseCredentials,
            {
                warehouseCatalog: undefined,
                onWarehouseCatalogChange: () => {},
            },
            SupportedDbtVersions.V1_7,
        );
        const explores = await adapter.compileAllExplores({
            userUuid: user.user_uuid,
            organizationUuid,
            projectUuid,
        });
        await new ProjectModel({
            database: knex,
            lightdashConfig,
            encryptionUtil: enc,
        }).saveExploresToCache(SEED_PROJECT.project_uuid, explores);
    } catch (e) {
        console.error(e);
        throw e;
    }
}
