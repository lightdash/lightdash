import {
    CreatePostgresCredentials,
    DbtLocalProjectConfig,
    DbtProjectType,
    DefaultSupportedDbtVersion,
    generateSlug,
    OrganizationMemberRole,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_ORG_2,
    SEED_ORG_2_ADMIN,
    SEED_ORG_2_ADMIN_EMAIL,
    SEED_ORG_2_ADMIN_PASSWORD,
    SEED_PROJECT,
    SEED_SPACE,
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

    const addUser = async (
        seedOrganization: DbOrganizationIn,
        seedUser: DbUserIn,
        seedEmail: Omit<DbEmailIn, 'user_id'>,
        seedPassword: { password: string },
    ) => {
        const [{ organization_id: organizationId }] = await knex(
            'organizations',
        )
            .insert(seedOrganization)
            .returning('organization_id');
        if (organizationId === undefined) {
            throw new Error('Organization was not created');
        }

        const [user] = await knex('users').insert(seedUser).returning('*');
        if (user.user_id === undefined) {
            throw new Error('User was not created');
        }

        await knex('emails').insert({ ...seedEmail, user_id: user.user_id });

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
            role: OrganizationMemberRole.ADMIN,
        });

        await knex(OnboardingTableName).insert({
            organization_id: organizationId,
            ranQuery_at: new Date(),
            shownSuccess_at: new Date(),
        });

        return { organizationId, user };
    };

    const { organizationId, user } = await addUser(
        SEED_ORG_1,
        SEED_ORG_1_ADMIN,
        SEED_ORG_1_ADMIN_EMAIL,
        SEED_ORG_1_ADMIN_PASSWORD,
    );
    await addUser(
        SEED_ORG_2,
        SEED_ORG_2_ADMIN,
        SEED_ORG_2_ADMIN_EMAIL,
        SEED_ORG_2_ADMIN_PASSWORD,
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

    const [{ project_id: projectId }] = await knex('projects')
        .insert({
            ...SEED_PROJECT,
            organization_id: organizationId,
            dbt_connection: encryptedProjectSettings,
            dbt_version: DefaultSupportedDbtVersion,
        })
        .returning('project_id');

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

    const [{ space_id: spaceId, space_uuid: spaceUuid }] = await knex('spaces')
        .insert({
            ...SEED_SPACE,
            is_private: false,
            project_id: projectId,
            slug: generateSlug(SEED_SPACE.name),
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
            DefaultSupportedDbtVersion,
        );
        const explores = await adapter.compileAllExplores();
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
