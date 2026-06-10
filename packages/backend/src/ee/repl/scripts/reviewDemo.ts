import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { OrganizationMembershipsTableName } from '../../../database/entities/organizationMemberships';
import { OrganizationTableName } from '../../../database/entities/organizations';
import { ProjectTableName } from '../../../database/entities/projects';
import { UserTableName } from '../../../database/entities/users';
import {
    AiOrganizationSettingsTableName,
    AiPromptTableName,
    AiThreadTableName,
    AiWebAppPromptTableName,
    AiWebAppThreadTableName,
} from '../../database/entities/ai';
import {
    AiAgentInstructionVersionsTableName,
    AiAgentTableName,
} from '../../database/entities/aiAgent';
import {
    AiAgentReviewClassifierRunTableName,
    AiAgentReviewItemTableName,
    AiAgentReviewRemediationTableName,
    AiAgentTurnSignalTableName,
} from '../../database/entities/aiAgentReviewClassifier';

const JAFFLE_SHOP_PROJECT_UUID = '3675b69e-8324-4110-bdca-059031aa8da3';
const DEMO_PREFIX = '[demo reviews]';
const DEMO_FINGERPRINT_PREFIX = 'demo-review:';
const DEMO_AGENT_SLUG = 'demo-review-agent';
const DEMO_THREAD_TITLE = `${DEMO_PREFIX} Dense review queue thread`;

type DemoFindingSeed = {
    slug: string;
    prompt: string;
    response: string | null;
    errorMessage?: string | null;
    correction: string;
    signal:
        | 'explicit_dispute'
        | 'implicit_correction'
        | 'retry_after_failure'
        | 'output_shape_correction';
    rootCause:
        | 'semantic_layer'
        | 'project_context'
        | 'agent_configuration'
        | 'data_gap'
        | 'product_capability'
        | 'runtime_reliability'
        | 'feedback_quality'
        | 'ambiguous';
    subcategories: string[];
    fixTargets: string[];
    ownerType:
        | 'semantic_layer_owner'
        | 'agent_admin'
        | 'product'
        | 'support'
        | 'unknown';
    recommendation: {
        actionType:
            | 'update_semantic_yaml'
            | 'update_agent_instructions'
            | 'add_knowledge_document'
            | 'route_to_product_work'
            | 'request_more_evidence'
            | 'no_action';
        title: string;
        rationale: string;
        targetRefs: Array<Record<string, unknown>>;
    } | null;
    targetRefs: Array<Record<string, unknown>>;
    reviewItemTitle: string;
    reviewItemDescription: string;
    status?: 'open' | 'in_progress';
    projectContextEntry?: {
        op: 'create' | 'update';
        id: string | null;
        kind: 'definition' | 'context';
        content: string;
        terms: string[];
        objects: string[];
    } | null;
};

