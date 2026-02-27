import { Knex } from 'knex';

export const ContentVerificationTableName = 'content_verification';

export type DbContentVerification = {
    content_verification_uuid: string;
    content_type: string;
    content_uuid: string;
    project_uuid: string;
    verified_by_user_uuid: string;
    verified_at: Date;
};

export type CreateDbContentVerification = Pick<
    DbContentVerification,
    | 'content_type'
    | 'content_uuid'
    | 'project_uuid'
    | 'verified_by_user_uuid'
>;

export type ContentVerificationTable = Knex.CompositeTableType<
    DbContentVerification,
    CreateDbContentVerification
>;
