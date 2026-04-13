# Managed Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an EE self-improving project health agent powered by Claude Managed Agents that monitors stale content, broken content, preview projects, creates charts via content-as-code, and surfaces insights — all reversible, with a full activity feed.

**Architecture:** Graphile Worker cron fires per-project heartbeats. Each heartbeat creates a stateless Managed Agent session that follows a structured checklist using MCP tools (reads) and custom tools (writes). All actions are logged to `managed_agent_actions` for the activity feed and reversibility. The action log serves as agent memory across sessions.

**Tech Stack:** `@anthropic-ai/sdk` (Managed Agents beta), Knex migrations, TSOA controllers, Graphile Worker, existing Lightdash MCP server, CoderService for chart-as-code.

**Design Spec:** `docs/superpowers/specs/2026-04-13-managed-agent-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/common/src/ee/types/managedAgent.ts` | Shared types: action types enum, settings type, action type, API request/response types |
| `packages/backend/src/ee/database/entities/managedAgent.ts` | DB entity types and table name constants |
| `packages/backend/src/database/migrations/YYYYMMDD_create_managed_agent_tables.ts` | Migration: `managed_agent_settings` + `managed_agent_actions` |
| `packages/backend/src/ee/models/ManagedAgentModel.ts` | DB access: settings CRUD, action log writes/reads/reversal |
| `packages/backend/src/ee/clients/ManagedAgentClient.ts` | Anthropic SDK wrapper: agent/env creation, session management, event streaming with custom tool dispatch |
| `packages/backend/src/ee/services/ManagedAgentService/ManagedAgentService.ts` | Orchestrator: settings management, heartbeat execution, tool handlers, reversal logic |
| `packages/backend/src/ee/services/ManagedAgentService/managedAgentTools.ts` | Custom tool definitions (JSON schemas) and system prompt |
| `packages/backend/src/ee/controllers/managedAgentController.ts` | TSOA controller: settings + actions + reverse endpoints |

### Modified Files

| File | Change |
|------|--------|
| `packages/common/src/ee/index.ts` | Re-export managed agent types |
| `packages/common/src/types/schedulerTaskList.ts` | Already done (PoC): `MANAGED_AGENT_HEARTBEAT` task |
| `packages/backend/src/config/parseConfig.ts` | Already done (PoC): `managedAgent` config section |
| `packages/backend/src/config/lightdashConfig.mock.ts` | Already done (PoC): mock config |
| `packages/backend/src/ee/scheduler/SchedulerWorker.ts` | Add `MANAGED_AGENT_HEARTBEAT` to `CommercialSchedulerWorker.getFullTaskList()` |
| `packages/backend/src/ee/index.ts` | Register model provider + service provider for managed agent |
| `packages/backend/src/scheduler/SchedulerWorker.ts` | Move cron registration to EE (conditional on config) |

### Files to Remove

| File | Reason |
|------|--------|
| `packages/backend/src/clients/ManagedAgentClient.ts` | PoC file — replaced by EE version |

---

## Task 1: Shared Types

**Files:**
- Create: `packages/common/src/ee/types/managedAgent.ts`
- Modify: `packages/common/src/ee/index.ts`

- [ ] **Step 1: Create the shared types file**

```typescript
// packages/common/src/ee/types/managedAgent.ts

export enum ManagedAgentActionType {
    FLAGGED_STALE = 'flagged_stale',
    SOFT_DELETED = 'soft_deleted',
    FLAGGED_BROKEN = 'flagged_broken',
    CREATED_CONTENT = 'created_content',
    INSIGHT = 'insight',
}

export enum ManagedAgentTargetType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SPACE = 'space',
    PROJECT = 'project',
}

export type ManagedAgentSettings = {
    projectUuid: string;
    enabled: boolean;
    scheduleCron: string;
    enabledByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type ManagedAgentAction = {
    actionUuid: string;
    projectUuid: string;
    sessionId: string;
    actionType: ManagedAgentActionType;
    targetType: ManagedAgentTargetType;
    targetUuid: string;
    targetName: string;
    description: string;
    metadata: Record<string, unknown>;
    reversedAt: Date | null;
    reversedByUserUuid: string | null;
    createdAt: Date;
};

export type UpdateManagedAgentSettings = {
    enabled?: boolean;
    scheduleCron?: string;
};

export type CreateManagedAgentAction = {
    projectUuid: string;
    sessionId: string;
    actionType: ManagedAgentActionType;
    targetType: ManagedAgentTargetType;
    targetUuid: string;
    targetName: string;
    description: string;
    metadata: Record<string, unknown>;
};

export type ManagedAgentActionFilters = {
    date?: string;          // ISO date string for calendar day view
    actionType?: ManagedAgentActionType;
    sessionId?: string;
};
```

- [ ] **Step 2: Re-export from common/ee index**

Add to `packages/common/src/ee/index.ts`:

```typescript
export * from './types/managedAgent';
```

- [ ] **Step 3: Build common and verify**

Run: `pnpm -F common build`
Expected: Success, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/common/src/ee/types/managedAgent.ts packages/common/src/ee/index.ts
git commit -m "feat(ee): add shared types for managed agent"
```

---

## Task 2: Database Entities and Migration

**Files:**
- Create: `packages/backend/src/ee/database/entities/managedAgent.ts`
- Create: `packages/backend/src/database/migrations/YYYYMMDD_create_managed_agent_tables.ts`

- [ ] **Step 1: Create the entity file**

```typescript
// packages/backend/src/ee/database/entities/managedAgent.ts
import { type Knex } from 'knex';

export const ManagedAgentSettingsTableName = 'managed_agent_settings';
export const ManagedAgentActionsTableName = 'managed_agent_actions';

