import { type CreateWarehouseCredentials } from './projects';

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

export type ApiWarehouseConnectionTestBody = {
    warehouseConnection: CreateWarehouseCredentials;
};
