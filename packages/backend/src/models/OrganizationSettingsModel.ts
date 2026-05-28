import {
    OrganizationSettings,
    UpdateOrganizationSettings,
} from '@lightdash/common';
import { Knex } from 'knex';
import isUndefined from 'lodash/isUndefined';
import omitBy from 'lodash/omitBy';
import {
    DbOrganizationSettingsColumns,
    OrganizationSettingsTableName,
} from '../database/entities/organizationSettings';

/**
 * Every settings column, each optionally provided. Used to build the upsert in
 * `update` — because all keys are required, adding a field to
 * `OrganizationSettings`/`DbOrganizationSettings` makes the object literal
 * below fail to compile until you map it. (`get` is likewise forced to read it
 * by returning the full `OrganizationSettings` shape.)
 */
type SettingsColumnPatch = {
    [K in keyof DbOrganizationSettingsColumns]:
        | DbOrganizationSettingsColumns[K]
        | undefined;
};

export class OrganizationSettingsModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    /**
     * Returns the org's raw stored overrides — `null` for anything not set (no
     * row, or a NULL column), which the resolver treats as "inherit the
     * instance default". The model is env-agnostic; resolving the fallback is
     * the caller's job.
     */
    async get(organizationUuid: string): Promise<OrganizationSettings> {
        const row = await this.database(OrganizationSettingsTableName)
            .where('organization_uuid', organizationUuid)
            .first();
        return {
            oidcLinkingEnabled: row?.oidc_linking_enabled ?? null,
            oidcToEmailLinkingEnabled:
                row?.oidc_to_email_linking_enabled ?? null,
            supportImpersonationEnabled:
                row?.support_impersonation_enabled ?? null,
        };
    }

    /**
     * Upserts only the settings present in `patch` (undefined entries are
     * dropped, so omitted settings keep their stored value). Returns the new
     * raw state.
     */
    async update(
        organizationUuid: string,
        patch: UpdateOrganizationSettings,
    ): Promise<OrganizationSettings> {
        const columns: SettingsColumnPatch = {
            oidc_linking_enabled: patch.oidcLinkingEnabled,
            oidc_to_email_linking_enabled: patch.oidcToEmailLinkingEnabled,
            support_impersonation_enabled: patch.supportImpersonationEnabled,
        };
        const toWrite = omitBy(
            columns,
            isUndefined,
        ) as Partial<DbOrganizationSettingsColumns>;

        await this.database(OrganizationSettingsTableName)
            .insert({ organization_uuid: organizationUuid, ...toWrite })
            .onConflict('organization_uuid')
            .merge({ ...toWrite, updated_at: new Date() });
        return this.get(organizationUuid);
    }
}
