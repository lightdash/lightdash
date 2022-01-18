import { OrganizationMemberProfile } from 'common';
import { Knex } from 'knex';
import { DbEmail, EmailTableName } from '../database/entities/emails';
import {
    DbOrganizationMembership,
    DbOrganizationMembershipIn,
    OrganizationMembershipsTableName,
} from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { DbUser, UserTableName } from '../database/entities/users';

type DbOrganizationMemberProfile = DbUser &
    DbOrganizationMembership &
    DbOrganization &
    DbEmail;

export class OrganizationMemberProfileModel {
    private readonly database: Knex;

    private readonly queryBuilder: Knex.QueryBuilder<
        DbOrganizationMemberProfile[]
    >;

    constructor({ database }: { database: Knex }) {
        this.database = database;
        this.queryBuilder = database(OrganizationMembershipsTableName)
            .innerJoin(
                UserTableName,
                `${OrganizationMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .joinRaw(
                `INNER JOIN ${EmailTableName} ON ${UserTableName}.user_id = ${EmailTableName}.user_id AND ${EmailTableName}.is_primary`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationMembershipsTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            );
    }

    private static parseRow(
        member: DbOrganizationMemberProfile,
    ): OrganizationMemberProfile {
        return {
            userUuid: member.user_uuid,
            firstName: member.first_name,
            lastName: member.last_name,
            email: member.email,
            organizationUuid: member.organization_uuid,
            role: member.role,
        };
    }

    async findOrganizationMember(
        organizationUuid: string,
        userUuid: string,
    ): Promise<OrganizationMemberProfile | undefined> {
        const [member] = await this.queryBuilder
            .where('user_uuid', userUuid)
            .andWhere('organization_uuid', organizationUuid)
            .select('*');
        return member && OrganizationMemberProfileModel.parseRow(member);
    }

    async getOrganizationMembers(
        organizationUuid: string,
    ): Promise<OrganizationMemberProfile[]> {
        const members = await this.queryBuilder
            .where('organization_uuid', organizationUuid)
            .select('*');
        return members.map(OrganizationMemberProfileModel.parseRow);
    }

    createOrganizationMembership = async (
        membershipIn: DbOrganizationMembershipIn,
    ) => {
        await this.database<DbOrganizationMembership>(
            'organization_memberships',
        ).insert<DbOrganizationMembershipIn>(membershipIn);
    };
}
