import { Knex } from 'knex';
import {
    DbOrganizationEmailDomain,
    DbOrganizationEmailDomainUpdate,
    OrganizationEmailDomainsTableName,
} from '../database/entities/organizationEmailDomains';

/**
 * Persistence for per-organization email sender domains (cloud-only email
 * whitelabelling). One row per organization.
 */
export class OrganizationEmailDomainModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async findByOrganization(
        organizationUuid: string,
    ): Promise<DbOrganizationEmailDomain | undefined> {
        return this.database(OrganizationEmailDomainsTableName)
            .where('organization_uuid', organizationUuid)
            .first();
    }

    /**
     * The sending identity to use for an organization's emails, or undefined
     * when the org has no verified + enabled domain. Used on the send path.
     */
    async findEnabledByOrganization(
        organizationUuid: string,
    ): Promise<DbOrganizationEmailDomain | undefined> {
        return this.database(OrganizationEmailDomainsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('is_enabled', true)
            .andWhere('dkim_verified', true)
            .andWhere('return_path_verified', true)
            .first();
    }

    /**
     * Domains still awaiting verification whose challenge started on or after
     * `startedAfter` (poller ignores stale/timed-out rows).
     */
    async findPendingForPolling(
        startedAfter: Date,
    ): Promise<DbOrganizationEmailDomain[]> {
        return this.database(OrganizationEmailDomainsTableName)
            .where((builder) => {
                void builder
                    .where('dkim_verified', false)
                    .orWhere('return_path_verified', false);
            })
            .whereNotNull('verification_started_at')
            .andWhere('verification_started_at', '>=', startedAfter);
    }

    /**
     * Creates or replaces the org's sending domain, resetting verification
     * state (a new domain always starts unverified and disabled).
     */
    async upsert(row: {
        organizationUuid: string;
        domain: string;
        fromEmail: string;
        fromName: string | null;
        postmarkDomainId: number;
        dkimHost: string | null;
        dkimValue: string | null;
        dkimVerified: boolean;
        returnPathHost: string | null;
        returnPathValue: string | null;
        returnPathVerified: boolean;
    }): Promise<DbOrganizationEmailDomain> {
        const now = new Date();
        const [inserted] = await this.database(
            OrganizationEmailDomainsTableName,
        )
            .insert({
                organization_uuid: row.organizationUuid,
                domain: row.domain,
                from_email: row.fromEmail,
                from_name: row.fromName,
                postmark_domain_id: row.postmarkDomainId,
                dkim_host: row.dkimHost,
                dkim_value: row.dkimValue,
                dkim_verified: row.dkimVerified,
                return_path_host: row.returnPathHost,
                return_path_value: row.returnPathValue,
                return_path_verified: row.returnPathVerified,
                is_enabled: false,
                verification_started_at: now,
                last_checked_at: now,
            })
            .onConflict('organization_uuid')
            .merge({
                domain: row.domain,
                from_email: row.fromEmail,
                from_name: row.fromName,
                postmark_domain_id: row.postmarkDomainId,
                dkim_host: row.dkimHost,
                dkim_value: row.dkimValue,
                dkim_verified: row.dkimVerified,
                return_path_host: row.returnPathHost,
                return_path_value: row.returnPathValue,
                return_path_verified: row.returnPathVerified,
                is_enabled: false,
                verification_started_at: now,
                last_checked_at: now,
                updated_at: now,
            })
            .returning('*');
        return inserted;
    }

    async update(
        organizationUuid: string,
        update: DbOrganizationEmailDomainUpdate,
    ): Promise<DbOrganizationEmailDomain> {
        const [updated] = await this.database(OrganizationEmailDomainsTableName)
            .where('organization_uuid', organizationUuid)
            .update({ ...update, updated_at: new Date() })
            .returning('*');
        return updated;
    }

    async delete(organizationUuid: string): Promise<void> {
        await this.database(OrganizationEmailDomainsTableName)
            .where('organization_uuid', organizationUuid)
            .delete();
    }
}
