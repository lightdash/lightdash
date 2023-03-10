import { AllowedEmailDomains } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbOrganizationAllowedEmailDomains,
    OrganizationAllowedEmailDomainsTableName,
} from '../database/entities/organizationsAllowedEmailDomains';

type Dependencies = {
    database: Knex;
};

export class OrganizationAllowedEmailDomainsModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    static mapDbOrganizationAllowedEmailDomainsToOrganizationAllowedEmailDomains(
        dbOrganizationAllowedEmailDomains: DbOrganizationAllowedEmailDomains,
    ): AllowedEmailDomains {
        return {
            organizationUuid:
                dbOrganizationAllowedEmailDomains.organization_uuid,
            emailDomains: dbOrganizationAllowedEmailDomains.email_domains,
            role: dbOrganizationAllowedEmailDomains.role,
            projectUuids: dbOrganizationAllowedEmailDomains.project_uuids,
        };
    }

    async findAllowedEmailDomains(
        orgUuid: string,
    ): Promise<AllowedEmailDomains | undefined> {
        const [row] = await this.database(
            OrganizationAllowedEmailDomainsTableName,
        )
            .where('organization_uuid', orgUuid)
            .select('*');

        if (!row) {
            return undefined;
        }
        return OrganizationAllowedEmailDomainsModel.mapDbOrganizationAllowedEmailDomainsToOrganizationAllowedEmailDomains(
            row,
        );
    }

    async getAllowedEmailDomains(
        orgUuid: string,
    ): Promise<AllowedEmailDomains> {
        const allowedEmailDomains = await this.findAllowedEmailDomains(orgUuid);
        if (!allowedEmailDomains) {
            throw new Error('Allowed email domains not found');
        }
        return allowedEmailDomains;
    }

    async upsertAllowedEmailDomains(
        data: AllowedEmailDomains,
    ): Promise<AllowedEmailDomains> {
        await this.database(OrganizationAllowedEmailDomainsTableName)
            .insert({
                organization_uuid: data.organizationUuid,
                email_domains: data.emailDomains,
                role: data.role,
                project_uuids: data.projectUuids,
            })
            .onConflict('organization_uuid')
            .merge();

        return this.getAllowedEmailDomains(data.organizationUuid);
    }
}
