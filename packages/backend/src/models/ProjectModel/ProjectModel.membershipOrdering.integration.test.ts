import {
    DefaultSupportedDbtVersion,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { GroupMembershipTableName } from '../../database/entities/groupMemberships';
import { GroupTableName } from '../../database/entities/groups';
import { OrganizationMembershipsTableName } from '../../database/entities/organizationMemberships';
import { OrganizationTableName } from '../../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../../database/entities/projectMemberships';
import {
    ProjectTableName,
    type DbProject,
} from '../../database/entities/projects';
import { UserTableName } from '../../database/entities/users';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { ProjectModel } from './ProjectModel';

describe('ProjectModel organization project ordering (PostgreSQL)', () => {
    let database: Knex;
    let transaction: Knex.Transaction;

    beforeAll(() => {
        if (!process.env.PGDATABASE && !process.env.PGCONNECTIONURI) {
            throw new Error(
                'Set PGCONNECTIONURI or PG connection variables for PostgreSQL tests',
            );
        }
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
            pool: { min: 0, max: 1 },
        });
    });

    beforeEach(async () => {
        transaction = await database.transaction();
    });

    afterEach(async () => {
        await transaction?.rollback();
    });

    afterAll(async () => {
        await database?.destroy();
    });

    test('orders by membership totals, preserving type precedence and oldest-first ties', async () => {
        const [organization] = await transaction(OrganizationTableName)
            .insert({ organization_name: 'Project ordering test' })
            .returning(['organization_id', 'organization_uuid']);
        const users = await transaction(UserTableName)
            .insert(
                Array.from({ length: 4 }, (_, index) => ({
                    first_name: 'Project',
                    last_name: `Member ${index}`,
                    is_marketing_opted_in: false,
                    is_tracking_anonymized: false,
                    is_setup_complete: true,
                    is_active: true,
                })),
            )
            .returning('user_id');
        await transaction(OrganizationMembershipsTableName).insert(
            users.map(({ user_id }) => ({
                organization_id: organization.organization_id,
                user_id,
                role: OrganizationMemberRole.VIEWER,
            })),
        );

        const fixtures = [
            { name: 'Neither newer', direct: 0, group: 0, createdDay: 2 },
            { name: 'Direct only tied', direct: 3, group: 0, createdDay: 5 },
            { name: 'Both sources', direct: 3, group: 2, createdDay: 7 },
            { name: 'Neither older', direct: 0, group: 0, createdDay: 1 },
            { name: 'Group only', direct: 0, group: 3, createdDay: 3 },
            { name: 'Both overlapping', direct: 1, group: 1, createdDay: 4 },
            { name: 'Direct only', direct: 4, group: 0, createdDay: 6 },
        ];
        await Promise.all(
            [ProjectType.PREVIEW, ProjectType.DEFAULT].flatMap((projectType) =>
                fixtures.map(async (fixture) => {
                    const name = `${projectType}: ${fixture.name}`;
                    const [project] = await transaction<DbProject>(
                        ProjectTableName,
                    )
                        .insert({
                            name,
                            organization_id: organization.organization_id,
                            project_type: projectType,
                            created_at: new Date(
                                Date.UTC(2024, 0, fixture.createdDay),
                            ),
                            dbt_connection: null,
                            dbt_connection_type: null,
                            copied_from_project_uuid: null,
                            dbt_version: DefaultSupportedDbtVersion,
                            organization_warehouse_credentials_uuid: null,
                            created_by_user_uuid: null,
                        })
                        .returning(['project_id', 'project_uuid']);
                    if (fixture.direct > 0) {
                        await transaction(ProjectMembershipsTableName).insert(
                            users
                                .slice(0, fixture.direct)
                                .map(({ user_id }) => ({
                                    project_id: project.project_id,
                                    user_id,
                                    role: ProjectMemberRole.VIEWER,
                                })),
                        );
                    }
                    if (fixture.group > 0) {
                        const [group] = await transaction(GroupTableName)
                            .insert({
                                organization_id: organization.organization_id,
                                name,
                                created_by_user_uuid: null,
                                updated_by_user_uuid: null,
                            })
                            .returning('group_uuid');
                        await transaction(GroupMembershipTableName).insert(
                            users
                                .slice(0, fixture.group)
                                .map(({ user_id }) => ({
                                    organization_id:
                                        organization.organization_id,
                                    group_uuid: group.group_uuid,
                                    user_id,
                                })),
                        );
                        await transaction(ProjectGroupAccessTableName).insert({
                            project_uuid: project.project_uuid,
                            group_uuid: group.group_uuid,
                            role: ProjectMemberRole.VIEWER,
                        });
                    }
                }),
            ),
        );

        const model = new ProjectModel({
            database: transaction,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: new EncryptionUtil({
                lightdashConfig: lightdashConfigMock,
            }),
        });
        const projects = await model.getAllByOrganizationUuid(
            organization.organization_uuid,
        );

        expect(projects.map(({ name }) => name)).toEqual([
            'DEFAULT: Both sources',
            'DEFAULT: Direct only',
            'DEFAULT: Group only',
            'DEFAULT: Direct only tied',
            'DEFAULT: Both overlapping',
            'DEFAULT: Neither older',
            'DEFAULT: Neither newer',
            'PREVIEW: Both sources',
            'PREVIEW: Direct only',
            'PREVIEW: Group only',
            'PREVIEW: Direct only tied',
            'PREVIEW: Both overlapping',
            'PREVIEW: Neither older',
            'PREVIEW: Neither newer',
        ]);
    });
});
