import {
    QuerySourceType,
    SEED_AI_AGENT,
    SEED_COMPOSER_ARTIFACT,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_VIEWER,
    SEED_PROJECT,
    type AiComposerChartArtifactConfigV2,
    type SourceQuery,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiPromptTableName,
    AiThreadTableName,
    AiWebAppPromptTableName,
    AiWebAppThreadTableName,
} from '../../entities/ai';
import { AiAgentTableName } from '../../entities/aiAgent';
import {
    AiArtifactsTableName,
    AiArtifactVersionsTableName,
} from '../../entities/aiArtifacts';

type SeedArtifact = {
    ref: { artifactUuid: string; versionUuid: string };
    title: string;
    config: AiComposerChartArtifactConfigV2;
};

const ordersByStatus: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_total_order_amount'],
    limit: 500,
};

const byStatus: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'by_status',
    sql: 'SELECT orders_status, orders_total_order_amount FROM orders ORDER BY orders_status',
    references: ['orders'],
    limit: 500,
};

const revenueByStatus: SeedArtifact = {
    ref: SEED_COMPOSER_ARTIFACT.revenueByStatus,
    title: 'Revenue by status',
    config: {
        source: 'composer',
        schemaVersion: 2,
        queries: [ordersByStatus, byStatus],
        terminalNodeId: 'by_status',
        vizConfig: {
            type: 'bar',
            x: 'orders_status',
            y: ['orders_total_order_amount'],
            groupBy: null,
            stack: null,
            horizontal: null,
            y2: null,
            labels: null,
        },
    },
};

const artifacts: SeedArtifact[] = [
    revenueByStatus,
    {
        ref: SEED_COMPOSER_ARTIFACT.revenueByMonthAndStatus,
        title: 'Revenue by month and status',
        config: {
            source: 'composer',
            schemaVersion: 2,
            queries: [
                {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    nodeId: 'orders',
                    exploreName: 'orders',
                    dimensions: ['orders_order_date_month', 'orders_status'],
                    metrics: ['orders_total_order_amount'],
                    limit: 500,
                },
                {
                    sourceType: QuerySourceType.DUCKDB,
                    nodeId: 'by_month',
                    sql: 'SELECT orders_order_date_month, orders_status, orders_total_order_amount FROM orders',
                    references: ['orders'],
                    limit: 500,
                },
            ],
            terminalNodeId: 'by_month',
            vizConfig: {
                type: 'line',
                x: 'orders_order_date_month',
                y: ['orders_total_order_amount'],
                groupBy: ['orders_status'],
                stack: null,
                horizontal: null,
                y2: null,
                labels: null,
            },
        },
    },
    {
        ref: SEED_COMPOSER_ARTIFACT.statusTable,
        title: 'Orders by status, as a table',
        config: { ...revenueByStatus.config, vizConfig: null },
    },
    {
        ref: SEED_COMPOSER_ARTIFACT.pythonNode,
        title: 'Revenue by status, through python',
        config: {
            ...revenueByStatus.config,
            queries: [
                ordersByStatus,
                {
                    sourceType: QuerySourceType.PYTHON,
                    nodeId: 'by_status',
                    code: 'result = inputs["orders"]',
                    references: ['orders'],
                },
            ],
        },
    },
    {
        ref: SEED_COMPOSER_ARTIFACT.queryUuidReference,
        title: 'Revenue by status, from an earlier run',
        config: {
            ...revenueByStatus.config,
            queries: [
                {
                    ...byStatus,
                    references: {
                        orders: '4d97672e-63f5-4f4b-a1bf-e817c5e830b5',
                    },
                },
            ],
        },
    },
    {
        ref: SEED_COMPOSER_ARTIFACT.doubleUnderscoreColumn,
        title: 'Revenue by status, aliased with a double underscore',
        config: {
            ...revenueByStatus.config,
            queries: [
                ordersByStatus,
                {
                    ...byStatus,
                    sql: 'SELECT orders_status AS status__name, orders_total_order_amount FROM orders',
                },
            ],
            vizConfig: {
                type: 'bar',
                x: 'status__name',
                y: ['orders_total_order_amount'],
                groupBy: null,
                stack: null,
                horizontal: null,
                y2: null,
                labels: null,
            },
        },
    },
    {
        ref: SEED_COMPOSER_ARTIFACT.customChartType,
        title: 'Revenue by status, drawn by a custom chart type',
        config: {
            ...revenueByStatus.config,
            vizConfig: {
                type: 'custom',
                customChartTypeSlug: 'seeded-custom-chart',
                fieldMapping: {
                    category: 'orders_status',
                    value: 'orders_total_order_amount',
                },
                options: null,
                dataAppVizUuid: 'dbb6f65d-2e99-45a6-b25b-cb377bcd5b1d',
                dataAppVizVersion: null,
            },
        },
    },
];

const viewerArtifact: SeedArtifact = {
    ref: SEED_COMPOSER_ARTIFACT.viewerOwned,
    title: 'Revenue by status, asked by a viewer',
    config: revenueByStatus.config,
};

const seedThread = async (
    knex: Knex,
    agentUuid: string,
    userUuid: string,
    threadArtifacts: SeedArtifact[],
) => {
    const [thread] = await knex(AiThreadTableName)
        .insert({
            organization_uuid: SEED_ORG_1.organization_uuid,
            project_uuid: SEED_PROJECT.project_uuid,
            created_from: 'web_app',
            agent_uuid: agentUuid,
        })
        .returning('ai_thread_uuid');
    await knex(AiWebAppThreadTableName).insert({
        ai_thread_uuid: thread.ai_thread_uuid,
        user_uuid: userUuid,
    });
    const [prompt] = await knex(AiPromptTableName)
        .insert({
            ai_thread_uuid: thread.ai_thread_uuid,
            created_by_user_uuid: userUuid,
            prompt: 'Show me revenue by order status',
        })
        .returning('ai_prompt_uuid');
    await knex(AiWebAppPromptTableName).insert({
        ai_prompt_uuid: prompt.ai_prompt_uuid,
        user_uuid: userUuid,
    });
    for (const { ref, title, config } of threadArtifacts) {
        // eslint-disable-next-line no-await-in-loop
        await knex(AiArtifactsTableName).insert({
            ai_artifact_uuid: ref.artifactUuid,
            ai_thread_uuid: thread.ai_thread_uuid,
            artifact_type: 'chart',
        });
        // eslint-disable-next-line no-await-in-loop
        await knex(AiArtifactVersionsTableName).insert({
            ai_artifact_version_uuid: ref.versionUuid,
            ai_artifact_uuid: ref.artifactUuid,
            ai_prompt_uuid: prompt.ai_prompt_uuid,
            version_number: 1,
            title,
            description: null,
            chart_config: config,
        });
    }
};

/** Composer artifacts the save-to-dashboard tests read: one per outcome. */
export async function seed(knex: Knex): Promise<void> {
    const agent = await knex(AiAgentTableName)
        .where({
            project_uuid: SEED_PROJECT.project_uuid,
            slug: SEED_AI_AGENT.slug,
        })
        .first('ai_agent_uuid');
    if (!agent) throw new Error('Seed the AI agent before its artifacts');
    const existing = await knex(AiArtifactsTableName)
        .where('ai_artifact_uuid', revenueByStatus.ref.artifactUuid)
        .first();
    if (existing) return;
    await seedThread(
        knex,
        agent.ai_agent_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        artifacts,
    );
    await seedThread(knex, agent.ai_agent_uuid, SEED_ORG_1_VIEWER.user_uuid, [
        viewerArtifact,
    ]);
}