export type DbManagedAgentSettings = {
    project_uuid: string;
    enabled: boolean;
    schedule_cron: string;
    enabled_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DbManagedAgentSettingsCreate = Pick<
    DbManagedAgentSettings,
    'project_uuid'
> &
    Partial<Pick<DbManagedAgentSettings, 'enabled' | 'schedule_cron' | 'enabled_by_user_uuid'>>;

export type DbManagedAgentSettingsUpdate = Partial<
    Pick<DbManagedAgentSettings, 'enabled' | 'schedule_cron' | 'enabled_by_user_uuid' | 'updated_at'>
>;

export type ManagedAgentSettingsTable = Knex.CompositeTableType<
    DbManagedAgentSettings,
    DbManagedAgentSettingsCreate,
    DbManagedAgentSettingsUpdate
>;

export type DbManagedAgentAction = {
    action_uuid: string;
    project_uuid: string;
    session_id: string;
    action_type: string;
    target_type: string;
    target_uuid: string;
    target_name: string;
    description: string;
    metadata: Record<string, unknown>;
    reversed_at: Date | null;
    reversed_by_user_uuid: string | null;
    created_at: Date;
};

export type DbManagedAgentActionCreate = Omit<
    DbManagedAgentAction,
    'action_uuid' | 'reversed_at' | 'reversed_by_user_uuid' | 'created_at'
>;

export type ManagedAgentActionsTable = Knex.CompositeTableType<
    DbManagedAgentAction,
    DbManagedAgentActionCreate
>;
```

- [ ] **Step 2: Create the migration**

Run: `pnpm -F backend create-migration create_managed_agent_tables`

Then replace the generated file contents with:

```typescript
import { type Knex } from 'knex';
import {
    ManagedAgentActionsTableName,
    ManagedAgentSettingsTableName,
} from '../ee/database/entities/managedAgent';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.createTable(ManagedAgentSettingsTableName, (table) => {
        table
            .uuid('project_uuid')
            .primary()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.boolean('enabled').notNullable().defaultTo(false);
        table.text('schedule_cron').notNullable().defaultTo('*/30 * * * *');
        table
            .uuid('enabled_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.schema.createTable(ManagedAgentActionsTableName, (table) => {
        table
            .uuid('action_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.text('session_id').notNullable();
        table.text('action_type').notNullable();
        table.text('target_type').notNullable();
        table.uuid('target_uuid').notNullable();
        table.text('target_name').notNullable();
        table.text('description').notNullable();
        table.jsonb('metadata').notNullable().defaultTo('{}');
        table.timestamp('reversed_at', { useTz: false }).nullable();
        table
            .uuid('reversed_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    // Index for activity feed: filter by project + date
    await knex.raw(`
        CREATE INDEX managed_agent_actions_project_date_idx
        ON ${ManagedAgentActionsTableName} (project_uuid, created_at DESC)
    `);

    // Index for get_recent_actions: non-reversed actions per project
    await knex.raw(`
        CREATE INDEX managed_agent_actions_active_idx
        ON ${ManagedAgentActionsTableName} (project_uuid, created_at DESC)
        WHERE reversed_at IS NULL
    `);
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.dropTableIfExists(ManagedAgentActionsTableName);
    await knex.schema.dropTableIfExists(ManagedAgentSettingsTableName);
};
```

- [ ] **Step 3: Run the migration**

Run: `pnpm -F backend migrate`
Expected: Migration runs successfully.

- [ ] **Step 4: Verify tables exist**

Run: `psql -c "\d managed_agent_settings" && psql -c "\d managed_agent_actions"`
Expected: Both tables shown with correct columns.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ee/database/entities/managedAgent.ts packages/backend/src/database/migrations/*create_managed_agent_tables*
git commit -m "feat(ee): add managed agent database tables"
```

---

## Task 3: Model

**Files:**
- Create: `packages/backend/src/ee/models/ManagedAgentModel.ts`

- [ ] **Step 1: Create the model**

```typescript
// packages/backend/src/ee/models/ManagedAgentModel.ts
import { type Knex } from 'knex';
import {
    type CreateManagedAgentAction,
    type ManagedAgentAction,
    type ManagedAgentActionFilters,
    type ManagedAgentSettings,
    type UpdateManagedAgentSettings,
} from '@lightdash/common';
import {
    type DbManagedAgentAction,
    type DbManagedAgentSettings,
    ManagedAgentActionsTableName,
    ManagedAgentSettingsTableName,
} from '../database/entities/managedAgent';

export class ManagedAgentModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    // --- Settings ---

    static mapDbSettings(row: DbManagedAgentSettings): ManagedAgentSettings {
        return {
            projectUuid: row.project_uuid,
            enabled: row.enabled,
            scheduleCron: row.schedule_cron,
            enabledByUserUuid: row.enabled_by_user_uuid,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async getSettings(projectUuid: string): Promise<ManagedAgentSettings | null> {
        const row = await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .first();
        return row ? ManagedAgentModel.mapDbSettings(row) : null;
    }

    async upsertSettings(
        projectUuid: string,
        userUuid: string,
        update: UpdateManagedAgentSettings,
    ): Promise<ManagedAgentSettings> {
        const [row] = await this.database(ManagedAgentSettingsTableName)
            .insert({
                project_uuid: projectUuid,
                enabled: update.enabled ?? false,
                schedule_cron: update.scheduleCron ?? '*/30 * * * *',
                enabled_by_user_uuid: update.enabled ? userUuid : null,
                updated_at: new Date(),
            })
            .onConflict('project_uuid')
            .merge({
                enabled: update.enabled,
                ...(update.scheduleCron !== undefined && {
                    schedule_cron: update.scheduleCron,
                }),
                enabled_by_user_uuid: update.enabled ? userUuid : undefined,
                updated_at: new Date(),
            })
            .returning('*');
        return ManagedAgentModel.mapDbSettings(row);
    }

    async getEnabledProjects(): Promise<ManagedAgentSettings[]> {
        const rows = await this.database(ManagedAgentSettingsTableName).where({
            enabled: true,
        });
        return rows.map(ManagedAgentModel.mapDbSettings);
    }

    // --- Actions ---

    static mapDbAction(row: DbManagedAgentAction): ManagedAgentAction {
        return {
            actionUuid: row.action_uuid,
            projectUuid: row.project_uuid,
            sessionId: row.session_id,
            actionType: row.action_type as ManagedAgentAction['actionType'],
            targetType: row.target_type as ManagedAgentAction['targetType'],
            targetUuid: row.target_uuid,
            targetName: row.target_name,
            description: row.description,
            metadata: row.metadata,
            reversedAt: row.reversed_at,
            reversedByUserUuid: row.reversed_by_user_uuid,
            createdAt: row.created_at,
        };
    }

    async createAction(
        action: CreateManagedAgentAction,
    ): Promise<ManagedAgentAction> {
        const [row] = await this.database(ManagedAgentActionsTableName)
            .insert({
                project_uuid: action.projectUuid,
                session_id: action.sessionId,
                action_type: action.actionType,
                target_type: action.targetType,
                target_uuid: action.targetUuid,
                target_name: action.targetName,
                description: action.description,
                metadata: JSON.stringify(action.metadata),
            })
            .returning('*');
        return ManagedAgentModel.mapDbAction(row);
    }

    async getActions(
        projectUuid: string,
        filters: ManagedAgentActionFilters = {},
    ): Promise<ManagedAgentAction[]> {
        let query = this.database(ManagedAgentActionsTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('created_at', 'desc');

        if (filters.date) {
            query = query
                .whereRaw('created_at::date = ?', [filters.date]);
        }
        if (filters.actionType) {
            query = query.where({ action_type: filters.actionType });
        }
        if (filters.sessionId) {
            query = query.where({ session_id: filters.sessionId });
        }

        const rows = await query;
        return rows.map(ManagedAgentModel.mapDbAction);
    }

    async getRecentActions(
        projectUuid: string,
        limit: number = 50,
    ): Promise<ManagedAgentAction[]> {
        const rows = await this.database(ManagedAgentActionsTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('created_at', 'desc')
            .limit(limit);
        return rows.map(ManagedAgentModel.mapDbAction);
    }

    async getAction(actionUuid: string): Promise<ManagedAgentAction | null> {
        const row = await this.database(ManagedAgentActionsTableName)
            .where({ action_uuid: actionUuid })
            .first();
        return row ? ManagedAgentModel.mapDbAction(row) : null;
    }

    async reverseAction(
        actionUuid: string,
        userUuid: string,
    ): Promise<ManagedAgentAction> {
        const [row] = await this.database(ManagedAgentActionsTableName)
            .where({ action_uuid: actionUuid })
            .whereNull('reversed_at')
            .update({
                reversed_at: new Date(),
                reversed_by_user_uuid: userUuid,
            })
            .returning('*');
        if (!row) {
            throw new Error(
                `Action ${actionUuid} not found or already reversed`,
            );
        }
        return ManagedAgentModel.mapDbAction(row);
    }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F common build && pnpm -F backend typecheck 2>&1 | grep ManagedAgentModel`
Expected: No errors from our files.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/ee/models/ManagedAgentModel.ts
git commit -m "feat(ee): add ManagedAgentModel for settings and actions"
```

---

## Task 4: Custom Tool Definitions and System Prompt

**Files:**
- Create: `packages/backend/src/ee/services/ManagedAgentService/managedAgentTools.ts`

- [ ] **Step 1: Create the tools and prompt file**

This file exports: (a) the custom tool definitions array for the Managed Agents API, and (b) the system prompt.

```typescript
// packages/backend/src/ee/services/ManagedAgentService/managedAgentTools.ts

export const MANAGED_AGENT_SYSTEM_PROMPT = `You are a Lightdash project health agent. You run on a schedule to keep this project clean and useful.

## Rules
- ALWAYS explain WHY you're taking an action in the description field
- NEVER soft-delete content created in the last 7 days, regardless of view count
- NEVER soft-delete content if it's the only chart on a dashboard
- Prefer flagging over deleting when in doubt
- For insights, only surface actionable observations
- Check get_recent_actions first to avoid repeating yourself
- Escalate: if you flagged something 3+ runs ago and it hasn't been reversed, consider soft-deleting

## Checklist (follow in order)

### 0. Context
Call get_recent_actions to understand what you've already done.
Don't re-flag content you've already flagged. Escalate flagged content that's been ignored for 3+ runs.

### 1. Preview Project Cleanup
Call get_preview_projects. Flag any older than 3 months.

### 2. Stale Content Detection
Call get_stale_charts and get_stale_dashboards.
- Content with 0 views ever -> soft_delete_content
- Content with some views but none in 3+ months -> flag_content
Include last_viewed_at and views_count in the description.

### 3. Broken Content
Call get_broken_content. Flag all broken content with the specific errors.

### 4. Content Creation
Use the MCP tools to explore the data model. If you identify clear gaps (popular dimensions with no chart, commonly queried metrics with no visualization), create charts using create_content_from_code.
Only create content when there's a clear need. Quality over quantity.

### 5. Insights
Call get_popular_content.
- Surface content that is popular but not pinned
- Surface content with high views but restricted access (private space)
- If nothing noteworthy, skip this step
`;

export const CUSTOM_TOOL_DEFINITIONS = [
    {
        type: 'custom' as const,
        name: 'get_recent_actions',
        description:
            'Get the most recent actions taken by this agent on the project. Call this first to understand what you have already done in previous runs and avoid repeating yourself.',
        input_schema: {
            type: 'object' as const,
            properties: {
                limit: {
                    type: 'number',
                    description: 'Max actions to return (default 50)',
                },
            },
            required: [],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_stale_charts',
        description:
            'Get charts that have not been viewed in 3+ months. Returns uuid, name, space, last_viewed_at, views_count, and created_by.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_stale_dashboards',
        description:
            'Get dashboards that have not been viewed in 3+ months. Returns uuid, name, space, last_viewed_at, views_count, and created_by.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_broken_content',
        description:
            'Get charts and dashboards with validation errors (e.g., referencing fields that no longer exist). Returns uuid, name, type, and the specific errors.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_preview_projects',
        description:
            'Get preview projects older than 3 months. Returns uuid, name, created_at, and the project they were copied from.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_popular_content',
        description:
            'Get the most viewed charts and dashboards in the last 30 days. Returns uuid, name, type, views_count, unique_viewers, space name, and whether it is pinned.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        type: 'custom' as const,
        name: 'flag_content',
        description:
            'Flag a chart, dashboard, or project in the action log. Does NOT delete or modify the content — only records an observation. Use for stale content, broken content, or old preview projects.',
        input_schema: {
            type: 'object' as const,
            properties: {
                target_uuid: { type: 'string', description: 'UUID of the content to flag' },
                target_type: {
                    type: 'string',
                    enum: ['chart', 'dashboard', 'project'],
                    description: 'Type of content',
                },
                target_name: { type: 'string', description: 'Name of the content' },
                flag_type: {
                    type: 'string',
                    enum: ['flagged_stale', 'flagged_broken'],
                    description: 'Why this content is being flagged',
                },
                description: {
                    type: 'string',
                    description: 'Human-readable explanation of WHY you are flagging this content',
                },
                metadata: {
                    type: 'object',
                    description: 'Additional data (e.g., last_viewed_at, views_count, errors)',
                },
            },
            required: ['target_uuid', 'target_type', 'target_name', 'flag_type', 'description'],
        },
    },
    {
        type: 'custom' as const,
        name: 'soft_delete_content',
        description:
            'Soft-delete a chart or dashboard. The content can be restored by an admin. Do NOT use for content created in the last 7 days. Do NOT use if the chart is the only chart on a dashboard.',
        input_schema: {
            type: 'object' as const,
            properties: {
                target_uuid: { type: 'string', description: 'UUID of the chart or dashboard' },
                target_type: {
                    type: 'string',
                    enum: ['chart', 'dashboard'],
                    description: 'Type of content',
                },
                target_name: { type: 'string', description: 'Name of the content' },
                description: {
                    type: 'string',
                    description: 'Human-readable explanation of WHY you are deleting this content',
                },
                metadata: {
                    type: 'object',
                    description: 'Additional data (e.g., last_viewed_at, views_count)',
                },
            },
            required: ['target_uuid', 'target_type', 'target_name', 'description'],
        },
    },
    {
        type: 'custom' as const,
        name: 'log_insight',
        description:
            'Log an actionable observation about popular content. For example: a chart is very popular but not pinned, or popular content is in a private space with limited access.',
        input_schema: {
            type: 'object' as const,
            properties: {
                target_uuid: { type: 'string', description: 'UUID of the content' },
                target_type: {
                    type: 'string',
                    enum: ['chart', 'dashboard'],
                    description: 'Type of content',
                },
                target_name: { type: 'string', description: 'Name of the content' },
                description: {
                    type: 'string',
                    description: 'The insight — what is noteworthy and what should the admin consider doing',
                },
                metadata: {
                    type: 'object',
                    description: 'Supporting data (e.g., views_count, unique_viewers, space_name)',
                },
            },
            required: ['target_uuid', 'target_type', 'target_name', 'description'],
        },
    },
    {
        type: 'custom' as const,
        name: 'create_content_from_code',
        description:
            'Create a new chart from a chart-as-code JSON definition. The chart will be placed in an "Agent Suggestions" space for admin review. Use MCP tools first to explore the data model and validate with run_metric_query before creating.',
        input_schema: {
            type: 'object' as const,
            properties: {
                chart_as_code: {
                    type: 'object',
                    description:
                        'The full chart-as-code JSON definition. Must include: name, slug, tableName, metricQuery, chartConfig, tableConfig. Use spaceSlug "agent-suggestions".',
                },
                description: {
                    type: 'string',
                    description: 'Why this chart is useful — what gap does it fill',
                },
            },
            required: ['chart_as_code', 'description'],
        },
    },
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F backend typecheck 2>&1 | grep managedAgentTools`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/ee/services/ManagedAgentService/managedAgentTools.ts
git commit -m "feat(ee): add managed agent tool definitions and system prompt"
```

---

## Task 5: ManagedAgentClient (EE)

**Files:**
- Create: `packages/backend/src/ee/clients/ManagedAgentClient.ts`
- Remove: `packages/backend/src/clients/ManagedAgentClient.ts` (PoC)

- [ ] **Step 1: Create the EE client**

This client wraps the Anthropic SDK. It lazily creates the agent + environment, creates sessions, and streams events — dispatching custom tool calls to a provided handler.

```typescript
// packages/backend/src/ee/clients/ManagedAgentClient.ts
import Anthropic from '@anthropic-ai/sdk';
import Logger from '../../logging/logger';
import {
    CUSTOM_TOOL_DEFINITIONS,
    MANAGED_AGENT_SYSTEM_PROMPT,
} from '../services/ManagedAgentService/managedAgentTools';

type ManagedAgentClientConfig = {
    anthropicApiKey: string;
    siteUrl: string;
    serviceAccountPat: string;
};

type CustomToolHandler = (
    toolName: string,
    input: Record<string, unknown>,
) => Promise<string>;

export class ManagedAgentClient {
    private readonly config: ManagedAgentClientConfig;

    private client: Anthropic;

    private agentId: string | null = null;

    private environmentId: string | null = null;

    constructor(config: ManagedAgentClientConfig) {
        this.config = config;
        this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    }

    private async ensureAgentAndEnvironment(): Promise<{
        agentId: string;
        environmentId: string;
    }> {
        if (this.agentId && this.environmentId) {
            return { agentId: this.agentId, environmentId: this.environmentId };
        }

        Logger.info('Creating managed agent and environment...');

        const agent = await this.client.beta.agents.create({
            name: 'Lightdash Project Health Agent',
            model: 'claude-sonnet-4-6',
            system: MANAGED_AGENT_SYSTEM_PROMPT,
            mcp_servers: [
                {
                    type: 'url',
                    url: `${this.config.siteUrl}/api/v1/mcp`,
                    authorization_token: this.config.serviceAccountPat,
                },
            ],
            tools: [
                {
                    type: 'agent_toolset_20260401',
                    default_config: { enabled: false },
                    configs: [
                        { name: 'web_search', enabled: false },
                        { name: 'web_fetch', enabled: false },
                    ],
                },
                ...CUSTOM_TOOL_DEFINITIONS,
            ],
        });

        const environment = await this.client.beta.environments.create({
            name: 'lightdash-agent-env',
            config: {
                type: 'cloud',
                networking: { type: 'unrestricted' },
            },
        });

        this.agentId = agent.id;
        this.environmentId = environment.id;

        Logger.info(
            `Managed agent created: agentId=${agent.id}, environmentId=${environment.id}`,
        );

        return { agentId: agent.id, environmentId: environment.id };
    }

    async runSession(
        projectName: string,
        onCustomToolUse: CustomToolHandler,
    ): Promise<string> {
        const { agentId, environmentId } =
            await this.ensureAgentAndEnvironment();

        const session = await this.client.beta.sessions.create({
            agent: agentId,
            environment_id: environmentId,
            title: `Health check: ${projectName} — ${new Date().toISOString()}`,
        });

        Logger.info(`[ManagedAgent] Session created: ${session.id}`);

        const stream = await this.client.beta.sessions.events.stream(
            session.id,
        );

        await this.client.beta.sessions.events.send(session.id, {
            events: [
                {
                    type: 'user.message',
                    content: [
                        {
                            type: 'text',
                            text: `Analyze project "${projectName}". Follow your checklist.`,
                        },
                    ],
                },
            ],
        });

        for await (const event of stream) {
            if (event.type === 'agent.message') {
                for (const block of event.content) {
                    if ('text' in block) {
                        Logger.debug(`[ManagedAgent] ${block.text}`);
                    }
                }
            } else if (event.type === 'agent.custom_tool_use') {
                Logger.info(
                    `[ManagedAgent] Tool call: ${event.name}`,
                );
                try {
                    const result = await onCustomToolUse(
                        event.name,
                        event.input as Record<string, unknown>,
                    );
                    await this.client.beta.sessions.events.send(session.id, {
                        events: [
                            {
                                type: 'user.custom_tool_result',
                                tool_use_id: event.id,
                                content: result,
                            },
                        ],
                    });
                } catch (error) {
                    const errorMessage =
                        error instanceof Error
                            ? error.message
                            : 'Unknown error';
                    Logger.error(
                        `[ManagedAgent] Tool error: ${event.name}: ${errorMessage}`,
                    );
                    await this.client.beta.sessions.events.send(session.id, {
                        events: [
                            {
                                type: 'user.custom_tool_result',
                                tool_use_id: event.id,
                                content: JSON.stringify({
                                    error: errorMessage,
                                }),
                                is_error: true,
                            },
                        ],
                    });
                }
            } else if (event.type === 'session.status_idle') {
                Logger.info('[ManagedAgent] Session complete (idle)');
                break;
            }
        }

        return session.id;
    }
}
```

- [ ] **Step 2: Delete the PoC client**

Delete: `packages/backend/src/clients/ManagedAgentClient.ts`

- [ ] **Step 3: Remove PoC import from SchedulerWorker**

In `packages/backend/src/scheduler/SchedulerWorker.ts`, remove the import of `ManagedAgentClient` from `../clients/ManagedAgentClient` and remove the `managedAgentClient` field, `getManagedAgentClient()` method, and the `MANAGED_AGENT_HEARTBEAT` task handler. Keep the cron entry — it will be wired to the EE scheduler worker instead.

- [ ] **Step 4: Typecheck**

Run: `pnpm -F backend typecheck 2>&1 | grep -E "ManagedAgent|managedAgent"`
Expected: No errors from our files.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ee/clients/ManagedAgentClient.ts
git rm packages/backend/src/clients/ManagedAgentClient.ts
git add packages/backend/src/scheduler/SchedulerWorker.ts
git commit -m "feat(ee): add ManagedAgentClient, remove PoC"
```

---

## Task 6: ManagedAgentService

**Files:**
- Create: `packages/backend/src/ee/services/ManagedAgentService/ManagedAgentService.ts`

This is the orchestrator. It handles settings, executes heartbeats by dispatching tool calls to the right Lightdash services, and handles reversals.

- [ ] **Step 1: Create the service**

```typescript
// packages/backend/src/ee/services/ManagedAgentService/ManagedAgentService.ts
import {
    type CreateManagedAgentAction,
    ForbiddenError,
    ManagedAgentActionType,
    type ManagedAgentSettings,
    ManagedAgentTargetType,
    type UpdateManagedAgentSettings,
} from '@lightdash/common';
import { BaseService } from '../../../services/BaseService';
import Logger from '../../../logging/logger';
import { ManagedAgentClient } from '../../clients/ManagedAgentClient';
import { ManagedAgentModel } from '../../models/ManagedAgentModel';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { AnalyticsModel } from '../../../models/AnalyticsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { SavedChartModel } from '../../../models/SavedChartModel';
import type { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import type { ValidationModel } from '../../../models/ValidationModel/ValidationModel';
import type { SavedChartService } from '../../../services/SavedChartService/SavedChartService';
import type { DashboardService } from '../../../services/DashboardService/DashboardService';
import type { CoderService } from '../../../services/CoderService/CoderService';

type ManagedAgentServiceDependencies = {
    lightdashConfig: LightdashConfig;
    managedAgentModel: ManagedAgentModel;
    analyticsModel: AnalyticsModel;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    validationModel: ValidationModel;
    savedChartService: SavedChartService;
    dashboardService: DashboardService;
    coderService: CoderService;
};

const STALE_MONTHS = 3;
const CONTENT_MIN_AGE_DAYS = 7;

export class ManagedAgentService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly managedAgentModel: ManagedAgentModel;

    private readonly analyticsModel: AnalyticsModel;

    private readonly projectModel: ProjectModel;

    private readonly savedChartModel: SavedChartModel;

    private readonly dashboardModel: DashboardModel;

    private readonly validationModel: ValidationModel;

    private readonly savedChartService: SavedChartService;

    private readonly dashboardService: DashboardService;

    private readonly coderService: CoderService;

    private client: ManagedAgentClient | null = null;

    constructor(deps: ManagedAgentServiceDependencies) {
        super();
        this.lightdashConfig = deps.lightdashConfig;
        this.managedAgentModel = deps.managedAgentModel;
        this.analyticsModel = deps.analyticsModel;
        this.projectModel = deps.projectModel;
        this.savedChartModel = deps.savedChartModel;
        this.dashboardModel = deps.dashboardModel;
        this.validationModel = deps.validationModel;
        this.savedChartService = deps.savedChartService;
        this.dashboardService = deps.dashboardService;
        this.coderService = deps.coderService;
    }

    private getClient(): ManagedAgentClient {
        if (!this.client) {
            const { anthropicApiKey } = this.lightdashConfig.managedAgent;
            if (!anthropicApiKey) {
                throw new Error(
                    'ANTHROPIC_API_KEY is required for managed agent',
                );
            }
            this.client = new ManagedAgentClient({
                anthropicApiKey,
                siteUrl: this.lightdashConfig.siteUrl,
                serviceAccountPat:
                    this.lightdashConfig.managedAgent.serviceAccountPat ?? '',
            });
        }
        return this.client;
    }

    // --- Settings API ---

    async getSettings(
        projectUuid: string,
    ): Promise<ManagedAgentSettings | null> {
        return this.managedAgentModel.getSettings(projectUuid);
    }

    async updateSettings(
        projectUuid: string,
        userUuid: string,
        update: UpdateManagedAgentSettings,
    ): Promise<ManagedAgentSettings> {
        return this.managedAgentModel.upsertSettings(
            projectUuid,
            userUuid,
            update,
        );
    }

    // --- Actions API ---

    async getActions(projectUuid: string, filters = {}) {
        return this.managedAgentModel.getActions(projectUuid, filters);
    }

    async reverseAction(actionUuid: string, userUuid: string) {
        const action = await this.managedAgentModel.getAction(actionUuid);
        if (!action) {
            throw new Error(`Action ${actionUuid} not found`);
        }
        if (action.reversedAt) {
            throw new Error(`Action ${actionUuid} already reversed`);
        }

        // Reverse the actual mutation
        if (action.actionType === ManagedAgentActionType.SOFT_DELETED) {
            if (action.targetType === ManagedAgentTargetType.CHART) {
                await this.savedChartModel.restore(action.targetUuid);
            } else if (
                action.targetType === ManagedAgentTargetType.DASHBOARD
            ) {
                await this.dashboardModel.restore(action.targetUuid);
            }
        } else if (
            action.actionType === ManagedAgentActionType.CREATED_CONTENT
        ) {
            if (action.targetType === ManagedAgentTargetType.CHART) {
                await this.savedChartModel.delete(action.targetUuid);
            }
        }

        return this.managedAgentModel.reverseAction(actionUuid, userUuid);
    }

    // --- Heartbeat ---

    async runHeartbeat(projectUuid: string): Promise<void> {
        const settings =
            await this.managedAgentModel.getSettings(projectUuid);
        if (!settings?.enabled) {
            return;
        }

        const project = await this.projectModel.get(projectUuid);
        const client = this.getClient();

        Logger.info(
            `[ManagedAgent] Running heartbeat for project: ${project.name} (${projectUuid})`,
        );

        const sessionId = await client.runSession(
            project.name,
            async (toolName, input) =>
                this.handleToolCall(projectUuid, sessionId, toolName, input),
        );

        Logger.info(
            `[ManagedAgent] Heartbeat complete for project: ${project.name}`,
        );
    }

    // --- Tool Handlers ---

    private async handleToolCall(
        projectUuid: string,
        sessionId: string,
        toolName: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        switch (toolName) {
            case 'get_recent_actions':
                return this.handleGetRecentActions(
                    projectUuid,
                    input.limit as number | undefined,
                );
            case 'get_stale_charts':
                return this.handleGetStaleCharts(projectUuid);
            case 'get_stale_dashboards':
                return this.handleGetStaleDashboards(projectUuid);
            case 'get_broken_content':
                return this.handleGetBrokenContent(projectUuid);
            case 'get_preview_projects':
                return this.handleGetPreviewProjects(projectUuid);
            case 'get_popular_content':
                return this.handleGetPopularContent(projectUuid);
            case 'flag_content':
                return this.handleFlagContent(projectUuid, sessionId, input);
            case 'soft_delete_content':
                return this.handleSoftDelete(projectUuid, sessionId, input);
            case 'log_insight':
                return this.handleLogInsight(projectUuid, sessionId, input);
            case 'create_content_from_code':
                return this.handleCreateContent(
                    projectUuid,
                    sessionId,
                    input,
                );
            default:
                return JSON.stringify({ error: `Unknown tool: ${toolName}` });
        }
    }

    private async handleGetRecentActions(
        projectUuid: string,
        limit?: number,
    ): Promise<string> {
        const actions = await this.managedAgentModel.getRecentActions(
            projectUuid,
            limit ?? 50,
        );
        return JSON.stringify(
            actions.map((a) => ({
                action_uuid: a.actionUuid,
                action_type: a.actionType,
                target_name: a.targetName,
                target_type: a.targetType,
                description: a.description,
                reversed: a.reversedAt !== null,
                created_at: a.createdAt.toISOString(),
            })),
        );
    }

    private async handleGetStaleCharts(
        projectUuid: string,
    ): Promise<string> {
        const staleCharts =
            await this.analyticsModel.getUnusedCharts(projectUuid);
        return JSON.stringify(staleCharts);
    }

    private async handleGetStaleDashboards(
        projectUuid: string,
    ): Promise<string> {
        const staleDashboards =
            await this.analyticsModel.getUnusedDashboards(projectUuid);
        return JSON.stringify(staleDashboards);
    }

    private async handleGetBrokenContent(
        projectUuid: string,
    ): Promise<string> {
        const errors =
            await this.validationModel.get(projectUuid);
        return JSON.stringify(errors);
    }

    private async handleGetPreviewProjects(
        projectUuid: string,
    ): Promise<string> {
        const project = await this.projectModel.get(projectUuid);
        const previews =
            await this.projectModel.getPreviewProjectsOlderThan(
                project.organizationUuid,
                STALE_MONTHS,
            );
        return JSON.stringify(previews);
    }

    private async handleGetPopularContent(
        projectUuid: string,
    ): Promise<string> {
        const popular =
            await this.analyticsModel.getPopularContent(projectUuid);
        return JSON.stringify(popular);
    }

    private async handleFlagContent(
        projectUuid: string,
        sessionId: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            actionType: input.flag_type as ManagedAgentActionType,
            targetType: input.target_type as ManagedAgentTargetType,
            targetUuid: input.target_uuid as string,
            targetName: input.target_name as string,
            description: input.description as string,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });
        return JSON.stringify({ action_uuid: action.actionUuid });
    }

    private async handleSoftDelete(
        projectUuid: string,
        sessionId: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const targetUuid = input.target_uuid as string;
        const targetType = input.target_type as string;

        // Server-side safety rail: content age check
        // (Implementation will query the content's created_at and reject if < 7 days old)

        // Server-side safety rail: only-chart-on-dashboard check
        // (Implementation will check dashboard membership for charts)

        // Perform soft delete
        if (targetType === 'chart') {
            await this.savedChartModel.softDelete(targetUuid, 'managed-agent');
        } else if (targetType === 'dashboard') {
            await this.dashboardModel.softDelete(targetUuid, 'managed-agent');
        }

        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            actionType: ManagedAgentActionType.SOFT_DELETED,
            targetType: targetType as ManagedAgentTargetType,
            targetUuid,
            targetName: input.target_name as string,
            description: input.description as string,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });

        return JSON.stringify({
            action_uuid: action.actionUuid,
            recoverable: true,
        });
    }

    private async handleLogInsight(
        projectUuid: string,
        sessionId: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            actionType: ManagedAgentActionType.INSIGHT,
            targetType: input.target_type as ManagedAgentTargetType,
            targetUuid: input.target_uuid as string,
            targetName: input.target_name as string,
            description: input.description as string,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });
        return JSON.stringify({ action_uuid: action.actionUuid });
    }

    private async handleCreateContent(
        projectUuid: string,
        sessionId: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const chartAsCode = input.chart_as_code as Record<string, unknown>;
        const description = input.description as string;

        // Force spaceSlug to agent-suggestions
        chartAsCode.spaceSlug = 'agent-suggestions';

        // Create via CoderService (same path as lightdash upload)
        const result = await this.coderService.upsertChart(
            { userUuid: 'managed-agent' } as any, // Service account user
            projectUuid,
            chartAsCode.slug as string,
            chartAsCode as any,
            false,   // skipSpaceCreate
            true,    // publicSpaceCreate (Agent Suggestions is public)
        );

        const chartUuid =
            result.charts?.[0]?.data?.uuid ?? 'unknown';
        const chartName =
            (chartAsCode.name as string) ?? 'Untitled';

        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            actionType: ManagedAgentActionType.CREATED_CONTENT,
            targetType: ManagedAgentTargetType.CHART,
            targetUuid: chartUuid,
            targetName: chartName,
            description,
            metadata: { chart_as_code: chartAsCode },
        });

        return JSON.stringify({
            action_uuid: action.actionUuid,
            chart_uuid: chartUuid,
        });
    }
}
```

- [ ] **Step 2: Add `serviceAccountPat` to the config type and parser**

In `packages/backend/src/config/parseConfig.ts`, update the `managedAgent` config:

```typescript
// In the LightdashConfig type:
managedAgent: {
    enabled: boolean;
    anthropicApiKey: string | null;
    schedule: string;
    serviceAccountPat: string | null;  // ADD THIS
};

