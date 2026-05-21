/**
 * Whitelist of destination identifiers accepted by the scheduler-runs query
 * params (`?destinations=email,slack,...`). Shared between the v1
 * project-scoped controller and the v2 resource-scoped controllers.
 */
export const VALID_SCHEDULER_RUN_DESTINATIONS = [
    'email',
    'slack',
    'msteams',
    'gsheets',
    'googlechat',
] as const;
