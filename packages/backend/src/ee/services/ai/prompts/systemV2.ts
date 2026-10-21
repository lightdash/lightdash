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
import type { DeferredPromptSection, PromptSection } from '../loadout';
import { AiAgentSkillReference } from '../skills/types';
import {
    AiAgentDeepResearchRunContext,
    AiAgentRequestingUser,
    AiAgentThreadBindingContext,
} from '../types/aiAgent';
import { renderKnowledgeDocumentSummary } from '../utils/renderKnowledgeDocumentSummary';
import { escapeXmlText, xmlBuilder } from '../xmlBuilder';
import { renderAvailableCustomChartTypes } from './availableCustomChartTypes';
import { renderAvailableExplores } from './availableExplores';
import {
    COMPOSER_FILTER_GUIDANCE_SECTION,
    EXPRESSION_SEARCH_FIELD_VALUES_FILTER_GUIDANCE,
    FILTER_EXPRESSION_GUIDANCE_SECTION,
    STRUCTURED_FILTER_GUIDANCE_SECTION,
    STRUCTURED_SEARCH_FIELD_VALUES_FILTER_GUIDANCE,
} from './filterGuidance';
import { getAiWritebackSection } from './systemV2AiWriteback';
import { getCodingAgentSection } from './systemV2CodingAgent';
import {
    DOCUMENT_NUDGES_GUIDANCE,
    getContentToolsSection,
    getDocumentToolsSection,
} from './systemV2ContentTools';
import { DATA_ACCESS_DISABLED_SECTION } from './systemV2DataAccessDisabled';
import { DATA_ACCESS_ENABLED_SECTION } from './systemV2DataAccessEnabled';
import { GENERATE_DATA_APP_SECTION } from './systemV2DataApps';
import { MEMORIES_SECTION } from './systemV2Memories';
import {
    COMPOSER_QUERY_PATH,
    getQueryingComposerSection,
} from './systemV2QueryingComposer';
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
import {
    CHART_TYPES_LIMITATION,
    CLASSIC_QUERY_PATH,
    FORECAST_LIMITATION,
    SYSTEM_PROMPT_TEMPLATE,
    type QueryPath,
} from './systemV2Template';
import {
    getThreadBindingSection,
    getThreadContextSection,
} from './systemV2ThreadSetup';

const getDataAccessSection = (
    enableDataAccess: boolean,
    slackLinksOnly: boolean,
): string => {
    if (slackLinksOnly) return getSlackLinksOnlySection(enableDataAccess);
    return enableDataAccess
        ? DATA_ACCESS_ENABLED_SECTION
        : DATA_ACCESS_DISABLED_SECTION;
};

const NO_PROMPT_SECTIONS: ReadonlySet<PromptSection> = new Set();

const getFilterGuidanceSection = (
    composer: boolean,
    enableFilterExpressions: boolean,
): string => {
    if (composer) return COMPOSER_FILTER_GUIDANCE_SECTION;
    return enableFilterExpressions
        ? FILTER_EXPRESSION_GUIDANCE_SECTION
        : STRUCTURED_FILTER_GUIDANCE_SECTION;
};

export type CapabilitySectionArgs = {
    // Sections the loadout renders; everything else in the prompt is wording.
    promptSections?: ReadonlySet<PromptSection>;
    availableSkills?: AiAgentSkillReference[];
    enableDocumentNudges?: boolean;
    enableDocumentCustomCharts?: boolean;
    slackChannelId?: string | null;
    warehouseType?: WarehouseTypes | null;
    warehouseSchema?: string | null;
    warehouseConnections?: {
        name: string;
        warehouseConnectionUuid: string | null;
        warehouseType: WarehouseTypes;
        isOriginal: boolean;
    }[];
    sqlScope?: AgentSqlScope | null;
    runSqlMaxLimit?: number;
    canRunQuery?: boolean;
};