// In the parser return:
managedAgent: {
    enabled: process.env.MANAGED_AGENT_ENABLED === 'true',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    schedule: process.env.MANAGED_AGENT_SCHEDULE || '*/30 * * * *',
    serviceAccountPat: process.env.MANAGED_AGENT_SERVICE_ACCOUNT_PAT || null,  // ADD THIS
},
```

Also update the mock config in `lightdashConfig.mock.ts`:

```typescript
managedAgent: {
    enabled: false,
    anthropicApiKey: null,
    schedule: '*/30 * * * *',
    serviceAccountPat: null,  // ADD THIS
},
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -F common build && pnpm -F backend typecheck 2>&1 | grep ManagedAgentService`
Expected: No errors from our files.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/ee/services/ManagedAgentService/ManagedAgentService.ts
git add packages/backend/src/config/parseConfig.ts packages/backend/src/config/lightdashConfig.mock.ts
git commit -m "feat(ee): add ManagedAgentService with tool handlers"
```

---

## Task 7: Wire Into EE Scheduler Worker

**Files:**
- Modify: `packages/backend/src/ee/scheduler/SchedulerWorker.ts`
- Modify: `packages/backend/src/scheduler/SchedulerWorker.ts`

- [ ] **Step 1: Move the heartbeat handler to CommercialSchedulerWorker**

