import { NotFoundError, VerifiedDomain } from '@lightdash/common';
import bcrypt from 'bcrypt';
import { Knex } from 'knex';
import {
    DbOrganizationDomainVerification,
    OrganizationDomainVerificationsTableName,
} from '../database/entities/organizationDomainVerifications';

const mapVerifiedDomain = (
    row: DbOrganizationDomainVerification,
): VerifiedDomain => ({
    organizationUuid: row.organization_uuid,
    domain: row.domain,
    // Only verified rows are mapped, so verified_at is non-null.
    verifiedAt: row.verified_at!,
    verifiedByUserUuid: row.verified_by_user_uuid,
});

/**
 * Pending OTP challenge for a domain — the fields needed to confirm a passcode.
 */
type PendingChallenge = {
    passcode: string | null;
    createdAt: Date | null;
    numberOfAttempts: number;
};

export class OrganizationDomainVerificationModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    /** Verified domains owned by an organization. */
    async findVerifiedDomains(
        organizationUuid: string,
    ): Promise<VerifiedDomain[]> {
        const rows = await this.database(
            OrganizationDomainVerificationsTableName,
        )
            .where('organization_uuid', organizationUuid)
            .whereNotNull('verified_at')
            .orderBy('domain');
        return rows.map(mapVerifiedDomain);
    }

    async findByOrgAndDomain(
        organizationUuid: string,
        domain: string,
    ): Promise<DbOrganizationDomainVerification | undefined> {
        return this.database(OrganizationDomainVerificationsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('domain', domain.toLowerCase())
            .first();
    }

    /**
     * The organization that owns a verified domain, if any. Used to enforce
     * global first-verified-wins before issuing a new challenge.
     */
    async findVerifiedDomainOwner(
        domain: string,
    ): Promise<{ organizationUuid: string } | undefined> {
        const row = await this.database(
            OrganizationDomainVerificationsTableName,
        )
            .where('domain', domain.toLowerCase())
            .whereNotNull('verified_at')
            .first('organization_uuid');
        return row ? { organizationUuid: row.organization_uuid } : undefined;
    }

    /**
     * Creates or refreshes a pending OTP challenge for an org+domain. The
     * passcode is bcrypt-hashed before storage and the attempt counter / clock
     * are reset, mirroring {@link EmailModel.createPrimaryEmailOtp}.
     */
    async upsertChallenge({
        organizationUuid,
        domain,
        passcode,
    }: {
        organizationUuid: string;
        domain: string;
        passcode: string;
    }): Promise<{ createdAt: Date; numberOfAttempts: number }> {
        const hashedPasscode = await bcrypt.hash(
            passcode,
            await bcrypt.genSalt(),
        );
        const now = new Date();
        const [row] = await this.database(
            OrganizationDomainVerificationsTableName,
        )
            .insert({
                organization_uuid: organizationUuid,
                domain: domain.toLowerCase(),
                passcode: hashedPasscode,
                passcode_created_at: now,
                number_of_attempts: 0,
            })
            .onConflict(['organization_uuid', 'domain'])
            .merge({
                passcode: hashedPasscode,
                passcode_created_at: now,
                number_of_attempts: 0,
                updated_at: now,
            })
            .returning(['passcode_created_at', 'number_of_attempts']);
        return {
            createdAt: row.passcode_created_at ?? now,
            numberOfAttempts: row.number_of_attempts,
        };
    }

    /**
     * Compares a passcode against the stored hash for an org+domain's pending
     * challenge. Throws {@link NotFoundError} when there is no pending challenge
     * or the passcode does not match (mirrors
     * {@link EmailModel.getPrimaryEmailStatusByUserAndOtp}). On match, returns
     * the challenge clock + attempts so the caller can check expiry/lockout.
     */
    async verifyChallengePasscode({
        organizationUuid,
        domain,
        passcode,
    }: {
        organizationUuid: string;
        domain: string;
        passcode: string;
    }): Promise<{ createdAt: Date; numberOfAttempts: number }> {
        const row = await this.database(
            OrganizationDomainVerificationsTableName,
        )
            .where('organization_uuid', organizationUuid)
            .andWhere('domain', domain.toLowerCase())
            .whereNull('verified_at')
            .first<PendingChallenge | undefined>(
                'passcode',
                this.database.ref('passcode_created_at').as('createdAt'),
                this.database.ref('number_of_attempts').as('numberOfAttempts'),
            );
        const match =
            row !== undefined &&
            row.createdAt !== null &&
            (await bcrypt.compare(passcode, row.passcode ?? ''));
        if (!match || !row || row.createdAt === null) {
            throw new NotFoundError(
                'No matching domain verification challenge',
            );
        }
        return {
            createdAt: row.createdAt,
            numberOfAttempts: row.numberOfAttempts,
        };
    }

    async incrementChallengeAttempts({
        organizationUuid,
        domain,
    }: {
        organizationUuid: string;
        domain: string;
    }): Promise<void> {
        await this.database(OrganizationDomainVerificationsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('domain', domain.toLowerCase())
            .whereNull('verified_at')
            .increment('number_of_attempts', 1);
    }

    /**
     * Marks an existing pending challenge as verified. Relies on the partial
     * unique index `UNIQUE(domain) WHERE verified_at IS NOT NULL` to reject the
     * write if another organization verified the domain first — the caller
     * should translate that DB conflict into a friendly error.
     */
    async markChallengeVerified({
        organizationUuid,
        domain,
        verifiedByUserUuid,
    }: {
        organizationUuid: string;
        domain: string;
        verifiedByUserUuid: string;
    }): Promise<void> {
        await this.database(OrganizationDomainVerificationsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('domain', domain.toLowerCase())
            .update({
                verified_at: new Date(),
                verified_by_user_uuid: verifiedByUserUuid,
                passcode: null,
                passcode_created_at: null,
                updated_at: new Date(),
            });
    }

    async deleteVerification({
        organizationUuid,
        domain,
    }: {
        organizationUuid: string;
        domain: string;
    }): Promise<void> {
        await this.database(OrganizationDomainVerificationsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('domain', domain.toLowerCase())
            .delete();
    }
}
