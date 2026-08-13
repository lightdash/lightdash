export type UpgradeFailureClass =
    | 'preflight_blocked'
    | 'migration_state_invalid'
    | 'lease_lost'
    | 'lock_timeout'
    | 'db_unreachable'
    | 'constraint_violation'
    | 'permission_denied'
    | 'resource_exhausted'
    | 'graphile_worker_failed'
    | 'timeout_exceeded'
    | 'migration_defect'
    | 'unclassified';

export type UpgradeEventName =
    | 'upgrade_started'
    | 'upgrade_completed'
    | 'upgrade_failed'
    | 'migration_lock_takeover'
    | 'preflight_blocked';

export type UpgradeEventProperties = {
    migration_run_uuid: string | null;
    to_version: string;
    from_version: string | null;
    span_migrations: number | null;
    execution_mode: string;
    duration_seconds: number | null;
    attempt: number | null;
    outcome: 'succeeded' | 'parked' | 'retrying' | null;
    failure_class: UpgradeFailureClass | null;
    failing_migration: string | null;
    preceded_by_unlock: boolean | null;
    preceding_unlock_forced: boolean | null;
    preflight_decision: string | null;
    preflight_red: number | null;
    preflight_yellow: number | null;
    preflight_blocked_checks: string[] | null;
};

export type UpgradeTelemetryEvent = {
    event: UpgradeEventName;
    properties: UpgradeEventProperties;
};
