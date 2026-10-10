import { type AgentWarehouseRestrictionConfirmation } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AgentWarehouseRestrictionConfirmationsTableName,
    type DbAgentWarehouseRestrictionConfirmation,
} from '../database/entities/agentWarehouseRestrictionConfirmations';
import { AgentWarehouseBindingFingerprint } from '../services/AgentPermissionService/agentWarehouseBindingFingerprint';

const toConfirmation = (
    row: DbAgentWarehouseRestrictionConfirmation,
): AgentWarehouseRestrictionConfirmation => ({
    projectUuid: row.project_uuid,
    bindingFingerprint: row.binding_fingerprint,
    confirmedByUserUuid: row.confirmed_by_user_uuid,
    confirmedAt: row.confirmed_at,
});

export class AgentWarehouseRestrictionConfirmationModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async get(
        projectUuid: string,
    ): Promise<AgentWarehouseRestrictionConfirmation | null> {
        const row = await this.database(
            AgentWarehouseRestrictionConfirmationsTableName,
        )
            .where('project_uuid', projectUuid)
            .first();
        return row ? toConfirmation(row) : null;
    }

    async upsert({
        projectUuid,
        bindingFingerprint,
        confirmedByUserUuid,
    }: Omit<
        AgentWarehouseRestrictionConfirmation,
        'confirmedAt'
    >): Promise<AgentWarehouseRestrictionConfirmation> {
        const [row] = await this.database(
            AgentWarehouseRestrictionConfirmationsTableName,
        )
            .insert({
                project_uuid: projectUuid,
                binding_fingerprint: bindingFingerprint,
                confirmed_by_user_uuid: confirmedByUserUuid,
            })
            .onConflict('project_uuid')
            .merge({
                binding_fingerprint: bindingFingerprint,
                confirmed_by_user_uuid: confirmedByUserUuid,
                confirmed_at: this.database.fn.now(),
            })
            .returning('*');
        return toConfirmation(row);
    }

    async delete(projectUuid: string): Promise<void> {
        await this.database(AgentWarehouseRestrictionConfirmationsTableName)
            .where('project_uuid', projectUuid)
            .delete();
    }

    async getCurrentBindingFingerprint(projectUuid: string): Promise<string> {
        return new AgentWarehouseBindingFingerprint({
            database: this.database,
        }).get(projectUuid);
    }
}
