import {
    ARTIFACT_CHART_TAG,
    ChartKind,
    ChartType,
    DOCUMENT_CHART_TAG,
    DOCUMENT_CONVERSATION_TAGS,
    joinDocumentBlocks,
    ParameterError,
    parseDocumentBlocks,
    QUERY_RESULT_TAG,
    type DocumentBlock,
    type DocumentTag,
    type McpDocumentAsCode,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import type {
    ArtifactChartExportAccess,
    ArtifactSqlResult,
} from './artifactChartAsCode';
import type { PreparedChartAsCode } from './chartAsCode';

const QUERY_RESULT_DISPLAYS = ['table', 'big_number'] as const;

const getChartConfig = (
    tag: DocumentTag,
    prepared: PreparedChartAsCode,
): PreparedChartAsCode['chartConfig'] => {
    if (tag.name === ARTIFACT_CHART_TAG) return prepared.chartConfig;
    switch (tag.attributes.display ?? 'table') {
        case 'table':
            return { type: ChartType.TABLE };
        case 'big_number':
            return { type: ChartType.BIG_NUMBER };
        default:
            throw new ParameterError(
                `<${QUERY_RESULT_TAG}> display must be one of: ${QUERY_RESULT_DISPLAYS.join(', ')}`,
            );
    }
};

const toDocumentChart = (
    tag: DocumentTag,
    prepared: PreparedChartAsCode,
): McpDocumentAsCode['charts'][string] => {
    if (prepared.merge) {
        throw new ParameterError(
            `Merged charts cannot be placed with <${tag.name}> yet. Add the chart in full under charts with its merge definition and place it with <${DOCUMENT_CHART_TAG}>.`,
        );
    }
    const { title, description } = tag.attributes;
    // A JSON round trip drops undefined optional fields the stored schema rejects.
    return {
        source: 'semantic',
        chart: JSON.parse(
            JSON.stringify({
                name: title ?? prepared.name,
                description: description ?? prepared.description,
                tableName: prepared.tableName,
                metricQuery: prepared.metricQuery,
                chartConfig: getChartConfig(tag, prepared),
                tableConfig: prepared.tableConfig,
                pivotConfig: prepared.pivotConfig,
                parameters: prepared.parameters,
            }),
        ),
    };
};

/**
 * A SQL result as a SQL table; its columns are unknown until it runs, so an
 * empty column config shows them all.
 */
const toSqlDocumentChart = (
    tag: DocumentTag,
    result: ArtifactSqlResult,
): McpDocumentAsCode['charts'][string] => {
    if ((tag.attributes.display ?? 'table') !== 'table') {
        throw new ParameterError(
            `SQL results can only be placed as a table: use <${QUERY_RESULT_TAG}> without display`,
        );
    }
    const { title, description } = tag.attributes;
    return {
        source: 'sql',
        chart: {
            name: title ?? result.title ?? 'SQL query results',
            ...(description === undefined ? {} : { description }),
            sql: result.sql,
            limit: result.limit,
            chartKind: ChartKind.TABLE,
            config: {
                type: ChartKind.TABLE,
                metadata: { version: 1 },
                columns: {},
                display: {},
            },
        },
    };
};

/**
 * Replace charts placed from this conversation (`<artifact-chart>` and
 * `<query-result>`) with `<document-chart>` tags and their chart definitions,
 * so the Document can be saved like any other.
 */
type DocumentMarkdownWithCharts = Pick<
    McpDocumentAsCode,
    'markdown' | 'charts'
>;

export const resolveDocumentConversationTags = async (
    content: DocumentMarkdownWithCharts,
    artifacts: ArtifactChartExportAccess | undefined,
): Promise<DocumentMarkdownWithCharts> => {
    const blocks = parseDocumentBlocks(content.markdown, [
        DOCUMENT_CHART_TAG,
        ...DOCUMENT_CONVERSATION_TAGS,
    ]);
    if (
        !blocks.some(
            (block) =>
                block.type === 'tag' && block.tag.name !== DOCUMENT_CHART_TAG,
        )
    ) {
        return content;
    }
    if (!artifacts) {
        throw new ParameterError(
            'Charts from this conversation cannot be placed here. Add them in full under charts.',
        );
    }
    const charts = { ...content.charts };
    let next = 1;
    const resolved = await Promise.all(
        blocks.map(async (block): Promise<DocumentBlock> => {
            if (
                block.type === 'markdown' ||
                block.tag.name === DOCUMENT_CHART_TAG
            ) {
                return block;
            }
            const { version } = block.tag.attributes;
            if (!version || !isUuid(version)) {
                throw new ParameterError(
                    `<${block.tag.name}> needs the version attribute: the artifact versionUuid from this conversation`,
                );
            }
            while (Object.hasOwn(charts, `artifact-${next}`)) next += 1;
            const key = `artifact-${next}`;
            next += 1;
            const sqlResult =
                block.tag.name === QUERY_RESULT_TAG
                    ? await artifacts.prepareSqlVersion(version)
                    : null;
            charts[key] = sqlResult
                ? toSqlDocumentChart(block.tag, sqlResult)
                : toDocumentChart(
                      block.tag,
                      await artifacts.prepareVersion(version),
                  );
            return {
                type: 'tag',
                tag: { name: DOCUMENT_CHART_TAG, attributes: { id: key } },
            };
        }),
    );
    return { markdown: joinDocumentBlocks(resolved), charts };
};