const getCapabilitySections = (
    args: CapabilitySectionArgs,
): Record<DeferredPromptSection, string> => {
    const sections = args.promptSections ?? NO_PROMPT_SECTIONS;
    const canRunQuery = args.canRunQuery ?? false;
    const composer = sections.has('queryingComposer');
    return {
        runSql: sections.has('runSql')
            ? getRunSqlSection({
                  warehouseType: args.warehouseType ?? null,
                  warehouseSchema: args.warehouseSchema ?? null,
                  warehouseConnections: args.warehouseConnections ?? [],
                  sqlScope: args.sqlScope ?? null,
                  runSqlMaxLimit: args.runSqlMaxLimit,
                  viaComposerQueries: composer,
                  canRunQuery,
              })
            : '',
        contentTools: sections.has('contentTools')
            ? [
                  getContentToolsSection({
                      canRunQuery,
                      viaComposerQueries: composer,
                  }),
                  sections.has('documents')
                      ? getDocumentToolsSection({
                            customCharts:
                                args.enableDocumentCustomCharts ?? false,
                            nudges: args.enableDocumentNudges ?? false,
                            viaComposerQueries: composer,
                        })
                      : '',
              ]
                  .filter(Boolean)
                  .join('\n\n')
            : '',
        schedulingTools: sections.has('schedulingTools')
            ? getSchedulingToolsSection(args.slackChannelId ?? null)
            : '',
        generateDataApp: sections.has('generateDataApp')
            ? GENERATE_DATA_APP_SECTION
            : '',
        skills: sections.has('skills')
            ? renderAvailableSkills(args.availableSkills ?? [])
            : '',
    };
};

/** Instructions for capabilities left out of the system prompt, returned when the agent loads the remaining tools. */
export const getDeferredToolInstructions = (
    args: CapabilitySectionArgs,
    deferredSections: ReadonlySet<DeferredPromptSection>,
): string => {
    const sections = getCapabilitySections(args);
    return [...deferredSections]
        .map((section) => sections[section])
        .filter(Boolean)
        .join('\n\n');
};

