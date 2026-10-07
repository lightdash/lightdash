import { type OrganizationAgentIdentitySettings } from '@lightdash/common';
import { type Knex } from 'knex';

type DbOrganizationAgentIdentitySettings = {
    organization_uuid: string;
    require_verified_agent_sessions: boolean;
    created_at: Date;
    updated_at: Date;
};

export class OrganizationAgentIdentitySettingsModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async get(
        organizationUuid: string,
    ): Promise<OrganizationAgentIdentitySettings> {
        const row = await this.database<DbOrganizationAgentIdentitySettings>(
            'organization_agent_identity_settings',
        )
            .where('organization_uuid', organizationUuid)
            .first();
        return {
            requireVerifiedAgentSessions:
                row?.require_verified_agent_sessions ?? false,
        };
    }

    async upsert(
        organizationUuid: string,
        settings: OrganizationAgentIdentitySettings,
    ): Promise<OrganizationAgentIdentitySettings> {
        const [row] = await this.database<DbOrganizationAgentIdentitySettings>(
            'organization_agent_identity_settings',
        )
            .insert({
                organization_uuid: organizationUuid,
                require_verified_agent_sessions:
                    settings.requireVerifiedAgentSessions,
            })
            .onConflict('organization_uuid')
            .merge({
                require_verified_agent_sessions:
                    settings.requireVerifiedAgentSessions,
                updated_at: this.database.fn.now(),
            })
            .returning('*');
        return {
            requireVerifiedAgentSessions: row.require_verified_agent_sessions,
        };
    }
}
