import { randomBytes } from 'crypto';
import { Knex } from 'knex';
import { AwsWebIdentityAudiencesTableName } from '../database/entities/awsWebIdentityAudiences';

export class AwsWebIdentityAudienceModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async create(
        organizationUuid: string,
        createdByUserUuid: string | null,
    ): Promise<string> {
        const audience = `lightdash-${randomBytes(16).toString('hex')}`;
        await this.database(AwsWebIdentityAudiencesTableName).insert({
            audience,
            organization_uuid: organizationUuid,
            created_by_user_uuid: createdByUserUuid,
        });
        return audience;
    }

    async getOrganizationUuid(audience: string): Promise<string | null> {
        const row = await this.database(AwsWebIdentityAudiencesTableName)
            .select('organization_uuid')
            .where({ audience })
            .first();
        return row?.organization_uuid ?? null;
    }
}
