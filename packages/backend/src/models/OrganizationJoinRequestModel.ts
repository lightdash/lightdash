import {
    NotFoundError,
    OrganizationJoinRequestStatus,
    type OrganizationJoinRequest,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { EmailTableName } from '../database/entities/emails';
import {
    OrganizationJoinRequestsTableName,
    type DbOrganizationJoinRequest,
} from '../database/entities/organizationJoinRequests';
import { UserTableName } from '../database/entities/users';

export class OrganizationJoinRequestModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async create(data: {
        organizationUuid: string;
        userUuid: string;
        expiresAt: Date;
    }): Promise<DbOrganizationJoinRequest> {
        const [row] = await this.database(OrganizationJoinRequestsTableName)
            .insert({
                join_request_uuid: uuidv4(),
                organization_uuid: data.organizationUuid,
                user_uuid: data.userUuid,
                status: OrganizationJoinRequestStatus.PENDING,
                expires_at: data.expiresAt,
            })
            .returning('*');
        return row;
    }

    async findLatestForUser(
        userUuid: string,
    ): Promise<DbOrganizationJoinRequest[]> {
        return this.database(OrganizationJoinRequestsTableName)
            .distinctOn('organization_uuid')
            .where('user_uuid', userUuid)
            .orderBy([
                { column: 'organization_uuid' },
                { column: 'created_at', order: 'desc' },
            ])
            .select('*');
    }

    async countCreatedSince(userUuid: string, since: Date): Promise<number> {
        const [{ count }] = await this.database(
            OrganizationJoinRequestsTableName,
        )
            .where('user_uuid', userUuid)
            .where('created_at', '>', since)
            .count<{ count: string }[]>('join_request_uuid as count');
        return Number(count);
    }

    async expirePendingForUser(
        userUuid: string,
        organizationUuid: string,
        now: Date,
    ): Promise<void> {
        await this.database(OrganizationJoinRequestsTableName)
            .where('user_uuid', userUuid)
            .where('organization_uuid', organizationUuid)
            .where('status', OrganizationJoinRequestStatus.PENDING)
            .where('expires_at', '<=', now)
            .update({ status: OrganizationJoinRequestStatus.EXPIRED });
    }

    async get(joinRequestUuid: string): Promise<DbOrganizationJoinRequest> {
        const row = await this.database(OrganizationJoinRequestsTableName)
            .where('join_request_uuid', joinRequestUuid)
            .first();
        if (!row) {
            throw new NotFoundError('Request to join not found');
        }
        return row;
    }

    async listOpenForOrganization(
        organizationUuid: string,
        now: Date,
    ): Promise<OrganizationJoinRequest[]> {
        const rows = await this.database(OrganizationJoinRequestsTableName)
            .join(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${OrganizationJoinRequestsTableName}.user_uuid`,
            )
            .join(EmailTableName, (join) => {
                join.on(
                    `${EmailTableName}.user_id`,
                    '=',
                    `${UserTableName}.user_id`,
                ).andOnVal(`${EmailTableName}.is_primary`, '=', true);
            })
            .where(
                `${OrganizationJoinRequestsTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(
                `${OrganizationJoinRequestsTableName}.status`,
                OrganizationJoinRequestStatus.PENDING,
            )
            .where(`${OrganizationJoinRequestsTableName}.expires_at`, '>', now)
            .orderBy(`${OrganizationJoinRequestsTableName}.created_at`, 'asc')
            .select<
                (DbOrganizationJoinRequest & {
                    email: string;
                    first_name: string;
                    last_name: string;
                })[]
            >(
                `${OrganizationJoinRequestsTableName}.*`,
                `${EmailTableName}.email`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
            );
        return rows.map((row) => ({
            joinRequestUuid: row.join_request_uuid,
            organizationUuid: row.organization_uuid,
            user: {
                userUuid: row.user_uuid,
                email: row.email,
                firstName: row.first_name,
                lastName: row.last_name,
            },
            createdAt: row.created_at,
            expiresAt: row.expires_at,
        }));
    }

    async decide(
        joinRequestUuid: string,
        status:
            | OrganizationJoinRequestStatus.APPROVED
            | OrganizationJoinRequestStatus.DECLINED,
        decidedByUserUuid: string,
        trx: Knex = this.database,
    ): Promise<void> {
        await trx(OrganizationJoinRequestsTableName)
            .where('join_request_uuid', joinRequestUuid)
            .update({
                status,
                decided_at: new Date(),
                decided_by_user_uuid: decidedByUserUuid,
            });
    }
}
