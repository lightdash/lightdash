import {
    AiAgentDocumentStructuredSummary,
    AiAgentDocumentSummary,
    AiWritebackAttribution,
    Explore,
    WarehouseTypes,
} from '@lightdash/common';
import { SystemModelMessage } from 'ai';
import moment from 'moment';
import { AiAgentSkillReference } from '../skills/types';
import { xmlBuilder } from '../xmlBuilder';
import { renderAvailableExplores } from './availableExplores';
import { getAiWritebackSection } from './systemV2AiWriteback';
import { CONTENT_TOOLS_SECTION } from './systemV2ContentTools';
import { DATA_ACCESS_DISABLED_SECTION } from './systemV2DataAccessDisabled';
import { DATA_ACCESS_ENABLED_SECTION } from './systemV2DataAccessEnabled';
import {
    REPO_FS_SECTION,
    repoFsRootHint,
    repoFsSearchCaveat,
} from './systemV2RepoFs';
import { getRunSqlSection } from './systemV2RunSql';
import { SEARCH_SEMANTIC_LAYER_SECTION } from './systemV2SearchSemanticLayer';
import { renderAvailableSkills } from './systemV2Skills';
import { SYSTEM_PROMPT_TEMPLATE } from './systemV2Template';

export const getSystemPromptV2 = (args: {
    availableExplores: Explore[];
    availableSkills?: AiAgentSkillReference[];
    knowledgeDocuments?: AiAgentDocumentSummary[];
    hasProjectContext?: boolean;
    instructions?: string;
    agentName?: string;
    date?: string;
    enableDataAccess?: boolean;
    enableSearchSemanticLayer?: boolean;
    enableAiWriteback?: boolean;
    writebackAttribution?: AiWritebackAttribution | null;
    siteUrl?: string;
    enableRepoDiscovery?: boolean;
    repoFsRoot?: string | null;
    // Whether the repo host supports server-side code search (GitHub yes,
    // GitLab no). Defaults true; when false the prompt steers off `search`.
    repoFsSupportsCodeSearch?: boolean;
    // Experimental: replace findExplores/findFields with grepFields/getMetadata.
    enableGrepFields?: boolean;
    enableContentTools?: boolean;
    canRunSql?: boolean;
    warehouseType?: WarehouseTypes | null;
    warehouseSchema?: string | null;
    unauthenticatedMcpServerNames?: string[];
}): SystemModelMessage => {
    const {
        instructions,
        agentName = 'Lightdash AI Analyst',
        date = moment().utc().format('YYYY-MM-DD'),
        enableDataAccess = false,
        enableSearchSemanticLayer = false,
        enableAiWriteback = false,
        writebackAttribution = null,
        siteUrl = '',
        enableRepoDiscovery = false,
        repoFsRoot = null,
        repoFsSupportsCodeSearch = true,
        enableGrepFields = false,
        enableContentTools = false,
        canRunSql = false,
        warehouseType = null,
        warehouseSchema = null,
        unauthenticatedMcpServerNames = [],
    } = args;

    const crossExploreJoinRule = canRunSql
        ? '  - You cannot mix fields from different explores in a single generateVisualization call. When the user needs data combined across explores that are not joined in the semantic layer, use the runSql tool to write raw SQL across those tables.'
        : '  - You can not mix fields from different explores.';

    const customSqlLimitation = canRunSql
        ? ''
        : '\n- You cannot execute raw SQL or add custom SQL expressions to a query.';

    const renderKnowledgeDocument = (doc: AiAgentDocumentSummary): string => {
        const { summary } = doc;
        const children: string[] = [
            xmlBuilder('description', null, summary.description),
        ];
        if (summary.definedTerms.length > 0) {
            children.push(
                xmlBuilder('defines', null, summary.definedTerms.join(', ')),
            );
        }
        if (summary.relatedExploreNames.length > 0) {
            children.push(
                xmlBuilder(
                    'applies_to_explores',
                    null,
                    summary.relatedExploreNames.join(', '),
                ),
            );
        }
        if (summary.useWhen) {
            children.push(xmlBuilder('use_when', null, summary.useWhen));
        }
        if (summary.warning) {
            children.push(xmlBuilder('warning', null, summary.warning));
        }
        return xmlBuilder(
            'knowledge_document',
            {
                uuid: doc.uuid,
                name: doc.name,
                relevance: summary.relevance,
            },
            ...children,
        );
    };

    const knowledgeDocuments = args.knowledgeDocuments ?? [];
    const knowledgeDocumentsContent =
        knowledgeDocuments.length === 0
            ? 'No knowledge documents have been curated for this agent.'
            : knowledgeDocuments.map(renderKnowledgeDocument).join('\n');

    const fieldDiscoveryToolLabel = enableGrepFields
        ? 'grepFields/getMetadata'
        : 'findExplores/findFields';

    const projectContextContent = args.hasProjectContext
        ? `This project has curated business context (acronyms, definitions, rules). Call the \`loadProjectContext\` tool BEFORE ${fieldDiscoveryToolLabel} — it can change which explore, field, or filter value you should use. Treat it as authoritative over your own assumptions.`
        : 'No project context has been configured for this project.';

    const AVAILABLE_EXPLORES_INLINE_LIMIT = 15;
    let availableExploresContent: string;
    if (args.availableExplores.length === 0) {
        availableExploresContent =
            'No explores are available to this agent. Tell the user there is no data you can query and suggest they ask an administrator to set up explores or adjust the agent configuration.';
    } else if (
        args.availableExplores.length <= AVAILABLE_EXPLORES_INLINE_LIMIT
    ) {
        availableExploresContent = renderAvailableExplores(
            args.availableExplores,
        ).toString();
    } else {
        const discoveryTool = enableGrepFields ? 'grepFields' : 'findExplores';
        availableExploresContent = `This agent has access to ${args.availableExplores.length} explores. Use ${discoveryTool} to discover the relevant one for each request.`;
    }

    const internalToolExamples = enableGrepFields
        ? 'grepFields, getMetadata, generateVisualization, searchFieldValues, findContent, get_knowledge_document_content'
        : 'findExplores, findFields, generateVisualization, searchFieldValues, findContent, get_knowledge_document_content';
    const fieldDiscoveryToolName = enableGrepFields
        ? 'grepFields'
        : 'findFields';
    const fieldResolutionTools = enableGrepFields
        ? 'grepFields/getMetadata or searchSemanticLayer'
        : 'findFields or searchSemanticLayer';
    const dataDiscoveryWorkflow = enableGrepFields
        ? [
              "   - Call grepFields with high-signal keyword patterns from the user's request. Leave exploreName null unless the thread already gives you a specific explore. Use the returned explore groups, required filters, verified usage, and any knowledge-document guidance to choose one explore.",
              '   - If multiple explores are genuinely plausible and no knowledge document resolves the ambiguity, ask the user a concise clarification question and do not call generateVisualization.',
              '   - If no explore or fields cover the request, explain that and offer alternatives if appropriate.',
              '   - Once you have chosen an explore and fields, call getMetadata for that explore and the selected fields to get joined-table markers, filter types, required filters, and hints.',
              "   - Use only field IDs returned by grepFields and verified with getMetadata. Don't include every field; pick the metrics, dimensions, date grains, and filters needed for the answer.",
          ].join('\n')
        : [
              "   - Call findExplores with high-signal keywords from the user's request. Use the returned explore matches, top matching fields, joined tables, required filters, verified usage, and any knowledge-document guidance to choose one explore.",
              '   - If multiple explores are genuinely plausible and no knowledge document resolves the ambiguity, ask the user a concise clarification question and do not call generateVisualization.',
              '   - If no explore covers the request, explain that and offer alternatives if appropriate.',
              '   - Once you have chosen an explore, call findFields for that explore with the needed metric/entity/date/filter terms. Pass all needed field searches in one request.',
              "   - Use only field IDs returned by findFields. Don't include every field; pick the metrics, dimensions, date grains, and filters needed for the answer.",
          ].join('\n');
    const fieldIdSourceRule = enableGrepFields
        ? 'Use only fieldIds returned by grepFields and verified with getMetadata.'
        : 'Use only field IDs returned by findFields.';
    const joinedTableMarkerRule = enableGrepFields
        ? 'getMetadata identifies joined-table fields; trust that detail rather than substituting a base-table field with a similar name.'
        : 'findFields surfaces joined-table fields with `isFromJoinedTable`; trust those markers rather than substituting a base-table field with a similar name.';

    const content = SYSTEM_PROMPT_TEMPLATE.replace(
        '{{self_improvement_section}}',
        '',
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
            '{{repo_fs_section}}',
            enableRepoDiscovery
                ? REPO_FS_SECTION +
                      repoFsRootHint(repoFsRoot) +
                      repoFsSearchCaveat(repoFsSupportsCodeSearch)
                : '',
        )
        .replace(
            '{{search_semantic_layer_section}}',
            enableSearchSemanticLayer ? SEARCH_SEMANTIC_LAYER_SECTION : '',
        )
        .replace(
            '{{data_access_section}}',
            enableDataAccess
                ? DATA_ACCESS_ENABLED_SECTION
                : DATA_ACCESS_DISABLED_SECTION,
        )
        .replace(
            '{{run_sql_section}}',
            canRunSql ? getRunSqlSection(warehouseType, warehouseSchema) : '',
        )
        .replace(
            '{{content_tools_section}}',
            enableContentTools ? CONTENT_TOOLS_SECTION : '',
        )
        .replace('{{cross_explore_join_rule}}', crossExploreJoinRule)
        .replace('{{custom_sql_limitation}}', customSqlLimitation)
        .replace('{{agent_name}}', agentName)
        .replace('{{internal_tool_examples}}', internalToolExamples)
        .replace('{{field_discovery_tool_name}}', fieldDiscoveryToolName)
        .replace('{{field_resolution_tools}}', fieldResolutionTools)
        .replace('{{data_discovery_workflow}}', dataDiscoveryWorkflow)
        .replace('{{field_id_source_rule}}', fieldIdSourceRule)
        .replace('{{joined_table_marker_rule}}', joinedTableMarkerRule)
        .replace(
            '{{instructions}}',
            instructions ? `Special instructions: ${instructions}` : '',
        )
        .replace('{{date}}', date)
        .replace('{{available_explores}}', availableExploresContent)
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

    const grepFieldsSection = enableGrepFields
        ? [
              '## Finding explores and fields (grepFields)',
              'Use `grepFields` to search the field catalog (names, labels, descriptions, hints, tags) with case-insensitive keyword patterns (`|` for OR, space or .* between words for AND). It returns `explore/fieldId  [kind type]` lines grouped by explore, so it identifies both candidate explores and fields.',
              '- The user message may already include a "Candidate fields pre-grepped from the catalog" block. Read it FIRST — if it contains the fields you need, use them as the grep result and go straight to getMetadata. Only call grepFields when those candidates do not cover the question or you need a different angle.',
              '- When you call grepFields, pass several patterns in ONE call (the `patterns` array) covering the different angles of the question at once — e.g. `["revenue|sales", "country|region"]`. Do not grep one pattern, wait, then grep another.',
              '- Use meaningful keywords, not long natural-language phrases. Read the returned fieldIds and pick the single explore that answers at the right grain before building a query.',
              "- Once you have narrowed down to the explore(s) and field(s) you intend to use, call `getMetadata` (batching all of them in one call) to get the detail you need to build a correct query — an explore's joined tables and required filters, and a field's filter type, case-sensitivity and hints. grepFields tells you what exists; getMetadata tells you how to use it.",
              '- If your literal patterns miss, grepFields automatically returns the closest catalog matches (fuzzy search, verified fields first) under "No exact grep matches" — use those rather than re-grepping a long list of synonyms.',
              '- Once you have the fieldIds you need, build the query. Do NOT re-grep for fields you already found, and do not call grepFields again between generateVisualization attempts — if a query fails, fix the query itself (filters, metric, grain), not the discovery. If you need a filter value you are unsure of (e.g. which status string exists), use searchFieldValues rather than guessing.',
          ].join('\n')
        : '';

    const finalContent = [
        content,
        grepFieldsSection,
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
        },
    };
};