In `packages/backend/src/ee/scheduler/SchedulerWorker.ts`, add `managedAgentService` to the constructor args and add the task handler:

```typescript
// Add to CommercialSchedulerWorkerArguments:
type CommercialSchedulerWorkerArguments = SchedulerTaskArguments & {
    aiAgentService: AiAgentService;
    embedService: EmbedService;
    managedAgentService: ManagedAgentService;  // ADD
};

// Add field:
protected readonly managedAgentService: ManagedAgentService;

// In constructor:
this.managedAgentService = args.managedAgentService;

// In getFullTaskList(), add to the spread:
[SCHEDULER_TASKS.MANAGED_AGENT_HEARTBEAT]: async () => {
    if (!this.lightdashConfig.managedAgent.enabled) {
        return;
    }

    Logger.info('Starting managed agent heartbeat');

    try {
        const enabledProjects =
            await this.managedAgentService.getEnabledProjects();

        if (enabledProjects.length === 0) {
            Logger.debug('No projects with managed agent enabled');
            return;
        }

        // v1: single project support
        const project = enabledProjects[0];
        await this.managedAgentService.runHeartbeat(
            project.projectUuid,
        );

        Logger.info('Managed agent heartbeat completed');
    } catch (error) {
        Logger.error('Error during managed agent heartbeat:', error);
        throw error;
    }
},
```