const DEMO_FINDINGS: DemoFindingSeed[] = [
    {
        slug: 'cross-project-telemetry',
        prompt: 'Create dbt models and a Lightdash explore for AI agent telemetry across projects and organizations, then explain which org each event belongs to.',
        response:
            'I can model the telemetry, but I only found project-level joins so cross-project organization attribution may need to be inferred.',
        correction:
            'Cross-project org data exists in the organizations table plus tool calls, please include that instead of inferring.',
        signal: 'explicit_dispute',
        rootCause: 'data_gap',
        subcategories: ['missing_cross_project_data'],
        fixTargets: ['dbt_modeling_ticket'],
        ownerType: 'product',
        recommendation: {
            actionType: 'route_to_product_work',
            title: 'Add cross-project telemetry modeling support',
            rationale:
                'The request depends on data relationships that are not modeled in the current project.',
            targetRefs: [],
        },
        targetRefs: [],
        reviewItemTitle:
            'Create dbt models and Lightdash explore for AI agent telemetry and cross-project organization attribution',
        reviewItemDescription:
            'The answer could not reliably join telemetry back to organizations across projects.',
        status: 'open',
    },
    {
        slug: 'simple-metric-query',
        prompt: 'What is total monthly revenue for org 42, and please do not build a complex SQL query if a metric already exists.',
        response:
            'I wrote a SQL query over invoices and grouped by month to estimate total revenue.',
        correction:
            'You can just use the monthly revenue metric filtered by org_id, no need for custom SQL here.',
        signal: 'explicit_dispute',
        rootCause: 'agent_configuration',
        subcategories: ['query_approach'],
        fixTargets: ['agent_configuration_change'],
        ownerType: 'agent_admin',
        recommendation: {
            actionType: 'update_agent_instructions',
            title: 'Teach agent to prefer direct metric queries for simple aggregations',
            rationale:
                'The agent should prefer a known metric before falling back to bespoke SQL.',
            targetRefs: [],
        },
        targetRefs: [{ type: 'agent_config', setting: 'instructions' }],
        reviewItemTitle:
            'Teach agent to prefer direct metric queries for simple aggregations',
        reviewItemDescription:
            'The agent defaulted to a complex SQL path instead of using an existing metric.',
        status: 'open',
    },
    {
        slug: 'sql-approval-timeout',
        prompt: 'Run the SQL to roll revenue up to organization level and show me the result.',
        response: null,
        errorMessage: 'SQL approval request timed out before the query ran.',
        correction:
            'Roll up to org level, the query never finished because approval timed out.',
        signal: 'retry_after_failure',
        rootCause: 'runtime_reliability',
        subcategories: ['sql_approval_timeout'],
        fixTargets: ['runtime_reliability_ticket'],
        ownerType: 'support',
        recommendation: {
            actionType: 'route_to_product_work',
            title: 'Investigate recurring SQL approval timeouts',
            rationale:
                'The failure happened in runtime approval flow, not in project logic.',
            targetRefs: [],
        },
        targetRefs: [{ type: 'runtime', key: 'sql_approval_timeout' }],
        reviewItemTitle: 'SQL approval timeout in runSql tool',
        reviewItemDescription:
            'The agent was blocked by a runtime timeout before it could answer.',
        status: 'in_progress',
    },
    {
        slug: 'lookup-completeness',
        prompt: 'Look up this organization using both the project UUID and organization UUID I pasted, then tell me which project it belongs to.',
        response:
            'I found the project, but I only used the project UUID and ignored the organization identifier.',
        correction:
            'The org UUID was part of the lookup criteria, the answer should have checked both identifiers.',
        signal: 'implicit_correction',
        rootCause: 'agent_configuration',
        subcategories: ['incomplete_lookup_response'],
        fixTargets: ['agent_configuration_change'],
        ownerType: 'agent_admin',
        recommendation: {
            actionType: 'update_agent_instructions',
            title: 'Improve lookup completeness in agent instructions',
            rationale:
                'The instructions should require the agent to use all provided identifiers during lookup.',
            targetRefs: [],
        },
        targetRefs: [{ type: 'agent_config', setting: 'instructions' }],
        reviewItemTitle:
            'Improve user lookup completeness in agent instructions',
        reviewItemDescription:
            'The answer only used part of the provided identifiers during lookup.',
        status: 'open',
    },
    {
        slug: 'wau-metric-missing',
        prompt: 'How many weekly active users did we have last month? Please use the canonical metric if it exists.',
        response:
            'I approximated weekly active users from orders because I could not find a canonical metric.',
        correction:
            'Use the weekly_active_users metric in analytics instead of estimating from orders.',
        signal: 'explicit_dispute',
        rootCause: 'semantic_layer',
        subcategories: ['missing_metric'],
        fixTargets: ['semantic_yaml_patch'],
        ownerType: 'semantic_layer_owner',
        recommendation: {
            actionType: 'update_semantic_yaml',
            title: 'Create weekly active users metric in analytics',
            rationale:
                'The agent guessed because a canonical WAU metric was not easy to discover from the semantic layer.',
            targetRefs: [
                {
                    type: 'metric',
                    modelName: 'analytics',
                    metricName: 'weekly_active_users',
                },
            ],
        },
        targetRefs: [
            {
                type: 'metric',
                modelName: 'analytics',
                metricName: 'weekly_active_users',
            },
        ],
        reviewItemTitle: 'Create weekly active users metric in analytics',
        reviewItemDescription:
            'The agent estimated weekly active users instead of relying on a modeled metric.',
        status: 'open',
    },
    {
        slug: 'project-context-active-user',
        prompt: 'What does an active user mean for the Jaffle Shop team, and answer using the project-specific definition.',
        response:
            'An active user is probably anyone who placed an order in the last 30 days.',
        correction:
            'For Jaffle Shop, active user means a customer with a completed checkout in the last 28 days.',
        signal: 'explicit_dispute',
        rootCause: 'project_context',
        subcategories: ['business_definition'],
        fixTargets: ['project_context_rule'],
        ownerType: 'unknown',
        recommendation: {
            actionType: 'add_knowledge_document',
            title: 'Add active user definition to project context',
            rationale:
                'The answer guessed a business definition that should live in reusable project context.',
            targetRefs: [],
        },
        targetRefs: [],
        reviewItemTitle:
            'Teach the agent the Jaffle Shop definition of active user',
        reviewItemDescription:
            'The agent guessed the business definition instead of using project context.',
        projectContextEntry: {
            op: 'create',
            id: null,
            kind: 'definition',
            content:
                'Active user means a customer with a completed checkout in the last 28 days.',
            terms: ['active user'],
            objects: ['customers'],
        },
        status: 'open',
    },
    {
        slug: 'revenue-dimension-join',
        prompt: 'Break monthly revenue down by acquisition source and keep the joins aligned with the marketing explore.',
        response:
            'I grouped revenue by source, but the result came from the orders table only.',
        correction:
            'Use the marketing explore join path so acquisition source matches the semantic layer definition.',
        signal: 'explicit_dispute',
        rootCause: 'semantic_layer',
        subcategories: ['join_path'],
        fixTargets: ['semantic_yaml_patch'],
        ownerType: 'semantic_layer_owner',
        recommendation: {
            actionType: 'update_semantic_yaml',
            title: 'Align revenue by source with the marketing explore join path',
            rationale:
                'The semantic layer needs a clearer path for revenue by acquisition source.',
            targetRefs: [
                {
                    type: 'explore',
                    modelName: 'marketing',
                    exploreName: 'revenue_by_source',
                },
            ],
        },
        targetRefs: [
            {
                type: 'explore',
                modelName: 'marketing',
                exploreName: 'revenue_by_source',
            },
        ],
        reviewItemTitle:
            'Align revenue by source with the marketing explore join path',
        reviewItemDescription:
            'The answer used a join path that did not match the semantic-layer definition for acquisition source.',
        status: 'open',
    },
    {
        slug: 'missing-discount-source',
        prompt: 'Why did revenue drop after the spring promo? Include discount source attribution if we have it.',
        response:
            'Revenue dropped after the promo, but I do not have discount-source attribution in the warehouse.',
        correction:
            'That attribution is not modeled yet, so call that out clearly instead of implying you looked it up.',
        signal: 'implicit_correction',
        rootCause: 'data_gap',
        subcategories: ['missing_discount_source'],
        fixTargets: ['dbt_modeling_ticket'],
        ownerType: 'product',
        recommendation: {
            actionType: 'route_to_product_work',
            title: 'Model discount-source attribution in the warehouse',
            rationale:
                'The requested attribution is not available in the current data model.',
            targetRefs: [],
        },
        targetRefs: [],
        reviewItemTitle: 'Model discount-source attribution for promo analysis',
        reviewItemDescription:
            'The answer needed attribution data that does not exist in the current project.',
        status: 'open',
    },
    {
        slug: 'csv-export-capability',
        prompt: 'Export the answer as a styled CSV with separate tabs for revenue and users.',
        response:
            'I can answer the question, but I cannot create a multi-tab CSV export.',
        correction:
            'That export format is unsupported, say so plainly and suggest an alternative.',
        signal: 'output_shape_correction',
        rootCause: 'product_capability',
        subcategories: ['unsupported_export_format'],
        fixTargets: ['product_capability_ticket'],
        ownerType: 'product',
        recommendation: {
            actionType: 'route_to_product_work',
            title: 'Clarify unsupported multi-tab CSV exports',
            rationale:
                'The request asks for an output shape the product does not support.',
            targetRefs: [
                { type: 'product_capability', capabilityKey: 'csv_tabs' },
            ],
        },
        targetRefs: [{ type: 'product_capability', capabilityKey: 'csv_tabs' }],
        reviewItemTitle: 'Clarify unsupported multi-tab CSV export requests',
        reviewItemDescription:
            'The request asked for an output format the product cannot create.',
        status: 'open',
    },
    {
        slug: 'needs-triage',
        prompt: 'Show me the latest retention number and then compare it with the cohort view from last quarter.',
        response:
            'I answered with the latest retention number but skipped the cohort comparison.',
        correction:
            'I was actually changing the question midway, not correcting the first part.',
        signal: 'implicit_correction',
        rootCause: 'ambiguous',
        subcategories: ['needs_human_review'],
        fixTargets: ['feedback_needed'],
        ownerType: 'unknown',
        recommendation: {
            actionType: 'request_more_evidence',
            title: 'Review whether this was a real failure',
            rationale:
                'The follow-up could be a correction or just a change in user intent.',
            targetRefs: [],
        },
        targetRefs: [],
        reviewItemTitle:
            'Review whether the retention follow-up was a real failure',
        reviewItemDescription:
            'The follow-up may reflect a new question instead of a concrete correction.',
        status: 'open',
    },
];

