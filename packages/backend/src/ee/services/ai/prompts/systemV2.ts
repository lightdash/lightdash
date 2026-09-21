import {
    AiAgentDocumentContext,
    AiWritebackAttribution,
    Explore,
    WarehouseTypes,
    type AgentSqlScope,
    type CustomChartTypeLibrary,
} from '@lightdash/common';
import { SystemModelMessage } from 'ai';
import moment from 'moment';
import { AiAgentSkillReference } from '../skills/types';
import {
    AiAgentDeepResearchRunContext,
    AiAgentRequestingUser,
} from '../types/aiAgent';
import { escapeXmlText, xmlBuilder } from '../xmlBuilder';
import { renderAvailableCustomChartTypes } from './availableCustomChartTypes';
import { renderAvailableExplores } from './availableExplores';
import {
    EXPRESSION_SEARCH_FIELD_VALUES_FILTER_GUIDANCE,
    FILTER_EXPRESSION_GUIDANCE_SECTION,
    STRUCTURED_FILTER_GUIDANCE_SECTION,
    STRUCTURED_SEARCH_FIELD_VALUES_FILTER_GUIDANCE,
} from './filterGuidance';
import { getAiWritebackSection } from './systemV2AiWriteback';
import { getCodingAgentSection } from './systemV2CodingAgent';
import {
    CONTENT_TOOLS_SECTION,
    DOCUMENT_TOOLS_SECTION,
} from './systemV2ContentTools';
import { DATA_ACCESS_DISABLED_SECTION } from './systemV2DataAccessDisabled';
import { DATA_ACCESS_ENABLED_SECTION } from './systemV2DataAccessEnabled';
import { GENERATE_DATA_APP_SECTION } from './systemV2DataApps';
import { MEMORIES_SECTION } from './systemV2Memories';
import {
    REPO_FS_SECTION,
    repoFsRootHint,
    repoFsSearchCaveat,
} from './systemV2RepoFs';
import { getRequestingUserSection } from './systemV2RequestingUser';
import { getRunSqlSection } from './systemV2RunSql';
import { getSchedulingToolsSection } from './systemV2SchedulingTools';
import { SEARCH_SEMANTIC_LAYER_SECTION } from './systemV2SearchSemanticLayer';
import { renderAvailableSkills } from './systemV2Skills';
import { getSlackLinksOnlySection } from './systemV2SlackLinksOnly';
import { SYSTEM_PROMPT_TEMPLATE } from './systemV2Template';

const getDataAccessSection = (
    enableDataAccess: boolean,
    slackLinksOnly: boolean,
): string => {
    if (slackLinksOnly) return getSlackLinksOnlySection(enableDataAccess);
    return enableDataAccess
        ? DATA_ACCESS_ENABLED_SECTION
        : DATA_ACCESS_DISABLED_SECTION;
};

