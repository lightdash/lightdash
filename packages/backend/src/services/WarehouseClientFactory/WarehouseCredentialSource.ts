import {
    type AiExecutionPlan,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import type { WarehouseConnectionProject } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import type { ConnectionRouteWithOriginal } from '../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import type { ConnectionContext } from './ConnectionContext';
import type { MaterializedCredentials } from './CredentialResolver';
import type { WarehouseClientRef } from './WarehouseClientFactory';

export type ResolvedWarehouseCredentials = MaterializedCredentials & {
    userWarehouseCredentialsUuid: string | undefined;
    aiPlan?: AiExecutionPlan;
};

export type WarehouseCredentialResolutionContext = Omit<
    ConnectionContext,
    'organizationUuid'
> & {
    organizationUuid: string | null;
};

export type WarehouseCredentialBase = {
    projectUuid: string;
    credentials: CreateWarehouseCredentials;
    organizationUuid: string | null;
    connectionRoute: ConnectionRouteWithOriginal | null;
} & (
    | { kind: 'final'; warehouseConnectionUuid: null }
    | {
          kind: 'original';
          warehouseConnectionUuid: null;
          organizationWarehouseCredentialsUuid: string | null;
      }
    | {
          kind: 'extra';
          warehouseConnectionUuid: string;
          project: WarehouseConnectionProject;
          organizationWarehouseCredentialsUuid: string | null;
      }
);

export interface WarehouseCredentialSource {
    loadBase(
        ref: Extract<WarehouseClientRef, { kind: 'binding' }>,
        context: ConnectionContext,
    ): Promise<WarehouseCredentialBase>;
    finish(
        base: WarehouseCredentialBase,
        context: WarehouseCredentialResolutionContext,
    ): Promise<ResolvedWarehouseCredentials>;
}