type ProjectContext = {
    organizationUuid: string;
    organizationId: number;
    projectUuid: string;
    createdByUserUuid: string | null;
};

const buildAppUrl = (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
): string =>
    `/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`;

async function getProjectContext(
    trx: Knex.Transaction,
    projectUuid: string,
): Promise<ProjectContext> {
    const project = await trx(ProjectTableName)
        .join(
            OrganizationTableName,
            `${ProjectTableName}.organization_id`,
            `${OrganizationTableName}.organization_id`,
        )
        .select<
            {
                organizationUuid: string;
                organizationId: number;
                projectUuid: string;
                createdByUserUuid: string | null;
            }[]
        >([
            `${OrganizationTableName}.organization_uuid as organizationUuid`,
            `${OrganizationTableName}.organization_id as organizationId`,
            `${ProjectTableName}.project_uuid as projectUuid`,
            `${ProjectTableName}.created_by_user_uuid as createdByUserUuid`,
        ])
        .where(`${ProjectTableName}.project_uuid`, projectUuid)
        .first();

    if (!project) {
        throw new Error(`Project not found: ${projectUuid}`);
    }

    return project;
}

async function getSeedUserUuid(
    trx: Knex.Transaction,
    project: ProjectContext,
): Promise<string> {
    if (project.createdByUserUuid) {
        return project.createdByUserUuid;
    }

    const user = await trx(OrganizationMembershipsTableName)
        .join(
            UserTableName,
            `${OrganizationMembershipsTableName}.user_id`,
            `${UserTableName}.user_id`,
        )
        .select<{ userUuid: string }[]>(
            `${UserTableName}.user_uuid as userUuid`,
        )
        .where(
            `${OrganizationMembershipsTableName}.organization_id`,
            project.organizationId,
        )
        .where(`${UserTableName}.is_active`, true)
        .orderBy(`${OrganizationMembershipsTableName}.created_at`, 'asc')
        .first();

    if (!user) {
        throw new Error('No active user found for demo review seed');
    }

    return user.userUuid;
}

