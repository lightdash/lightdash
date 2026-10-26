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
import { escapeXmlText, xmlBuilder } from '../xmlBuilder';
import { renderAvailableCustomChartTypes } from './availableCustomChartTypes';
import { renderAvailableExplores } from './availableExplores';
import {
    COMPOSER_FILTER_GUIDANCE_SECTION,
    FILTER_EXPRESSION_GUIDANCE_SECTION,
    STRUCTURED_FILTER_GUIDANCE_SECTION,
} from './filterGuidance';
import { getAiWritebackSection } from './systemV2AiWriteback';
import {
    DOCUMENT_NUDGES_GUIDANCE,
    getContentToolsSection,
    getDocumentToolsSection,
} from './systemV2ContentTools';
import { DATA_ACCESS_DISABLED_SECTION } from './systemV2DataAccessDisabled';
import { DATA_ACCESS_ENABLED_SECTION } from './systemV2DataAccessEnabled';
import { GENERATE_DATA_APP_SECTION } from './systemV2DataApps';
import { getKnowledgeDocumentsSection } from './systemV2KnowledgeDocuments';
import { MEMORIES_SECTION } from './systemV2Memories';
import {
    COMPOSER_QUERY_PATH,
    getQueryingComposerSection,
} from './systemV2QueryingComposer';
import { getRepoFsSection } from './systemV2RepoFs';
import { getRequestingUserSection } from './systemV2RequestingUser';
import { getRunSqlSection } from './systemV2RunSql';
import { getSchedulingToolsSection } from './systemV2SchedulingTools';
import { SEARCH_SEMANTIC_LAYER_SECTION } from './systemV2SearchSemanticLayer';
import { renderAvailableSkills } from './systemV2Skills';
import { getSlackLinksOnlySection } from './systemV2SlackLinksOnly';
import {
    CLASSIC_QUERY_PATH,
    FORECAST_LIMITATION,
    getChartTypesLimitation,
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
                  viaComposerQueries: composer,
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
        // Python nodes in query; only meaningful for the composer base.
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
            '- A query uses fields from one explore. Raw SQL combines tables only on the original connection; when the data spans connections, explain this limit.';
    } else if (canRunSql) {
        crossExploreJoinRule =
            '- A query uses fields from one explore. To combine explores that are not joined in the semantic layer, use the runSql tool to write raw SQL across those tables.';
    } else {
        crossExploreJoinRule = '- A query uses fields from one explore.';
    }
    const queryPath: QueryPath = composer
        ? {
              ...COMPOSER_QUERY_PATH,
              queryLanguageSections: getQueryingComposerSection({
                  enablePythonNodes: enableComposerPythonNodes,
                  canRunSql,
                  slackChannelId,
              }),
          }
        : {
              ...CLASSIC_QUERY_PATH,
              queryLanguageSections: `${CLASSIC_QUERY_PATH.queryLanguageSections}\n${crossExploreJoinRule}`,
          };

    let customSqlLimitation = '';
    if (!canRunSql) {
        customSqlLimitation = composer
            ? '\n- Warehouse data comes from semanticLayer nodes; raw SQL against the warehouse is unavailable.'
            : '\n- You cannot execute raw SQL or add custom SQL expressions to a query.';
    }

    const deepResearchRuns = args.deepResearchRuns ?? [];
    const deepResearchContent =
        deepResearchRuns.length === 0
            ? ''
            : [
                  '## Deep Research in this conversation',
                  'This state is current for this user turn. Keep active progress separate from report findings: present findings only from an available report, and let a running investigation continue without implicitly starting a duplicate run or offering to cancel, restart or change it.',
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
        const projectContextDefinition =
            'This project has curated business context: acronyms, definitions, rules and conventions that are not in the field metadata.';
        projectContextContent = args.projectContextPreloaded
            ? `${projectContextDefinition} The entries relevant to this request are already preloaded: apply them before discovery, as authoritative over your own assumptions. They are a partial selection: load more with \`loadProjectContext\` for missing definitions, additional scope or conflicting rules, not to reload the preloaded entries.`
            : `${projectContextDefinition} Load it with \`loadProjectContext\` before discovery, since it can change which explore, field or filter value you use, and treat it as authoritative over your own assumptions.`;
    }

    const AVAILABLE_EXPLORES_INLINE_LIMIT = 15;
    let availableExploresContent: string;
    if (args.availableExplores.length === 0) {
        availableExploresContent = canRunSql
            ? `No explores are available to this agent yet, but you have direct warehouse access: rather than telling the user there is no data, discover the schema with listWarehouseTables and describeWarehouseTable, then answer questions with ${
                  composer ? 'query using a sql node' : 'runSql'
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
    // Without data access the agent never sees the rows it could tabulate.
    const tabulateRows = allowMarkdownTables && enableDataAccess;
    // On the composer base, visualize presents results in Slack.
    const allowSlackTableSelection =
        !composer && !!slackChannelId && enableDataAccess && !slackLinksOnly;
    const chartOnlyWhenAsked =
        'Use generateVisualization for a chart only when the user asks for a chart or visualization: an answer that could be visualized is not a request for one, nor a reason to load more tools.';
    const tableVisualizationRule =
        'Use generateVisualization with defaultVizType: "table" when the user requests a table visualization or a saved, interactive or downloadable table.';
    let answerToolGuidance: string;
    if (composer) {
        answerToolGuidance = tabulateRows
            ? '- Write a small tabular answer as a Markdown table.'
            : '- When the user asks for a table, visualize the result as a table.';
    } else if (!allowMarkdownTables) {
        const slackTableRule =
            'When a user asks for a "table", generate a table visualization with generateVisualization (defaultVizType: \'table\').';
        answerToolGuidance = canRunQuery
            ? `- Use runQuery for a data answer without a chart${allowSlackTableSelection ? ' and summarize from its rows' : ''}. ${slackTableRule} ${chartOnlyWhenAsked}`
            : `- Answer data questions with generateVisualization. ${slackTableRule}`;
    } else {
        const markdownTableClause = tabulateRows
            ? ' and present a small tabular answer as a Markdown table'
            : '';
        answerToolGuidance = canRunQuery
            ? `- Use runQuery for a data answer without a chart${markdownTableClause}. ${tableVisualizationRule} ${chartOnlyWhenAsked}`
            : `- Answer data questions with generateVisualization${markdownTableClause}. ${tableVisualizationRule}`;
    }
    const chartFollowupGuidance = composer
        ? ''
        : 'To change an existing chart, edit the last successful query input only where the user asked and call generateVisualization; say the chart was updated only after that call succeeds. Discover a requested field missing from the carried-forward ones rather than binding its value to an unrelated dimension.';
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
        .replace('{{answer_tool_guidance}}', answerToolGuidance)
        .replace(
            '{{response_format_guidance}}',
            allowMarkdownTables
                ? '- Use simple Markdown: bold, italics, lists, and Markdown tables with their data in the rows and a blank line before and after. Use ### headings only to organize a longer answer; no # or ## headers, code blocks, images or horizontal rules.'
                : '- Use simple Markdown: `###` headings, bold, italics and lists, and no `#` or `##` headers, code blocks, Markdown tables, images or horizontal rules.',
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
                  })
                : '',
        )
        .replace(
            '{{repo_fs_section}}',
            promptSections.has('repoFs')
                ? getRepoFsSection({
                      root: repoFsRoot,
                      supportsCodeSearch: repoFsSupportsCodeSearch,
                  })
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
        // Composer chart types come from the visualize tool's schema.
        .replace(
            '{{chart_types_limitation}}',
            composer
                ? ''
                : getChartTypesLimitation(
                      promptSections.has('availableCustomChartTypes'),
                  ),
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
        .replace('{{knowledge_documents}}', () =>
            getKnowledgeDocumentsSection(args.knowledgeDocuments ?? []),
        )
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
                            'The tools of the attached MCP servers below load on demand: before calling one whose definition is not loaded yet, load it with `loadMcpTools`, so you read its input schema instead of guessing it from the name.',
                        ]
                      : []),
                  ...mcpServers.map(
                      ({ name, toolNames }) =>
                          `- ${name}: ${[...toolNames].sort().join(', ') || '(no tools available)'}`,
                  ),
              ].join('\n')
            : '';

    const finalContent = [
        content,
        getThreadBindingSection(threadBinding, contentToolsEnabled),
        getThreadContextSection(threadContext),
        'Claim a cause only with direct evidence of the mechanism (a documented change, a causal analysis), not from correlation, timing or subgroup differences; label other explanations as hypotheses and say what would test them. A zero or null result proves absence only with confirmed join coverage and entity attribution, and an earliest record is a first occurrence only with confirmed source and time coverage. Compare like-for-like periods, compute per-day rates only over a confirmed exposure window, and label partial periods (no proof of a decline either way) and current-state attributes (not historical snapshots). Take baselines, sampling limits and query constraints from the executed query and field definitions, not the shape of the results.',
        'Lead short answers with the result, not a title or restated request; the UI already labels each artifact. Give the key finding rather than repeating the chart as a table or list, state material scope and uncertainty, leave out speculative diagnoses, and end with an offer only when it is specific to the result (e.g. related dashboards after a new chart).',
        slackChannelId && !composer
            ? 'For Slack answers, choose zero or one generated chart by default: the best successful chart when the user requests one; more, up to 10, only when the user asks or distinct views help, and none that are redundant, diagnostic or superseded. To select a chart, add the internal marker <slack-chart versionUuid="<versionUuid>" /> on its own line in your final response, with the exact saved versionUuid copied from a successful chart execution in the current turn. The marker is hidden from visible text and attaches that saved chart card. Every selected chart card carries an "Explore in Lightdash" button that opens the chart with its fields and filters, so a selected chart is the link or report the user asked for: say it is attached below. The row cap on the preview rows returned to you does not cap that chart.'
            : '',
        allowSlackTableSelection
            ? 'For Slack answers, a summary is the default when it answers the question. Include a table only when the user requests one or its rows materially help, at most 10 and none diagnostic or intermediate: add the internal marker <slack-table queryUuid="<queryUuid>" /> on its own line in your final response, with the exact queryUuid copied from a successful semantic table or composer query execution in the current turn. The marker is hidden from visible text and renders that execution as a native Slack table, not a CSV.'
            : '',
        deepResearchContent,
        'After an execution error, fix the cause it reports rather than resubmitting a query that failed the same way; when the error points to the source or a scan, inspect the missing metadata or another source. Keep the requested scope and report evidence gaps.',
        'For a plain entity trend or breakdown, use the single matching count definition and its configured default time granularity; a nearby revenue or amount field is no reason to ask count versus amount. Apply explicit business rules and prior scope first, and ask the user to choose only between count definitions that genuinely compete. Restrict dates only when the request or a rule does, and state the measure, grain and scope used.',
        chartFollowupGuidance,
        'Keep an exclusion the user explicitly names in the executed query even when no rows match it, and say it currently removes no rows. When a category needs interpretation rather than a literal match, ask the user what it means before filtering.',
        'Apply or restate a sourced business rule with its exact predicate, entity grain, exceptions, date boundaries and numeric conditions, not a broader label: a zero amount does not mean the event is absent, and excluding nonzero amounts differs from excluding positive ones. Keep a reporting-date window distinct from when a mutable attribute is evaluated. When the sources set no current-state, snapshot or timezone convention, say so if it affects the answer instead of inventing one.',
        'Category labels are values, not comparisons: "Low Cost" does not prove a group is cheaper. Use comparative or superlative wording only when the result rows include every compared group or period and their values establish the order; otherwise rerun the exact query.',
        'For a definition or reference-only question, give the shortest complete answer: the definition with every required condition and exception, date scope only when asked, each rule once, without implementation caveats, unasked conventions or offers to run queries.',
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