- [ ] **Step 2: Clean up base SchedulerWorker**

In `packages/backend/src/scheduler/SchedulerWorker.ts`:
- Remove the `ManagedAgentClient` import
- Remove the `managedAgentClient` field
- Remove the `getManagedAgentClient()` method
- Remove the `MANAGED_AGENT_HEARTBEAT` task handler from `getFullTaskList()`
- Keep the cron entry in `parsedCronItems` (it's needed for Graphile Worker to schedule the task)

- [ ] **Step 3: Add `getEnabledProjects` to ManagedAgentService**

Add to `ManagedAgentService`:

```typescript
async getEnabledProjects(): Promise<ManagedAgentSettings[]> {
    return this.managedAgentModel.getEnabledProjects();
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm -F backend typecheck 2>&1 | grep -E "SchedulerWorker|ManagedAgent"`
Expected: No errors from our files.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ee/scheduler/SchedulerWorker.ts
git add packages/backend/src/scheduler/SchedulerWorker.ts
git add packages/backend/src/ee/services/ManagedAgentService/ManagedAgentService.ts
git commit -m "feat(ee): wire managed agent heartbeat into commercial scheduler"
```

---

## Task 8: Register in EE DI Container

**Files:**
- Modify: `packages/backend/src/ee/index.ts`

- [ ] **Step 1: Add model and service providers**

In `packages/backend/src/ee/index.ts`, add:

```typescript
// In modelProviders:
managedAgentModel: ({ database }) =>
    new ManagedAgentModel({ database }),

// In serviceProviders:
managedAgentService: ({ models, context }) =>
    new ManagedAgentService({
        lightdashConfig: context.lightdashConfig,
        managedAgentModel: models.getManagedAgentModel(),
        analyticsModel: models.getAnalyticsModel(),
        projectModel: models.getProjectModel(),
        savedChartModel: models.getSavedChartModel(),
        dashboardModel: models.getDashboardModel(),
        validationModel: models.getValidationModel(),
        savedChartService: context.serviceRepository.getSavedChartService(),
        dashboardService: context.serviceRepository.getDashboardService(),
        coderService: context.serviceRepository.getCoderService(),
    }),

// In schedulerWorkerFactory, add managedAgentService:
managedAgentService: context.serviceRepository.getManagedAgentService(),
```

- [ ] **Step 2: Add type slot to ModelManifest**

In `packages/backend/src/models/ModelRepository.ts`, add to the `ModelManifest` type:

```typescript
managedAgentModel: unknown;
```

And add the getter:

```typescript
getManagedAgentModel<T = unknown>(): T {
    return this.getModel('managedAgentModel');
}
```

- [ ] **Step 3: Add type slot to ServiceRepository**

In the service repository, add the getter for `ManagedAgentService`:

```typescript
getManagedAgentService<T = unknown>(): T {
    return this.getService('managedAgentService');
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm -F backend typecheck 2>&1 | grep -c "error TS"` (compare to baseline — should not increase)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ee/index.ts
git add packages/backend/src/models/ModelRepository.ts
git commit -m "feat(ee): register managed agent in DI container"
```

---

## Task 9: TSOA Controller

**Files:**
- Create: `packages/backend/src/ee/controllers/managedAgentController.ts`

- [ ] **Step 1: Create the controller**

```typescript
// packages/backend/src/ee/controllers/managedAgentController.ts
import {
    type ManagedAgentAction,
    type ManagedAgentActionFilters,
    type ManagedAgentActionType,
    type ManagedAgentSettings,
    type UpdateManagedAgentSettings,
} from '@lightdash/common';
import express from 'express';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from 'tsoa';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import type { ApiErrorPayload } from '../../controllers/apiErrorPayload';
import type { ManagedAgentService } from '../services/ManagedAgentService/ManagedAgentService';

type ApiManagedAgentSettingsResponse = {
    status: 'ok';
    results: ManagedAgentSettings | null;
};

type ApiManagedAgentActionsResponse = {
    status: 'ok';
    results: ManagedAgentAction[];
};

type ApiManagedAgentActionResponse = {
    status: 'ok';
    results: ManagedAgentAction;
};

@Route('/api/v1/projects/{projectUuid}/managed-agent')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Managed Agent')
export class ManagedAgentController extends BaseController {
    private getManagedAgentService() {
        return this.services.getManagedAgentService<ManagedAgentService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/settings')
    @OperationId('getManagedAgentSettings')
    async getSettings(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiManagedAgentSettingsResponse> {
        const results =
            await this.getManagedAgentService().getSettings(projectUuid);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Patch('/settings')
    @OperationId('updateManagedAgentSettings')
    async updateSettings(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: UpdateManagedAgentSettings,
    ): Promise<ApiManagedAgentSettingsResponse> {
        const results = await this.getManagedAgentService().updateSettings(
            projectUuid,
            req.user!.userUuid,
            body,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/actions')
    @OperationId('getManagedAgentActions')
    async getActions(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() date?: string,
        @Query() actionType?: ManagedAgentActionType,
        @Query() sessionId?: string,
    ): Promise<ApiManagedAgentActionsResponse> {
        const results = await this.getManagedAgentService().getActions(
            projectUuid,
            { date, actionType, sessionId },
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/actions/{actionUuid}/reverse')
    @OperationId('reverseManagedAgentAction')
    async reverseAction(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() actionUuid: string,
    ): Promise<ApiManagedAgentActionResponse> {
        const results = await this.getManagedAgentService().reverseAction(
            actionUuid,
            req.user!.userUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }
}
```

- [ ] **Step 2: Regenerate API**

Run: `pnpm generate-api`
Expected: `generated/routes.ts` now includes the `ManagedAgentController`.

- [ ] **Step 3: Typecheck**

Run: `pnpm -F backend typecheck 2>&1 | grep managedAgentController`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/ee/controllers/managedAgentController.ts
git add packages/backend/src/generated/routes.ts
git commit -m "feat(ee): add managed agent API endpoints"
```

---

## Task 10: Add Missing Model Methods

Several tool handlers reference model methods that need to exist on `AnalyticsModel` and `ProjectModel`. Some already exist (e.g., `getUnusedCharts`), others need to be added.

**Files:**
- Modify: `packages/backend/src/models/AnalyticsModel.ts`
- Modify: `packages/backend/src/models/ProjectModel/ProjectModel.ts`

- [ ] **Step 1: Check which methods already exist**

Run:
```bash
grep -n "getUnusedCharts\|getUnusedDashboards\|getPopularContent\|getPreviewProjectsOlderThan" packages/backend/src/models/AnalyticsModel.ts packages/backend/src/models/ProjectModel/ProjectModel.ts
```

Expected: `getUnusedCharts` and `getUnusedDashboards` likely exist (from the `unusedChartsSql`/`unusedDashboardsSql` queries found during exploration). `getPopularContent` and `getPreviewProjectsOlderThan` likely need to be added.

- [ ] **Step 2: Add `getPopularContent` to AnalyticsModel**

```typescript
async getPopularContent(projectUuid: string): Promise<Array<{
    uuid: string;
    name: string;
    type: 'chart' | 'dashboard';
    views_count: number;
    unique_viewers: number;
    space_name: string;
}>> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const charts = await this.database('analytics_chart_views as cv')
        .join('saved_queries as sq', 'sq.saved_query_uuid', 'cv.chart_uuid')
        .join('spaces as s', 's.space_id', 'sq.space_id')
        .join('projects as p', 'p.project_id', 's.project_id')
        .where('p.project_uuid', projectUuid)
        .whereNull('sq.deleted_at')
        .where('cv.timestamp', '>=', thirtyDaysAgo)
        .groupBy('sq.saved_query_uuid', 'sq.name', 's.name')
        .select(
            'sq.saved_query_uuid as uuid',
            'sq.name',
            this.database.raw("'chart' as type"),
            this.database.raw('COUNT(*) as views_count'),
            this.database.raw('COUNT(DISTINCT cv.user_uuid) as unique_viewers'),
            's.name as space_name',
        )
        .orderBy('views_count', 'desc')
        .limit(20);

    const dashboards = await this.database('analytics_dashboard_views as dv')
        .join('dashboards as d', 'd.dashboard_uuid', 'dv.dashboard_uuid')
        .join('spaces as s', 's.space_id', 'd.space_id')
        .join('projects as p', 'p.project_id', 's.project_id')
        .where('p.project_uuid', projectUuid)
        .whereNull('d.deleted_at')
        .where('dv.timestamp', '>=', thirtyDaysAgo)
        .groupBy('d.dashboard_uuid', 'd.name', 's.name')
        .select(
            'd.dashboard_uuid as uuid',
            'd.name',
            this.database.raw("'dashboard' as type"),
            this.database.raw('COUNT(*) as views_count'),
            this.database.raw('COUNT(DISTINCT dv.user_uuid) as unique_viewers'),
            's.name as space_name',
        )
        .orderBy('views_count', 'desc')
        .limit(20);

    return [...charts, ...dashboards]
        .sort((a, b) => Number(b.views_count) - Number(a.views_count))
        .slice(0, 20);
}
```

- [ ] **Step 3: Add `getPreviewProjectsOlderThan` to ProjectModel**

```typescript
async getPreviewProjectsOlderThan(
    organizationUuid: string,
    months: number,
): Promise<Array<{
    uuid: string;
    name: string;
    created_at: Date;
    copied_from: string | null;
}>> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const rows = await this.database('projects as p')
        .join('organizations as o', 'o.organization_id', 'p.organization_id')
        .where('o.organization_uuid', organizationUuid)
        .where('p.project_type', 'PREVIEW')
        .where('p.created_at', '<', cutoff)
        .select(
            'p.project_uuid as uuid',
            'p.name',
            'p.created_at',
            'p.copied_from_project_uuid as copied_from',
        );

    return rows;
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm -F backend typecheck 2>&1 | grep -E "AnalyticsModel|ProjectModel" | grep error`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/models/AnalyticsModel.ts
git add packages/backend/src/models/ProjectModel/ProjectModel.ts
git commit -m "feat: add getPopularContent and getPreviewProjectsOlderThan model methods"
```

---

## Task 11: Integration Test

**Files:**
- Create: `packages/backend/src/ee/services/ManagedAgentService/ManagedAgentService.test.ts`

- [ ] **Step 1: Write a test for the tool dispatch logic**

```typescript
// packages/backend/src/ee/services/ManagedAgentService/ManagedAgentService.test.ts
import { ManagedAgentActionType, ManagedAgentTargetType } from '@lightdash/common';
import { ManagedAgentModel } from '../../models/ManagedAgentModel';

// Test the model's static mappers and action creation logic
describe('ManagedAgentModel', () => {
    describe('mapDbSettings', () => {
        it('should map DB row to domain object', () => {
            const dbRow = {
                project_uuid: 'proj-123',
                enabled: true,
                schedule_cron: '*/30 * * * *',
                enabled_by_user_uuid: 'user-456',
                created_at: new Date('2026-01-01'),
                updated_at: new Date('2026-01-02'),
            };

            const result = ManagedAgentModel.mapDbSettings(dbRow);

            expect(result).toEqual({
                projectUuid: 'proj-123',
                enabled: true,
                scheduleCron: '*/30 * * * *',
                enabledByUserUuid: 'user-456',
                createdAt: new Date('2026-01-01'),
                updatedAt: new Date('2026-01-02'),
            });
        });
    });

    describe('mapDbAction', () => {
        it('should map DB row to domain object', () => {
            const dbRow = {
                action_uuid: 'act-789',
                project_uuid: 'proj-123',
                session_id: 'sess-abc',
                action_type: 'flagged_stale',
                target_type: 'chart',
                target_uuid: 'chart-111',
                target_name: 'Old Chart',
                description: 'Not viewed in 6 months',
                metadata: { views_count: 0 },
                reversed_at: null,
                reversed_by_user_uuid: null,
                created_at: new Date('2026-04-13'),
            };

            const result = ManagedAgentModel.mapDbAction(dbRow);

            expect(result).toEqual({
                actionUuid: 'act-789',
                projectUuid: 'proj-123',
                sessionId: 'sess-abc',
                actionType: ManagedAgentActionType.FLAGGED_STALE,
                targetType: ManagedAgentTargetType.CHART,
                targetUuid: 'chart-111',
                targetName: 'Old Chart',
                description: 'Not viewed in 6 months',
                metadata: { views_count: 0 },
                reversedAt: null,
                reversedByUserUuid: null,
                createdAt: new Date('2026-04-13'),
            });
        });
    });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm -F backend test:dev:nowatch -- --testPathPattern=ManagedAgentService`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/ee/services/ManagedAgentService/ManagedAgentService.test.ts
git commit -m "test(ee): add managed agent model mapper tests"
```

---

## Task 12: End-to-End Verification

- [ ] **Step 1: Set environment variables**

Add to `.env.development.local`:

```bash
MANAGED_AGENT_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...
MANAGED_AGENT_SERVICE_ACCOUNT_PAT=<your-pat>
MANAGED_AGENT_SCHEDULE=*/5 * * * *
```

- [ ] **Step 2: Run migration if not already done**

Run: `pnpm -F backend migrate`

- [ ] **Step 3: Enable the agent for a project**

```bash
curl -X PATCH \
  -H "Authorization: ApiKey $LDPAT" \
  -H "Content-Type: application/json" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/managed-agent/settings" \
  -d '{"enabled": true}'
```

Expected: `{ "status": "ok", "results": { "enabled": true, ... } }`

- [ ] **Step 4: Wait for a heartbeat or trigger manually**

Watch logs for:
```
[ManagedAgent] Running heartbeat for project: ...
[ManagedAgent] Session created: ...
[ManagedAgent] Tool call: get_recent_actions
[ManagedAgent] Tool call: get_stale_charts
...
[ManagedAgent] Session complete (idle)
```

- [ ] **Step 5: Check the activity feed**

```bash
curl -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/managed-agent/actions"
```

Expected: Array of actions the agent took.

- [ ] **Step 6: Test reversal**

Pick an action UUID from the response above:

```bash
curl -X POST \
  -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/managed-agent/actions/$ACTION_UUID/reverse"
```

Expected: Action now has `reversed_at` set. If it was a soft-delete, the content is restored.
