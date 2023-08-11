import {
    CreateOrganization,
    NotFoundError,
    Organization,
    UpdateOrganization,
    UserAllowedOrganization,
} from '@lightdash/common';
import { Knex } from 'knex';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { OrganizationAllowedEmailDomainsTableName } from '../database/entities/organizationsAllowedEmailDomains';

export class OrganizationModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static mapDBObjectToOrganization(data: DbOrganization): Organization {
        return {
            organizationUuid: data.organization_uuid,
            name: data.organization_name,
            chartColors: data.chart_colors,
            defaultProjectUuid: data.default_project_uuid
                ? data.default_project_uuid
                : undefined,
        };
    }

    async hasOrgs(): Promise<boolean> {
        const orgs = await this.database(OrganizationTableName).select(
            'organization_id',
        );
        return orgs.length > 0;
    }

    async get(organizationUuid: string): Promise<Organization> {
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (org === undefined) {
            throw new NotFoundError(`No organization found`);
        }
        return OrganizationModel.mapDBObjectToOrganization(org);
    }

    async create(data: CreateOrganization): Promise<Organization> {
        const [org] = await this.database(OrganizationTableName)
            .insert({
                organization_name: data.name,
            })
            .returning('*');
        return OrganizationModel.mapDBObjectToOrganization(org);
    }

    async update(
        organizationUuid: string,
        data: UpdateOrganization,
    ): Promise<Organization> {
        // Undefined values are ignored by .update (it DOES NOT set null)
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .update({
                organization_name: data.name,
                chart_colors: data.chartColors,
                default_project_uuid: data.defaultProjectUuid,
            })
            .returning('*');
        return OrganizationModel.mapDBObjectToOrganization(org);
    }

    async deleteOrgAndUsers(
        organizationUuid: string,
        userUuids: string[],
    ): Promise<void> {
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (org === undefined) {
            throw new NotFoundError(`No organization found`);
        }

        await this.database.transaction(async (trx) => {
            await trx('users').delete().whereIn('user_uuid', userUuids);

            await trx(OrganizationTableName)
                .where('organization_uuid', organizationUuid)
                .delete();
        });
    }

    async getAllowedOrgsForDomain(
        domain: string,
    ): Promise<UserAllowedOrganization[]> {
        const rows = await this.database(
            OrganizationAllowedEmailDomainsTableName,
        )
            .whereRaw('? = ANY(email_domains)', domain)
            .select('organization_uuid');

        if (rows.length === 0) {
            return [];
        }

        const membersCountSubQuery = this.database(
            OrganizationMembershipsTableName,
        )
            .count('user_id')
            .where(
                'organization_id',
                this.database.ref(`${OrganizationTableName}.organization_id`),
            );

        const allowedOrgs = await this.database(OrganizationTableName)
            .select('organization_uuid', 'organization_name', {
                members_count: membersCountSubQuery,
            })
            .whereIn(
                'organization_uuid',
                rows.map((r) => r.organization_uuid),
            );

        return allowedOrgs.map((o) => ({
            organizationUuid: o.organization_uuid,
            name: o.organization_name,
            membersCount: o.members_count,
        }));
    }
}
