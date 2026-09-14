import {
    type CreateAthenaCredentials,
    type CreateBigqueryCredentials,
    type CreateClickhouseCredentials,
    type CreateDatabricksCredentials,
    type CreateDuckdbCredentials,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type CreateSnowflakeCredentials,
    type CreateTrinoCredentials,
    type CreateWarehouseCredentialsWithOptionalSecrets,
} from './projects';

export const SSH_TUNNEL_STAGES = [
    'resolve',
    'tcp',
    'handshake',
    'auth',
    'forward',
] as const;

export type SshTunnelStage = (typeof SSH_TUNNEL_STAGES)[number];

export type SshTunnelErrorData = {
    stage: SshTunnelStage;
    sshHost: string;
    sshPort: number;
    sshUser: string;
    cause: string;
};

export const isSshTunnelErrorData = (
    data: unknown,
): data is SshTunnelErrorData =>
    typeof data === 'object' &&
    data !== null &&
    'stage' in data &&
    typeof data.stage === 'string' &&
    (SSH_TUNNEL_STAGES as readonly string[]).includes(data.stage);

export type WarehouseConnectionHopStage = SshTunnelStage | 'database';

export type WarehouseConnectionHopStatus = 'ok' | 'failed' | 'skipped';

export type WarehouseConnectionHop = {
    stage: WarehouseConnectionHopStage;
    status: WarehouseConnectionHopStatus;
    message: string | null;
};

export type WarehouseConnectionTestResults = {
    ok: boolean;
    hops: WarehouseConnectionHop[];
};

export type ApiWarehouseConnectionTestResponse = {
    status: 'ok';
    results: WarehouseConnectionTestResults;
};

export const WAREHOUSE_CONNECTION_HOP_LABELS: Record<
    WarehouseConnectionHopStage,
    string
> = {
    resolve: 'Resolve SSH host',
    tcp: 'Reach SSH port',
    handshake: 'SSH handshake',
    auth: 'Key accepted',
    forward: 'Bastion reaches database',
    database: 'Database login and test query',
};

// The full credential types are spelled out so their schemas stay in the
// request body's union; the optional-secrets type widens it.
export type ApiWarehouseConnectionTestBody = {
    warehouseConnection:
        | CreateRedshiftCredentials
        | CreateBigqueryCredentials
        | CreatePostgresCredentials
        | CreateSnowflakeCredentials
        | CreateDatabricksCredentials
        | CreateTrinoCredentials
        | CreateClickhouseCredentials
        | CreateAthenaCredentials
        | CreateDuckdbCredentials
        | CreateWarehouseCredentialsWithOptionalSecrets;
};