async function ensureReviewsEnabled(
    trx: Knex.Transaction,
    organizationUuid: string,
): Promise<void> {
    const existing = await trx(AiOrganizationSettingsTableName)
        .where('organization_uuid', organizationUuid)
        .first();

    if (existing) {
        await trx(AiOrganizationSettingsTableName)
            .where('organization_uuid', organizationUuid)
            .update({
                ai_agents_visible: true,
                ai_agent_reviews_enabled: true,
            });
        return;
    }

    await trx(AiOrganizationSettingsTableName).insert({
        organization_uuid: organizationUuid,
        ai_agents_visible: true,
        ai_agent_reviews_enabled: true,
    });
}

async function ensureAgent(
    trx: Knex.Transaction,
    project: ProjectContext,
): Promise<{ agentUuid: string; createdDemoAgent: boolean }> {
    const existingAgent = await trx(AiAgentTableName)
        .select<{ ai_agent_uuid: string }[]>(['ai_agent_uuid'])
        .where('project_uuid', project.projectUuid)
        .where('is_system', false)
        .orderBy('created_at', 'asc')
        .first();

    if (existingAgent) {
        return {
            agentUuid: existingAgent.ai_agent_uuid,
            createdDemoAgent: false,
        };
    }

    const agentUuid = randomUUID();
    await trx(AiAgentTableName).insert({
        ai_agent_uuid: agentUuid,
        organization_uuid: project.organizationUuid,
        project_uuid: project.projectUuid,
        name: 'Demo review agent',
        slug: DEMO_AGENT_SLUG,
        description: 'Local agent used for dense review demo data',
        image_url: null,
        tags: ['demo'],
        enable_data_access: true,
        enable_self_improvement: false,
        enable_content_tools: true,
        is_system: false,
        version: 1,
    });
    await trx(AiAgentInstructionVersionsTableName).insert({
        ai_agent_uuid: agentUuid,
        instruction:
            'Demo agent used to seed dense AI review findings in development.',
    });

    return { agentUuid, createdDemoAgent: true };
}

