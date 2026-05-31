import type { SessionUser, WarehouseTypes } from '@lightdash/common';
import type { AiWritebackFailureStage } from '../../../analytics/LightdashAnalytics';
import type { DbAiWritebackThread } from '../../database/entities/ai';

/**
 * The canonical warehouse keys we ship a skill file for. Several
 * `WarehouseTypes` map onto one key (e.g. `athena` → `trino`); warehouses with
 * no dedicated file (`clickhouse`, `duckdb`) resolve to `null` and the agent
 * gets `shared.md` only. Matches the filenames under `skills/warehouses/`.
 */
export type WarehouseSkillKey =
    | 'bigquery'
    | 'snowflake'
    | 'postgres'
    | 'redshift'
    | 'databricks'
    | 'trino';

export type GithubConnection = {
    owner: string;
    repo: string;
    projectSubPath: string;
};

export type GithubInstallation = {
    installationId: string;
    token: string;
};

export type SetStage = (stage: AiWritebackFailureStage) => void;

export type TurnContext = {
    organizationUuid: string;
    projectName: string;
    githubConnection: GithubConnection;
    existingRow: DbAiWritebackThread | null;
    isResume: boolean;
    /**
     * The project's warehouse dialect, used to pick the warehouse skill file
     * and stamped on every `ai_writeback.run.*` event for failure-rate-by-
     * warehouse slicing. `null` when the project has no warehouse connection.
     */
    warehouseType: WarehouseTypes | null;
};

export type AppliedChanges = {
    prUrl: string | null;
    prCreated: boolean;
    pauseOnExit: boolean;
};

export type AiWritebackSource =
    | 'slack'
    | 'web'
    | 'mcp'
    | 'api'
    | 'admin_review';

export type AiWritebackRunArgs = {
    user: SessionUser;
    projectUuid: string;
    prompt: string;
    aiThreadUuid?: string;
    /**
     * Identifies the trigger surface so logs, metrics, and analytics can
     * group runs by where they originated. Required so adding new triggers
     * is a type-system change rather than a silent fallthrough.
     */
    source: AiWritebackSource;
    /**
     * Fired with a short, user-facing progress message each time the run
     * advances through a meaningful phase (e.g. "Starting sandbox",
     * "Discovering models"). Fire-and-forget — the callback should not throw
     * and the service does not await it. Used by callers that surface
     * progress live (the Slack agent updates its "Thinking…" message).
     */
    onProgress?: (message: string) => void;
};
