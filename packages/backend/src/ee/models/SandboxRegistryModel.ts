import { Knex } from 'knex';
import {
    SandboxRegistryTableName,
    type DbSandboxRegistry,
    type SandboxRegistryTable,
} from '../database/entities/sandboxRegistry';
import {
    type SandboxRegistryRecord,
    type SandboxRegistryStore,
} from '../services/SandboxRuntime/SandboxManager';
import {
    type PersistentWorkspace,
    type SnapshotRef,
} from '../services/SandboxRuntime/types';

type Dependencies = {
    database: Knex;
};

/**
 * Knex-backed sandbox registry. Implements {@link SandboxRegistryStore} so the
 * SandboxManager (and the reaper) stay decoupled from the table. jsonb columns
 * are written stringified and read back as parsed objects by node-pg.
 */
export class SandboxRegistryModel implements SandboxRegistryStore {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    private static mapRow(row: DbSandboxRegistry): SandboxRegistryRecord {
        return {
            sandboxUuid: row.sandbox_uuid,
            organizationUuid: row.organization_uuid,
            projectUuid: row.project_uuid,
            providerSandboxId: row.provider_sandbox_id,
            snapshotRef: row.snapshot_ref,
            workspace: row.workspace,
            lastActivityAt: row.last_activity_at,
        };
    }

    async create(input: {
        organizationUuid: string;
        projectUuid: string;
        provider: string;
        providerSandboxId: string;
        workspace: PersistentWorkspace;
    }): Promise<string> {
        const [row] = await this.database<SandboxRegistryTable>(
            SandboxRegistryTableName,
        )
            .insert({
                organization_uuid: input.organizationUuid,
                project_uuid: input.projectUuid,
                provider: input.provider,
                provider_sandbox_id: input.providerSandboxId,
                status: 'running',
                workspace: JSON.stringify(
                    input.workspace,
                ) as unknown as PersistentWorkspace,
            })
            .returning('sandbox_uuid');
        return row.sandbox_uuid;
    }

    async findBySandboxUuid(
        sandboxUuid: string,
    ): Promise<SandboxRegistryRecord | null> {
        const row = await this.database<SandboxRegistryTable>(
            SandboxRegistryTableName,
        )
            .where('sandbox_uuid', sandboxUuid)
            .first();
        return row ? SandboxRegistryModel.mapRow(row) : null;
    }

    async markRunning(
        sandboxUuid: string,
        providerSandboxId: string,
    ): Promise<void> {
        // Untyped builder: DB-managed timestamps are set via knex.fn.now()
        // (Knex.Raw), which the typed Update shape rejects.
        await this.database(SandboxRegistryTableName)
            .where('sandbox_uuid', sandboxUuid)
            .update({
                status: 'running',
                provider_sandbox_id: providerSandboxId,
                last_activity_at: this.database.fn.now(),
                updated_at: this.database.fn.now(),
            });
    }

    async markSuspended(
        sandboxUuid: string,
        input: { snapshotRef: SnapshotRef; providerSandboxId: string | null },
    ): Promise<void> {
        await this.database(SandboxRegistryTableName)
            .where('sandbox_uuid', sandboxUuid)
            .update({
                status: 'suspended',
                provider_sandbox_id: input.providerSandboxId,
                snapshot_ref: JSON.stringify(input.snapshotRef),
                last_activity_at: this.database.fn.now(),
                updated_at: this.database.fn.now(),
            });
    }

    async touch(sandboxUuid: string): Promise<void> {
        await this.database(SandboxRegistryTableName)
            .where('sandbox_uuid', sandboxUuid)
            .update({
                last_activity_at: this.database.fn.now(),
                updated_at: this.database.fn.now(),
            });
    }

    async deleteBySandboxUuid(sandboxUuid: string): Promise<void> {
        await this.database(SandboxRegistryTableName)
            .where('sandbox_uuid', sandboxUuid)
            .delete();
    }

    async findIdleRunning(olderThan: Date): Promise<SandboxRegistryRecord[]> {
        const rows = await this.database<SandboxRegistryTable>(
            SandboxRegistryTableName,
        )
            .where('status', 'running')
            .where('last_activity_at', '<', olderThan);
        return rows.map(SandboxRegistryModel.mapRow);
    }

    async findExpiredSuspended(
        olderThan: Date,
    ): Promise<SandboxRegistryRecord[]> {
        const rows = await this.database<SandboxRegistryTable>(
            SandboxRegistryTableName,
        )
            .where('status', 'suspended')
            .where('last_activity_at', '<', olderThan);
        return rows.map(SandboxRegistryModel.mapRow);
    }
}
