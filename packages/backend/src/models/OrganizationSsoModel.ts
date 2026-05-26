import {
    AzureAdSsoConfig,
    GenericOidcSsoConfig,
    GoogleSsoConfig,
    OktaSsoConfig,
    OneLoginSsoConfig,
    OrganizationSsoMethodFlags,
    OrganizationSsoProvider,
    UnexpectedServerError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { OrganizationSsoConfigurationsTableName } from '../database/entities/organizationSsoConfigurations';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

type OrganizationSsoModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

type ProviderConfigTypeMap = {
    [OrganizationSsoProvider.AZUREAD]: AzureAdSsoConfig;
    [OrganizationSsoProvider.OKTA]: OktaSsoConfig;
    [OrganizationSsoProvider.GENERIC_OIDC]: GenericOidcSsoConfig;
    [OrganizationSsoProvider.ONELOGIN]: OneLoginSsoConfig;
    [OrganizationSsoProvider.GOOGLE]: GoogleSsoConfig;
};

export type OrganizationSsoMethod<P extends OrganizationSsoProvider> = {
    organizationUuid: string;
    provider: P;
    config: ProviderConfigTypeMap[P];
} & OrganizationSsoMethodFlags;

/**
 * Lightweight projection of a per-org Google policy row. Google has no
 * credentials, so only the flags matter — and unlike the credential
 * providers, we need disabled rows too (an org's `enabled: false` row is the
 * whole point of the feature, but it never surfaces via the enabled-only
 * discovery query).
 */
export type OrganizationGoogleMethod = {
    organizationUuid: string;
    enabled: boolean;
    allowPassword: boolean;
};

const ALLOWED_EMAIL_DOMAINS_TABLE = 'organization_allowed_email_domains';

export class OrganizationSsoModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor(args: OrganizationSsoModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    private encryptConfig(config: object): Buffer {
        return this.encryptionUtil.encrypt(JSON.stringify(config));
    }

    private decryptConfig<P extends OrganizationSsoProvider>(
        buffer: Buffer,
    ): ProviderConfigTypeMap[P] {
        try {
            return JSON.parse(
                this.encryptionUtil.decrypt(buffer),
            ) as ProviderConfigTypeMap[P];
        } catch (e) {
            throw new UnexpectedServerError(
                'Failed to decrypt organization SSO configuration',
            );
        }
    }

    async findMethod<P extends OrganizationSsoProvider>(
        organizationUuid: string,
        provider: P,
    ): Promise<OrganizationSsoMethod<P> | undefined> {
        const row = await this.database(OrganizationSsoConfigurationsTableName)
            .where('organization_uuid', organizationUuid)
            .where('provider', provider)
            .first();
        if (!row) return undefined;
        return {
            organizationUuid: row.organization_uuid,
            provider: row.provider as P,
            config: this.decryptConfig<P>(row.config),
            enabled: row.enabled,
            overrideEmailDomains: row.override_email_domains,
            emailDomains: row.email_domains ?? [],
            allowPassword: row.allow_password,
        };
    }

    /**
     * Restricts a query to rows whose effective whitelist includes the given
     * (already-normalized) domain. The "effective whitelist" is the row's own
     * `email_domains` when `override_email_domains = true`, else the org's
     * `allowed_email_domains` list. Assumes the query has already left-joined
     * {@link ALLOWED_EMAIL_DOMAINS_TABLE}.
     */
    private static emailDomainMatchClause(normalized: string) {
        return (builder: Knex.QueryBuilder) => {
            void builder
                .where((subOverride) => {
                    void subOverride
                        .where(
                            `${OrganizationSsoConfigurationsTableName}.override_email_domains`,
                            true,
                        )
                        .whereRaw(
                            `? = ANY (${OrganizationSsoConfigurationsTableName}.email_domains)`,
                            [normalized],
                        );
                })
                .orWhere((subInherit) => {
                    void subInherit
                        .where(
                            `${OrganizationSsoConfigurationsTableName}.override_email_domains`,
                            false,
                        )
                        .whereRaw(
                            `? = ANY (${ALLOWED_EMAIL_DOMAINS_TABLE}.email_domains)`,
                            [normalized],
                        );
                });
        };
    }

    /**
     * Finds all enabled SSO methods whose effective whitelist includes the
     * email's domain.
     */
    async findEnabledMethodsForEmailDomain(
        emailDomain: string,
    ): Promise<OrganizationSsoMethod<OrganizationSsoProvider>[]> {
        const normalized = emailDomain.toLowerCase();
        const rows = await this.database(OrganizationSsoConfigurationsTableName)
            .leftJoin(
                ALLOWED_EMAIL_DOMAINS_TABLE,
                `${OrganizationSsoConfigurationsTableName}.organization_uuid`,
                `${ALLOWED_EMAIL_DOMAINS_TABLE}.organization_uuid`,
            )
            .where(`${OrganizationSsoConfigurationsTableName}.enabled`, true)
            .andWhere(OrganizationSsoModel.emailDomainMatchClause(normalized))
            .select(`${OrganizationSsoConfigurationsTableName}.*`);

        return rows.map((row) => ({
            organizationUuid: row.organization_uuid,
            provider: row.provider as OrganizationSsoProvider,
            config: this.decryptConfig(row.config),
            enabled: row.enabled,
            overrideEmailDomains: row.override_email_domains,
            emailDomains: row.email_domains ?? [],
            allowPassword: row.allow_password,
        }));
    }

    /**
     * Finds every per-org Google policy row matching the email's domain,
     * including disabled ones. Google is enabled by default (shared instance
     * OAuth app); a row only exists when an org has set an explicit policy, so
     * unlike {@link findEnabledMethodsForEmailDomain} we must NOT filter on
     * `enabled` — a disabled row is exactly what we look for to suppress
     * Google for that org's domains.
     */
    async findGoogleMethodsForEmailDomain(
        emailDomain: string,
    ): Promise<OrganizationGoogleMethod[]> {
        const normalized = emailDomain.toLowerCase();
        const rows = await this.database(OrganizationSsoConfigurationsTableName)
            .leftJoin(
                ALLOWED_EMAIL_DOMAINS_TABLE,
                `${OrganizationSsoConfigurationsTableName}.organization_uuid`,
                `${ALLOWED_EMAIL_DOMAINS_TABLE}.organization_uuid`,
            )
            .where(
                `${OrganizationSsoConfigurationsTableName}.provider`,
                OrganizationSsoProvider.GOOGLE,
            )
            .andWhere(OrganizationSsoModel.emailDomainMatchClause(normalized))
            .select(`${OrganizationSsoConfigurationsTableName}.*`);

        return rows.map((row) => ({
            organizationUuid: row.organization_uuid,
            enabled: row.enabled,
            allowPassword: row.allow_password,
        }));
    }

    async upsert<P extends OrganizationSsoProvider>(
        organizationUuid: string,
        provider: P,
        config: ProviderConfigTypeMap[P],
        flags: Partial<OrganizationSsoMethodFlags>,
        userUuid: string | null,
    ): Promise<void> {
        const encrypted = this.encryptConfig(config);
        const insert = {
            organization_uuid: organizationUuid,
            provider,
            config: encrypted,
            ...(flags.enabled !== undefined ? { enabled: flags.enabled } : {}),
            ...(flags.overrideEmailDomains !== undefined
                ? { override_email_domains: flags.overrideEmailDomains }
                : {}),
            ...(flags.emailDomains !== undefined
                ? {
                      email_domains: flags.emailDomains.map((d) =>
                          d.toLowerCase(),
                      ),
                  }
                : {}),
            ...(flags.allowPassword !== undefined
                ? { allow_password: flags.allowPassword }
                : {}),
            created_by_user_uuid: userUuid,
            updated_by_user_uuid: userUuid,
        };
        await this.database(OrganizationSsoConfigurationsTableName)
            .insert(insert)
            .onConflict(['organization_uuid', 'provider'])
            .merge({
                config: encrypted,
                ...(flags.enabled !== undefined
                    ? { enabled: flags.enabled }
                    : {}),
                ...(flags.overrideEmailDomains !== undefined
                    ? { override_email_domains: flags.overrideEmailDomains }
                    : {}),
                ...(flags.emailDomains !== undefined
                    ? {
                          email_domains: flags.emailDomains.map((d) =>
                              d.toLowerCase(),
                          ),
                      }
                    : {}),
                ...(flags.allowPassword !== undefined
                    ? { allow_password: flags.allowPassword }
                    : {}),
                updated_at: new Date(),
                updated_by_user_uuid: userUuid,
            });
    }

    async delete(
        organizationUuid: string,
        provider: OrganizationSsoProvider,
    ): Promise<void> {
        await this.database(OrganizationSsoConfigurationsTableName)
            .where('organization_uuid', organizationUuid)
            .where('provider', provider)
            .delete();
    }
}
