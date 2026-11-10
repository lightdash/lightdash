import { Knex } from 'knex';

type DbAwsWebIdentityAudience = {
    audience: string;
    organization_uuid: string;
    created_by_user_uuid: string | null;
    created_at: Date;
};

export const AwsWebIdentityAudiencesTableName = 'aws_web_identity_audiences';
export type AwsWebIdentityAudiencesTable = Knex.CompositeTableType<
    DbAwsWebIdentityAudience,
    Omit<DbAwsWebIdentityAudience, 'created_at'>
>;
