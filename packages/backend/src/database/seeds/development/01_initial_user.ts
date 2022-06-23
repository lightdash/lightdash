import {
    CreatePostgresCredentials,
    DbtLocalProjectConfig,
    LightdashMode,
    OrganizationMemberRole,
    ProjectType,
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
import { projectModel } from '../../../models/models';
import { EncryptionService } from '../../../services/EncryptionService/EncryptionService';
import { projectService } from '../../../services/services';
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
        const [organizationId] = await knex('organizations')
            .insert(seedOrganization)
            .returning('organization_id');

        const [userId] = await knex('users')
            .insert(seedUser)
            .returning('user_id');

        await knex('emails').insert({ ...seedEmail, user_id: userId });

        await knex('password_logins').insert({
            user_id: userId,
            password_hash: await bcrypt.hash(
                seedPassword.password,
                await bcrypt.genSalt(),
            ),
        });

        await knex('organization_memberships').insert({
            user_id: userId,
            organization_id: organizationId,
            role: OrganizationMemberRole.ADMIN,
        });

        await knex(OnboardingTableName).insert({
            organization_id: organizationId,
            ranQuery_at: new Date(),
            shownSuccess_at: new Date(),
        });

        return organizationId;
    };

    const organizationId = await addUser(
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
    const enc = new EncryptionService({ lightdashConfig });
    const demoDir = process.env.DBT_DEMO_DIR;
    if (!demoDir) {
        throw new Error(
            'Must specify absolute path to demo project with DBT_DEMO_DIR',
        );
    }
    const projectSettings: DbtLocalProjectConfig = {
        type: ProjectType.DBT,
        project_dir: path.join(demoDir, '/dbt'),
        profiles_dir: path.join(demoDir, '/profiles'),
    };
    const encryptedProjectSettings = enc.encrypt(
        JSON.stringify(projectSettings),
    );

    const [projectId] = await knex('projects')
        .insert({
            ...SEED_PROJECT,
            organization_id: organizationId,
            dbt_connection: encryptedProjectSettings,
        })
        .returning('project_id');

    let encryptedCredentials: Buffer;
    if (
        lightdashConfig.mode === LightdashMode.DEMO ||
        lightdashConfig.mode === LightdashMode.PR
    ) {
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
        const creds: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            schema: 'jaffle',
            host: process.env.PGHOST,
            port,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            dbname: process.env.PGDATABASE,
            sslmode: 'disable',
        };
        encryptedCredentials = enc.encrypt(JSON.stringify(creds));
    } else {
        // Dev mode
        encryptedCredentials = Buffer.from(
            'bd2b8a1f5c50106edc43aa886e9865c73b209f3afea54245dd4106f80d5318bab30789096d43f17310f664080a1d96adc230fd3093b9f5a85e1e975ed20c46c9928821f2de87d59b1ef0dbbae6fc332f11ffae7485e43e67e26efecc9ea9a984510b0e52032646bd925e4db0e45253332416c4bc332f16ad5269ffdd60d18d1cd178400153f7e64ca54fe408e059bd99ee79f8fcfdac066cd2a6d6a1ed15eca4ddfffa50254b1f0e2daa7615ccb1bffaeacf315641856eb4c0284012b5fc331a84ea3cbff7da85ed84e1005ab004b104d75b207723259055f83f62eae69eda1ccaeeecdf9d98226301d9c0a64c9313ec9cd127fd3dd11fc3925b8825b68a782870686c000cfc4703d8891b26',
            'hex',
        );
    }

    await knex('warehouse_credentials').insert({
        project_id: projectId,
        encrypted_credentials: encryptedCredentials,
        warehouse_type: 'postgres',
    });

    await knex('spaces').insert({ ...SEED_SPACE, project_id: projectId });

    const explores = await projectService.refreshAllTables(
        { userUuid: SEED_ORG_1_ADMIN.user_uuid },
        SEED_PROJECT.project_uuid,
    );
    await projectModel.saveExploresToCache(SEED_PROJECT.project_uuid, explores);
}
