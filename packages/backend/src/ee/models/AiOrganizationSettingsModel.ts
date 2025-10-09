import {
    AiOrganizationSettings,
    CreateAiOrganizationSettings,
    NotFoundError,
    UpdateAiOrganizationSettings,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiOrganizationSettingsTable,
    AiOrganizationSettingsTableName,
    DbAiOrganizationSettings,
} from '../database/entities/ai';

type Dependencies = {
    database: Knex;
};

export class AiOrganizationSettingsModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    // eslint-disable-next-line class-methods-use-this
    private mapDbToEntity(
        db: DbAiOrganizationSettings,
    ): AiOrganizationSettings {
        return {
            organizationUuid: db.organization_uuid,
            aiAgentsVisible: db.ai_agents_visible,
        };
    }

    async findByOrganizationUuid(
        organizationUuid: string,
    ): Promise<AiOrganizationSettings | null> {
        const row = await this.database
            .select<DbAiOrganizationSettings>()
            .from(AiOrganizationSettingsTableName)
            .where('organization_uuid', organizationUuid)
            .first();

        return row ? this.mapDbToEntity(row) : null;
    }

    async getByOrganizationUuid(
        organizationUuid: string,
    ): Promise<AiOrganizationSettings> {
        const settings = await this.findByOrganizationUuid(organizationUuid);
        if (!settings) {
            throw new NotFoundError(
                `AI organization settings not found for organization ${organizationUuid}`,
            );
        }
        return settings;
    }

    async create(
        data: CreateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        const [row] = await this.database<AiOrganizationSettingsTable>(
            AiOrganizationSettingsTableName,
        )
            .insert({
                organization_uuid: data.organizationUuid,
                ai_agents_visible: data.aiAgentsVisible,
            })
            .returning('*');

        return this.mapDbToEntity(row);
    }

    async update(
        organizationUuid: string,
        data: UpdateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        const [row] = await this.database<AiOrganizationSettingsTable>(
            AiOrganizationSettingsTableName,
        )
            .where('organization_uuid', organizationUuid)
            .update({
                ai_agents_visible: data.aiAgentsVisible,
            })
            .returning('*');

        if (!row) {
            throw new NotFoundError(
                `AI organization settings not found for organization ${organizationUuid}`,
            );
        }

        return this.mapDbToEntity(row);
    }

    async upsert(
        organizationUuid: string,
        data: UpdateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        const existing = await this.findByOrganizationUuid(organizationUuid);

        if (existing) {
            return this.update(organizationUuid, data);
        }
        return this.create({
            organizationUuid,
            aiAgentsVisible: data.aiAgentsVisible,
        });
    }

    async delete(organizationUuid: string): Promise<void> {
        await this.database<AiOrganizationSettingsTable>(
            AiOrganizationSettingsTableName,
        )
            .where('organization_uuid', organizationUuid)
            .delete();
    }
}
