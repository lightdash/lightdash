import {
    type ContentOwnerAssignment,
    type ContentOwnershipInfo,
    type ContentType,
    type UserContentOwnershipSummary,
} from '@lightdash/common';
import { Knex } from 'knex';
import { ContentOwnershipTableName } from '../database/entities/contentOwnership';
import { EmailTableName } from '../database/entities/emails';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { UserTableName } from '../database/entities/users';

type ContentOwnershipModelArguments = {
    database: Knex;
};

export class ContentOwnershipModel {
    private readonly database: Knex;

    constructor({ database }: ContentOwnershipModelArguments) {
        this.database = database;
    }

    async getByContent(
        contentType: ContentType,
        contentUuid: string,
    ): Promise<ContentOwnershipInfo | null> {
        const row = await this.database(ContentOwnershipTableName)
            .leftJoin(
                { owner_user: UserTableName },
                `${ContentOwnershipTableName}.owner_user_uuid`,
                'owner_user.user_uuid',
            )
            .leftJoin({ owner_email: EmailTableName }, function joinEmail() {
                this.on(
                    'owner_user.user_id',
                    '=',
                    'owner_email.user_id',
                ).andOnVal('owner_email.is_primary', true);
            })
            .leftJoin(
                { owner_group: GroupTableName },
                `${ContentOwnershipTableName}.owner_group_uuid`,
                'owner_group.group_uuid',
            )
            .leftJoin(
                { assigner: UserTableName },
                `${ContentOwnershipTableName}.assigned_by_user_uuid`,
                'assigner.user_uuid',
            )
            .where(`${ContentOwnershipTableName}.content_type`, contentType)
            .where(`${ContentOwnershipTableName}.content_uuid`, contentUuid)
            .select(
                `${ContentOwnershipTableName}.assigned_at`,
                this.database.ref('owner_user.user_uuid').as('owner_user_uuid'),
                this.database
                    .ref('owner_user.first_name')
                    .as('owner_first_name'),
                this.database.ref('owner_user.last_name').as('owner_last_name'),
                this.database.ref('owner_email.email').as('owner_email'),
                this.database
                    .ref('owner_group.group_uuid')
                    .as('owner_group_uuid'),
                this.database.ref('owner_group.name').as('owner_group_name'),
                this.database.ref('assigner.user_uuid').as('assigner_uuid'),
                this.database
                    .ref('assigner.first_name')
                    .as('assigner_first_name'),
                this.database
                    .ref('assigner.last_name')
                    .as('assigner_last_name'),
            )
            .first();

        if (!row) return null;

        const owner = row.owner_user_uuid
            ? ({
                  type: 'user',
                  userUuid: row.owner_user_uuid,
                  firstName: row.owner_first_name,
                  lastName: row.owner_last_name,
                  email: row.owner_email ?? '',
              } as const)
            : ({
                  type: 'group',
                  groupUuid: row.owner_group_uuid,
                  name: row.owner_group_name,
              } as const);

        return {
            owner,
            assignedAt: row.assigned_at,
            assignedBy: row.assigner_uuid
                ? {
                      userUuid: row.assigner_uuid,
                      firstName: row.assigner_first_name,
                      lastName: row.assigner_last_name,
                  }
                : null,
        };
    }

    async upsert({
        contentType,
        contentUuid,
        projectUuid,
        owner,
        assignedByUserUuid,
    }: {
        contentType: ContentType;
        contentUuid: string;
        projectUuid: string;
        owner: ContentOwnerAssignment;
        assignedByUserUuid: string;
    }): Promise<void> {
        const ownerColumns = {
            owner_user_uuid: owner.type === 'user' ? owner.userUuid : null,
            owner_group_uuid: owner.type === 'group' ? owner.groupUuid : null,
        };

        await this.database(ContentOwnershipTableName)
            .insert({
                content_type: contentType,
                content_uuid: contentUuid,
                project_uuid: projectUuid,
                assigned_by_user_uuid: assignedByUserUuid,
                ...ownerColumns,
            })
            .onConflict(['content_type', 'content_uuid'])
            .merge({
                ...ownerColumns,
                assigned_by_user_uuid: assignedByUserUuid,
                assigned_at: this.database.fn.now(),
            });
    }

