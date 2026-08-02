import { type Knex } from 'knex';
import {
    type PersistentWorkspace,
    type SnapshotRef,
} from '../../services/SandboxRuntime/types';

export const SandboxRegistryTableName = 'sandbox_registry';

export type SandboxRegistryStatus = 'running' | 'suspended';

export type DbSandboxRegistry = {
    sandbox_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    provider: string;
    provider_sandbox_id: string | null;
    status: SandboxRegistryStatus;
    snapshot_ref: SnapshotRef | null;
    workspace: PersistentWorkspace;
    created_at: Date;
    updated_at: Date;
};

export type SandboxRegistryTable = Knex.CompositeTableType<
    DbSandboxRegistry,
    Pick<
        DbSandboxRegistry,
        | 'organization_uuid'
        | 'project_uuid'
        | 'provider'
        | 'provider_sandbox_id'
        | 'status'
        | 'workspace'
    >,
    Partial<
        Pick<
            DbSandboxRegistry,
            'provider_sandbox_id' | 'status' | 'snapshot_ref' | 'updated_at'
        >
    >
>;
