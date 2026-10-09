import {
    WarehouseTypes,
    type AiIdentitySource,
    type OrganizationAgentIdentitySettings,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { OrganizationTableName } from '../database/entities/organizations';
import { type OrganizationAgentIdentityRulesModel } from './OrganizationAgentIdentityRulesModel';

type DbOrganizationAgentIdentitySettings = {
    organization_uuid: string;
    require_verified_agent_sessions: boolean;
    created_at: Date;
    updated_at: Date;
};

export class OrganizationAgentIdentitySettingsModel {
    private readonly database: Knex;

    private readonly rulesModel: OrganizationAgentIdentityRulesModel;

    constructor({
        database,
        rulesModel,
    }: {
        database: Knex;
        rulesModel: OrganizationAgentIdentityRulesModel;
    }) {
        this.database = database;
        this.rulesModel = rulesModel;
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
    ): Promise<{
        settings: OrganizationAgentIdentitySettings;
        previousSource: AiIdentitySource;
        changed: boolean;
    }> {
        return this.database.transaction(async (transaction) => {
            await transaction(OrganizationTableName)
                .where('organization_uuid', organizationUuid)
                .select('organization_uuid')
                .forUpdate()
                .first();
            const { previousSource, changed } = await this.rulesModel.set(
                organizationUuid,
                WarehouseTypes.SNOWFLAKE,
                {
                    source: settings.requireVerifiedAgentSessions
                        ? 'agent_sign_in'
                        : 'marked_person',
                },
                transaction,
            );
            return {
                settings: {
                    requireVerifiedAgentSessions:
                        settings.requireVerifiedAgentSessions,
                },
                changed,
                previousSource,
            };
        });
    }
}
