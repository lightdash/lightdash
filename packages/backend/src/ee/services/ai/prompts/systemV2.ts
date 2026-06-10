import {
    AiAgentDocumentStructuredSummary,
    AiAgentDocumentSummary,
    Explore,
    WarehouseTypes,
} from '@lightdash/common';
import { SystemModelMessage } from 'ai';
import moment from 'moment';
import { AiAgentSkillReference } from '../skills/types';
import { xmlBuilder } from '../xmlBuilder';
import { renderAvailableExplores } from './availableExplores';
import { AI_WRITEBACK_SECTION } from './systemV2AiWriteback';
import { CONTENT_TOOLS_SECTION } from './systemV2ContentTools';
import { DATA_ACCESS_DISABLED_SECTION } from './systemV2DataAccessDisabled';
import { DATA_ACCESS_ENABLED_SECTION } from './systemV2DataAccessEnabled';
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
    enableChartAsCodeArtifacts?: boolean;
    enableSearchSemanticLayer?: boolean;
    enableAiWriteback?: boolean;
    enableContentTools?: boolean;
    canRunSql?: boolean;
    warehouseType?: WarehouseTypes | null;
    warehouseSchema?: string | null;
}): SystemModelMessage => {
    const {
        instructions,
        agentName = 'Lightdash AI Analyst',
        date = moment().utc().format('YYYY-MM-DD'),
        enableDataAccess = false,
        enableChartAsCodeArtifacts = true,
        enableSearchSemanticLayer = false,
        enableAiWriteback = false,
        enableContentTools = false,
        canRunSql = false,
        warehouseType = null,
        warehouseSchema = null,
    } = args;

    const crossExploreJoinRule = canRunSql
        ? '  - You cannot mix fields from different explores in a single generateVisualization call. When the user needs data combined across explores that are not joined in the semantic layer, use the runSql tool to write raw SQL across those tables.'
        : '  - You can not mix fields from different explores.';

    const customSqlLimitation = canRunSql
        ? ''
        : '\n- You cannot execute raw SQL or add custom SQL expressions to a query.';

    const tableVisualizationInstruction = enableChartAsCodeArtifacts
        ? 'When a user asks for a "table", generate a table visualization with generateVisualization using chart-as-code `chartConfig.type: "table"`. Never produce markdown tables.'
        : 'When a user asks for a "table", generate a table visualization with generateVisualization (defaultVizType: \'table\'). Never produce markdown tables.';

    const generateVisualizationInstruction = enableChartAsCodeArtifacts
        ? 'Use chart-as-code: put the query in `metricQuery`, the runtime visualization in `chartConfig`, table column order in top-level `tableConfig`, and pivots in top-level `pivotConfig`. For table styling, use canonical chart-as-code only: column display options go under `chartConfig.config.columns`; conditional formatting rules go under `chartConfig.config.conditionalFormattings`; never put `columns` at `chartConfig` root and never use `dataBarColor`. The server validates the payload against chart-as-code and returns errors you can repair.'
        : "The tool's parameter docs describe every chart-config option — read those rather than guessing. Key conventions: `dimensions[0]` drives the x-axis; put extra grouping dimensions in `chartConfig.groupBy` (never the x-axis dim) for multi-series, leave `null` for single-series; always set `xAxisLabel` and `yAxisLabel`.";

    const tableCalculationShapeInstruction = enableChartAsCodeArtifacts
        ? 'Table calc parameter shapes (frames, partitionBy, orderBy) follow the chart-as-code metric query shape.'
        : 'Table calc parameter shapes (frames, partitionBy, orderBy) are documented in the generateVisualization schema.';

    const customMetricReferenceInstruction = enableChartAsCodeArtifacts
        ? 'Use the fieldId in `metricQuery.metrics`, `chartConfig`, `sorts`, `filters`, or `tableCalculations`.'
        : 'Use the fieldId in `queryConfig.metrics`, `chartConfig.yAxisMetrics`, `sorts`, `filters`, or `tableCalculations`.';

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

    const projectContextContent = args.hasProjectContext
        ? 'This project has curated business context (acronyms, definitions, rules). Call the `loadProjectContext` tool BEFORE findExplores/findFields/discoverFields — it can change which explore, field, or filter value you should use. Treat it as authoritative over your own assumptions.'
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
        availableExploresContent = `This agent has access to ${args.availableExplores.length} explores. Use findExplores to discover the relevant one for each request.`;
    }

    const content = SYSTEM_PROMPT_TEMPLATE.replace(
        '{{self_improvement_section}}',
        '',
    )
        .replace(
            '{{ai_writeback_section}}',
            enableAiWriteback ? AI_WRITEBACK_SECTION : '',
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
        .replace(
            '{{table_visualization_instruction}}',
            tableVisualizationInstruction,
        )
        .replace(
            '{{generate_visualization_instruction}}',
            generateVisualizationInstruction,
        )
        .replace(
            '{{table_calculation_shape_instruction}}',
            tableCalculationShapeInstruction,
        )
        .replace(
            '{{custom_metric_reference_instruction}}',
            customMetricReferenceInstruction,
        )
        .replace('{{cross_explore_join_rule}}', crossExploreJoinRule)
        .replace('{{custom_sql_limitation}}', customSqlLimitation)
        .replace('{{agent_name}}', agentName)
        .replace(
            '{{instructions}}',
            instructions ? `Special instructions: ${instructions}` : '',
        )
        .replace('{{date}}', date)
        .replace('{{available_explores}}', availableExploresContent)
        .replace('{{knowledge_documents}}', knowledgeDocumentsContent)
        .replace('{{project_context}}', projectContextContent);

    const skillsSection = renderAvailableSkills(args.availableSkills ?? []);

    return {
        role: 'system',
        content: skillsSection ? `${content}\n\n${skillsSection}` : content,
        providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
        },
    };
};