    async findUserOwnerByEmail(
        email: string,
        organizationUuid: string,
    ): Promise<string | undefined> {
        const row = await this.database(EmailTableName)
            .innerJoin(
                UserTableName,
                `${EmailTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .innerJoin(
                OrganizationMembershipsTableName,
                `${UserTableName}.user_id`,
                `${OrganizationMembershipsTableName}.user_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationMembershipsTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .whereRaw(`LOWER(${EmailTableName}.email) = LOWER(?)`, [email])
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select(`${UserTableName}.user_uuid`)
            .first();
        return row?.user_uuid;
    }

    async findGroupOwnerByName(
        name: string,
        organizationUuid: string,
    ): Promise<string | undefined> {
        const row = await this.database(GroupTableName)
            .innerJoin(
                OrganizationTableName,
                `${GroupTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .where(`${GroupTableName}.name`, name)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select(`${GroupTableName}.group_uuid`)
            .first();
        return row?.group_uuid;
    }

    async isOwnerInOrganization(
        owner: ContentOwnerAssignment,
        organizationUuid: string,
    ): Promise<boolean> {
        if (owner.type === 'user') {
            const row = await this.database(OrganizationMembershipsTableName)
                .innerJoin(
                    UserTableName,
                    `${OrganizationMembershipsTableName}.user_id`,
                    `${UserTableName}.user_id`,
                )
                .innerJoin(
                    OrganizationTableName,
                    `${OrganizationMembershipsTableName}.organization_id`,
                    `${OrganizationTableName}.organization_id`,
                )
                .where(`${UserTableName}.user_uuid`, owner.userUuid)
                .where(
                    `${OrganizationTableName}.organization_uuid`,
                    organizationUuid,
                )
                .first();
            return row !== undefined;
        }
        const row = await this.database(GroupTableName)
            .innerJoin(
                OrganizationTableName,
                `${GroupTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .where(`${GroupTableName}.group_uuid`, owner.groupUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .first();
        return row !== undefined;
    }

    async getOwnershipSummaryByOwner(
        ownerUserUuid: string,
    ): Promise<UserContentOwnershipSummary> {
        const rows = await this.database(ContentOwnershipTableName)
            .innerJoin(
                ProjectTableName,
                `${ContentOwnershipTableName}.project_uuid`,
                `${ProjectTableName}.project_uuid`,
            )
            .where(
                `${ContentOwnershipTableName}.owner_user_uuid`,
                ownerUserUuid,
            )
            .groupBy(
                `${ProjectTableName}.project_uuid`,
                `${ProjectTableName}.name`,
            )
            .select(
                `${ProjectTableName}.project_uuid`,
                this.database
                    .ref(`${ProjectTableName}.name`)
                    .as('project_name'),
            )
            .count(`${ContentOwnershipTableName}.content_ownership_uuid`, {
                as: 'count',
            });

        const byProject = rows.map((row) => ({
            projectUuid: row.project_uuid,
            projectName: row.project_name,
            count: Number(row.count),
        }));

        return {
            totalCount: byProject.reduce((acc, p) => acc + p.count, 0),
            byProject,
        };
    }

    async reassignUserOwnership(
        fromUserUuid: string,
        toUserUuid: string,
        assignedByUserUuid: string,
    ): Promise<number> {
        return this.database(ContentOwnershipTableName)
            .where('owner_user_uuid', fromUserUuid)
            .update({
                owner_user_uuid: toUserUuid,
                owner_group_uuid: null,
                assigned_by_user_uuid: assignedByUserUuid,
                assigned_at: this.database.fn.now(),
            });
    }

    async remove(contentType: ContentType, contentUuid: string): Promise<void> {
        await this.database(ContentOwnershipTableName)
            .where({
                content_type: contentType,
                content_uuid: contentUuid,
            })
            .delete();
    }
}