export const getSystemPromptV2 = (args: {
    availableExplores: Explore[];
    availableCustomChartTypes?: CustomChartTypeLibrary;
    availableSkills?: AiAgentSkillReference[];
    knowledgeDocuments?: AiAgentDocumentContext[];
    deepResearchRuns?: AiAgentDeepResearchRunContext[];
    hasProjectContext?: boolean;
    projectContextPreloaded?: boolean;
    enableFastMetadata?: boolean;
    enableChartExport?: boolean;
    instructions?: string;
    agentName?: string;
    requestingUser?: AiAgentRequestingUser | null;
    date?: string;
    enableDataAccess?: boolean;
    enableFilterExpressions?: boolean;
    enableAiWriteback?: boolean;
    writebackAttribution?: AiWritebackAttribution | null;
    enableCodingAgent?: boolean;
    siteUrl?: string;
    enableRepoDiscovery?: boolean;
    repoFsRoot?: string | null;
    // Whether the repo host supports server-side code search (GitHub yes,
    // GitLab no). Defaults true; when false the prompt steers off `search`.
    repoFsSupportsCodeSearch?: boolean;
    enableContentTools?: boolean;
    enableDocuments?: boolean;
    enableGenerateDataApp?: boolean;
    enableAiAgentMemory?: boolean;
    // Originating Slack channel for "this channel" scheduling targets; null on
    // web and MCP prompts.
    slackChannelId?: string | null;
    // Org Slack setting: the answer may not carry query results into Slack.
    slackLinksOnly?: boolean;
    canRunSql?: boolean;
    // When composer queries are on, the standalone runSql tool is withheld
    // and raw SQL runs as `sql` nodes inside runComposerQueries instead.
    enableComposerQueries?: boolean;
    enableMergeQueries?: boolean;
    warehouseType?: WarehouseTypes | null;
    warehouseSchema?: string | null;
    sqlScope?: AgentSqlScope | null;
    // runSql's own max, quoted in its prompt section.
    runSqlMaxLimit?: number;
    unauthenticatedMcpServerNames?: string[];
    mcpServers?: Array<{ name: string; toolNames: string[] }>;
}): SystemModelMessage => {
    const {
        instructions,
        agentName = 'Lightdash AI Analyst',
        requestingUser = null,
        date = moment().utc().format('YYYY-MM-DD'),
        enableDataAccess = false,
        enableFilterExpressions = false,
        enableAiWriteback = false,
        writebackAttribution = null,
        enableCodingAgent = false,
        siteUrl = '',
        enableRepoDiscovery = false,
        repoFsRoot = null,
        repoFsSupportsCodeSearch = true,
        enableContentTools = false,
        enableDocuments = false,
        enableGenerateDataApp = false,
        enableAiAgentMemory = false,
        slackChannelId = null,
        slackLinksOnly = false,
        canRunSql = false,
        enableComposerQueries = false,
        enableMergeQueries = false,
        warehouseType = null,
        warehouseSchema = null,
        sqlScope = null,
        runSqlMaxLimit,
        unauthenticatedMcpServerNames = [],
        mcpServers = [],
    } = args;

    let crossExploreJoinRule: string;
    if (enableMergeQueries) {
        crossExploreJoinRule =
            '  - To combine fields from two explores that are not joined in the semantic layer, use generateVisualization with mergeConfig. Keep the primary query in queryConfig, put exactly one additional query in mergeConfig.additionalSources, and join dimensions at the same type and grain. Do not use runSql merely to combine explores.';
    } else if (enableComposerQueries) {
        crossExploreJoinRule =
            '  - You cannot mix fields from different explores in a single generateVisualization call. When the user needs data combined across explores that are not joined in the semantic layer, use runComposerQueries: one semanticLayer node per explore plus a duckdb node that joins their results.';
    } else if (canRunSql) {
        crossExploreJoinRule =
            '  - You cannot mix fields from different explores in a single generateVisualization call. When the user needs data combined across explores that are not joined in the semantic layer, use the runSql tool to write raw SQL across those tables.';
    } else {
        crossExploreJoinRule =
            '  - You can not mix fields from different explores.';
    }

    const customSqlLimitation = canRunSql
        ? ''
        : '\n- You cannot execute raw SQL or add custom SQL expressions to a query.';

    const renderKnowledgeDocument = (doc: AiAgentDocumentContext): string => {
        const { summary } = doc;
        const children: string[] = [
            xmlBuilder('description', null, escapeXmlText(summary.description)),
        ];
        if (summary.definedTerms.length > 0) {
            children.push(
                xmlBuilder(
                    'defines',
                    null,
                    escapeXmlText(summary.definedTerms.join(', ')),
                ),
            );
        }
        if (summary.relatedExploreNames.length > 0) {
            children.push(
                xmlBuilder(
                    'applies_to_explores',
                    null,
                    escapeXmlText(summary.relatedExploreNames.join(', ')),
                ),
            );
        }
        if (summary.useWhen) {
            children.push(
                xmlBuilder('use_when', null, escapeXmlText(summary.useWhen)),
            );
        }
        if (summary.warning) {
            children.push(
                xmlBuilder('warning', null, escapeXmlText(summary.warning)),
            );
        }
        const fullContent = doc.content ?? '';
        const hasFullContent =
            doc.alwaysIncludeInContext && fullContent.length > 0;
        if (hasFullContent) {
            children.push(
                xmlBuilder('full_content', null, escapeXmlText(fullContent)),
            );
        }
        return xmlBuilder(
            'knowledge_document',
            {
                uuid: doc.uuid,
                name: doc.name,
                relevance: summary.relevance,
                full_content_included: hasFullContent,
            },
            ...children,
        );
    };

    const knowledgeDocuments = args.knowledgeDocuments ?? [];
    const knowledgeDocumentsContent =
        knowledgeDocuments.length === 0
            ? 'No knowledge documents have been curated for this agent.'
            : knowledgeDocuments.map(renderKnowledgeDocument).join('\n');

    const deepResearchRuns = args.deepResearchRuns ?? [];
    const deepResearchContent =
        deepResearchRuns.length === 0
            ? ''
            : [
                  '## Deep Research in this conversation',
                  'This state is current for this user turn. Treat active progress separately from report findings. Never claim unfinished findings are available, implicitly start a duplicate run, or offer to cancel, restart, or modify a run.',
                  'For questions about report findings, call `listKnowledgeDocuments`, identify the matching Deep Research report, then call `getKnowledgeDocumentContent`. If more than one report could match, ask which research question the user means.',
                  xmlBuilder(
                      'deep_research_runs',
                      { count: deepResearchRuns.length },
                      ...deepResearchRuns.map((run) =>
                          xmlBuilder(
                              'deep_research_run',
                              {
                                  uuid: run.uuid,
                                  status: run.status,
                                  phase: run.phase,
                                  activity: run.activity,
                                  progress_current: run.progressCurrent,
                                  progress_total: run.progressTotal,
                                  started_at: run.startedAt,
                                  elapsed_seconds: run.elapsedSeconds,
                                  report_available: run.hasReport,
                              },
                              xmlBuilder(
                                  'question',
                                  null,
                                  escapeXmlText(run.question),
                              ),
                          ),
                      ),
                  ),
              ].join('\n');

    let projectContextContent =
        'No project context has been configured for this project.';
    if (args.hasProjectContext) {
        projectContextContent = args.projectContextPreloaded
            ? 'Relevant project business context is already preloaded for this request. Apply it BEFORE field discovery; treat it as authoritative over your own assumptions. This is a partial selection: use `loadProjectContext` for missing definitions, additional scope or conflicting rules. Do not reload the same entries merely to begin discovery.'
            : 'This project has curated business context (acronyms, definitions, rules). Call the `loadProjectContext` tool BEFORE grepFields — it can change which explore, field, or filter value you should use. Treat it as authoritative over your own assumptions.';
    }

    const AVAILABLE_EXPLORES_INLINE_LIMIT = 15;
    let availableExploresContent: string;
    if (args.availableExplores.length === 0) {
        availableExploresContent = canRunSql
            ? `No explores are available to this agent yet, but you DO have direct warehouse access. Do not tell the user there is no data. Instead, use listWarehouseTables and describeWarehouseTable to discover the schema, then answer questions with ${
                  enableComposerQueries
                      ? 'runComposerQueries using a sql node'
                      : 'runSql'
              }.`
            : 'No explores are available to this agent. Tell the user there is no data you can query and suggest they ask an administrator to set up explores or adjust the agent configuration.';
    } else if (
        args.availableExplores.length <= AVAILABLE_EXPLORES_INLINE_LIMIT
    ) {
        availableExploresContent = renderAvailableExplores(
            args.availableExplores,
        ).toString();
    } else {
        availableExploresContent = `This agent has access to ${args.availableExplores.length} explores. Use grepFields to discover the relevant one for each request.`;
    }

    const allowMarkdownTables =
        args.enableFastMetadata && !slackChannelId && !slackLinksOnly;
    const content = SYSTEM_PROMPT_TEMPLATE.replace(
        '{{self_improvement_section}}',
        '',
    )
        .replace(
            '{{table_request_guidance}}',
            allowMarkdownTables
                ? '- For a small tabular answer, use runQuery and present its results as a Markdown table. Use generateVisualization with defaultVizType: "table" when the user requests a table visualization or a saved, interactive or downloadable table.'
                : '- When a user asks for a "table", generate a table visualization with generateVisualization (defaultVizType: \'table\'). Never produce markdown tables.',
        )
        .replace(
            '{{response_format_guidance}}',
            allowMarkdownTables
                ? '- Use simple Markdown: bold, italics, lists, and Markdown tables with a header, separator and data rows. Use blank lines around tables. Never emit an empty table header followed by the same data as a list. Use ### headings only when needed to organize a longer answer. No # or ## headers, code blocks, images or horizontal rules.'
                : '- Use simple Markdown: `###`, bold, italics, lists. No `#` or `##` headers, no code blocks, no markdown tables, no images, no horizontal rules.',
        )
        .replace(
            '{{search_field_values_filter_guidance}}',
            enableFilterExpressions
                ? EXPRESSION_SEARCH_FIELD_VALUES_FILTER_GUIDANCE
                : STRUCTURED_SEARCH_FIELD_VALUES_FILTER_GUIDANCE,
        )
        .replace(
            '{{filter_guidance_section}}',
            enableFilterExpressions
                ? FILTER_EXPRESSION_GUIDANCE_SECTION
                : STRUCTURED_FILTER_GUIDANCE_SECTION,
        )
        .replace(
            '{{ai_writeback_section}}',
            enableAiWriteback
                ? getAiWritebackSection(
                      writebackAttribution,
                      siteUrl,
                      enableContentTools,
                  )
                : '',
        )
        .replace(
            '{{coding_agent_section}}',
            enableCodingAgent ? getCodingAgentSection() : '',
        )
        .replace(
            '{{repo_fs_section}}',
            enableRepoDiscovery
                ? REPO_FS_SECTION +
                      repoFsRootHint(repoFsRoot) +
                      repoFsSearchCaveat(repoFsSupportsCodeSearch)
                : '',
        )
        .replace(
            '{{search_semantic_layer_section}}',
            SEARCH_SEMANTIC_LAYER_SECTION,
        )
        .replace(
            '{{data_access_section}}',
            getDataAccessSection(enableDataAccess, slackLinksOnly),
        )
        .replace(
            '{{run_sql_section}}',
            canRunSql
                ? getRunSqlSection({
                      warehouseType,
                      warehouseSchema,
                      sqlScope,
                      runSqlMaxLimit,
                      viaComposerQueries: enableComposerQueries,
                  })
                : '',
        )
        .replace(
            '{{content_tools_section}}',
            enableContentTools
                ? [
                      CONTENT_TOOLS_SECTION,
                      enableDocuments ? DOCUMENT_TOOLS_SECTION : '',
                  ]
                      .filter(Boolean)
                      .join('\n\n')
                : '',
        )
        .replace(
            '{{generate_data_app_section}}',
            enableGenerateDataApp ? GENERATE_DATA_APP_SECTION : '',
        )
        .replace(
            '{{scheduling_tools_section}}',
            enableContentTools ? getSchedulingToolsSection(slackChannelId) : '',
        )
        .replace(
            '{{memories_section}}',
            enableAiAgentMemory ? MEMORIES_SECTION : '',
        )
        .replace('{{cross_explore_join_rule}}', crossExploreJoinRule)
        .replace('{{custom_sql_limitation}}', customSqlLimitation)
        .replace('{{agent_name}}', agentName)
        .replace(
            '{{instructions}}',
            instructions ? `Special instructions: ${instructions}` : '',
        )
        .replace(
            '{{requesting_user_section}}',
            getRequestingUserSection(requestingUser),
        )
        .replace('{{date}}', date)
        .replace('{{available_explores}}', availableExploresContent)
        .replace(
            '{{available_custom_chart_types}}',
            renderAvailableCustomChartTypes(
                args.availableCustomChartTypes ?? { types: [], totalCount: 0 },
            ),
        )
        .replace(
            '{{unloaded_knowledge_documents}}',
            args.enableFastMetadata
                ? 'other documents whose complete content has not already been preloaded for this request'
                : 'other documents',
        )
        .replace('{{knowledge_documents}}', knowledgeDocumentsContent)
        .replace('{{project_context}}', projectContextContent);

    const skillsSection = renderAvailableSkills(args.availableSkills ?? []);
    const mcpConnectionsSection =
        unauthenticatedMcpServerNames.length > 0
            ? `## MCP connections\n${unauthenticatedMcpServerNames
                  .map(
                      (name) =>
                          `${name} MCP connection is setup, but the current user is not logged in`,
                  )
                  .join('\n')}`
            : '';
    const hasLiveMcpTools = mcpServers.some(
        ({ toolNames }) => toolNames.length > 0,
    );
    const mcpToolsSection =
        mcpServers.length > 0
            ? [
                  '## MCP tools',
                  ...(hasLiveMcpTools
                      ? [
                            'MCP tool definitions are loaded on demand. You MUST call `loadMcpTools` with the exact names you need before calling any unloaded MCP tool. Never guess a tool input from its name. Loaded tools remain available for this thread.',
                        ]
                      : []),
                  ...mcpServers.map(
                      ({ name, toolNames }) =>
                          `- ${name}: ${[...toolNames].sort().join(', ') || '(no tools available)'}`,
                  ),
              ].join('\n')
            : '';

    const grepFieldsSection = [
        '## Finding fields (grepFields)',
        'To find which explore and fields can answer a question, use the `grepFields` tool instead of any other discovery step. It greps the field catalog (names, labels, descriptions, hints, tags) with case-insensitive keyword patterns (`|` for OR, space or .* between words for AND) and returns `explore/fieldId  [kind type]` lines grouped by explore.',
        '- The user message may already include a "Candidate fields pre-grepped from the catalog" block. Read it FIRST — if it contains the fields you need, use them directly and skip calling grepFields. Only call grepFields when those candidates do not cover the question or you need a different angle.',
        '- When you do call grepFields, pass several patterns in ONE call (the `patterns` array) covering the different angles of the question at once — e.g. `["revenue|sales", "country|region"]`. Do not grep one pattern, wait, then grep another.',
        '- Use meaningful keywords, not long natural-language phrases. Read the returned fieldIds and pick the single explore that answers at the right grain before building a query.',
        "- Once you have narrowed down to the explore(s) and field(s) you intend to use, call `getMetadata` (batching all of them in one call) to get the detail you need to build a correct query — an explore's joined tables and table filters, and a field's filter type, case-sensitivity, default time dimension and hints. grepFields tells you what exists; getMetadata tells you how to use it.",
        '- A description or hint ending in "...(truncated)" is incomplete — call getMetadata to read the full text before using that field.',
        "- Respect a metric's default time dimension, if it has one, unless the user explicitly requests a different time dimension.",
        "- Table filters marked `required` require every query to filter that field, but their configured operator and values are replaceable defaults, not fixed constraints on the data. When the user's requested scope differs, you MUST query the explore with a compatible filter on the same field or a derived time dimension of that field; it replaces the configured default. For example, if `created_at inThePast [4 weeks]` is required, use `created_at inThePast [10 months]` when the user asks for ten months. Never treat a required filter's default as a modelling limitation or switch to saved chart results because of it.",
        '- Table filters marked `suggested` are soft suggestions: apply them unless the user asks for a different range or scope.',
        '- If your literal patterns miss, grepFields automatically returns the closest catalog matches (fuzzy search, verified fields first) under "No exact grep matches" — use those rather than re-grepping a long list of synonyms.',
        '- Once you have the fieldIds you need, build the query. Do NOT re-grep for fields you already found, and do not call grepFields again between generateVisualization attempts — if a query fails, fix the query itself (filters, metric, grain), not the discovery. If you need a filter value you are unsure of (e.g. which status string exists), use searchFieldValues rather than guessing.',
    ].join('\n');

    const finalContent = [
        content,
        args.enableFastMetadata
            ? 'All assistant text is user-visible, including text before and between tool calls. Do not write context-preservation notes, scratchpads, field-ID inventories or summaries for yourself into the response when warned about context being cleared. Context housekeeping is handled by the application. Do not save temporary query results as durable user memories. Continue the user task using available evidence; if necessary, retrieve missing evidence with an authorized tool. Prior assistant notes are not evidence.'
            : '',
        args.enableFastMetadata
            ? 'Separate observed results from explanations. Correlation, timing and subgroup differences do not establish causation: a coverage drop does not prove an automation failed, a policy changed or someone followed a different process. Support causal claims with direct evidence about the mechanism, such as documented changes or an appropriate causal analysis. Label untested explanations as hypotheses, state what evidence would test them, and do not say alternatives are ruled out by descriptive counts alone. Do not invent statistical baselines, sampling limits or query constraints from the shape of the results; use the executed query and field definitions. Compare like-for-like periods; label partial periods and mutable current-state attributes rather than treating them as historical snapshots.'
            : '',
        args.enableFastMetadata
            ? 'Lead short answers with the result, not a generated title or a restatement of the request. Do not repeat the artifact title as a heading: the UI already labels the artifact. Summarize the key finding without duplicating the entire chart as both a table and a list. Include material scope and uncertainty, but avoid speculative diagnoses and unsolicited offers at the end of every answer.'
            : '',
        deepResearchContent,
        grepFieldsSection,
        args.enableFastMetadata
            ? 'For straightforward entity trends or breakdowns, use a single matching count definition and its configured default time granularity when available. A nearby revenue or amount field alone is not a reason to ask count versus amount. Apply explicit business rules and prior scope first; ask when count definitions genuinely compete. Do not invent a date restriction; state the measure, grain and scope used. When the current request or a field-search result includes preloaded catalog metadata, use those definitions, joins, filters and defaults directly. Only call getMetadata for missing or truncated details; do not repeat a metadata lookup to confirm the same details.'
            : '',
        args.enableFastMetadata
            ? 'Use runQuery when the user wants an answer from data without a chart; it returns rows without creating a chart artifact in web chat. Slack result cards are attached automatically. Use generateVisualization only when the user asks for a chart or visualization. Do not create a chart merely because the answer could be visualized.'
            : '',
        args.enableFastMetadata
            ? 'For a follow-up that changes only presentation, such as "as a line chart", reuse the preceding successful query tool input. Preserve its measure, filters and scope, add only the dimension or chart configuration required by the request, and call generateVisualization directly when the carried-forward candidates cover it.'
            : '',
        args.enableChartExport
            ? 'When exportChartAsCode is available, you MUST call it for chart YAML and never write or reconstruct YAML yourself. For a chart from an earlier turn, use its exact artifactUuid and versionUuid with null queryUuid when those references are already available. Otherwise call it with null for all three source identifiers to discover conversation artifacts. Pass null for an unspecified destination slug or spaceSlug; the tool reports missing values so you can ask the user. Do not search content to infer a destination, regenerate a chart or rerun data queries just to export it.'
            : '',
        args.enableFastMetadata
            ? 'When the user explicitly names a value to exclude, retain that exclusion in the executed query even if searchFieldValues finds no matching rows. A value search reports observed data, not permitted filter literals. Explain that the exclusion currently removes no rows; do not omit it or substitute a different category. If the intended category requires interpretation rather than literal matching, clarify it first.'
            : '',
        args.enableFastMetadata
            ? 'When applying or restating sourced business rules, preserve the exact predicate, entity grain, exceptions and date boundaries. Do not replace numeric conditions with broader labels: an amount equal to zero does not establish absence of the associated event, and excluding nonzero amounts is not the same as excluding only positive amounts. Distinguish a reporting-date window from the time at which a mutable attribute is evaluated. Do not invent current-state, historical-snapshot or timezone conventions when the sources do not specify them. State the missing convention if it affects the answer; keep supported rules intact.'
            : '',
        args.enableFastMetadata
            ? 'Category labels are values, not comparisons. A label such as "Low Cost" does not prove that its group is cheaper than another group. Use comparative or superlative wording only when the available result rows include every compared group or period and the values establish that ordering. Prior prose is not evidence; reuse or rerun the exact query when comparison rows are absent.'
            : '',
        args.enableFastMetadata
            ? 'For a definition or reference-only question, give the shortest complete answer: the definition, required conditions and exceptions, plus date scope only when requested. Preserve all requested rules. Avoid repeating them under multiple headings, speculative implementation caveats and offers to run future queries. Discuss an unspecified convention when the user asks about it or the requested result depends on choosing it; merely restating a documented definition does not require the user to settle every convention for a possible future query.'
            : '',
        mcpToolsSection,
        mcpConnectionsSection,
        skillsSection,
    ]
        .filter(Boolean)
        .join('\n\n');

    return {
        role: 'system',
        content: finalContent,
        providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
            bedrock: { cachePoint: { type: 'default' } },
        },
    };
};
