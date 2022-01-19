import { Knex } from 'knex';
import { OrganizationTableName } from '../database/entities/organizations';
import { NotExistsError } from '../errors';

export class OrganizationModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    async hasOrgs(): Promise<boolean> {
        const orgs = await this.database(OrganizationTableName).select(
            'organization_id',
        );
        return orgs.length > 0;
    }

    async update(
        organizationUuid: string,
        data: { organizationName: string },
    ): Promise<void> {
        if (!organizationUuid) {
            throw new NotExistsError('Organization not found');
        }
        await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .update({
                organization_name: data.organizationName,
            });
    }
}
