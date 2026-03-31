import { AllowedDomain, NotFoundError } from '@lightdash/common';
import { Knex } from 'knex';
import {
    OrganizationAllowedDomainsTableName,
} from '../../database/entities/organizationAllowedDomains';
import { OrganizationTableName } from '../../database/entities/organizations';

type Dependencies = {
    database: Knex;
};

export class OrganizationAllowedDomainsModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    private organizationIdSubquery(organizationUuid: string) {
        return this.database(OrganizationTableName)
            .select('organization_id')
            .where('organization_uuid', organizationUuid)
            .first();
    }

    async getAllByOrganizationUuid(
        organizationUuid: string,
    ): Promise<AllowedDomain[]> {
        const rows = await this.database(OrganizationAllowedDomainsTableName)
            .where(
                'organization_id',
                this.organizationIdSubquery(organizationUuid),
            )
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
        organizationUuid: string,
        domain: string,
        type: 'sdk' | 'embed',
        createdByUserUuid: string,
    ): Promise<AllowedDomain> {
        const [row] = await this.database(OrganizationAllowedDomainsTableName)
            .insert({
                organization_id: this.organizationIdSubquery(organizationUuid),
                domain,
                type,
                created_by_user_uuid: createdByUserUuid,
            })
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
        organizationUuid: string,
        domainUuid: string,
    ): Promise<void> {
        const deleted = await this.database(
            OrganizationAllowedDomainsTableName,
        )
            .where(
                'organization_id',
                this.organizationIdSubquery(organizationUuid),
            )
            .where('organization_allowed_domain_uuid', domainUuid)
            .delete();

        if (deleted === 0) {
            throw new NotFoundError('Allowed domain not found');
        }
    }
}
