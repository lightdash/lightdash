export type PreflightLockState = {
    isLocked: boolean;
    activeMigrationBackends: number;
};

export type PreflightTableStats = {
    table: string;
    inserts: number;
    updates: number;
    deletes: number;
    liveTuples: number;
};

export type PreflightActivityRow = {
    pid: number;
    userName: string | null;
    applicationName: string | null;
    state: string | null;
    xactAgeSeconds: number | null;
    query: string | null;
    blockedBy: number[];
};

/**
 * One read-only snapshot of the instance database's upgrade-relevant state.
 * Write rates are derived by the consumer from two snapshots — the server
 * stays stateless and the sampling interval stays a client choice.
 */
export type PreflightProbe = {
    serverTime: string;
    /** null when the knex migration lock table does not exist */
    lock: PreflightLockState | null;
    tableStats: PreflightTableStats[];
    activity: PreflightActivityRow[];
};

export type ApiPreflightProbeResponse = {
    status: 'ok';
    results: PreflightProbe;
};
