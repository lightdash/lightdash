import {
    NotExistsError,
    NotFoundError,
    Organisation,
    UpdateOrganisation,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';

export class OrganizationModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static mapDBObjectToOrganisation(data: DbOrganization): Organisation {
        return {
            organizationUuid: data.organization_uuid,
            name: data.organization_name,
            allowedEmailDomains: data.allowed_email_domains,
            chartColors: data.chart_colors,
        };
    }

    async hasOrgs(): Promise<boolean> {
        const orgs = await this.database(OrganizationTableName).select(
            'organization_id',
        );
        return orgs.length > 0;
    }

    async get(organizationUuid: string): Promise<Organisation> {
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (org === undefined) {
            throw new NotFoundError(`No organisation found`);
        }
        return OrganizationModel.mapDBObjectToOrganisation(org);
    }

    async update(
        organizationUuid: string,
        data: UpdateOrganisation,
    ): Promise<Organisation> {
        if (!organizationUuid) {
            throw new NotExistsError('Organization not found');
        }
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .update({
                organization_name: data.name,
                allowed_email_domains: JSON.stringify(data.allowedEmailDomains),
                chart_colors: data.chartColors,
            })
            .returning('*');
        return OrganizationModel.mapDBObjectToOrganisation(org);
    }

    async delete(organizationUuid: string): Promise<void> {
        await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .delete();
    }
}
