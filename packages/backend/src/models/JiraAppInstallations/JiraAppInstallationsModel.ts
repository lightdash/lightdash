import {
    NotFoundError,
    UnexpectedServerError,
    type JiraInstallation,
    type JiraSite,
    type LightdashUserWithOrg, // pragma: allowlist secret
} from '@lightdash/common'; // pragma: allowlist secret
import { type Knex } from 'knex';
import { JiraAppInstallationTableName } from '../../database/entities/jiraAppInstallation';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

type Arguments = { database: Knex; encryptionUtil: EncryptionUtil };

export type JiraAuth = {
    clientId: string;
    clientSecret: string;
    token: string;
    refreshToken: string | null;
    expiresAt: Date;
    site: JiraSite | null;
};

export class JiraAppInstallationsModel {
    readonly database: Knex;

    readonly encryptionUtil: EncryptionUtil;

    constructor(args: Arguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    async transaction<T>(run: (trx: Knex.Transaction) => Promise<T>) {
        return this.database.transaction(run);
    }

    private decrypt(value: Buffer, label: string): string {
        try {
            return this.encryptionUtil.decrypt(value);
        } catch {
            throw new UnexpectedServerError(`Failed to decrypt Jira ${label}`);
        }
    }

    async findInstallation(
        organizationUuid: string,
    ): Promise<JiraInstallation | undefined> {
        const row = await this.database(JiraAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .first();
        if (!row) return undefined;
        return {
            organizationUuid: row.organization_uuid,
            clientId: row.oauth_client_id,
            siteId: row.jira_site_id,
            siteName: row.jira_site_name,
            siteUrl: row.jira_site_url,
            requiresSiteSelection: row.jira_site_id === null,
        };
    }

    async getInstallation(organizationUuid: string): Promise<JiraInstallation> {
        const installation = await this.findInstallation(organizationUuid);
        if (!installation)
            throw new NotFoundError('Jira installation not found');
        return installation;
    }

    async upsertInstallation(
        user: LightdashUserWithOrg, // pragma: allowlist secret
        args: {
            clientId: string;
            clientSecret: string;
            token: string;
            refreshToken: string | null;
            expiresAt: Date;
            site: JiraSite | null;
        },
        database: Knex = this.database,
    ): Promise<void> {
        const credentials = {
            oauth_client_id: args.clientId,
            encrypted_oauth_client_secret: this.encryptionUtil.encrypt(
                args.clientSecret,
            ),
        };
        await database(JiraAppInstallationTableName)
            .insert({
                organization_uuid: user.organizationUuid,
                ...credentials,
                encrypted_access_token: this.encryptionUtil.encrypt(args.token),
                encrypted_refresh_token: args.refreshToken
                    ? this.encryptionUtil.encrypt(args.refreshToken)
                    : null,
                token_expires_at: args.expiresAt,
                jira_site_id: args.site?.id ?? null,
                jira_site_name: args.site?.name ?? null,
                jira_site_url: args.site?.url ?? null,
                created_by_user_uuid: user.userUuid,
                updated_by_user_uuid: user.userUuid,
            })
            .onConflict('organization_uuid')
            .merge({
                ...credentials,
                encrypted_access_token: this.encryptionUtil.encrypt(args.token),
                encrypted_refresh_token: args.refreshToken
                    ? this.encryptionUtil.encrypt(args.refreshToken)
                    : null,
                token_expires_at: args.expiresAt,
                jira_site_id: args.site?.id ?? null,
                jira_site_name: args.site?.name ?? null,
                jira_site_url: args.site?.url ?? null,
                updated_by_user_uuid: user.userUuid,
                updated_at: new Date(),
            });
    }

    async setSite(
        organizationUuid: string,
        site: JiraSite,
        database: Knex = this.database,
    ): Promise<void> {
        await database(JiraAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .update({
                jira_site_id: site.id,
                jira_site_name: site.name,
                jira_site_url: site.url,
                updated_at: new Date(),
            });
    }

    async getAuth(organizationUuid: string): Promise<JiraAuth> {
        const row = await this.database(JiraAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .first();
        if (!row) {
            throw new NotFoundError(
                `Unable to find Jira authentication for organization ${organizationUuid}`,
            );
        }
        return {
            clientId: row.oauth_client_id,
            clientSecret: this.decrypt(
                row.encrypted_oauth_client_secret,
                'client secret',
            ),
            token: this.decrypt(row.encrypted_access_token, 'access token'),
            refreshToken: row.encrypted_refresh_token
                ? this.decrypt(row.encrypted_refresh_token, 'refresh token')
                : null,
            expiresAt: row.token_expires_at,
            site:
                row.jira_site_id && row.jira_site_name && row.jira_site_url
                    ? {
                          id: row.jira_site_id,
                          name: row.jira_site_name,
                          url: row.jira_site_url,
                      }
                    : null,
        };
    }

    async updateAuth(
        organizationUuid: string,
        args: Pick<JiraAuth, 'token' | 'refreshToken' | 'expiresAt'>,
    ): Promise<void> {
        await this.database(JiraAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .update({
                encrypted_access_token: this.encryptionUtil.encrypt(args.token),
                encrypted_refresh_token: args.refreshToken
                    ? this.encryptionUtil.encrypt(args.refreshToken)
                    : null,
                token_expires_at: args.expiresAt,
                updated_at: new Date(),
            });
    }

    async deleteInstallation(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<void> {
        await database(JiraAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .delete();
    }
}
