import { Knex } from 'knex';

export const OrganizationDomainVerificationsTableName =
    'organization_domain_verifications';

export type DbOrganizationDomainVerification = {
    domain_verification_uuid: string;
    organization_uuid: string;
    domain: string;
    verified_at: Date | null;
    verified_by_user_uuid: string | null;
    passcode: string | null;
    passcode_created_at: Date | null;
    number_of_attempts: number;
    created_at: Date;
    updated_at: Date;
};

export type DbOrganizationDomainVerificationIn = Pick<
    DbOrganizationDomainVerification,
    'organization_uuid' | 'domain'
> &
    Partial<
        Pick<
            DbOrganizationDomainVerification,
            | 'verified_at'
            | 'verified_by_user_uuid'
            | 'passcode'
            | 'passcode_created_at'
            | 'number_of_attempts'
        >
    >;

export type DbOrganizationDomainVerificationUpdate = Partial<
    Pick<
        DbOrganizationDomainVerification,
        | 'verified_at'
        | 'verified_by_user_uuid'
        | 'passcode'
        | 'passcode_created_at'
        | 'number_of_attempts'
        | 'updated_at'
    >
>;

export type OrganizationDomainVerificationsTable = Knex.CompositeTableType<
    DbOrganizationDomainVerification,
    DbOrganizationDomainVerificationIn,
    DbOrganizationDomainVerificationUpdate
>;
