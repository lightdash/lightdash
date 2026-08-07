export type PreflightLockState = {
    isLocked: boolean;
    /** seconds since the newest completed migration; evidence for judging a held lock */
    lastMigrationAgeSeconds: number | null;
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

/**
 * The plan for one fact's backfill SQL. `plan` is null when this instance's
 * schema cannot run the statement — a gap the caller reports rather than a
 * failure that stops the preflight.
 */
export type PreflightExplain = {
    plan: unknown;
    error: string | null;
};

export type ApiPreflightExplainResponse = {
    status: 'ok';
    results: PreflightExplain;
};
