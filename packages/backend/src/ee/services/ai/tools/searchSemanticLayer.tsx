import { searchSemanticLayerToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type {
    SearchSemanticLayerFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';
import { stringifyToolJson, type ToolOutputFormat } from './toolOutputFormat';

type Dependencies = {
    searchSemanticLayer: SearchSemanticLayerFn;
    updateProgress: UpdateProgressFn;
    /** Upper bound for the agent-supplied pageSize; also the fallback default. */
    maxPageSize: number;
    outputFormat?: ToolOutputFormat;
};

/** Used when the agent does not specify a pageSize. */
const DEFAULT_PAGE_SIZE = 200;

const toolDefinition = searchSemanticLayerToolDefinition.for('agent');

const semanticLayerNote =
    'These fields are drawn from across ALL explores in the project. Use this inventory to compare definitions and spot duplicate or confusingly similar metrics. For a high-level overview, this first page plus the totals above is usually enough — only page through the rest when you genuinely need every field (e.g. a project-wide duplicate/inconsistency audit). To inspect a single explore in depth, use findFields.';

const generateJsonResponse = ({
    fields,
    pagination,
}: Awaited<ReturnType<SearchSemanticLayerFn>>) =>
    stringifyToolJson({
        page: pagination?.page,
        pageSize: pagination?.pageSize,
        totalPageCount: pagination?.totalPageCount,
        totalResults: pagination?.totalResults,
        note: semanticLayerNote,
        fields: fields.map((field) => ({
            name: field.name,
            label: field.label,
            exploreName: field.tableName,
            fieldType: field.fieldType,
            usageInCharts: field.chartUsage ?? 0,
            description: field.description,
        })),
    });

const generateXmlResponse = ({
    fields,
    pagination,
}: Awaited<ReturnType<SearchSemanticLayerFn>>) => (
    <semanticLayerFields
        page={pagination?.page}
        pageSize={pagination?.pageSize}
        totalPageCount={pagination?.totalPageCount}
        totalResults={pagination?.totalResults}
    >
        <note>{semanticLayerNote}</note>
        {fields.map((field) => (
            <field
                name={field.name}
                label={field.label}
                exploreName={field.tableName}
                fieldType={field.fieldType}
                usageInCharts={field.chartUsage ?? 0}
            >
                {field.description && (
                    <description>{field.description}</description>
                )}
            </field>
        ))}
    </semanticLayerFields>
);

export const getSearchSemanticLayer = ({
    searchSemanticLayer,
    updateProgress,
    maxPageSize,
    outputFormat = 'xml',
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                const hasQuery = !!args.searchQuery?.trim();
                await updateProgress(
                    hasQuery
                        ? `Searching the semantic layer for "${args.searchQuery}"...`
                        : 'Listing metrics and dimensions across the semantic layer...',
                );

                // The agent picks the page size to fit the task; clamp to the
                // server max so a single call can't pull an unbounded payload.
                const pageSize = Math.min(
                    args.pageSize ?? DEFAULT_PAGE_SIZE,
                    maxPageSize,
                );
                const { fields, pagination } = await searchSemanticLayer({
                    searchQuery: args.searchQuery,
                    type: args.type,
                    page: args.page ?? 1,
                    pageSize,
                });

                return {
                    result:
                        outputFormat === 'json'
                            ? generateJsonResponse({ fields, pagination })
                            : generateXmlResponse({
                                  fields,
                                  pagination,
                              }).toString(),
                    metadata: {
                        status: 'success',
                        ranking: {
                            searchQuery: args.searchQuery,
                            type: args.type,
                            fields: fields.map((field) => ({
                                name: field.name,
                                label: field.label,
                                tableName: field.tableName,
                                fieldType: field.fieldType,
                                searchRank: field.searchRank,
                                chartUsage: field.chartUsage,
                            })),
                        },
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error searching the semantic layer.`,
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