async function createThread(
    trx: Knex.Transaction,
    project: ProjectContext,
    agentUuid: string,
    userUuid: string,
): Promise<string> {
    const threadUuid = randomUUID();
    await trx(AiThreadTableName).insert({
        ai_thread_uuid: threadUuid,
        organization_uuid: project.organizationUuid,
        project_uuid: project.projectUuid,
        created_from: 'web_app',
        agent_uuid: agentUuid,
        title: DEMO_THREAD_TITLE,
    } as never);
    await trx(AiWebAppThreadTableName).insert({
        ai_thread_uuid: threadUuid,
        user_uuid: userUuid,
    });
    return threadUuid;
}

function buildDemoEvidence(seed: DemoFindingSeed) {
    const evidence = [
        {
            source: 'user_prompt',
            text: seed.prompt,
            redacted: false,
        },
    ];

    if (seed.response) {
        evidence.push({
            source: 'assistant_answer',
            text: seed.response,
            redacted: false,
        });
    }

    evidence.push({
        source: 'next_user_prompt',
        text: seed.correction,
        redacted: false,
    });

    return evidence;
}

export function getAiAgentReviewDemoScripts(database: Knex) {
    async function cleanupAiAgentReviewDemo(
        projectUuid: string = JAFFLE_SHOP_PROJECT_UUID,
    ) {
        return database.transaction(async (trx) => {
            const demoThreadRows = await trx(AiThreadTableName)
                .select<{ ai_thread_uuid: string }[]>('ai_thread_uuid')
                .where('project_uuid', projectUuid)
                .where('title', DEMO_THREAD_TITLE);
            const demoThreadUuids = demoThreadRows.map(
                (row) => row.ai_thread_uuid,
            );

            const demoPromptRows = demoThreadUuids.length
                ? await trx(AiPromptTableName)
                      .select<{ ai_prompt_uuid: string }[]>('ai_prompt_uuid')
                      .whereIn('ai_thread_uuid', demoThreadUuids)
                : [];
            const demoPromptUuids = demoPromptRows.map(
                (row) => row.ai_prompt_uuid,
            );

            await trx(AiAgentReviewRemediationTableName)
                .where('fingerprint', 'like', `${DEMO_FINGERPRINT_PREFIX}%`)
                .delete();
            await trx(AiAgentReviewItemTableName)
                .where('fingerprint', 'like', `${DEMO_FINGERPRINT_PREFIX}%`)
                .delete();
            await trx(AiAgentTurnSignalTableName)
                .modify((query) => {
                    void query.where(
                        'fingerprint',
                        'like',
                        `${DEMO_FINGERPRINT_PREFIX}%`,
                    );
                    if (demoThreadUuids.length > 0) {
                        void query.orWhereIn('ai_thread_uuid', demoThreadUuids);
                    }
                })
                .delete();
            await trx(AiAgentReviewClassifierRunTableName)
                .where('review_agent_version', `${DEMO_PREFIX} seed`)
                .delete();

            if (demoPromptUuids.length > 0) {
                await trx(AiWebAppPromptTableName)
                    .whereIn('ai_prompt_uuid', demoPromptUuids)
                    .delete();
            }
            if (demoThreadUuids.length > 0) {
                await trx(AiPromptTableName)
                    .whereIn('ai_thread_uuid', demoThreadUuids)
                    .delete();
                await trx(AiWebAppThreadTableName)
                    .whereIn('ai_thread_uuid', demoThreadUuids)
                    .delete();
                await trx(AiThreadTableName)
                    .whereIn('ai_thread_uuid', demoThreadUuids)
                    .delete();
            }

            const demoAgents = await trx(AiAgentTableName)
                .select<{ ai_agent_uuid: string }[]>('ai_agent_uuid')
                .where('project_uuid', projectUuid)
                .where('slug', DEMO_AGENT_SLUG);
            const demoAgentUuids = demoAgents.map((row) => row.ai_agent_uuid);
            if (demoAgentUuids.length > 0) {
                await trx(AiAgentInstructionVersionsTableName)
                    .whereIn('ai_agent_uuid', demoAgentUuids)
                    .delete();
                await trx(AiAgentTableName)
                    .whereIn('ai_agent_uuid', demoAgentUuids)
                    .delete();
            }

            return {
                deletedThreads: demoThreadUuids.length,
                deletedPrompts: demoPromptUuids.length,
                deletedAgents: demoAgentUuids.length,
            };
        });
    }

    async function seedAiAgentReviewDemo(
        projectUuid: string = JAFFLE_SHOP_PROJECT_UUID,
    ) {
        await cleanupAiAgentReviewDemo(projectUuid);

        return database.transaction(async (trx) => {
            const project = await getProjectContext(trx, projectUuid);
            const userUuid = await getSeedUserUuid(trx, project);
            await ensureReviewsEnabled(trx, project.organizationUuid);
            const { agentUuid, createdDemoAgent } = await ensureAgent(
                trx,
                project,
            );
            const threadUuid = await createThread(
                trx,
                project,
                agentUuid,
                userUuid,
            );

            const runUuid = randomUUID();
            await trx(AiAgentReviewClassifierRunTableName).insert({
                ai_agent_review_run_uuid: runUuid,
                organization_uuid: project.organizationUuid,
                status: 'completed',
                review_agent_version: `${DEMO_PREFIX} seed`,
                judge_prompt_hash: `${DEMO_PREFIX}:judge`,
                run_scope: {
                    type: 'manual',
                    requestedByUserUuid: userUuid,
                    filters: {
                        source: 'demo-review-seed',
                    },
                },
                total_turns: DEMO_FINDINGS.length,
                processed_turns: DEMO_FINDINGS.length,
                signal_count: DEMO_FINDINGS.length,
                finding_count: DEMO_FINDINGS.length,
                review_item_count: DEMO_FINDINGS.length,
                completed_at: trx.fn.now(),
            } as never);

            const createdFingerprints: string[] = [];
            for (const [index, finding] of DEMO_FINDINGS.entries()) {
                const promptUuid = randomUUID();
                const fingerprint = `${DEMO_FINGERPRINT_PREFIX}${finding.slug}`;
                const createdAt = new Date(
                    Date.now() - (DEMO_FINDINGS.length - index) * 60_000,
                );

                // These inserts are intentionally sequential so prompts, signals,
                // and review items stay time-ordered in the seeded thread.
                // eslint-disable-next-line no-await-in-loop
                await trx(AiPromptTableName).insert({
                    ai_prompt_uuid: promptUuid,
                    ai_thread_uuid: threadUuid,
                    created_by_user_uuid: userUuid,
                    prompt: `${DEMO_PREFIX} ${finding.prompt}`,
                    response: finding.response,
                    error_message: finding.errorMessage ?? null,
                    responded_at: createdAt,
                    model_config: {
                        modelName: 'gpt-5',
                        modelProvider: 'openai',
                    },
                    token_usage: {
                        totalTokens: 1200 + index * 37,
                    },
                    created_at: createdAt,
                } as never);
                // eslint-disable-next-line no-await-in-loop
                await trx(AiWebAppPromptTableName).insert({
                    ai_prompt_uuid: promptUuid,
                    user_uuid: userUuid,
                });

                // eslint-disable-next-line no-await-in-loop
                await trx(AiAgentTurnSignalTableName).insert({
                    ai_agent_review_turn_signal_uuid: randomUUID(),
                    ai_agent_review_run_uuid: runUuid,
                    ai_prompt_uuid: promptUuid,
                    ai_thread_uuid: threadUuid,
                    organization_uuid: project.organizationUuid,
                    project_uuid: project.projectUuid,
                    agent_uuid: agentUuid,
                    interaction_source: 'app',
                    source_ref: {
                        source: 'app',
                        threadUuid,
                        promptUuid,
                        appUrl: buildAppUrl(
                            project.projectUuid,
                            agentUuid,
                            threadUuid,
                        ),
                    },
                    signal: finding.signal,
                    implicit_signal_sources: ['next_user_correction'],
                    confidence: 'high',
                    promoted_to_finding: true,
                    promotion_reason: 'Seeded for local review-density QA',
                    tool_evidence_refs: [],
                    fingerprint,
                    primary_root_cause: finding.rootCause,
                    secondary_root_causes: [],
                    subcategories: finding.subcategories,
                    fix_targets: finding.fixTargets,
                    target_refs: finding.targetRefs,
                    evidence_excerpts: buildDemoEvidence(finding),
                    recommendation: finding.recommendation,
                    project_context_entry: finding.projectContextEntry ?? null,
                    owner_type: finding.ownerType,
                    review_item_title: finding.reviewItemTitle,
                    review_item_description: finding.reviewItemDescription,
                    runtime_context_snapshot: {
                        userUuid,
                        canRunSql: true,
                        canManageAgent: true,
                    },
                    model_metadata: {
                        provider: 'openai',
                        model: 'gpt-5',
                    },
                    created_at: createdAt,
                } as never);

                // eslint-disable-next-line no-await-in-loop
                await trx(AiAgentReviewItemTableName)
                    .insert({
                        fingerprint,
                        organization_uuid: project.organizationUuid,
                        project_uuid: project.projectUuid,
                        agent_uuid: agentUuid,
                        status: finding.status ?? 'open',
                        status_updated_at: createdAt,
                        status_updated_by_user_uuid: userUuid,
                    } as never)
                    .onConflict('fingerprint')
                    .merge({
                        status: finding.status ?? 'open',
                        status_updated_at: createdAt,
                        status_updated_by_user_uuid: userUuid,
                        updated_at: trx.fn.now(),
                    });

                createdFingerprints.push(fingerprint);
            }

            return {
                projectUuid: project.projectUuid,
                organizationUuid: project.organizationUuid,
                agentUuid,
                threadUuid,
                findingCount: DEMO_FINDINGS.length,
                createdDemoAgent,
                fingerprints: createdFingerprints,
            };
        });
    }

    return {
        seedAiAgentReviewDemo,
        cleanupAiAgentReviewDemo,
    };
}
