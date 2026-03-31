import {
    AllowedDomain,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    CreateDbOrganizationAllowedDomain,
    OrganizationAllowedDomainsTableName,
} from '../../database/entities/organizationAllowedDomains';

type Dependencies = {
    database: Knex;
};

export class OrganizationAllowedDomainsModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async getAllByOrganizationId(
        organizationId: number,
    ): Promise<AllowedDomain[]> {
        const rows = await this.database(OrganizationAllowedDomainsTableName)
            .where('organization_id', organizationId)
            .orderBy('created_at', 'asc');

        return rows.map((row) => ({
            organizationAllowedDomainUuid:
                row.organization_allowed_domain_uuid,
            domain: row.domain,
            type: row.type,
            createdAt: row.created_at,
            createdByUserUuid: row.created_by_user_uuid,
        }));
    }

    async getAllDomains(): Promise<AllowedDomain[]> {
        const rows = await this.database(OrganizationAllowedDomainsTableName)
            .orderBy('created_at', 'asc');

        return rows.map((row) => ({
            organizationAllowedDomainUuid:
                row.organization_allowed_domain_uuid,
            domain: row.domain,
            type: row.type,
            createdAt: row.created_at,
            createdByUserUuid: row.created_by_user_uuid,
        }));
    }

    async create(
        data: CreateDbOrganizationAllowedDomain,
    ): Promise<AllowedDomain> {
        const [row] = await this.database(OrganizationAllowedDomainsTableName)
            .insert(data)
            .returning('*');

        return {
            organizationAllowedDomainUuid:
                row.organization_allowed_domain_uuid,
            domain: row.domain,
            type: row.type,
            createdAt: row.created_at,
            createdByUserUuid: row.created_by_user_uuid,
        };
    }

    async delete(
        organizationId: number,
        domainUuid: string,
    ): Promise<void> {
        const deleted = await this.database(
            OrganizationAllowedDomainsTableName,
        )
            .where('organization_id', organizationId)
            .where('organization_allowed_domain_uuid', domainUuid)
            .delete();

        if (deleted === 0) {
            throw new NotFoundError('Allowed domain not found');
        }
    }
}