export const getSystemPromptV2 = (
    args: CapabilitySectionArgs & {
        availableExplores: Explore[];
        // Capability sections withheld until the agent loads the matching tools.
        deferredSections?: ReadonlySet<DeferredPromptSection>;
        availableCustomChartTypes?: CustomChartTypeLibrary;
        knowledgeDocuments?: AiAgentDocumentContext[];
        deepResearchRuns?: AiAgentDeepResearchRunContext[];
        hasProjectContext?: boolean;
        projectContextPreloaded?: boolean;
        enableChartExport?: boolean;
        instructions?: string;
        agentName?: string;
        requestingUser?: AiAgentRequestingUser | null;
        threadBinding?: AiAgentThreadBindingContext | null;
        threadContext?: string | null;
        date?: string;
        enableDataAccess?: boolean;
        enableFilterExpressions?: boolean;
        writebackAttribution?: AiWritebackAttribution | null;
        siteUrl?: string;
        repoFsRoot?: string | null;
        // Whether the repo host supports server-side code search (GitHub yes,
        // GitLab no). Defaults true; when false the prompt steers off `search`.
        repoFsSupportsCodeSearch?: boolean;
        // Org Slack setting: the answer may not carry query results into Slack.
        slackLinksOnly?: boolean;
        canRunSql?: boolean;
        // Python nodes in runComposerQueries; only meaningful for the composer base.
        enableComposerPythonNodes?: boolean;
        unauthenticatedMcpServerNames?: string[];
        mcpServers?: Array<{ name: string; toolNames: string[] }>;
    },
): SystemModelMessage => {
    const {
        instructions,
        agentName = 'Lightdash AI Analyst',
        requestingUser = null,
        threadBinding = null,
        threadContext = null,
        date = moment().utc().format('YYYY-MM-DD'),
        enableDataAccess = false,
        enableFilterExpressions = false,
        writebackAttribution = null,
        siteUrl = '',
        repoFsRoot = null,
        repoFsSupportsCodeSearch = true,
        promptSections = NO_PROMPT_SECTIONS,
        slackChannelId = null,
        slackLinksOnly = false,
        canRunSql = false,
        canRunQuery = false,
        enableComposerPythonNodes = false,
        unauthenticatedMcpServerNames = [],
        deferredSections = new Set<DeferredPromptSection>(),
        mcpServers = [],
    } = args;

    const capabilitySections = getCapabilitySections(args);
    const contentToolsEnabled = promptSections.has('contentTools');
    const composer = promptSections.has('queryingComposer');
    const getCapabilitySection = (section: DeferredPromptSection) =>
        deferredSections.has(section) ? '' : capabilitySections[section];

    let crossExploreJoinRule: string;
    if (canRunSql && (args.warehouseConnections?.length ?? 0) > 1) {
        crossExploreJoinRule =
            '  - You cannot mix fields from different explores in a single generateVisualization call. Raw SQL can combine tables only on the original connection. Do not join tables across connections; explain this limit.';
    } else if (canRunSql) {
        crossExploreJoinRule =
            '  - You cannot mix fields from different explores in a single generateVisualization call. When the user needs data combined across explores that are not joined in the semantic layer, use the runSql tool to write raw SQL across those tables.';
    } else {
        crossExploreJoinRule =
            '  - You can not mix fields from different explores.';
    }
    const queryPath: QueryPath = composer
        ? {
              ...COMPOSER_QUERY_PATH,
              queryLanguageSections: getQueryingComposerSection({
                  enablePythonNodes: enableComposerPythonNodes,
                  slackChannelId,
              }),
          }
        : {
              ...CLASSIC_QUERY_PATH,
              queryLanguageSections: `${CLASSIC_QUERY_PATH.queryLanguageSections}\n\n${crossExploreJoinRule}`,
          };

    let customSqlLimitation = '';
    if (!canRunSql) {
        customSqlLimitation = composer
            ? '\n- Warehouse data comes from semanticLayer nodes; raw SQL against the warehouse is unavailable.'
            : '\n- You cannot execute raw SQL or add custom SQL expressions to a query.';
    }

    const renderKnowledgeDocument = (doc: AiAgentDocumentContext): string => {
        const { summary } = doc;
        const children = renderKnowledgeDocumentSummary(summary);
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
                  'This state is current for this user turn. Treat active progress separately from report findings. Never claim unfinished findings are available, implicitly start a duplicate run, or offer to cancel, restart, or change a running investigation.',
                  'For questions about report findings, call `listKnowledgeDocuments`, identify the matching Deep Research report, then call `getKnowledgeDocumentContent`. If more than one report could match, ask which research question the user means.',
                  contentToolsEnabled
                      ? 'A published report is a Document you can update. Only when the user clearly asks to change the report itself (for example to add, extend or fix a section or chart), `readContent` it by its Document slug, then `editContent` it: change only what was asked and keep every other section and chart exactly as it is. Each edit saves a new version of the same Document. Otherwise answer in the conversation; if it is unclear whether the user wants the report updated, ask.'
                      : 'You cannot update a published report here. If the user asks to change one, say that updating reports requires the "Create and edit content" setting on this agent, which an admin can turn on, and that they can also edit the Document directly. Do not offer to rewrite or regenerate the report.',
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
    if (promptSections.has('projectContext') && args.hasProjectContext) {
        projectContextContent = args.projectContextPreloaded
            ? 'Relevant project business context is already preloaded for this request. Apply it BEFORE field discovery; treat it as authoritative over your own assumptions. This is a partial selection: use `loadProjectContext` for missing definitions, additional scope or conflicting rules. Do not reload the same entries merely to begin discovery.'
            : 'This project has curated business context (acronyms, definitions, rules). Call the `loadProjectContext` tool BEFORE grepFields — it can change which explore, field, or filter value you should use. Treat it as authoritative over your own assumptions.';
    }

    const AVAILABLE_EXPLORES_INLINE_LIMIT = 15;
    let availableExploresContent: string;
    if (args.availableExplores.length === 0) {
        availableExploresContent = canRunSql
            ? `No explores are available to this agent yet, but you DO have direct warehouse access. Do not tell the user there is no data. Instead, use listWarehouseTables and describeWarehouseTable to discover the schema, then answer questions with ${
                  composer ? 'runComposerQueries using a sql node' : 'runSql'
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

    const allowMarkdownTables = !slackChannelId && !slackLinksOnly;
    const allowSlackTableSelection =
        !!slackChannelId && enableDataAccess && !slackLinksOnly;
    let tableRequestGuidance: string;
    if (composer) {
        tableRequestGuidance = allowMarkdownTables
            ? '- For a small tabular answer, present its rows as a Markdown table. Present the result itself when the user asks for an interactive or downloadable table.'
            : '- When a user asks for a "table", present the result that answers it; it is shown as a table. Never produce markdown tables.';
    } else if (!allowMarkdownTables) {
        tableRequestGuidance =
            '- When a user asks for a "table", generate a table visualization with generateVisualization (defaultVizType: \'table\'). Never produce markdown tables.';
    } else {
        tableRequestGuidance = `- For a small tabular answer, ${canRunQuery ? 'use runQuery and present its results' : 'present the results'} as a Markdown table. Use generateVisualization with defaultVizType: "table" when the user requests a table visualization or a saved, interactive or downloadable table.`;
    }
    const chartFollowupGuidance = composer
        ? 'For a follow-up that changes an existing result, preserve everything the user did not ask to change. When the requested field is absent from the carried-forward candidates, discover that field instead of binding its value to an unrelated existing dimension.'
        : 'For a follow-up that changes an existing chart, reuse the preceding successful query tool input. Preserve everything the user did not ask to change. Apply the requested presentation, filter, sort, limit, segmentation, grouping or grain change and call generateVisualization; never claim the chart was updated unless that call succeeds. When the requested field is absent from the carried-forward candidates, discover that field instead of binding its value to an unrelated existing dimension.';
    const answerQueryGuidance = slackChannelId
        ? 'Use runQuery when the user wants an answer from data without a chart; summarize from its rows when data access is available. Select generated tables or charts in the final response only when requested or useful. Use generateVisualization only when the user asks for a chart or visualization. Do not create a chart merely because the answer could be visualized.'
        : 'Use runQuery when the user wants an answer from data without a chart; it returns rows as a table rather than a chart. Slack result cards are attached automatically. Use generateVisualization only when the user asks for a chart or visualization. Do not create a chart merely because the answer could be visualized.';
    // Function replacers keep any `$` in the inserted text literal.
    const content = SYSTEM_PROMPT_TEMPLATE.replace(
        '{{internal_tool_examples}}',
        () => queryPath.internalToolExamples,
    )
        .replace(
            '{{dashboard_request_guidance}}',
            () => queryPath.dashboardRequestGuidance,
        )
        .replace('{{discovery_outcomes}}', () => queryPath.discoveryOutcomes)
        .replace('{{query_step}}', () => queryPath.queryStep)
        .replace(
            '{{query_language_sections}}',
            () => queryPath.queryLanguageSections,
        )
        .replace('{{self_improvement_section}}', '')
        .replace('{{table_request_guidance}}', tableRequestGuidance)
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
            getFilterGuidanceSection(composer, enableFilterExpressions),
        )
        .replace(
            '{{ai_writeback_section}}',
            promptSections.has('aiWriteback')
                ? getAiWritebackSection({
                      attribution: writebackAttribution,
                      siteUrl,
                      canEditContent: contentToolsEnabled,
                      viaComposerQueries: composer,
                  })
                : '',
        )
        .replace(
            '{{coding_agent_section}}',
            promptSections.has('codingAgent') ? getCodingAgentSection() : '',
        )
        .replace(
            '{{repo_fs_section}}',
            promptSections.has('repoFs')
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
            '{{document_nudges_section}}',
            promptSections.has('documents') && args.enableDocumentNudges
                ? DOCUMENT_NUDGES_GUIDANCE
                : '',
        )
        .replace('{{run_sql_section}}', getCapabilitySection('runSql'))
        .replace(
            '{{content_tools_section}}',
            getCapabilitySection('contentTools'),
        )
        .replace(
            '{{generate_data_app_section}}',
            getCapabilitySection('generateDataApp'),
        )
        .replace(
            '{{scheduling_tools_section}}',
            getCapabilitySection('schedulingTools'),
        )
        .replace(
            '{{memories_section}}',
            promptSections.has('memories') ? MEMORIES_SECTION : '',
        )
        .replace('{{custom_sql_limitation}}', customSqlLimitation)
        // Composer results pick their chart through the present marker.
        .replace(
            '{{chart_types_limitation}}',
            composer ? '' : CHART_TYPES_LIMITATION,
        )
        .replace(
            '{{forecast_limitation}}',
            composer && enableComposerPythonNodes ? '' : FORECAST_LIMITATION,
        )
        .replace('{{agent_name}}', agentName)
        .replace(
            '{{instructions}}',
            instructions ? `Special instructions: ${instructions}` : '',
        )
        .replace(
            '{{requesting_user_section}}',
            promptSections.has('requestingUser')
                ? getRequestingUserSection(requestingUser)
                : '',
        )
        .replace('{{date}}', date)
        .replace('{{available_explores}}', availableExploresContent)
        .replace(
            '{{available_custom_chart_types}}',
            promptSections.has('availableCustomChartTypes')
                ? renderAvailableCustomChartTypes(
                      args.availableCustomChartTypes ?? {
                          types: [],
                          totalCount: 0,
                      },
                  )
                : '',
        )
        .replace(
            '{{unloaded_knowledge_documents}}',
            'other documents whose complete content has not already been preloaded for this request',
        )
        .replace('{{knowledge_documents}}', knowledgeDocumentsContent)
        .replace('{{project_context}}', projectContextContent);

    const skillsSection = getCapabilitySection('skills');
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
        promptSections.has('mcpTools') && mcpServers.length > 0
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
        'Once the selected fields and source are validated, build the query. Reuse known definitions. After an execution error, inspect missing metadata or alternative sources when the failure indicates a source/scan problem; do not repeat nearly identical failed queries. Preserve the requested scope and report evidence gaps.',
    ].join('\n');

    const finalContent = [
        content,
        getThreadBindingSection(threadBinding, contentToolsEnabled),
        getThreadContextSection(threadContext),
        'All assistant text is user-visible, including text before and between tool calls. Do not save temporary query results as durable user memories. Prior assistant notes are not evidence.',
        'Separate observed results from explanations. Correlation, timing and subgroup differences do not establish causation: a coverage drop does not prove an automation failed, a policy changed or someone followed a different process. Support causal claims with direct evidence about the mechanism, such as documented changes or an appropriate causal analysis. A zero/null result does not prove source-wide absence when join coverage or entity attribution is unverified. The earliest observed record in one source does not establish the true first occurrence without verified source and time coverage. Partial periods neither prove nor disprove a decline; do not calculate per-day rates without a verified exposure window. Label untested explanations as hypotheses, state what evidence would test them, and do not say alternatives are ruled out by descriptive counts alone. Do not invent statistical baselines, sampling limits or query constraints from the shape of the results; use the executed query and field definitions. Compare like-for-like periods; label partial periods and mutable current-state attributes rather than treating them as historical snapshots.',
        'Lead short answers with the result, not a generated title or a restatement of the request. Do not repeat the artifact title as a heading: the UI already labels the artifact. Summarize the key finding without duplicating the entire chart as both a table and a list. Include material scope and uncertainty, but avoid speculative diagnoses and unsolicited offers at the end of every answer.',
        slackChannelId
            ? 'For Slack answers, choose zero or one generated chart by default. When the user requests a chart, select the best successful chart that answers the request. Show multiple charts only when the user requests them or distinct useful views improve the answer. Omit redundant, diagnostic and superseded charts. To select a chart, add the internal marker <slack-chart versionUuid="<versionUuid>" /> on its own line in your final response, replacing <versionUuid> with the exact saved versionUuid copied from a successful chart execution in the current turn. The marker is hidden from visible text and selects that saved chart card for your answer. Every selected chart card carries an "Explore in Lightdash" button that opens that chart with its fields and filters, so selecting the chart is how you deliver a link or report the user asked for: say the report is attached below and never claim you cannot provide a link. The row cap on the preview rows returned to you does not limit the chart the user opens from the card, so do not call the report incomplete or capped because of it. Select at most 10 charts. Never invent versionUuid values, reference charts from earlier turns or automatically display every generated chart.'
            : '',
        allowSlackTableSelection
            ? 'For Slack answers, a summary is the default when it answers the question. Include a table only when the user requests one or its rows materially help explain the answer. To select a table, add the internal marker <slack-table queryUuid="<queryUuid>" /> on its own line in your final response, replacing <queryUuid> with the exact queryUuid copied from a successful semantic table or composer query execution in the current turn. The marker is hidden from visible text and renders that execution as a native Slack table in your answer; it does not send a CSV. Select at most 10 requested or useful final tables. Omit diagnostic and intermediate tables, and supporting evidence that does not improve the answer. Never automatically include every table you queried. Do not invent queryUuid values or reuse executions from earlier turns.'
            : '',
        deepResearchContent,
        grepFieldsSection,
        'For straightforward entity trends or breakdowns, use a single matching count definition and its configured default time granularity when available. A nearby revenue or amount field alone is not a reason to ask count versus amount. Apply explicit business rules and prior scope first; ask when count definitions genuinely compete. Do not invent a date restriction; state the measure, grain and scope used. When the current request or a field-search result includes preloaded catalog metadata, use those definitions, joins, filters and defaults directly. Only call getMetadata for missing or truncated details; do not repeat a metadata lookup to confirm the same details.',
        canRunQuery ? answerQueryGuidance : '',
        chartFollowupGuidance,
        args.enableChartExport
            ? 'When exportChartAsCode is available, you MUST call it for chart YAML and never write or reconstruct YAML yourself. For a chart from an earlier turn, use its exact artifactUuid and versionUuid with null queryUuid when those references are already available. Otherwise call it with null for all three source identifiers to discover conversation artifacts. Pass null for an unspecified destination slug or spaceSlug; the tool reports missing values so you can ask the user. Do not search content to infer a destination, regenerate a chart or rerun data queries just to export it.'
            : '',
        'When the user explicitly names a value to exclude, retain that exclusion in the executed query even if searchFieldValues finds no matching rows. A value search reports observed data, not permitted filter literals. Explain that the exclusion currently removes no rows; do not omit it or substitute a different category. If the intended category requires interpretation rather than literal matching, clarify it first.',
        'When applying or restating sourced business rules, preserve the exact predicate, entity grain, exceptions and date boundaries. Do not replace numeric conditions with broader labels: an amount equal to zero does not establish absence of the associated event, and excluding nonzero amounts is not the same as excluding only positive amounts. Distinguish a reporting-date window from the time at which a mutable attribute is evaluated. Do not invent current-state, historical-snapshot or timezone conventions when the sources do not specify them. State the missing convention if it affects the answer; keep supported rules intact.',
        'Category labels are values, not comparisons. A label such as "Low Cost" does not prove that its group is cheaper than another group. Use comparative or superlative wording only when the available result rows include every compared group or period and the values establish that ordering. Prior prose is not evidence; reuse or rerun the exact query when comparison rows are absent.',
        'For a definition or reference-only question, give the shortest complete answer: the definition, required conditions and exceptions, plus date scope only when requested. Preserve all requested rules. Avoid repeating them under multiple headings, speculative implementation caveats and offers to run future queries. Discuss an unspecified convention when the user asks about it or the requested result depends on choosing it; merely restating a documented definition does not require the user to settle every convention for a possible future query.',
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
